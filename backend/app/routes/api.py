"""Blueprint providing translation and content API routes."""
from flask import Blueprint, request, jsonify, session, current_app, Response, send_file
from openai import OpenAI
import requests
import re
import json
from ..utils.clerk_auth import require_auth, get_user_id, get_user_email
from ..utils.file_utils import allowed_file
from ..firestore_client import db as fs_db
import uuid
import logging
from datetime import datetime
import os
from werkzeug.utils import secure_filename

logger = logging.getLogger(__name__)

api_bp = Blueprint('api', __name__, url_prefix='/api')

@api_bp.route('/translate', methods=['POST'])
def translate_content():
    """Translate HTML content with OpenAI and return JSON or stream events."""
    data = request.get_json()
    if not data:
        return jsonify({"error": "Invalid JSON payload"}), 400

    content = data.get('content') 
    target_language = data.get('target_language')
    model = data.get('model')
    user_api_key = data.get('api_key')
    cefr_level = data.get('cefr_level')
    stream = data.get('stream', False)  # New parameter to enable streaming

    if content is None or target_language is None or model is None:
        return jsonify({"error": "Missing required fields: content, target_language, model"}), 400


    api_key_to_use = user_api_key if user_api_key else current_app.config.get('OPENAI_API_KEY')
    if not api_key_to_use: return jsonify({"error": "OpenAI API key not configured..."}), 400
    
    # Ensure system_prompt is defined or moved to config if it's complex
    system_prompt = (
        "You are a helpful translator. You translate the provided HTML content "
        "while preserving the HTML structure. ONLY return the translated HTML "
        "content, with no introductory text, explanations, or markdown "
        "formatting like ```html."  # Simplified for now
    )
    user_prompt_prefix = (
        f"Translate the following HTML content to {target_language}"
    )
    if cefr_level:
        user_prompt_prefix += (
            f", simplifying for CEFR level {cefr_level}. Preserve HTML tags."
        )
    else:
        user_prompt_prefix += ". Preserve HTML tags."
    full_user_prompt = (
        f"{user_prompt_prefix}\n\nHTML Content:\n```html\n{content}\n```"
    )

    current_app.logger.info(
        (
            f"--- API/Translate Request --- Lang: {target_language}, Model: {model}, "
            f"CEFR: {cefr_level or 'N/A'}, Stream: {stream}"
        )
    )

    try:
        client = OpenAI(api_key=api_key_to_use)
        
        if stream:
            # Handle streaming response
            def generate():
                buffer = ""
                last_chunk = "" # Store the complete translated text to save to cache at the end
                
                # Create a streaming request to OpenAI
                completion = client.chat.completions.create(
                    model=model,
                    messages=[
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": full_user_prompt},
                    ],
                    stream=True,
                )
                
                # Send SSE format for streaming events
                yield "data: {\"status\": \"started\"}\n\n"
                
                for chunk in completion:
                    content = chunk.choices[0].delta.content
                    
                    # Some chunks might not have content
                    if content is not None:
                        buffer += content
                        last_chunk += content
                        
                        # Clean any markdown code blocks on the fly
                        while "```html" in buffer:
                            buffer = buffer.replace("```html", "", 1)
                        while "```" in buffer:
                            buffer = buffer.replace("```", "", 1)
                        
                        # Send the accumulated buffer
                        yield f"data: {json.dumps({'content': buffer})}\n\n"
                        buffer = ""  # Clear buffer after sending
                
                # Ensure the final chunk is sent (if any remains in buffer)
                if buffer:
                    yield f"data: {json.dumps({'content': buffer})}\n\n"
                
                # Send complete translated text for caching
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
                
            # Return the generator as a streaming response
            return Response(generate(), mimetype='text/event-stream')
        else:
            # Handle non-streaming (original) response method
            completion = client.chat.completions.create(
                model=model,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": full_user_prompt},
                ],
            )
            translated_text = completion.choices[0].message.content.strip()

            if translated_text.startswith("```html"): translated_text = translated_text[7:].strip()
            elif translated_text.startswith("```"): translated_text = translated_text[3:].strip()
            if translated_text.endswith("```"): translated_text = translated_text[:-3].strip()
            
            current_app.logger.info(
                f"Translation successful. First 100 chars: {translated_text[:100]}..."
            )
            return jsonify({"translated_text": translated_text})

    except Exception as e:
        current_app.logger.error(f"Error calling OpenAI API: {e}", exc_info=True) 
        return jsonify({"error": f"Error during translation: {e}"}), 500

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
            response_from_jpdb = requests.post(jpdb_api_url, headers=headers, json=payload)
            
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
    forq = data.get('forq', False)
    sentence = data.get('sentence')
    jpdb_api_key = data.get('jpdb_api_key')
    mining_deck_id = data.get('mining_deck_id')
    forq_deck_id = data.get('forq_deck_id')

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

    # Here you would implement the JPDB review API call
    # For now, we'll just return a success response
    current_app.logger.info(f"Reviewing card vid={vid}, sid={sid}, rating={rating}")
    
    # Return a mock new state for the word
    if rating in ('good', 'easy', 'pass', 'known'):
        new_state = ['known']
    elif rating in ('nothing', 'hard', 'fail'):
        new_state = ['failed']
    else:
        new_state = ['learning']
    
    return jsonify({"success": True, "newState": new_state})
