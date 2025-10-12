"""Blueprint providing translation and content API routes."""
from flask import Blueprint, request, jsonify, session, current_app, Response
from openai import OpenAI
import requests
import re
import json
import os
from ..utils.clerk_auth import require_auth, optional_auth, require_admin
from ..models import db, Bookmark
from flask import g
import logging

logger = logging.getLogger(__name__)

api_bp = Blueprint('api', __name__, url_prefix='/api')

# --- OpenAI API Key Pool ---
openai_key_pool: list[str] = []
_key_index = 0


def get_next_openai_key() -> str | None:
    """Return the next key from the pool using round-robin rotation."""
    global _key_index
    if not openai_key_pool:
        return None
    key = openai_key_pool[_key_index]
    _key_index = (_key_index + 1) % len(openai_key_pool)
    return key

@api_bp.route('/debug/admin_check', methods=['GET'])
@require_auth
def debug_admin_check():
    """Debug endpoint to check admin status and organization memberships."""
    from ..utils.clerk_auth import is_progressive_reader_admin, clerk

    user = g.user
    if not user:
        return jsonify({"error": "No user found"}), 401

    debug_info = {
        "user_id": user.id,
        "is_admin": is_progressive_reader_admin(user.id),
        "memberships": []
    }

    if clerk:
        try:
            memberships = clerk.organization_memberships.list(user_id=[user.id])
            for m in memberships.data:
                org = getattr(m, "organization", None)
                org_name = getattr(org, "name", "") if org else ""
                debug_info["memberships"].append({
                    "organization_name": org_name,
                    "role": m.role,
                    "is_progressive_reader": org_name == "ProgressiveReader",
                    "is_admin_role": m.role.lower() == "admin"
                })
        except Exception as e:
            debug_info["error"] = str(e)
    else:
        debug_info["error"] = "Clerk client not initialized"

    return jsonify(debug_info)

@api_bp.route('/openai_key_configured', methods=['GET'])
def openai_key_configured():
    """Return whether the server has at least one OpenAI API key."""
    configured = bool(openai_key_pool or current_app.config.get('OPENAI_API_KEY'))
    return jsonify({'openai_key_configured': configured,
                    'pool_size': len(openai_key_pool)})



@api_bp.route('/openai_keys/add', methods=['POST'])
@require_admin
def add_openai_key():
    """Add an API key to the rotation pool."""
    data = request.get_json() or {}
    key = data.get('key')
    if not key:
        return jsonify({'error': 'Missing key'}), 400
    openai_key_pool.append(key)
    current_app.logger.info(f'Added OpenAI key. Pool size now {len(openai_key_pool)}')
    return jsonify({'success': True, 'pool_size': len(openai_key_pool)})


@api_bp.route('/openai_keys/remove', methods=['POST'])
@require_admin
def remove_openai_key():
    """Remove an API key from the rotation pool."""
    data = request.get_json() or {}
    key = data.get('key')
    if not key:
        return jsonify({'error': 'Missing key'}), 400
    try:
        openai_key_pool.remove(key)
        current_app.logger.info(
            f'Removed OpenAI key. Pool size now {len(openai_key_pool)}')
        return jsonify({'success': True, 'pool_size': len(openai_key_pool)})
    except ValueError:
        return jsonify({'error': 'Key not found'}), 404


@api_bp.route('/openai_keys', methods=['GET'])
@require_admin
def list_openai_keys():
    """Return the list of stored OpenAI API keys."""
    return jsonify({'keys': openai_key_pool})


# --- Kanji JLPT Level Management ---

def get_kanji_data_path():
    """Get the path to the kanjiapi_full.json file."""
    # Get the project root directory (parent of backend/)
    current_file = os.path.abspath(__file__)  # /path/to/backend/app/routes/api.py
    routes_dir = os.path.dirname(current_file)  # /path/to/backend/app/routes
    app_dir = os.path.dirname(routes_dir)  # /path/to/backend/app
    backend_dir = os.path.dirname(app_dir)  # /path/to/backend
    project_root = os.path.dirname(backend_dir)  # /path/to/project
    return os.path.join(project_root, 'frontend', 'src', 'data', 'jlpt', 'kanjiapi_full.json')

@api_bp.route('/kanji/search', methods=['POST'])
@require_admin
def search_kanji():
    """Search for kanji by character or meaning."""
    data = request.get_json() or {}
    query = data.get('query', '').strip()
    
    if not query:
        return jsonify({'error': 'Missing search query'}), 400
    
    try:
        kanji_path = get_kanji_data_path()
        if not os.path.exists(kanji_path):
            return jsonify({'error': 'Kanji database not found'}), 404
            
        with open(kanji_path, 'r', encoding='utf-8') as f:
            kanji_data = json.load(f)
        
        kanjis = kanji_data.get('kanjis', {})
        results = []
        
        # Search by exact kanji match first
        if query in kanjis:
            kanji_info = kanjis[query].copy()
            kanji_info['kanji'] = query
            results.append(kanji_info)
        
        # Then search by meanings (limit to 20 results)
        if len(results) == 0:
            query_lower = query.lower()
            for kanji_char, kanji_info in kanjis.items():
                if len(results) >= 20:
                    break
                meanings = kanji_info.get('meanings', [])
                if any(query_lower in meaning.lower() for meaning in meanings):
                    result = kanji_info.copy()
                    result['kanji'] = kanji_char
                    results.append(result)
        
        return jsonify({'results': results})
        
    except Exception as e:
        current_app.logger.error(f"Error searching kanji: {e}")
        return jsonify({'error': 'Failed to search kanji'}), 500

