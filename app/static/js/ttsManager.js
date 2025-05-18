// Enhanced text-to-speech controls with progress tracking and floating controls

let isSpeaking = false;
let isPaused = false;
let currentUtterance = null;
let contentElement = null;
let contentText = "";
let currentIndex = 0;
let currentRate = 1.0;
let textNodeMap = [];
let fallbackHighlightEl = null;
const TTS_HIGHLIGHT_NAME = "tts-current-word"; // Name for the CSS Highlight
let fallbackTimeoutId = null;
const boundarySupported = "onboundary" in SpeechSynthesisUtterance.prototype;

function buildIndexMap(element) {
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, null);
  const map = [];
  let index = 0;
  while (walker.nextNode()) {
    const node = walker.currentNode;
    map.push({ node, start: index });
    index += node.textContent.length;
  }
  return map;
}

function findNodeOffset(map, charIndex) {
  for (let i = map.length - 1; i >= 0; i--) {
    if (charIndex >= map[i].start) {
      return { node: map[i].node, offset: charIndex - map[i].start };
    }
  }
  return { node: map[0].node, offset: 0 };
}

function clearHighlight() {
  if (CSS.highlights) {
    CSS.highlights.delete(TTS_HIGHLIGHT_NAME);
  } else if (fallbackHighlightEl) {
    const parent = fallbackHighlightEl.parentNode;
    if (parent) {
      while (fallbackHighlightEl.firstChild) {
        parent.insertBefore(
          fallbackHighlightEl.firstChild,
          fallbackHighlightEl,
        );
      }
      parent.removeChild(fallbackHighlightEl);
    }
    fallbackHighlightEl = null;
  }
}

function highlightAtIndex(index) {
  clearHighlight();

  const remainingText = contentText.slice(index);
  const match = remainingText.match(/\S+/); // Find the current word (any non-whitespace sequence)
  if (!match) return;

  const word = match[0];
  const start = index; // Start index of the word in the full contentText
  const end = index + word.length; // End index of the word

  const startPos = findNodeOffset(textNodeMap, start);
  const endPos = findNodeOffset(textNodeMap, end);

  if (!startPos.node || !endPos.node) {
    console.warn("Could not find nodes for highlighting range.");
    return;
  }

  const range = document.createRange();
  try {
    range.setStart(startPos.node, startPos.offset);
    range.setEnd(endPos.node, endPos.offset);

    if (CSS.highlights) {
      const highlight = new Highlight(range);
      CSS.highlights.set(TTS_HIGHLIGHT_NAME, highlight);
    } else {
      const span = document.createElement("span");
      span.className = "tts-highlight";
      range.surroundContents(span);
      fallbackHighlightEl = span;
    }
  } catch (err) {
    console.warn("Unable to highlight range", err);
  }
}

function highlightSentenceAtIndex(index) {
  clearHighlight();

  const remainingText = contentText.slice(index);
  const match = remainingText.match(/[^.!?]+[.!?]*\s*/);
  if (!match) return;

  const segment = match[0];
  const start = index;
  const end = index + segment.length;

  const startPos = findNodeOffset(textNodeMap, start);
  const endPos = findNodeOffset(textNodeMap, end);

  if (!startPos.node || !endPos.node) {
    console.warn("Could not find nodes for sentence highlight range.");
    return;
  }

  const range = document.createRange();
  try {
    range.setStart(startPos.node, startPos.offset);
    range.setEnd(endPos.node, endPos.offset);

    if (CSS.highlights) {
      const highlight = new Highlight(range);
      CSS.highlights.set(TTS_HIGHLIGHT_NAME, highlight);
    } else {
      const span = document.createElement("span");
      span.className = "tts-highlight";
      range.surroundContents(span);
      fallbackHighlightEl = span;
    }
  } catch (err) {
    console.warn("Unable to highlight sentence range", err);
  }
}

function startFallbackHighlighting(startIndex) {
  const sentences = contentText.slice(startIndex).match(/[^.!?]+[.!?]*\s*/g);
  if (!sentences) return;
  let offset = startIndex;
  let i = 0;

  function highlightNext() {
    currentIndex = offset;
    highlightSentenceAtIndex(currentIndex);

    const wordCount = sentences[i].trim().split(/\s+/).filter(Boolean).length;
    i++;
    if (i >= sentences.length) {
      fallbackTimeoutId = setTimeout(
        stopFallbackHighlighting,
        (300 * wordCount) / currentRate,
      );
      return;
    }
    offset += sentences[i - 1].length;
    fallbackTimeoutId = setTimeout(
      highlightNext,
      (300 * wordCount) / currentRate,
    );
  }

  highlightNext();
}

function stopFallbackHighlighting() {
  if (fallbackTimeoutId) {
    clearTimeout(fallbackTimeoutId);
    fallbackTimeoutId = null;
  }
}

function showControls() {
  const panel = document.getElementById("tts-control-panel");
  if (panel) panel.style.display = "flex";
}

