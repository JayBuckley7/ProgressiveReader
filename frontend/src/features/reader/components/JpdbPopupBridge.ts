import type { Token } from "~/types";

export type PopupWordData = {
  token: Token;
  position: number;
  sentence?: string;
};

type PopupAnchor = Element | { x: number; y: number };
type PopupOptions = { pin?: boolean; sourceElement?: Element };

export const JPDB_POPUP_NEEDED_EVENT = "pr:jpdb-popup-needed";

let suppressedHoverElement: Element | null = null;
let suppressedHoverKey: string | null = null;
let suppressPopupActivationUntil = 0;

const CLOSE_ACTIVATION_SUPPRESSION_MS = 700;

function getPopupSourceKey(element?: Element | null): string | null {
  const token = (element as (Element & { jpdbData?: PopupWordData }) | null)?.jpdbData?.token;
  const card = token?.card;
  if (card && (card.vid || card.sid)) {
    return `${card.vid || 0}/${card.sid || 0}`;
  }
  return element?.textContent?.trim() || null;
}

function nowMs(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

export function showDefinitionPopup(
  word: string,
  anchorOrPosition: PopupAnchor,
  wordData?: PopupWordData,
  options?: PopupOptions
) {
  // Keep the reader independent from the large dictionary/JLPT chunk. If the
  // user asks for a definition before it finishes loading, JpdbPopup queues it.
  window.dispatchEvent(new Event(JPDB_POPUP_NEEDED_EVENT));
  void import("./JpdbPopup").then((module) => {
    module.showDefinitionPopup(word, anchorOrPosition, wordData, options);
  });
}

export function hideDefinitionPopup() {
  void import("./JpdbPopup").then((module) => {
    module.hideDefinitionPopup();
  });
}

export function isDefinitionPopupActivationSuppressed(): boolean {
  return nowMs() < suppressPopupActivationUntil;
}

export function suppressDefinitionPopupActivation() {
  suppressPopupActivationUntil = nowMs() + CLOSE_ACTIVATION_SUPPRESSION_MS;
}

export function setDefinitionPopupSuppression(element?: Element | null) {
  suppressedHoverElement = element ?? null;
  suppressedHoverKey = getPopupSourceKey(element);
}

export function isDefinitionPopupSuppressedFor(element: Element): boolean {
  return suppressedHoverElement === element || (
    suppressedHoverKey !== null && getPopupSourceKey(element) === suppressedHoverKey
  );
}

export function clearDefinitionPopupSuppression(element?: Element | null) {
  if (!element || suppressedHoverElement === element || getPopupSourceKey(element) === suppressedHoverKey) {
    suppressedHoverElement = null;
    suppressedHoverKey = null;
  }
}