@api_bp.route('/kanji/update', methods=['POST'])
@require_admin
def update_kanji_jlpt():
    """Update the JLPT level of a kanji."""
    data = request.get_json() or {}
    kanji = data.get('kanji', '').strip()
    jlpt_level = data.get('jlpt_level')
    
    if not kanji or len(kanji) != 1:
        return jsonify({'error': 'Invalid kanji character'}), 400
    
    if jlpt_level is not None and (not isinstance(jlpt_level, int) or jlpt_level < 1 or jlpt_level > 5):
        return jsonify({'error': 'JLPT level must be between 1-5 or null'}), 400
    
    try:
        kanji_path = get_kanji_data_path()
        if not os.path.exists(kanji_path):
            return jsonify({'error': 'Kanji database not found'}), 404
        
        # Create backup
        backup_path = kanji_path + '.backup'
        with open(kanji_path, 'r', encoding='utf-8') as src:
            with open(backup_path, 'w', encoding='utf-8') as dst:
                dst.write(src.read())
        
        # Load and update data
        with open(kanji_path, 'r', encoding='utf-8') as f:
            kanji_data = json.load(f)
        
        if kanji not in kanji_data.get('kanjis', {}):
            return jsonify({'error': 'Kanji not found in database'}), 404
        
        old_jlpt = kanji_data['kanjis'][kanji].get('jlpt')
        kanji_data['kanjis'][kanji]['jlpt'] = jlpt_level
        
        # Save updated data
        with open(kanji_path, 'w', encoding='utf-8') as f:
            json.dump(kanji_data, f, ensure_ascii=False, separators=(',', ':'))
        
        current_app.logger.info(f'Updated kanji {kanji} JLPT level from {old_jlpt} to {jlpt_level}')
        
        return jsonify({
            'success': True,
            'kanji': kanji,
            'old_jlpt': old_jlpt,
            'new_jlpt': jlpt_level
        })
        
    except Exception as e:
        current_app.logger.error(f"Error updating kanji: {e}")
        return jsonify({'error': 'Failed to update kanji'}), 500

@api_bp.route('/kanji/info/<kanji_char>', methods=['GET'])
@require_admin
def get_kanji_info(kanji_char):
    """Get detailed information about a specific kanji."""
    if not kanji_char or len(kanji_char) != 1:
        return jsonify({'error': 'Invalid kanji character'}), 400
    
    try:
        kanji_path = get_kanji_data_path()
        if not os.path.exists(kanji_path):
            return jsonify({'error': 'Kanji database not found'}), 404
            
        with open(kanji_path, 'r', encoding='utf-8') as f:
            kanji_data = json.load(f)
        
        kanjis = kanji_data.get('kanjis', {})
        
        if kanji_char not in kanjis:
            return jsonify({'error': 'Kanji not found'}), 404
        
        kanji_info = kanjis[kanji_char].copy()
        kanji_info['kanji'] = kanji_char
        
        return jsonify(kanji_info)
        
    except Exception as e:
        current_app.logger.error(f"Error getting kanji info: {e}")
        return jsonify({'error': 'Failed to get kanji info'}), 500


