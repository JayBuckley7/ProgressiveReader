/**
 * OCR API adapter for processing PDFs with OCR.
 *
 * NOTE: The response is a SSE stream (progress JSON) followed by binary PDF bytes.
 */

import type { BackendFetchPort } from "@core/backend/fetchPort";
import type { OcrBackendPort, OcrPageLayoutResponse, OcrProgress, OcrProgressCallback } from "@core/backend/ports";
import { appLog } from "@shared/appLog";

export function createOcrBackendPort(fetchPort: BackendFetchPort): OcrBackendPort {
  return {
    async processPdf(file: File, onProgress?: OcrProgressCallback, opts?: { signal?: AbortSignal }): Promise<File> {
      // Create FormData with PDF file
      const formData = new FormData();
      formData.append("pdf", file);

      // POST to OCR endpoint (returns SSE stream)
      const response = await fetchPort.request({
        path: "/api/ocr/process",
        method: "POST",
        body: formData,
        signal: opts?.signal,
      });

      if (!response.ok) {
        const errorText = await response.text();
        let errorMessage = "OCR processing failed";
        try {
          const errorJson = JSON.parse(errorText);
          errorMessage = errorJson.error || errorMessage;
        } catch {
          // If response is not JSON, use the text
          errorMessage = errorText || errorMessage;
        }
        throw new Error(errorMessage);
      }

      // Read Server-Sent Events stream
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) {
        throw new Error("Failed to read response stream");
      }

      let buffer = "";
      let filename = file.name;
      const pdfBytes: Uint8Array[] = [];
      let isReceivingPDF = false;
      let totalBytesReceived = 0;

      try {
        while (true) {
          const { done, value } = await reader.read();

          if (done) {
            break;
          }

          totalBytesReceived += value.length;

          // Log every 10MB received to debug transfer size
          if (totalBytesReceived % (10 * 1024 * 1024) < value.length) {
            appLog.debug(`[OCR] Total bytes received so far: ${(totalBytesReceived / (1024 * 1024)).toFixed(1)}MB`);
          }

          if (!isReceivingPDF) {
            // Still receiving SSE messages as text
            const chunkText = decoder.decode(value, { stream: true });
            buffer += chunkText;

            // Process complete SSE messages (lines ending with \n\n)
            const lines = buffer.split("\n\n");
            buffer = lines.pop() || ""; // Keep incomplete line in buffer

            for (const line of lines) {
              if (line.startsWith("data: ")) {
                const jsonStr = line.slice(6); // Remove 'data: ' prefix
                try {
                  const data: OcrProgress = JSON.parse(jsonStr);

                  // Call progress callback if provided
                  if (onProgress) {
                    onProgress(data);
                  }

                  // Handle completion - switch to binary PDF mode
                  if (data.type === "complete") {
                    if (data.filename) {
                      filename = String(data.filename);
                    }
                    const expectedSize =
                      typeof (data as any).size === "number"
                        ? (((data as any).size as number) / (1024 * 1024)).toFixed(2) + "MB"
                        : "unknown";
                    appLog.debug(`[OCR] Completion message received. Expected PDF size: ${expectedSize}`);
                    // Next chunks will be binary PDF data
                    isReceivingPDF = true;
                    // Clear text buffer - any remaining data after this will be binary
                    buffer = "";
                  }

                  // Handle errors
                  if (data.type === "error") {
                    throw new Error(String(data.error || "OCR processing failed"));
                  }
                } catch (e) {
                  // If it's our error, rethrow it
                  if (e instanceof Error && e.message.includes("OCR processing failed")) {
                    throw e;
                  }
                  // Otherwise, log and continue (might be malformed JSON)
                  appLog.warn("Failed to parse SSE message", jsonStr.substring(0, 200), e);
                }
              }
            }
          } else {
            // Receiving binary PDF chunks
            pdfBytes.push(value);
          }
        }

        // Process any remaining buffer if we're still in SSE mode
        if (!isReceivingPDF && buffer.trim()) {
          const lines = buffer.split("\n\n");
          for (const line of lines) {
            if (line.startsWith("data: ")) {
              const jsonStr = line.slice(6);
              try {
                const data: OcrProgress = JSON.parse(jsonStr);
                if (onProgress) {
                  onProgress(data);
                }
                if (data.type === "complete") {
                  if (data.filename) {
                    filename = String(data.filename);
                  }
                  isReceivingPDF = true;
                }
                if (data.type === "error") {
                  throw new Error(String(data.error || "OCR processing failed"));
                }
              } catch (e) {
                if (e instanceof Error && e.message.includes("OCR processing failed")) {
                  throw e;
                }
                appLog.warn("Failed to parse final SSE message", jsonStr, e);
              }
            }
          }
        }
      } finally {
        reader.releaseLock();
      }

      if (!isReceivingPDF || pdfBytes.length === 0) {
        throw new Error("OCR processing completed but no PDF was returned");
      }

      // Combine all byte chunks into a single Uint8Array
      const totalLength = pdfBytes.reduce((sum, chunk) => sum + chunk.length, 0);
      appLog.debug(`[OCR] Final PDF size: ${(totalLength / (1024 * 1024)).toFixed(2)}MB (${totalLength} bytes)`);
      appLog.debug(`[OCR] Total stream bytes received: ${(totalBytesReceived / (1024 * 1024)).toFixed(2)}MB`);

      if (totalLength > totalBytesReceived * 1.1) {
        appLog.warn(`[OCR] PDF size (${totalLength}) is larger than bytes received (${totalBytesReceived}) - unexpected.`);
      }

      const combined = new Uint8Array(totalLength);
      let offset = 0;
      for (const chunk of pdfBytes) {
        combined.set(chunk, offset);
        offset += chunk.length;
      }

      const ocrBlob = new Blob([combined], { type: "application/pdf" });
      return new File([ocrBlob], filename, { type: "application/pdf" });
    },

    async processPageLayout(args): Promise<OcrPageLayoutResponse> {
      const formData = new FormData();
      formData.append("image", args.image, `page-${args.pageIndex + 1}.png`);
      formData.append("page_index", String(args.pageIndex));
      formData.append("ocr_profile", args.ocrProfile || "ja-pdf-overlay-hybrid-v1");
      if (args.contentHash) {
        formData.append("content_hash", args.contentHash);
      }
      if (args.documentId) {
        formData.append("document_id", args.documentId);
      }
      if (args.documentVersion) {
        formData.append("document_version", args.documentVersion);
      }

      const response = await fetchPort.request({
        path: "/api/ocr/layout/page",
        method: "POST",
        body: formData,
        signal: args.signal,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || "Failed to fetch OCR page layout");
      }

      return (await response.json()) as OcrPageLayoutResponse;
    },
  };
}

