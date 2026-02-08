import { gDriveService } from "@integrations/googleDrive/gdriveService";
import { authManager } from "@shared/services/authManager";
import { appLog } from "@shared/appLog";
import { notifyError } from "@shared/utils/notify";
import { bookCacheService } from "../bookCache";
import { bookStorageService } from "../bookStorage";
import { processPDFWithOCR, type OCRProgressCallback } from "../ocrApi";
import type { BookMetadata } from "~/types";
import type { BookCoverService } from "../bookCovers";
import type { ClerkUserLike } from "./provider";
import { assertGoogleProvider, detectProviderFromClerkUser } from "./provider";

function getErrorMessage(err: unknown): string {
  if (!err) return "Unknown error";
  if (typeof err === "string") return err;
  if (typeof err === "object" && "message" in err) return String((err as { message?: unknown }).message || "Unknown error");
  return "Unknown error";
}

export async function uploadBookToDrive(params: {
  file: File;
  meta: { title: string; fileType: string; cover?: Blob; processOCR?: boolean };
  covers: BookCoverService;
  clerkUser?: ClerkUserLike;
  onOCRProgress?: OCRProgressCallback;
}): Promise<BookMetadata> {
  const { file, meta, covers, clerkUser, onOCRProgress } = params;

  appLog.debug("[BookLibrary] Uploading book to user's cloud storage (privacy-first).");

  const provider = detectProviderFromClerkUser(clerkUser);
  assertGoogleProvider(provider);

  // Check connection using centralized auth manager.
  const isAuthenticated = await authManager.ensureAuthenticated();
  if (!isAuthenticated) {
    throw new Error("Failed to authenticate with Google Drive");
  }

  // Extract cover image from EPUB/PDF if not provided.
  let coverBlob = meta.cover;

  if (!coverBlob && meta.fileType === "epub") {
    try {
      const extractedCover = await bookStorageService.extractCoverFromEpub(file);
      if (extractedCover) coverBlob = extractedCover;
    } catch (error) {
      appLog.warn("[BookLibrary] Failed to extract cover from EPUB", error);
    }
  } else if (!coverBlob && meta.fileType === "pdf") {
    const extracted = await bookStorageService.extractCoverFromPdf(file);
    if (extracted) coverBlob = extracted;
  }

  if (!coverBlob) {
    const lookedUpCover = await covers.lookupCover(meta.title);
    if (lookedUpCover) coverBlob = lookedUpCover;
  }

  if (!coverBlob) {
    coverBlob = await covers.generatePlaceholderCover(meta.title, meta.fileType);
  }

  // Process PDF with OCR if requested.
  let fileToUpload = file;
  if (meta.processOCR && meta.fileType === "pdf") {
    try {
      fileToUpload = await processPDFWithOCR(file, onOCRProgress);
    } catch (error) {
      appLog.error("[BookLibrary] OCR processing failed; uploading original PDF", error);
      notifyError(error, {
        title: "OCR processing failed",
        description: "Uploading original PDF.",
      });
    }
  }

  const bookResult = await gDriveService.uploadFile(
    fileToUpload.name,
    fileToUpload,
    fileToUpload.type || "application/epub+zip"
  );
  if (!bookResult) {
    throw new Error("Failed to upload book to Google Drive");
  }

  let coverImageId: string | undefined;
  if (coverBlob) {
    const mime = coverBlob.type || "image/jpeg";
    const ext = mime.includes("png")
      ? "png"
      : mime.includes("webp")
        ? "webp"
        : mime.includes("svg")
          ? "svg"
          : "jpg";
    const coverFileName = `${meta.title}_cover.${ext}`;
    const coverResult = await gDriveService.uploadFile(coverFileName, coverBlob, mime);
    if (coverResult) coverImageId = coverResult.id;
  }

  await gDriveService.addBookMetadata(bookResult.id, {
    title: meta.title,
    fileName: fileToUpload.name,
    fileType: meta.fileType,
    coverImageId,
    uploadedAt: new Date().toISOString(),
  });

  const bookMetadata: BookMetadata = {
    id: bookResult.id,
    title: meta.title,
    fileType: meta.fileType,
    driveFileId: bookResult.id,
    coverImageId,
    coverUrl: coverImageId ? `https://drive.google.com/thumbnail?id=${coverImageId}&sz=w400-h600` : undefined,
    uploadedAt: new Date(),
    userId: "current-user",
    cloudProvider: "google",
    folderId: undefined,
  };

  // Clear cache since book list has changed.
  bookCacheService.clearBookListCache();

  appLog.debug("[BookLibrary] Book uploaded successfully");
  return bookMetadata;
}

export function wrapUploadError(error: unknown): Error {
  const msg = getErrorMessage(error);
  return new Error(`Failed to upload to Google Drive: ${msg}`);
}