@api_bp.route('/translate/chapter', methods=['POST'])
def translate_chapter():
    """Translate chapter HTML content with OpenAI, optimized for long-form content with streaming support."""
    data = request.get_json()
    if not data:
        return jsonify({"error": "Invalid JSON payload"}), 400

    content = data.get('content')
    target_language = (
        data.get('target_lang')
        or data.get('target_language')
        or data.get('targetLanguage')
    )
    source_language = (
        data.get('source_lang')
        or data.get('source_language')
        or data.get('sourceLanguage')
    )
    model = data.get('model', 'gpt-4o-mini')  # Default optimized for chapters
    user_api_key = data.get('api_key')
    cefr_level = data.get('cefr_level')
    stream = data.get('stream', False)
    use_cefr = data.get('use_cefr', False)
    translation_service = data.get('translation_service', 'openai')  # Default to OpenAI for chapters

    if content is None:
        return jsonify({"error": "Missing required field: content"}), 400

    # Default to English if no target language specified
    if target_language is None:
        target_language = 'English'

    current_app.logger.info(
        f"--- Chapter Translation Request --- Lang: {target_language}, Model: {model}, "
        f"Service: {translation_service}, CEFR: {cefr_level or 'N/A'}, Stream: {stream}"
    )

    # Handle OpenAI service for chapter translation
    # Simplified logic: if user provides personal key, use it; otherwise use server keys
    api_key_to_use = (
        user_api_key
        or get_next_openai_key()
        or current_app.config.get("OPENAI_API_KEY")
    )

    if not api_key_to_use:
        return jsonify({"error": "OpenAI API key not configured"}), 400

    system_prompt = (
        "You are a professional translator specializing in literary content. "
        "Translate the provided HTML chapter content while preserving the HTML structure, "
        "maintaining narrative flow and literary style. ONLY return the translated HTML "
        "content, with no introductory text, explanations, or markdown formatting like ```html."
    )
    user_prompt_prefix = f"Translate the following chapter content to {target_language}"
    if use_cefr and cefr_level:
        user_prompt_prefix += (
            f", adapting the complexity to CEFR level {cefr_level} while maintaining "
            f"the essence and flow of the original text. Preserve HTML tags."
        )
    else:
        user_prompt_prefix += ". Preserve HTML tags and maintain literary quality."
    full_user_prompt = (
        f"{user_prompt_prefix}\n\nChapter Content:\n```html\n{content}\n```"
    )

    try:
        client = OpenAI(api_key=api_key_to_use)

        if stream:
            def generate():
                buffer = ""
                last_chunk = ""

                completion = client.chat.completions.create(
                    model=model,
                    messages=[
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": full_user_prompt},
                    ],
                    stream=True,
                    temperature=0.3,  # Lower temperature for more consistent translations
                )

                yield "data: {\"status\": \"started\"}\n\n"

                for chunk in completion:
                    part = chunk.choices[0].delta.content
                    if part is not None:
                        buffer += part
                        last_chunk += part
                        while "```html" in buffer:
                            buffer = buffer.replace("```html", "", 1)
                        while "```" in buffer:
                            buffer = buffer.replace("```", "", 1)
                        yield f"data: {json.dumps({'content': buffer})}\n\n"
                        buffer = ""

                if buffer:
                    yield f"data: {json.dumps({'content': buffer})}\n\n"

                clean_translated_text = last_chunk
                if clean_translated_text.startswith("```html"):
                    clean_translated_text = clean_translated_text[7:].strip()
                elif clean_translated_text.startswith("```"):
                    clean_translated_text = clean_translated_text[3:].strip()
                if clean_translated_text.endswith("```"):
                    clean_translated_text = clean_translated_text[:-3].strip()

                yield (
                    "data: "
                    f"{json.dumps({'complete': True, 'translated_text': clean_translated_text})}"
                    "\n\n"
                )
                yield "data: [DONE]\n\n"

            return Response(generate(), mimetype="text/event-stream")
        else:
            completion = client.chat.completions.create(
                model=model,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": full_user_prompt},
                ],
                temperature=0.3,  # Lower temperature for more consistent translations
            )
            translated_text = completion.choices[0].message.content.strip()

            if translated_text.startswith("```html"):
                translated_text = translated_text[7:].strip()
            elif translated_text.startswith("```"):
                translated_text = translated_text[3:].strip()
            if translated_text.endswith("```"):
                translated_text = translated_text[:-3].strip()

            current_app.logger.info(
                f"Chapter translation successful. First 100 chars: {translated_text[:100]}..."
            )
            return jsonify({"translated_text": translated_text})

    except Exception as e:
        current_app.logger.error(f"Error calling OpenAI API for chapter: {e}", exc_info=True)
        return jsonify({"error": f"Error during chapter translation: {e}"}), 500


@api_bp.route('/translate/vocabulary', methods=['POST'])
def translate_vocabulary():
    """Translate individual words or phrases for vocabulary highlighting, optimized for speed and accuracy."""
    data = request.get_json()
    if not data:
        return jsonify({"error": "Invalid JSON payload"}), 400

    content = data.get('content')
    target_language = (
        data.get('target_lang')
        or data.get('target_language')
        or data.get('targetLanguage')
        or 'English'  # Default for vocabulary
    )
    translation_service = data.get('translation_service', 'google')  # Default to Google for vocabulary

    if content is None:
        return jsonify({"error": "Missing required field: content"}), 400

    current_app.logger.info(
        f"--- Vocabulary Translation Request --- Content: '{content[:50]}...', "
        f"Lang: {target_language}, Service: {translation_service}"
    )

    user_api_key = data.get('api_key')
    use_server_key = data.get('use_server_key', True)
    
    if use_server_key:
        api_key_to_use = (
            user_api_key
            or get_next_openai_key()
            or current_app.config.get("OPENAI_API_KEY")
        )
    else:
        api_key_to_use = user_api_key

    if not api_key_to_use:
        return jsonify({"error": "OpenAI API key not configured"}), 400

    # Simplified prompt for vocabulary translation
    system_prompt = (
        "You are a precise translator for vocabulary learning. "
        "Translate the given word or short phrase accurately and concisely. "
        "Provide only the translation, no explanations or extra text."
    )
    user_prompt = f"Translate '{content}' to {target_language}"

    try:
        client = OpenAI(api_key=api_key_to_use)

        completion = client.chat.completions.create(
            model="gpt-3.5-turbo",  # Faster model for vocabulary
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            temperature=0.1,  # Very low temperature for consistent vocabulary translations
            max_tokens=50,  # Limit tokens for vocabulary responses
        )
        translated_text = completion.choices[0].message.content.strip()

        current_app.logger.info(
            f"Vocabulary OpenAI translation successful: '{content}' -> '{translated_text}'"
        )
        return jsonify({"translated_text": translated_text})

    except Exception as e:
        current_app.logger.error(f"Error calling OpenAI API for vocabulary: {e}", exc_info=True)
        return jsonify({"error": f"Error during vocabulary translation: {e}"}), 500


