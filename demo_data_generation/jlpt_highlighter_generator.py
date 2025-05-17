import os
import sys
import re
import json
import time
import requests
from bs4 import BeautifulSoup
from typing import List, Dict, Any

# ---------------- CONFIG ----------------
JPDB_API_URL = "https://jpdb.io/api/v1/parse"
DEFAULT_JPDB_API_KEY = ""
MAX_SEGMENTS_PER_API_BATCH = 50
MAX_BYTES_PER_API_BATCH = 14_000  # JPDB documented limit (14 kB)
TOKEN_FIELDS = ["position", "length", "vocabulary_index", "furigana"]
VOCAB_FIELDS = [
    "vid", "sid", "rid", "spelling", "reading", "frequency_rank",
    "part_of_speech", "meanings_chunks", "meanings_part_of_speech",
    "card_state", "pitch_accent",
]

BOOK_FOLDER_MAP = {
    "dcc_smol": "demo-uuid-dcc-smol",
    "wasteland_smol": "demo-uuid-wasteland-smol",
    "草枕_smol": "demo-uuid-kusamakura-smol",
}

# ------------- Helper functions ----------------

def debug(msg: str):
    print(f"[DEBUG] {msg}")


# ---------- Translate‑entry utilities ----------

def html_from_stream(stream: List[str]) -> str:
    """Re‑create translated HTML from response_json_stream array."""
    chunks: List[str] = []
    for line in stream:
        if not line.startswith("data: "):
            continue
        payload = line[6:].strip()
        if payload == "[DONE]":
            break
        try:
            obj = json.loads(payload)
        except json.JSONDecodeError:
            continue
        # final packet may contain translated_text
        if obj.get("complete") is True and obj.get("translated_text"):
            chunks.append(obj["translated_text"])
        elif "content" in obj:
            chunks.append(obj["content"])
    html = "".join(chunks)
    # remove any accidental markdown fences
    html = re.sub(r"^```.*?\n|```$", "", html, flags=re.DOTALL)
    return html


def get_entry_html(entry: Dict[str, Any]) -> str:
    if "translated_text" in entry and entry["translated_text"]:
        return entry["translated_text"]
    # older format: reconstruct from stream
    stream = entry.get("response_json_stream")
    if isinstance(stream, list):
        return html_from_stream(stream)
    raise ValueError("No HTML found in entry (missing translated_text / stream)")

# ---------- JPDB helpers ----------

def strip_html(html: str) -> str:
    return BeautifulSoup(html, "lxml").get_text(separator="", strip=False)


def split_sentences(text: str) -> List[str]:
    return [s.strip() for s in re.split(r"(?:。|\n)", text) if s.strip()]


def jpdb_post(segments: List[str], api_key: str):
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
        "Accept": "application/json",
    }
    payload = {
        "text": segments,
        "position_length_encoding": "utf16",
        "token_fields": TOKEN_FIELDS,
        "vocabulary_fields": VOCAB_FIELDS,
    }
    debug(f"JPDB call with {len(segments)} segments | {sum(len(s) for s in segments)} chars")
    r = requests.post(JPDB_API_URL, headers=headers, json=payload)
    debug(f"JPDB status {r.status_code}")
    r.raise_for_status()
    return r.json()


def build_vocab_map(raw):
    out = []
    for v in raw:
        out.append({
            "vid": v[VOCAB_FIELDS.index("vid")],
            "sid": v[VOCAB_FIELDS.index("sid")],
            "rid": v[VOCAB_FIELDS.index("rid")],
            "spelling": v[VOCAB_FIELDS.index("spelling")],
            "reading": v[VOCAB_FIELDS.index("reading")],
            "frequencyRank": v[VOCAB_FIELDS.index("frequency_rank")],
            "partOfSpeech": v[VOCAB_FIELDS.index("part_of_speech")],
            "pitchAccent": v[VOCAB_FIELDS.index("pitch_accent")] or [],
            "state": v[VOCAB_FIELDS.index("card_state")] or ["not-in-deck"],
            "meanings": [
                {
                    "glosses": glosses,
                    "partOfSpeech": v[VOCAB_FIELDS.index("meanings_part_of_speech")][i],
                }
                for i, glosses in enumerate(v[VOCAB_FIELDS.index("meanings_chunks")])
            ],
        })
    return out


