// settingsModal.js – **refactored for global keybind helpers & constant export with NO truncation**
// ---------------------------------------------------------------------------------
// 1.  keybindToString(), MODIFIERS, and MOUSE_BUTTONS moved to file scope so that
//     _loadSettingsToUI() can use them before _attachEventListeners() is executed.
// 2.  window.settingsModalManager now also exposes DEFAULT_SETTINGS_MODAL so that
//     other modules (e.g. translationManager.js) can safely import it.
// 3.  Duplicate in‑scope definitions removed from _attachEventListeners().
// 4.  No runtime logic changed – only hoisting / deduplication – so behaviour is
//     identical but ReferenceErrors are gone.
// ---------------------------------------------------------------------------------

/* ---------- global key‑bind helpers ------------------------------------------- */
const MODIFIERS = ["Control", "Alt", "Shift", "Meta"];
const MOUSE_BUTTONS = [
  "Left Mouse Button",
  "Middle Mouse Button",
  "Right Mouse Button",
];

/**
 * Turn a keybind object (or legacy string) into a human‑readable label.
 *   { key, code, modifiers[] }  →  "Ctrl+Shift+S" etc.
 *   Legacy strings like "ShiftLeft" are mapped to "Left Shift".
 */
function keybindToString(bind) {
  if (!bind || bind === "None") return "None";

  // -------- legacy string support (for imports / old LS values) ------------
  if (typeof bind === "string") {
    const mapLegacy = {
      ShiftLeft: "Left Shift",
      ShiftRight: "Right Shift",
      ControlLeft: "Left Control",
      ControlRight: "Right Control",
      AltLeft: "Left Alt",
      AltRight: "Right Alt",
      MetaLeft: "Left Cmd/Win",
      MetaRight: "Right Cmd/Win",
    };
    return mapLegacy[bind] || bind;
  }

  // -------- pretty print object form --------------------------------------
  // Stand‑alone modifier (no extra modifiers) → "Left Shift" etc.
  if (
    bind.key &&
    MODIFIERS.includes(bind.key) &&
    (!bind.modifiers || bind.modifiers.length === 0)
  ) {
    const mapCode = {
      ShiftLeft: "Left Shift",
      ShiftRight: "Right Shift",
      ControlLeft: "Left Control",
      ControlRight: "Right Control",
      AltLeft: "Left Alt",
      AltRight: "Right Alt",
      MetaLeft: "Left Cmd/Win",
      MetaRight: "Right Cmd/Win",
    };
    return mapCode[bind.code] || bind.key.charAt(0).toUpperCase() + bind.key.slice(1);
  }

  // Combination – assemble modifiers first
  const parts = [];
  if (bind.modifiers && bind.modifiers.length) {
    parts.push(
      ...bind.modifiers.map((m) => {
        if (m === "Meta") return "Cmd/Win";
        if (m === "Control") return "Ctrl";
        return m.charAt(0).toUpperCase() + m.slice(1);
      })
    );
  }

  // Main key normalisation
  let main = bind.key || "";
  if (main === " ") main = "Space";
  else if (main.startsWith("Arrow")) main = main.replace("Arrow", "");
  else if (main === "Escape") main = "Esc";

  if (main && !MODIFIERS.includes(main)) parts.push(main);
  // Fallback to .code if key is empty
  if (!main && bind.code) parts.push(bind.code);

  return parts.length ? [...new Set(parts)].join("+") : "None";
}

/* ---------- DOM element refs & defaults ------------------------------------- */
let settingsModal,
  toggleSettingsBtn,
  settingsCloseBtn,
  apiKeyInput,
  modelSelect,
  languageSelect,
  cefrSlider,
  cefrOutput,
  jpdbApiKeyInput,
  miningDeckIdInput,
  customWordCssInput,
  themeSelect,
  forqDeckIdInput,
  blacklistDeckIdInput,
  neverForgetDeckIdInput,
  contextWidthInput,
  forqOnMineCheckbox,
  showPopupKeyInput,
  addKeyInput,
  dialogKeyInput,
  blacklistKeyInput,
  neverForgetKeyInput,
  nothingKeyInput,
  somethingKeyInput,
  hardKeyInput,
  goodKeyInput,
  easyKeyInput,
  showPopupOnHoverCheckbox,
  touchscreenSupportCheckbox,
  disableFadeAnimationCheckbox,
  customPopupCssInput,
  exportSettingsBtn,
  importSettingsBtn,
  panelNavButtons,
  settingPanels,
  autoloadCheckbox;