@api_bp.route('/delete_cached_translation', methods=['POST'])
def delete_cached_translation_route():
    """Acknowledge removal of cached translation on the client."""
    data = request.get_json()
    item_index = data.get('item_index')
    if item_index is None:
        return jsonify({'success': False, 'error': 'Missing item_index'}), 400
    current_app.logger.info(
        (
            "Received signal to acknowledge deletion of cached translation for "
            f"item index: {item_index}."
        )
    )
    return jsonify({'success': True, 'message': 'Client-side cache deletion acknowledged.'})

@api_bp.route('/toggle_jlpt', methods=['POST'])
def toggle_jlpt():
    """Enable or disable JLPT highlighting in the session."""
    data = request.get_json()
    if data is None or 'enabled' not in data or not isinstance(data['enabled'], bool):
        return jsonify({
            'success': False,
            'error': 'Invalid payload. "enabled" boolean is required.'
        }), 400

    is_enabled = data['enabled']
    session['jlpt_highlighting_enabled'] = is_enabled
    current_app.logger.info(f"JLPT highlighting set to: {is_enabled}")
    return jsonify({'success': True, 'jlpt_highlighting_enabled': is_enabled})

@api_bp.route('/due_cards', methods=['POST'])
@require_auth
def due_cards():
    """Return JPDB due cards for the authenticated user."""
    data = request.get_json(silent=True) or {}
    username = data.get('username')
    password = data.get('password')
    cookie = data.get('cookie') or request.headers.get('Cookie')

    if not (username or password or cookie):
        return jsonify({'error': 'Authentication required'}), 401

    from app.utils.jpdb_due import fetch_all_due_cards

    cards = fetch_all_due_cards(username=username,
                                password=password,
                                cookie_string=cookie)
    if cards is None or (isinstance(cards, list) and not cards):
        return jsonify({'error': 'Failed to fetch cards'}), 400

    return jsonify(cards)

@api_bp.route('/list-user-decks', methods=['POST'])
@require_auth
def list_user_decks():
    """List the user's JPDB decks with id, name, and word count."""
    data = request.get_json(silent=True) or {}
    username = data.get('username')
    password = data.get('password')
    cookie = data.get('cookie') or request.headers.get('Cookie')

    if not (username or password or cookie):
        return jsonify({'error': 'JPDB authentication required'}), 401

    try:
        # Import the helper function from jpdb_due module
        from app.utils.jpdb_due import fetch_user_decks

        decks = fetch_user_decks(
            username=username,
            password=password,
            cookie_string=cookie,
        )

        if decks is None:
            return jsonify({'error': 'Failed to fetch decks from JPDB'}), 400

        return jsonify(decks)

    except Exception as e:
        current_app.logger.error(f"Error fetching user decks: {e}")
        return jsonify({'error': str(e)}), 500

