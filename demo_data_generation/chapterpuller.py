import os
import sys
import json
import time
import requests
from typing import List, Dict, Tuple
from ebooklib import epub, ITEM_DOCUMENT
from bs4 import BeautifulSoup

# ── Hard‑coded mapping of each book to its demo JSON folder ────────────
BOOK_FOLDER_MAP: Dict[str, str] = {
    # EPUB metadata title (or filename keyword) : demo folder name
    "Dungeon Crawler Carl": "demo-uuid-dcc-smol",
    "dcc_smol": "demo-uuid-dcc-smol",
    "The Waste Land": "demo-uuid-wasteland-smol",
    "wasteland_smol": "demo-uuid-wasteland-smol",
    "草枕": "demo-uuid-kusamakura-smol",
    "kusamakura_smol": "demo-uuid-kusamakura-smol",
}

# ── Translation targets ────────────────────────────────────────────────
LANGUAGES: List[Tuple[str, str]] = [
    ("Spanish", "es"),
    ("French", "fr"),
    ("German", "de"),
    ("Mandarin", "zh"),
    ("Japanese", "ja"),
    ("Korean", "ko"),
]
CEFR_LEVELS: List[str] = ["A1", "A2", "B1", "B2", "C1", "C2"]

# ── OpenAI API configuration (real key inserted) ───────────────────────
OPENAI_API_KEY = ""
OPENAI_MODEL = "gpt-4o-mini"
OPENAI_URL = "https://api.openai.com/v1/chat/completions"
HEADERS = {
    "Authorization": f"Bearer {OPENAI_API_KEY}",
    "Content-Type": "application/json",
}

# ── Helpers ────────────────────────────────────────────────────────────

def sanitize_filename(name: str) -> str:
    """Replace characters that are invalid in file names."""
    return "".join(c if c.isalnum() or c in (" ", "-", "_") else "_" for c in name).strip()


def post_chat_completion_stream(messages: List[Dict[str, str]]) -> str:
    """Call the OpenAI chat completion endpoint with streaming and return full content."""
    payload = {
        "model": OPENAI_MODEL,
        "messages": messages,
        "stream": True,
        "max_tokens": 4096,
        "temperature": 0.2,
    }
    full_text = ""
    with requests.post(OPENAI_URL, headers=HEADERS, json=payload, stream=True, timeout=90) as resp:
        resp.raise_for_status()
        for line in resp.iter_lines():
            if not line:
                continue
            decoded = line.decode("utf-8")
            if decoded.startswith("data: "):
                data = decoded[6:]
                if data.strip() == "[DONE]":
                    break
                try:
                    chunk = json.loads(data)
                    delta = chunk["choices"][0].get("delta", {})
                    full_text += delta.get("content", "")
                except json.JSONDecodeError:
                    continue
    return full_text


def generate_mock_stream(original_html: str, translated_html: str) -> List[str]:
    """Return the response_json_stream array matching the required SSE mock format."""
    return [
        "data: {\"status\": \"started\"}\n\n",
        f"data: {{\"content\": {json.dumps(original_html)} }}\n\n",
        f"data: {{\"complete\": true, \"translated_text\": {json.dumps(translated_html)} }}\n\n",
        "data: [DONE]\n\n",
    ]


# ── Core process ───────────────────────────────────────────────────────

def build_mock_translate(epub_path: str):
    # 1. Read EPUB
    print(f"[MockGen] Loading EPUB: {epub_path}")
    try:
        book = epub.read_epub(epub_path)
    except Exception as exc:
        print(f"[MockGen] ERROR: Could not read EPUB — {exc}")
        return

    # 2. Identify demo folder
    title_meta = book.get_metadata("DC", "title")
    book_title = title_meta[0][0] if title_meta else os.path.splitext(os.path.basename(epub_path))[0]
    safe_title = sanitize_filename(book_title)

    # Resolve demo folder name by explicit mapping (filename & title keywords)
    demo_folder = None
    for key, folder in BOOK_FOLDER_MAP.items():
        if key.lower() in book_title.lower() or key.lower() in os.path.basename(epub_path).lower():
            demo_folder = folder
            break
    if demo_folder is None:
        print(f"[MockGen] ERROR: No demo folder mapping for '{book_title}'. Aborting.")
        return

    repo_root = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
    demo_base = os.path.join(repo_root, 'app', 'static', 'demo_data')
    demo_path = os.path.join(demo_base, demo_folder)
    os.makedirs(demo_path, exist_ok=True)
    print(f"[MockGen] Writing mock translations to '{demo_path}'")

    # 3. Iterate chapters via spine
    spine_ids = [ref for ref, _ in book.spine]
    entries: List[Dict] = []

    for idx, idref in enumerate(spine_ids, start=1):
        item = book.get_item_with_id(idref)
        if not item or item.get_type() != ITEM_DOCUMENT:
            continue

        soup = BeautifulSoup(item.get_content(), "lxml")
        body = soup.body
        original_html = "".join(str(child) for child in body.children) if body else item.get_body_content().decode("utf-8", errors="ignore")

        base_name = item.get_name() or f"chapter_{idx:02d}"
        print(f"  • Chapter {idx}: {base_name}")

        for lang_name, _ in LANGUAGES:
            for cefr in CEFR_LEVELS:
                print(f"    – Translating to {lang_name} (CEFR {cefr})…", end=" ")
                try:
                    translated_html = post_chat_completion_stream([
                        {"role": "system", "content": (
                            f"You are a professional literary translator. Translate the provided HTML into {lang_name} at CEFR level {cefr}. "
                            "Return only valid HTML, preserving structure." )},
                        {"role": "user", "content": original_html},
                    ])
                    print("done")
                except Exception as exc:
                    print(f"ERROR: {exc}")
                    translated_html = f"<div class='translation-error'>{exc}</div>"

                stream_lines = generate_mock_stream(original_html, translated_html)
                entry = {
                    "book_id": demo_folder,
                    "item_index": idx,
                    "target_language": lang_name,
                    "cefr_level": cefr,
                    "response_json_stream": stream_lines,
                }
                entries.append(entry)
                time.sleep(0.2)  # basic throttle

    # 4. Append to the book's JSON file under app/static/demo_data
    out_file = os.path.join(demo_path, "translate_responses.json")
    if os.path.isfile(out_file):
        try:
            existing = json.load(open(out_file, encoding="utf-8"))
        except Exception:
            existing = []
    else:
        existing = []
    existing.extend(entries)
    with open(out_file, "w", encoding="utf-8") as fp:
        json.dump(existing, fp, ensure_ascii=False, indent=2)
    print(f"[MockGen] Mock file written: {out_file} (total {len(existing)} entries)")


# ── Entrypoint ─────────────────────────────────────────────────────────
if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Usage: python chapterpuller.py <book.epub>")
        sys.exit(1)

    epub_file = sys.argv[1]
    if not os.path.isfile(epub_file):
        print(f"Error: file '{epub_file}' not found in '{os.getcwd()}'")
        sys.exit(1)

    build_mock_translate(epub_file)