function hideControls() {
  const panel = document.getElementById("tts-control-panel");
  if (panel) panel.style.display = "none";
}

function speakFromIndex(index) {
  if (!contentElement) return;
  currentUtterance = new SpeechSynthesisUtterance(contentText.slice(index));
  currentUtterance.rate = currentRate;
  if (boundarySupported) {
    currentUtterance.onboundary = (e) => {
      if (e.name === "word") {
        currentIndex = index + e.charIndex;
        highlightAtIndex(currentIndex);
      }
    };
  } else {
    startFallbackHighlighting(index);
  }
  currentUtterance.onend = () => {
    isSpeaking = false;
    isPaused = false;
    hideControls();
    clearHighlight();
    stopFallbackHighlighting();
    const btn = document.getElementById("read-aloud-btn");
    if (btn) btn.textContent = "Read Aloud";
  };
  speechSynthesis.speak(currentUtterance);
  isSpeaking = true;
  isPaused = false;
  const btn = document.getElementById("read-aloud-btn");
  if (btn) btn.textContent = "Stop";
  showControls();
}

function speakCurrentChapter() {
  if (isSpeaking) return;
  contentElement = document.querySelector(".chapter-content");
  if (!contentElement) {
    console.error("TTS: .chapter-content element not found.");
    return;
  }
  // Use textContent for potentially better performance and simpler text extraction
  contentText = contentElement.textContent || "";
  if (!contentText.trim()) {
    console.warn("TTS: No text content found in .chapter-content.");
    return;
  }

  textNodeMap = buildIndexMap(contentElement);
  currentIndex = 0;

  // Check for API support before starting
  if (!("speechSynthesis" in window)) {
    console.error("TTS: Web Speech API (speechSynthesis) not supported.");
    alert("Sorry, your browser doesn't support text-to-speech.");
    return;
  }
  // Log highlighting method status
  if (CSS.highlights) {
    console.log(
      "[ttsManager] Using CSS Custom Highlight API for word highlighting (main method).",
    );
  } else {
    console.warn(
      "[ttsManager] CSS Custom Highlight API not supported. TTS will work without word highlighting (no backup method currently).",
    );
  }

  if (!boundarySupported) {
    console.warn(
      "[ttsManager] SpeechSynthesisUtterance boundary events not supported. Using sentence-based fallback highlighting.",
    );
  }

  speakFromIndex(0);
}

function pauseSpeaking() {
  if (isSpeaking && !isPaused) {
    speechSynthesis.pause();
    isPaused = true;
    stopFallbackHighlighting();
  }
}

function resumeSpeaking() {
  if (isSpeaking && isPaused) {
    speechSynthesis.resume();
    isPaused = false;
    if (!boundarySupported) {
      startFallbackHighlighting(currentIndex);
    }
  }
}

function stopSpeaking() {
  if (isSpeaking) {
    speechSynthesis.cancel();
    isSpeaking = false;
    isPaused = false;
    hideControls();
    clearHighlight();
    stopFallbackHighlighting();
    const btn = document.getElementById("read-aloud-btn");
    if (btn) btn.textContent = "Read Aloud";
  }
}

function adjustRate(delta) {
  currentRate = Math.min(3, Math.max(0.5, currentRate + delta));
  const display = document.getElementById("tts-speed-display");
  if (display) display.textContent = currentRate.toFixed(1) + "x";
  if (isSpeaking) {
    speechSynthesis.cancel();
    speakFromIndex(currentIndex);
  }
}

function initTtsManager() {
  const btn = document.getElementById("read-aloud-btn");
  if (btn) {
    btn.addEventListener("click", () => {
      console.log("[ttsManager] Read Aloud button clicked.");
      if (isSpeaking) {
        stopSpeaking();
      } else {
        speakCurrentChapter();
      }
    });
  }

  const pauseBtn = document.getElementById("tts-pause-btn");
  const stopBtn = document.getElementById("tts-stop-btn");
  const fasterBtn = document.getElementById("tts-speed-up");
  const slowerBtn = document.getElementById("tts-speed-down");

  if (pauseBtn) {
    pauseBtn.addEventListener("click", () => {
      if (isPaused) {
        resumeSpeaking();
        pauseBtn.textContent = "Pause";
      } else {
        pauseSpeaking();
        pauseBtn.textContent = "Resume";
      }
    });
  }

  if (stopBtn) {
    stopBtn.addEventListener("click", () => {
      stopSpeaking();
    });
  }

  if (fasterBtn) {
    fasterBtn.addEventListener("click", () => adjustRate(0.1));
  }

  if (slowerBtn) {
    slowerBtn.addEventListener("click", () => adjustRate(-0.1));
  }

  const display = document.getElementById("tts-speed-display");
  if (display) display.textContent = currentRate.toFixed(1) + "x";
}

window.ttsManager = {
  initTtsManager,
  speakCurrentChapter,
  stopSpeaking,
  pauseSpeaking,
  resumeSpeaking,
  adjustRate,
};