@api_bp.route('/get_jpdb_data', methods=['POST'])
def get_jpdb_data():
    """Fetch token and vocabulary data from JPDB for text segments."""
    data = request.get_json()
    if not data:
        return jsonify({"error": "Invalid JSON payload"}), 400

    text_segments_raw = data.get('text_segments')
    api_key = data.get('jpdb_api_key')

    if not text_segments_raw or not isinstance(text_segments_raw, list):
        return jsonify({
            "error": "Missing or invalid 'text_segments' (must be a list of strings)"
        }), 400
    if not all(isinstance(s, str) for s in text_segments_raw):
        return jsonify({
            "error": "Invalid 'text_segments': all items must be strings"
        }), 400
    if not api_key or not isinstance(api_key, str):
        return jsonify({"error": "Missing or invalid 'jpdb_api_key'"}), 400

    all_clean_segments = []
    for segment_text in text_segments_raw:
        normalized_segment = re.sub(r'\s+', ' ', segment_text).strip()
        if normalized_segment:
            all_clean_segments.append(normalized_segment)

    # If any segment exceeds the JPDB batch byte limit, split it into smaller chunks
    def _utf8_len(s: str) -> int:
        return len(s.encode('utf-8'))

    def _split_by_bytes(s: str, max_bytes: int) -> list[str]:
        chunks: list[str] = []
        start = 0
        while start < len(s):
            cur_bytes = 0
            end = start
            while end < len(s):
                ch = s[end]
                ch_b = len(ch.encode('utf-8'))
                if cur_bytes + ch_b > max_bytes:
                    break
                cur_bytes += ch_b
                end += 1
            if end == start:  # single character larger than max_bytes (extremely unlikely)
                # Fallback: force include this character to avoid infinite loop
                end = start + 1
            chunks.append(s[start:end])
            start = end
        return chunks

    def _split_segment_to_limit(s: str, max_bytes: int) -> list[str]:
        # Prefer sentence-aware splitting first, then fall back to byte slicing
        if _utf8_len(s) <= max_bytes:
            return [s]
        # Split on Japanese/Latin punctuation boundaries while keeping punctuation attached
        sentence_parts = re.split(r'(?<=[。！？!?])', s)
        if len(sentence_parts) > 1:
            acc = ''
            out: list[str] = []
            for part in sentence_parts:
                if not part:
                    continue
                if _utf8_len(acc) + _utf8_len(part) <= max_bytes:
                    acc += part
                else:
                    if acc:
                        out.append(acc)
                        acc = ''
                    if _utf8_len(part) <= max_bytes:
                        acc = part
                    else:
                        out.extend(_split_by_bytes(part, max_bytes))
                        acc = ''
            if acc:
                out.append(acc)
            return out
        # Fallback: raw byte-based slicing
        return _split_by_bytes(s, max_bytes)

    # Expand any over-limit segments
    if all_clean_segments:
        MAX_BYTES_PER_API_BATCH = current_app.config['MAX_BYTES_PER_API_BATCH']
        expanded_segments: list[str] = []
        for seg in all_clean_segments:
            if _utf8_len(seg) > MAX_BYTES_PER_API_BATCH:
                current_app.logger.info(
                    "Splitting oversized JPDB segment exceeding byte limit"
                )
                expanded_segments.extend(
                    _split_segment_to_limit(seg, MAX_BYTES_PER_API_BATCH)
                )
            else:
                expanded_segments.append(seg)
        all_clean_segments = expanded_segments

    if not all_clean_segments:
        current_app.logger.info("No non-empty segments to process for JPDB.")
        return jsonify([])

    MAX_BYTES_PER_API_BATCH = current_app.config['MAX_BYTES_PER_API_BATCH']
    MAX_SEGMENTS_PER_API_BATCH = current_app.config['MAX_SEGMENTS_PER_API_BATCH']
    TOKEN_FIELDS = current_app.config['JPDB_TOKEN_FIELDS']
    VOCAB_FIELDS = current_app.config['JPDB_VOCAB_FIELDS']
    jpdb_api_url = current_app.config['JPDB_API_URL']
    headers = {
        'Authorization': f'Bearer {api_key}',
        'Content-Type': 'application/json',
        'Accept': 'application/json',
    }

    all_processed_tokens_globally_offset = []
    current_segment_list_start_index = 0
    global_offset_processed_across_batches = 0

    while current_segment_list_start_index < len(all_clean_segments):
        segments_for_this_batch = []
        bytes_in_this_batch = 0
        global_offset_at_start_of_this_api_call = global_offset_processed_across_batches
        temp_next_segment_start_index = current_segment_list_start_index

        current_app.logger.debug(
            "Starting new batch creation. "
            f"current_segment_list_start_index: {current_segment_list_start_index}, "
            f"total_clean_segments: {len(all_clean_segments)}"
        )

        for i in range(current_segment_list_start_index, len(all_clean_segments)):
            segment_to_consider = all_clean_segments[i]
            segment_byte_length = len(segment_to_consider.encode('utf-8'))
            current_app.logger.debug(
                f"Considering segment {i}: '{segment_to_consider[:50]}...', "
                f"length: {len(segment_to_consider)}, bytes: {segment_byte_length}"
            )

            if segment_byte_length > MAX_BYTES_PER_API_BATCH:
                current_app.logger.warning(
                    f"Segment {i} (bytes: {segment_byte_length}) is larger than "
                    f"MAX_BYTES_PER_API_BATCH ({MAX_BYTES_PER_API_BATCH}). "
                    "Skipping this segment."
                )
                # If we skip, advance offsets and indices so we do not reprocess
                # or get stuck if this was the only segment.
                if i == current_segment_list_start_index:
                    # Oversized first segment of a new batch
                    global_offset_processed_across_batches += len(segment_to_consider)
                    temp_next_segment_start_index = i + 1
                # Break if not first; otherwise continue building current batch
                if not segments_for_this_batch:
                    temp_next_segment_start_index = i + 1
                    # Pretend we processed its length for correct subsequent offsets
                    global_offset_processed_across_batches += len(segment_to_consider)
                # Remaining logic handles this segment in the next iteration
                if not segments_for_this_batch:
                    current_segment_list_start_index = i + 1 # Advance the main loop index
                    global_offset_processed_across_batches += len(segment_to_consider)
                    # Pretend we processed its length for offset tracking
                    continue # Try next segment in all_clean_segments
                else:
                    # Process existing batch; this oversized segment will be handled next round
                    break

            if len(segments_for_this_batch) < MAX_SEGMENTS_PER_API_BATCH and \
               bytes_in_this_batch + segment_byte_length <= MAX_BYTES_PER_API_BATCH:
                segments_for_this_batch.append(segment_to_consider)
                bytes_in_this_batch += segment_byte_length
                temp_next_segment_start_index = i + 1
                current_app.logger.debug(
                    f"Added segment {i} to batch. Batch size: {len(segments_for_this_batch)}, "
                    f"bytes: {bytes_in_this_batch}"
                )
            else:
                current_app.logger.debug(
                    f"Segment {i} does not fit. Max segments: {len(segments_for_this_batch)}/"
                    f"{MAX_SEGMENTS_PER_API_BATCH}, Max bytes: "
                    f"{bytes_in_this_batch + segment_byte_length}/"
                    f"{MAX_BYTES_PER_API_BATCH}. Breaking to process current batch."
                )
                break
        current_segment_list_start_index = temp_next_segment_start_index

        if not segments_for_this_batch:
            # Hit when remaining segments are too large or none are left.
            current_app.logger.info(
                "No segments fit into a new JPDB batch (possibly due to segments "
                "being too large or no segments remaining)."
            )
            break

        current_app.logger.info(
            f"JPDB batch: {len(segments_for_this_batch)} segments, {bytes_in_this_batch} bytes. "
            f"Offset: {global_offset_at_start_of_this_api_call}"
        )
        payload = {
            'text': segments_for_this_batch,
            'position_length_encoding': 'utf16',
            'token_fields': TOKEN_FIELDS,
            'vocabulary_fields': VOCAB_FIELDS,
        }

        # --- Start Enhanced Logging ---
        current_app.logger.debug(f"Sending payload to JPDB: {payload}")
        # --- End Enhanced Logging ---

        response_from_jpdb = None
        try:
            # Add timeout and simple retries with exponential backoff
            max_attempts = 3
            last_exc = None
            for attempt in range(1, max_attempts + 1):
                try:
                    response_from_jpdb = requests.post(
                        jpdb_api_url,
                        headers=headers,
                        json=payload,
                        timeout=(5, 30)  # (connect timeout, read timeout)
                    )
                    break
                except requests.exceptions.Timeout as e:
                    last_exc = e
                    current_app.logger.warning(
                        f"JPDB request timed out on attempt {attempt}/{max_attempts}. Retrying..."
                    )
                    if attempt == max_attempts:
                        raise
                    # basic exponential backoff: 0.5s, 1s
                    import time
                    time.sleep(0.5 * attempt)

            # --- Start Enhanced Logging ---
            current_app.logger.info(f"JPDB API response status: {response_from_jpdb.status_code}")
            response_text = response_from_jpdb.text # Get text before trying to parse JSON
            current_app.logger.debug(
                f"JPDB API raw response text: {response_text[:500]}..."
            )  # Log first 500 chars
            # --- End Enhanced Logging ---

            response_from_jpdb.raise_for_status() # Check for HTTP errors after logging status

            jpdb_data = response_from_jpdb.json() # Now parse JSON

            # --- Start Enhanced Logging ---
            current_app.logger.debug(
                f"JPDB API parsed JSON data (sample): {str(jpdb_data)[:500]}..."
            )
            # --- End Enhanced Logging ---

            jpdb_vocab_list = jpdb_data.get('vocabulary', [])
            vocab_map = []
            for v_entry in jpdb_vocab_list:
                # Check if entry has enough fields (example: vid, sid, state)
                if not isinstance(v_entry, (list, tuple)) or len(v_entry) < len(VOCAB_FIELDS):
                    current_app.logger.warning(f"Skipping malformed vocab entry: {v_entry}")
                    vocab_map.append({
                        'vid': None,
                        'sid': None,
                        'state': ['error-vocab-format'],
                    })
                    continue

                # Map fields based on order defined in VOCAB_FIELDS
                entry_data = {
                    'vid': v_entry[VOCAB_FIELDS.index('vid')],
                    'sid': v_entry[VOCAB_FIELDS.index('sid')],
                    'rid': v_entry[VOCAB_FIELDS.index('rid')],
                    'spelling': v_entry[VOCAB_FIELDS.index('spelling')],
                    'reading': v_entry[VOCAB_FIELDS.index('reading')],
                    'frequencyRank': v_entry[VOCAB_FIELDS.index('frequency_rank')],
                    'partOfSpeech': v_entry[VOCAB_FIELDS.index('part_of_speech')],
                    'meaningsChunks': v_entry[VOCAB_FIELDS.index('meanings_chunks')],
                    'meaningsPartOfSpeech': v_entry[VOCAB_FIELDS.index('meanings_part_of_speech')],
                    'state': v_entry[VOCAB_FIELDS.index('card_state')] or ['not-in-deck'],
                    'pitchAccent': v_entry[VOCAB_FIELDS.index('pitch_accent')] or []
                }

                # Construct meanings list
                entry_data['meanings'] = []
                if entry_data['meaningsChunks'] and entry_data['meaningsPartOfSpeech']:
                    for i, glosses in enumerate(entry_data['meaningsChunks']):
                        if i < len(entry_data['meaningsPartOfSpeech']):
                            entry_data['meanings'].append({
                                'glosses': glosses,
                                'partOfSpeech': entry_data['meaningsPartOfSpeech'][i]
                            })

                # Remove intermediate keys
                del entry_data['meaningsChunks']
                del entry_data['meaningsPartOfSpeech']

                vocab_map.append(entry_data)

            tokens_data_from_api = jpdb_data.get('tokens', [])
            if len(tokens_data_from_api) != len(segments_for_this_batch):
                 current_app.logger.warning("JPDB API segments sent/received mismatch.")

            character_offset_within_this_api_batch = 0
            for segment_idx_in_batch, tokens_for_one_segment in enumerate(tokens_data_from_api):
                if segment_idx_in_batch >= len(segments_for_this_batch): break
                current_segment_text = segments_for_this_batch[segment_idx_in_batch]
                for raw_token in tokens_for_one_segment:
                    if (
                        not isinstance(raw_token, (list, tuple))
                        or len(raw_token) < len(TOKEN_FIELDS)
                    ):
                        current_app.logger.warning(
                            f"Skipping malformed token: {raw_token}"
                        )
                        continue

                    vocab_idx = raw_token[TOKEN_FIELDS.index('vocabulary_index')]
                    position_in_segment = raw_token[TOKEN_FIELDS.index('position')]
                    length = raw_token[TOKEN_FIELDS.index('length')]
                    furigana_data = raw_token[TOKEN_FIELDS.index('furigana')]

                    if not all(
                        isinstance(x, int) for x in [vocab_idx, position_in_segment, length]
                    ):
                        current_app.logger.warning(
                            f"Skipping token with invalid numeric fields: {raw_token}"
                        )
                        continue

                    card_data = {}
                    try:
                        if vocab_idx < 0:
                            card_data = {'state': ['unknown-negative-vocab-idx']}
                            # Handle negative index
                        elif vocab_idx < len(vocab_map):
                            card_data = vocab_map[vocab_idx]
                        else:
                            card_data = {'state': ['unknown-vocab-idx-out-of-bounds']}
                            # Handle out-of-bounds
                    except Exception as e:
                        current_app.logger.error(
                            f"Error accessing vocab_map at index {vocab_idx}: {e}"
                        )
                        card_data = {'state': ['error-vocab-map-access']}
                        continue

                    # Process rubies
                    rubies = []
                    if furigana_data and isinstance(furigana_data, list):
                        current_offset_in_token_surface = 0
                        for part in furigana_data:
                            if isinstance(part, str):
                                current_offset_in_token_surface += len(part)
                            elif isinstance(part, list) and len(part) == 2:
                                base_text_segment_part, ruby_text = part
                                if (
                                    isinstance(base_text_segment_part, str)
                                    and isinstance(ruby_text, str)
                                ):
                                    ruby_seg_start = current_offset_in_token_surface
                                    ruby_seg_length = len(base_text_segment_part)
                                    rubies.append({
                                        'text': ruby_text,
                                        'start': ruby_seg_start,
                                        'length': ruby_seg_length,
                                        'end': ruby_seg_start + ruby_seg_length,
                                    })
                                    current_offset_in_token_surface += ruby_seg_length

                    token_start_global = (
                        global_offset_at_start_of_this_api_call
                        + character_offset_within_this_api_batch
                        + position_in_segment
                    )
                    all_processed_tokens_globally_offset.append({
                        'start': token_start_global,
                        'length': length,
                        'end': token_start_global + length,
                        'card': card_data, # Now return the full card data
                        'rubies': rubies
                    })
                character_offset_within_this_api_batch += len(current_segment_text)
            chars_processed_in_this_batch_for_global_offset = sum(
                len(s) for s in segments_for_this_batch
            )
            global_offset_processed_across_batches += (
                chars_processed_in_this_batch_for_global_offset
            )

        except requests.exceptions.HTTPError as http_err:
            error_detail = "Unknown error"
            status_code = 500
            if response_from_jpdb is not None:
                status_code = response_from_jpdb.status_code
                try:
                    error_detail = response_from_jpdb.json().get(
                        'error_message', response_from_jpdb.text
                    )
                except ValueError:
                    error_detail = response_from_jpdb.text
            current_app.logger.error(
                f"JPDB HTTP error: {http_err} - Detail: {error_detail}",
                exc_info=True,
            )
            return jsonify({
                "error": str(http_err),
                "jpdb_error": error_detail,
                "status_code": status_code,
                "partial_results": all_processed_tokens_globally_offset,
            }), status_code
        except requests.exceptions.RequestException as req_err:
            current_app.logger.error(
                f"JPDB Request failed: {req_err}", exc_info=True
            )
            return jsonify({
                "error": str(req_err),
                "partial_results": all_processed_tokens_globally_offset,
            }), 500
        except Exception as e:
            current_app.logger.error(
                f"JPDB Unexpected error: {str(e)}", exc_info=True
            )
            return jsonify({
                "error": f"Unexpected error: {str(e)}",
                "partial_results": all_processed_tokens_globally_offset,
            }), 500

    current_app.logger.info(
        f"JPDB data processed. Total tokens: {len(all_processed_tokens_globally_offset)}"
    )
    return jsonify(all_processed_tokens_globally_offset)

