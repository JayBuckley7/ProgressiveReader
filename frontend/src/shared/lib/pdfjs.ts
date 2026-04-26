import * as pdfjsLib from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

type PdfJsLib = typeof pdfjsLib;

let configured = false;

export function getPdfJs(): PdfJsLib {
  if (!configured) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
    configured = true;
  }
  return pdfjsLib;
}

