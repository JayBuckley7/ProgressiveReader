from flask import Blueprint, request, jsonify, session, current_app
from openai import OpenAI
import requests
import re

api_bp = Blueprint('api', __name__, url_prefix='/api')

@api_bp.route('/translate', methods=['POST'])
def translate_content():
    data = request.get_json()
    if not data:
        return jsonify({"error": "Invalid JSON payload"}), 400

    content = data.get('content') 
    target_language = data.get('target_language')
    model = data.get('model')
    user_api_key = data.get('api_key')
    cefr_level = data.get('cefr_level')

    if content is None or target_language is None or model is None:
        return jsonify({"error": "Missing required fields: content, target_language, model"}), 400

    api_key_to_use = user_api_key if user_api_key else current_app.config.get('OPENAI_API_KEY') 
    if not api_key_to_use: return jsonify({"error": "OpenAI API key not configured..."}), 400
    
    # Ensure system_prompt is defined or moved to config if it's complex
    system_prompt = "You are a helpful translator. You translate the provided HTML content while preserving the HTML structure. ONLY return the translated HTML content, with no introductory text, explanations, or markdown formatting like ```html." # Simplified for now
    user_prompt_prefix = f"Translate the following HTML content to {target_language}"
    if cefr_level: user_prompt_prefix += f", simplifying for CEFR level {cefr_level}. Preserve HTML tags."
    else: user_prompt_prefix += ". Preserve HTML tags."
    full_user_prompt = f"{user_prompt_prefix}\n\nHTML Content:\n```html\n{content}\n```"

    current_app.logger.info(f"--- API/Translate Request --- Lang: {target_language}, Model: {model}, CEFR: {cefr_level or 'N/A'}") 

    try:
        client = OpenAI(api_key=api_key_to_use)
        completion = client.chat.completions.create(
            model=model,
            messages=[{"role": "system", "content": system_prompt}, {"role": "user", "content": full_user_prompt}]
        )
        translated_text = completion.choices[0].message.content.strip()

        if translated_text.startswith("```html"): translated_text = translated_text[7:].strip()
        elif translated_text.startswith("```"): translated_text = translated_text[3:].strip()
        if translated_text.endswith("```"): translated_text = translated_text[:-3].strip()
        
        current_app.logger.info(f"Translation successful. First 100 chars: {translated_text[:100]}...") 
        return jsonify({"translated_text": translated_text})

    except Exception as e:
        current_app.logger.error(f"Error calling OpenAI API: {e}", exc_info=True) 
        return jsonify({"error": f"Error during translation: {e}"}), 500

@api_bp.route('/delete_cached_translation', methods=['POST'])
def delete_cached_translation_route():
    data = request.get_json()
    item_index = data.get('item_index') 
    if item_index is None: 
        return jsonify({'success': False, 'error': 'Missing item_index'}), 400 
    current_app.logger.info(f"Received signal to acknowledge deletion of cached translation for item index: {item_index}.")
    return jsonify({'success': True, 'message': 'Client-side cache deletion acknowledged.'})

@api_bp.route('/toggle_jlpt', methods=['POST'])
def toggle_jlpt():
    data = request.get_json()
    if data is None or 'enabled' not in data or not isinstance(data['enabled'], bool):
        return jsonify({'success': False, 'error': 'Invalid payload. "enabled" boolean is required.'}), 400
    
    is_enabled = data['enabled']
    session['jlpt_highlighting_enabled'] = is_enabled
    current_app.logger.info(f"JLPT highlighting set to: {is_enabled}")
    return jsonify({'success': True, 'jlpt_highlighting_enabled': is_enabled})