@api_bp.route('/mine_jpdb_word', methods=['POST'])
def mine_jpdb_word():
    """Send a request to add a vocabulary word to a JPDB deck."""
    data = request.get_json()
    if not data:
        return jsonify({"error": "Invalid JSON payload"}), 400

    vid = data.get('vid')
    sid = data.get('sid')
    jpdb_api_key = data.get('jpdb_api_key')
    mining_deck_id = data.get('mining_deck_id')

    if not jpdb_api_key:
        return jsonify({"error": "Missing JPDB API key"}), 400
    if vid is None or sid is None:
        return jsonify({"error": "Missing vid or sid"}), 400

    # Here you would implement the JPDB mining API call
    # For now, we'll just return a success response
    current_app.logger.info(f"Mining word vid={vid}, sid={sid} to deck {mining_deck_id}")

    return jsonify({"success": True})

@api_bp.route('/update_jpdb_word_state', methods=['POST'])
def update_jpdb_word_state():
    """Update the study state of a JPDB vocabulary entry."""
    data = request.get_json()
    if not data:
        return jsonify({"error": "Invalid JSON payload"}), 400

    vid = data.get('vid')
    sid = data.get('sid')
    flag = data.get('flag')
    state = data.get('state')
    jpdb_api_key = data.get('jpdb_api_key')

    if not jpdb_api_key:
        return jsonify({"error": "Missing JPDB API key"}), 400
    if vid is None or sid is None:
        return jsonify({"error": "Missing vid or sid"}), 400
    if flag not in ('blacklist', 'never-forget', 'forq'):
        return jsonify({"error": "Invalid flag"}), 400
    if state is None:
        return jsonify({"error": "Missing state"}), 400

    # Here you would implement the JPDB state update API call
    # For now, we'll just return a success response
    current_app.logger.info(f"Updating word vid={vid}, sid={sid}, flag={flag}, state={state}")

    # Return a mock new state for the word
    new_state = ['known'] if state else ['new']

    return jsonify({"success": True, "newState": new_state})