const CEFR_LEVELS_SETTINGS = ["A1", "A2", "B1", "B2", "C1", "C2"];
const DEFAULT_SETTINGS_MODAL = {
  apiKey: "",
  // model will be set from serverDefaultModel
  language: "Japanese",
  cefrIndex: 3,
  jpdbApiKey: "",
  userTheme: "system",
  miningDeckId: "",
  forqDeckId: "",
  blacklistDeckId: "",
  neverForgetDeckId: "",
  contextWidth: 1,
  forqOnMine: false,
  showPopupKey: "ShiftLeft",
  addKey: "None",
  dialogKey: "None",
  blacklistKey: "None",
  neverForgetKey: "None",
  nothingKey: "None",
  somethingKey: "None",
  hardKey: "None",
  goodKey: "None",
  easyKey: "None",
  showPopupOnHover: true,
  touchscreenSupport: false,
  disableFadeAnimation: false,
  customWordCSS: "",
  customPopupCSS: "",
};
let serverProvidedDefaultModel = "gpt-4o-mini"; // fallback

/* ---------- ORIGINAL LOGIC (unchanged except duplicate removal) ---------- */

function _selectDOMElements() {
  settingsModal = document.getElementById("settings-modal");
  toggleSettingsBtn = document.getElementById("toggle-settings-btn");
  settingsCloseBtn = document.querySelector("#settings-modal .close-modal-btn");
  apiKeyInput = document.getElementById("openai-key");
  modelSelect = document.getElementById("openai-model");
  languageSelect = document.getElementById("target-language");
  cefrSlider = document.getElementById("cefr-level");
  cefrOutput = document.getElementById("cefr-output");
  jpdbApiKeyInput = document.getElementById("jpdb-api-key");
  miningDeckIdInput = document.getElementById("mining-deck-id");
  customWordCssInput = document.getElementById("custom-word-css");
  themeSelect = document.getElementById("theme-select");
  forqDeckIdInput = document.getElementById("forq-deck-id");
  blacklistDeckIdInput = document.getElementById("blacklist-deck-id");
  neverForgetDeckIdInput = document.getElementById("never-forget-deck-id");
  contextWidthInput = document.getElementById("context-width");
  forqOnMineCheckbox = document.getElementById("forq-on-mine");
  showPopupKeyInput = document.getElementById("show-popup-key");
  addKeyInput = document.getElementById("add-key");
  dialogKeyInput = document.getElementById("dialog-key");
  blacklistKeyInput = document.getElementById("blacklist-key");
  neverForgetKeyInput = document.getElementById("never-forget-key");
  nothingKeyInput = document.getElementById("nothing-key");
  somethingKeyInput = document.getElementById("something-key");
  hardKeyInput = document.getElementById("hard-key");
  goodKeyInput = document.getElementById("good-key");
  easyKeyInput = document.getElementById("easy-key");
  showPopupOnHoverCheckbox = document.getElementById("show-popup-on-hover");
  touchscreenSupportCheckbox = document.getElementById("touchscreen-support");
  disableFadeAnimationCheckbox = document.getElementById("disable-fade-animation");
  customPopupCssInput = document.getElementById("custom-popup-css");
  exportSettingsBtn = document.getElementById("export-settings-btn");
  importSettingsBtn = document.getElementById("import-settings-btn");
  panelNavButtons = document.querySelectorAll(".panel-nav-btn");
  settingPanels = document.querySelectorAll(".settings-panel-content");
  autoloadCheckbox = document.getElementById("autoload-checkbox");
}

function _updateCefrOutput() {
  if (cefrOutput && cefrSlider) {
    cefrOutput.textContent = CEFR_LEVELS_SETTINGS[cefrSlider.value];
  }
}

function openSettingsModal() {
  if (settingsModal) {
    _loadSettingsToUI();
    settingsModal.classList.add("active");
  }
}

function closeSettingsModal() {
  if (settingsModal) {
    settingsModal.classList.remove("