@api_bp.route('/get_jpdb_data', methods=['POST'])
def get_jpdb_data():
    data = request.get_json()
    if not data:
        return jsonify({"error": "Invalid JSON payload"}), 400

    text_segments_raw = data.get('text_segments') 
    api_key = data.get('jpdb_api_key')

    if not text_segments_raw or not isinstance(text_segments_raw, list):
        return jsonify({"error": "Missing or invalid 'text_segments' (must be a list of strings)"}), 400
    if not all(isinstance(s, str) for s in text_segments_raw):
        return jsonify({"error": "Invalid 'text_segments': all items must be strings"}), 400
    if not api_key or not isinstance(api_key, str):
        return jsonify({"error": "Missing or invalid 'jpdb_api_key'"}), 400

    all_clean_segments = []
    for segment_text in text_segments_raw:
        normalized_segment = re.sub(r'\s+', ' ', segment_text).strip()
        if normalized_segment: 
            all_clean_segments.append(normalized_segment)
    
    if not all_clean_segments:
        current_app.logger.info("No non-empty segments to process for JPDB.") 
        return jsonify([])

    MAX_BYTES_PER_API_BATCH = current_app.config['MAX_BYTES_PER_API_BATCH'] 
    MAX_SEGMENTS_PER_API_BATCH = current_app.config['MAX_SEGMENTS_PER_API_BATCH'] 
    TOKEN_FIELDS = current_app.config['JPDB_TOKEN_FIELDS'] 
    VOCAB_FIELDS = current_app.config['JPDB_VOCAB_FIELDS'] 
    jpdb_api_url = current_app.config['JPDB_API_URL'] 
    headers = { 'Authorization': f'Bearer {api_key}', 'Content-Type': 'application/json', 'Accept': 'application/json'}

    all_processed_tokens_globally_offset = []
    current_segment_list_start_index = 0 
    global_offset_processed_across_batches = 0 

    while current_segment_list_start_index < len(all_clean_segments):
        segments_for_this_batch = []
        bytes_in_this_batch = 0 
        global_offset_at_start_of_this_api_call = global_offset_processed_across_batches
        temp_next_segment_start_index = current_segment_list_start_index
        
        for i in range(current_segment_list_start_index, len(all_clean_segments)):
            segment_to_consider = all_clean_segments[i]
            segment_byte_length = len(segment_to_consider.encode('utf-8'))
            if len(segments_for_this_batch) < MAX_SEGMENTS_PER_API_BATCH and \
               bytes_in_this_batch + segment_byte_length <= MAX_BYTES_PER_API_BATCH:
                segments_for_this_batch.append(segment_to_consider)
                bytes_in_this_batch += segment_byte_length
                temp_next_segment_start_index = i + 1
            else:
                if not segments_for_this_batch and segment_byte_length <= MAX_BYTES_PER_API_BATCH:
                    segments_for_this_batch.append(segment_to_consider)
                    bytes_in_this_batch += segment_byte_length
                    temp_next_segment_start_index = i + 1
                break 
        current_segment_list_start_index = temp_next_segment_start_index

        if not segments_for_this_batch:
            if current_segment_list_start_index > 0: 
                potentially_long_segment_index = current_segment_list_start_index -1 
                if potentially_long_segment_index < len(all_clean_segments):
                    segment_that_was_too_long = all_clean_segments[potentially_long_segment_index]
                    if len(segment_that_was_too_long.encode('utf-8')) > MAX_BYTES_PER_API_BATCH:
                        current_app.logger.warning(f"Segment at index {potentially_long_segment_index} too long. Skipping.") 
                        global_offset_processed_across_batches += len(segment_that_was_too_long) 
                        continue 
            current_app.logger.info("No more segments for new JPDB batch.") 
            break

        current_app.logger.info(f"JPDB batch: {len(segments_for_this_batch)} segments, {bytes_in_this_batch} bytes. Offset: {global_offset_at_start_of_this_api_call}") 
        payload = { 'text': segments_for_this_batch, 'position_length_encoding': 'utf16', 'token_fields': TOKEN_FIELDS, 'vocabulary_fields': VOCAB_FIELDS}
        
        response_from_jpdb = None
        try:
            response_from_jpdb = requests.post(jpdb_api_url, headers=headers, json=payload)
            response_from_jpdb.raise_for_status()
            jpdb_data = response_from_jpdb.json()
            jpdb_vocab_list = jpdb_data.get('vocabulary', [])
            vocab_map = []
            for v_entry in jpdb_vocab_list:
                if not isinstance(v_entry, (list, tuple)) or len(v_entry) < 3:
                    vocab_map.append({'vid': None, 'sid': None, 'state': ['error-vocab-format']}); continue 
                vocab_map.append({ 'vid': v_entry[0], 'sid': v_entry[1], 'state': v_entry[2] if v_entry[2] else ['not-in-deck'] })

            tokens_data_from_api = jpdb_data.get('tokens', [])
            if len(tokens_data_from_api) != len(segments_for_this_batch):
                 current_app.logger.warning("JPDB API segments sent/received mismatch.") 

            character_offset_within_this_api_batch = 0 
            for segment_idx_in_batch, tokens_for_one_segment in enumerate(tokens_data_from_api):
                if segment_idx_in_batch >= len(segments_for_this_batch): break
                current_segment_text = segments_for_this_batch[segment_idx_in_batch]
                for raw_token in tokens_for_one_segment:
                    if not isinstance(raw_token, (list, tuple)) or len(raw_token) < 4:
                        continue
                    vocab_idx, position_in_segment, length, furigana_data = raw_token[0:4]
                    if not all(isinstance(x, int) for x in [vocab_idx, position_in_segment, length]):
                         continue
                    card_info = {}
                    try:
                        if vocab_idx < 0: card_info = {'state': ['unknown-negative-vocab-idx']}
                        elif vocab_idx < len(vocab_map): card_info = vocab_map[vocab_idx] 
                        else: card_info = {'state': ['unknown-vocab-idx-out-of-bounds']}
                    except Exception: card_info = {'state': ['error-vocab-map-access']}; continue
                    rubies = []
                    if furigana_data and isinstance(furigana_data, list):
                        current_offset_in_token_surface = 0
                        for part in furigana_data:
                            if isinstance(part, str): current_offset_in_token_surface += len(part)
                            elif isinstance(part, list) and len(part) == 2: 
                                base_text_segment_part, ruby_text = part
                                if isinstance(base_text_segment_part, str) and isinstance(ruby_text, str):
                                    ruby_seg_start = current_offset_in_token_surface
                                    ruby_seg_length = len(base_text_segment_part)
                                    rubies.append({ 'text': ruby_text, 'start': ruby_seg_start, 'length': ruby_seg_length, 'end': ruby_seg_start + ruby_seg_length })
                                    current_offset_in_token_surface += ruby_seg_length
                    token_start_global = global_offset_at_start_of_this_api_call + character_offset_within_this_api_batch + position_in_segment
                    all_processed_tokens_globally_offset.append({ 'start': token_start_global, 'length': length, 'end': token_start_global + length, 'state': card_info.get('state', ['unknown']), 'rubies': rubies })
                character_offset_within_this_api_batch += len(current_segment_text)
            chars_processed_in_this_batch_for_global_offset = sum(len(s) for s in segments_for_this_batch)
            global_offset_processed_across_batches += chars_processed_in_this_batch_for_global_offset 

        except requests.exceptions.HTTPError as http_err:
            error_detail = "Unknown error" 
            status_code = 500
            if response_from_jpdb is not None:
                status_code = response_from_jpdb.status_code
                try: error_detail = response_from_jpdb.json().get('error_message', response_from_jpdb.text)
                except ValueError: error_detail = response_from_jpdb.text
            current_app.logger.error(f"JPDB HTTP error: {http_err} - Detail: {error_detail}", exc_info=True) 
            return jsonify({"error": str(http_err), "jpdb_error": error_detail, "status_code": status_code, "partial_results": all_processed_tokens_globally_offset}), status_code
        except requests.exceptions.RequestException as req_err: 
            current_app.logger.error(f"JPDB Request failed: {req_err}", exc_info=True) 
            return jsonify({"error": str(req_err), "partial_results": all_processed_tokens_globally_offset}), 500
        except Exception as e: 
            current_app.logger.error(f"JPDB Unexpected error: {str(e)}", exc_info=True) 
            return jsonify({"error": f"Unexpected error: {str(e)}", "partial_results": all_processed_tokens_globally_offset}), 500
            
    current_app.logger.info(f"JPDB data processed. Total tokens: {len(all_processed_tokens_globally_offset)}") 
    return jsonify(all_processed_tokens_globally_offset) 