@api_bp.route('/review_jpdb_card', methods=['POST'])
def review_jpdb_card():
    """Record a review rating for a JPDB vocabulary card."""
    data = request.get_json()
    if not data:
        return jsonify({"error": "Invalid JSON payload"}), 400

    vid = data.get('vid')
    sid = data.get('sid')
    rating = data.get('rating')
    jpdb_api_key = data.get('jpdb_api_key')

    if not jpdb_api_key:
        return jsonify({"error": "Missing JPDB API key"}), 400
    if vid is None or sid is None:
        return jsonify({"error": "Missing vid or sid"}), 400
    if not rating or rating not in (
        'nothing',
        'something',
        'hard',
        'good',
        'easy',
        'pass',
        'fail',
        'known',
        'unknown',
    ):
        return jsonify({'error': 'Invalid rating'}), 400

    # Map local rating values to JPDB API grade values
    grade = 'okay' if rating == 'good' else rating

    headers = {
        'Authorization': f'Bearer {jpdb_api_key}',
        'Content-Type': 'application/json',
        'Accept': 'application/json',
    }
    review_url = current_app.config.get('JPDB_REVIEW_URL',
                                        'https://jpdb.io/api/v1/review')

    payload = {
        'vid': vid,
        'sid': sid,
        'grade': grade,
    }

    try:
        response = requests.post(review_url, headers=headers, json=payload)
        current_app.logger.info(
            f"JPDB review response status: {response.status_code}")
        response.raise_for_status()
        # JPDB's API returns minimal data; we ignore it and predict state below
    except requests.exceptions.HTTPError as http_err:
        try:
            error_detail = response.json().get('error')
        except Exception:
            error_detail = response.text
        current_app.logger.error(
            f"JPDB HTTP error: {http_err} - Detail: {error_detail}")
        return jsonify({'error': f'JPDB error: {error_detail}'}), response.status_code
    except requests.RequestException as req_err:
        current_app.logger.error(
            f"JPDB request failed: {req_err}", exc_info=True)
        return jsonify({'error': 'Failed to contact JPDB'}), 500

    current_app.logger.info(
        f"Reviewed card vid={vid}, sid={sid}, rating={rating}")

    # Predict new card state locally for UI update
    if rating in ('good', 'easy', 'pass', 'known'):
        new_state = ['known']
    elif rating in ('nothing', 'hard', 'fail'):
        new_state = ['failed']
    else:
        new_state = ['learning']

    return jsonify({'success': True, 'newState': new_state})


