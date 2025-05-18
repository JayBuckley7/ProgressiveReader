// ttsManager.js - Basic text-to-speech controls using Web Speech API

let isSpeaking = false;
let currentUtterance = null;

function speakCurrentChapter() {
    if (isSpeaking) return;
    const content = document.querySelector('.chapter-content');
    if (!content) return;
    const text = content.innerText;
    if (!text) return;

    currentUtterance = new SpeechSynthesisUtterance(text);
    currentUtterance.onend = () => {
        isSpeaking = false;
        const btn = document.getElementById('read-aloud-btn');
        if (btn) btn.textContent = 'Read Aloud';
    };
    speechSynthesis.speak(currentUtterance);
    isSpeaking = true;
    const btn = document.getElementById('read-aloud-btn');
    if (btn) btn.textContent = 'Stop';
}

function stopSpeaking() {
    if (isSpeaking) {
        speechSynthesis.cancel();
        isSpeaking = false;
        const btn = document.getElementById('read-aloud-btn');
        if (btn) btn.textContent = 'Read Aloud';
    }
}

function initTtsManager() {
    const btn = document.getElementById('read-aloud-btn');
    if (!btn) return;
    btn.addEventListener('click', () => {
        if (isSpeaking) {
            stopSpeaking();
        } else {
            speakCurrentChapter();
        }
    });
}

window.ttsManager = { initTtsManager, speakCurrentChapter, stopSpeaking };