def parse_chapter(text: str, api_key: str):
    segs = split_sentences(text)
    debug(f"› split into {len(segs)} segments")
    tokens, global_off, idx = [], 0, 0
    while idx < len(segs):
        batch, bytes_batch = [], 0
        while idx < len(segs) and len(batch) < MAX_SEGMENTS_PER_API_BATCH:
            seg = segs[idx]
            seg_b = len(seg.encode("utf-8"))
            if seg_b > MAX_BYTES_PER_API_BATCH:
                debug("  ‑ oversized segment skipped")
                idx += 1; global_off += len(seg); continue
            if bytes_batch + seg_b > MAX_BYTES_PER_API_BATCH:
                break
            batch.append(seg); bytes_batch += seg_b; idx += 1
        if not batch:
            break
        data = jpdb_post(batch, api_key)
        vocab_map = build_vocab_map(data.get("vocabulary", []))
        for seg_i, tok_list in enumerate(data.get("tokens", [])):
            seg_text = batch[seg_i]
            for pos, length, v_idx, furigana in tok_list:
                rubies, off = [], 0
                if isinstance(furigana, list):
                    for part in furigana:
                        if isinstance(part, str):
                            off += len(part)
                        elif isinstance(part, list) and len(part) == 2:
                            base, ruby = part
                            rubies.append({"text": ruby, "start": off, "length": len(base), "end": off+len(base)})
                            off += len(base)
                card = vocab_map[v_idx] if 0 <= v_idx < len(vocab_map) else {"state": ["unknown"]}
                start_glob = global_off + pos
                tokens.append({"start": start_glob, "length": length, "end": start_glob+length, "card": card, "rubies": rubies})
            global_off += len(seg_text)
    debug(f"  tokens total: {len(tokens)}")
    return tokens

# -------------- Main driver --------------

def resolve_folder(arg: str):
    if arg.endswith('.epub'):
        key = os.path.splitext(os.path.basename(arg))[0]
        return BOOK_FOLDER_MAP.get(key, arg)
    return BOOK_FOLDER_MAP.get(arg, arg)


def generate_highlights(arg: str, api_key: str):
    folder = resolve_folder(arg)
    debug(f"Folder = {folder}")
    trans_path = os.path.join(folder, 'mock_translate_responses.json')
    if not os.path.isfile(trans_path):
        raise FileNotFoundError(trans_path)

    translations = json.load(open(trans_path, encoding='utf-8'))
    debug(f"Loaded {len(translations)} translate entries")

    jp_entries = [e for e in translations if e.get('target_language') == 'Japanese']
    debug(f"Japanese entries: {len(jp_entries)}")

    results = []
    for ent in jp_entries:
        try:
            html = get_entry_html(ent)
        except ValueError as e:
            debug(f"Entry idx={ent['item_index']} missing html : {e}")
            continue
        plain = strip_html(html)
        debug(f"Processing idx={ent['item_index']} {ent['cefr_level']} (chars {len(plain)})")
        tokens = parse_chapter(plain, api_key)
        results.append({
            'book_id': ent['book_id'],
            'item_index': ent['item_index'],
            'target_language': 'Japanese',
            'cefr_level': ent['cefr_level'],
            'response_json': tokens,
        })
        time.sleep(0.05)

    out_file = os.path.join(folder, 'mock_highlight_responses.json')
    json.dump(sorted(results, key=lambda d: (d['item_index'], d['cefr_level'])), open(out_file, 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
    print(f"⭐ highlights written → {out_file} ({len(results)} entries)")


if __name__ == '__main__':
    if len(sys.argv) == 2:
        arg, key = sys.argv[1], DEFAULT_JPDB_API_KEY
    elif len(sys.argv) == 3:
        arg, key = sys.argv[1], sys.argv[2]
    else:
        print('Usage: python generate_mock_highlight_json.py <epub|key|folder> [JPDB_API_KEY]'); sys.exit(1)

    try:
        generate_highlights(arg, key)
    except Exception as exc:
        print('Error:', exc)
        sys.exit(1)