# ---------------------------------------------------------------------------
#  Bookmark Endpoints
# ---------------------------------------------------------------------------

@api_bp.route('/bookmarks', methods=['GET'])
@optional_auth
def get_bookmarks():
    """Return bookmarks for the given book"""
    book_id = request.args.get('bookId')
    if not book_id:
        return jsonify({'error': 'Missing bookId'}), 400

    query = Bookmark.query.filter_by(book_id=book_id)
    if g.get('user'):
        query = query.filter_by(user_id=g.user.id)
    bookmarks = query.order_by(Bookmark.created_at).all()

    return jsonify([
        {
            'id': b.id,
            'bookId': b.book_id,
            'chapterIndex': b.chapter_index,
            'position': b.position,
            'note': b.note,
            'createdAt': b.created_at.isoformat() if b.created_at else None,
        }
        for b in bookmarks
    ])


@api_bp.route('/bookmarks', methods=['POST'])
@optional_auth
def add_bookmark():
    """Create a bookmark for the current user (if any)."""
    data = request.get_json() or {}
    book_id = data.get('bookId')
    chapter_index = data.get('chapterIndex')
    position = data.get('position')
    note = data.get('note')

    if not book_id or chapter_index is None or position is None:
        return jsonify({'error': 'Missing required fields'}), 400

    bookmark = Bookmark(
        user_id=g.user.id if g.get('user') else None,
        book_id=book_id,
        chapter_index=chapter_index,
        position=position,
        note=note,
    )
    db.session.add(bookmark)
    db.session.commit()

    return jsonify({
        'id': bookmark.id,
        'bookId': bookmark.book_id,
        'chapterIndex': bookmark.chapter_index,
        'position': bookmark.position,
        'note': bookmark.note,
        'createdAt': bookmark.created_at.isoformat() if bookmark.created_at else None,
    }), 201
