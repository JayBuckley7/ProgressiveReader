"""Utility helpers for interacting with the JPDB API."""
from flask import jsonify, current_app
import re


def validate_jpdb_request(data):
    """Validate and normalize payload for ``get_jpdb_data``.

    Returns a tuple ``(segments, api_key, error_response)`` where ``segments`` is
    a list of cleaned strings, ``api_key`` is the JPDB API key and
    ``error_response`` is a Flask response tuple to be returned directly on
    failure.
    """
    if not data:
        return None, None, (jsonify({"error": "Invalid JSON payload"}), 400)

    text_segments = data.get("text_segments")
    api_key = data.get("jpdb_api_key")

    if not text_segments or not isinstance(text_segments, list):
        msg = "Missing or invalid 'text_segments' (must be a list of strings)"
        return None, None, (jsonify({"error": msg}), 400)
    if not all(isinstance(s, str) for s in text_segments):
        msg = "Invalid 'text_segments': all items must be strings"
        return None, None, (jsonify({"error": msg}), 400)
    if not api_key or not isinstance(api_key, str):
        return None, None, (jsonify({"error": "Missing or invalid 'jpdb_api_key'"}), 400)

    clean_segments = []
    for seg in text_segments:
        norm = re.sub(r"\s+", " ", seg).strip()
        if norm:
            clean_segments.append(norm)

    if not clean_segments:
        current_app.logger.info("No non-empty segments to process for JPDB.")
        return [], api_key, None

    return clean_segments, api_key, None


def create_jpdb_batches(segments, max_bytes, max_segments):
    """Yield batches of segments honoring JPDB API limits.

    Each yielded value is ``(batch_segments, offset)`` where ``offset`` is the
    global character offset of the first segment in the batch.
    """
    start_index = 0
    offset = 0
    while start_index < len(segments):
        batch = []
        batch_bytes = 0
        next_index = start_index
        while next_index < len(segments):
            seg = segments[next_index]
            seg_bytes = len(seg.encode("utf-8"))
            if seg_bytes > max_bytes:
                current_app.logger.warning(
                    "Segment %s (bytes: %s) exceeds MAX_BYTES_PER_API_BATCH (%s).",
                    next_index,
                    seg_bytes,
                    max_bytes,
                )
                if next_index == start_index:
                    offset += len(seg)
                    start_index += 1
                break
            if len(batch) < max_segments and batch_bytes + seg_bytes <= max_bytes:
                batch.append(seg)
                batch_bytes += seg_bytes
                next_index += 1
            else:
                break
        if not batch:
            continue
        yield batch, offset
        offset += sum(len(s) for s in batch)
        start_index = next_index


def build_vocab_map(vocab_list, vocab_fields):
    """Return a list of vocabulary dictionaries from a JPDB response."""
    mapping = []
    for entry in vocab_list:
        if not isinstance(entry, (list, tuple)) or len(entry) < len(vocab_fields):
            current_app.logger.warning("Skipping malformed vocab entry: %s", entry)
            mapping.append({"vid": None, "sid": None, "state": ["error-vocab-format"]})
            continue
        data = dict(zip(vocab_fields, entry))
        meanings = []
        if data.get("meanings_chunks") and data.get("meanings_part_of_speech"):
            for i, glosses in enumerate(data["meanings_chunks"]):
                if i < len(data["meanings_part_of_speech"]):
                    meanings.append({
                        "glosses": glosses,
                        "partOfSpeech": data["meanings_part_of_speech"][i],
                    })
        for k in ["meanings_chunks", "meanings_part_of_speech"]:
            data.pop(k, None)
        mapping.append({
            "vid": data["vid"],
            "sid": data["sid"],
            "rid": data["rid"],
            "spelling": data["spelling"],
            "reading": data["reading"],
            "frequencyRank": data["frequency_rank"],
            "partOfSpeech": data["part_of_speech"],
            "meanings": meanings,
            "state": data.get("card_state") or ["not-in-deck"],
            "pitchAccent": data.get("pitch_accent") or [],
        })
    return mapping


def extract_rubies(furigana):
    """Parse JPDB furigana data into ruby dictionaries."""
    rubies = []
    if not (furigana and isinstance(furigana, list)):
        return rubies
    offset = 0
    for part in furigana:
        if isinstance(part, str):
            offset += len(part)
        elif isinstance(part, list) and len(part) == 2:
            base, ruby = part
            if isinstance(base, str) and isinstance(ruby, str):
                rubies.append({
                    "text": ruby,
                    "start": offset,
                    "length": len(base),
                    "end": offset + len(base),
                })
                offset += len(base)
    return rubies


def parse_jpdb_tokens(jpdb_data, segments, token_fields, vocab_fields, start_offset):
    """Convert JPDB API response into a list of token dictionaries."""
    vocab_map = build_vocab_map(jpdb_data.get("vocabulary", []), vocab_fields)

    tokens = []
    tokens_data = jpdb_data.get("tokens", [])
    if len(tokens_data) != len(segments):
        current_app.logger.warning("JPDB API segments sent/received mismatch")

    char_offset = 0
    for seg_idx, seg_tokens in enumerate(tokens_data):
        if seg_idx >= len(segments):
            break
        seg_text = segments[seg_idx]
        for raw in seg_tokens:
            if not isinstance(raw, (list, tuple)) or len(raw) < len(token_fields):
                current_app.logger.warning("Skipping malformed token: %s", raw)
                continue
            vidx = raw[token_fields.index("vocabulary_index")]
            pos = raw[token_fields.index("position")]
            length = raw[token_fields.index("length")]
            furigana = raw[token_fields.index("furigana")]
            if not all(isinstance(x, int) for x in [vidx, pos, length]):
                current_app.logger.warning("Skipping token with invalid numeric fields: %s", raw)
                continue
            try:
                if vidx < 0:
                    card = {"state": ["unknown-negative-vocab-idx"]}
                elif vidx < len(vocab_map):
                    card = vocab_map[vidx]
                else:
                    card = {"state": ["unknown-vocab-idx-out-of-bounds"]}
            except Exception as exc:
                current_app.logger.error("Error accessing vocab_map at %s: %s", vidx, exc)
                card = {"state": ["error-vocab-map-access"]}
            rubies = extract_rubies(furigana)
            token_start = start_offset + char_offset + pos
            tokens.append({
                "start": token_start,
                "length": length,
                "end": token_start + length,
                "card": card,
                "rubies": rubies,
            })
        char_offset += len(seg_text)
    return tokens
