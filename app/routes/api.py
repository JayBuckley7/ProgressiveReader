"""Blueprint providing translation and content API routes."""
from flask import Blueprint, request, jsonify, session, current_app, Response
from openai import OpenAI
import requests
import json
import redis
import hashlib
from app.utils.jpdb_api_helpers import (
    validate_jpdb_request,
    create_jpdb_batches,
    parse_jpdb_tokens,
)

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

    # --- Redis duplicate request check ---
    request_token = hashlib.sha256(
        f"{target_language}|{cefr_level}|{model}|{content}".encode("utf-8")
    ).hexdigest()
    try:
        r = redis.Redis.from_url(current_app.config['REDIS_URL'])
        if r.exists(request_token):
            current_app.logger.info(f"Duplicate translation request denied: {request_token}")
            return jsonify({"error": "Duplicate translation request"}), 429
        else:
            r.set(request_token, 1, ex=300)
    except Exception as redis_exc:
        current_app.logger.warning(f"Redis check failed: {redis_exc}")

    api_key_to_use = user_api_key if user_api_key else current_app.config.get('OPENAI_API_KEY')
    if not api_key_to_use: return jsonify({"error": "OpenAI API key not configured..."}), 400
    
    # Ensure system_prompt is defined or moved to config if it's complex
    system_prompt = "You are a helpful translator. You translate the provided HTML content while preserving the HTML structure. ONLY return the translated HTML content, with no introductory text, explanations, or markdown formatting like ```html." # Simplified for now
    user_prompt_prefix = f"Translate the following HTML content to {target_language}"
    if cefr_level: user_prompt_prefix += f", simplifying for CEFR level {cefr_level}. Preserve HTML tags."
    else: user_prompt_prefix += ". Preserve HTML tags."
    full_user_prompt = f"{user_prompt_prefix}\n\nHTML Content:\n```html\n{content}\n```"

    current_app.logger.info(f"--- API/Translate Request --- Lang: {target_language}, Model: {model}, CEFR: {cefr_level or 'N/A'}, Stream: {stream}") 

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
                    messages=[{"role": "system", "content": system_prompt}, {"role": "user", "content": full_user_prompt}],
                    stream=True
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
                
                yield f"data: {json.dumps({'complete': True, 'translated_text': clean_translated_text})}\n\n"
                yield "data: [DONE]\n\n"
                
            # Return the generator as a streaming response
            return Response(generate(), mimetype='text/event-stream')
        else:
            # Handle non-streaming (original) response method
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
    """Acknowledge removal of cached translation on the client."""
    data = request.get_json()
    item_index = data.get('item_index') 
    if item_index is None: 
        return jsonify({'success': False, 'error': 'Missing item_index'}), 400 
    current_app.logger.info(f"Received signal to acknowledge deletion of cached translation for item index: {item_index}.")
    return jsonify({'success': True, 'message': 'Client-side cache deletion acknowledged.'})

@api_bp.route('/toggle_jlpt', methods=['POST'])
def toggle_jlpt():
    """Enable or disable JLPT highlighting in the session."""
    data = request.get_json()
    if data is None or 'enabled' not in data or not isinstance(data['enabled'], bool):
        return jsonify({'success': False, 'error': 'Invalid payload. "enabled" boolean is required.'}), 400
    
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
    segments, api_key, error = validate_jpdb_request(request.get_json())
    if error:
        return error
    if not segments:
        return jsonify([])

    cfg = current_app.config
    headers = {
        'Authorization': f'Bearer {api_key}',
        'Content-Type': 'application/json',
        'Accept': 'application/json'
    }
    results = []
    for batch, offset in create_jpdb_batches(
        segments,
        cfg['MAX_BYTES_PER_API_BATCH'],
        cfg['MAX_SEGMENTS_PER_API_BATCH']
    ):
        payload = {
            'text': batch,
            'position_length_encoding': 'utf16',
            'token_fields': cfg['JPDB_TOKEN_FIELDS'],
            'vocabulary_fields': cfg['JPDB_VOCAB_FIELDS']
        }
        current_app.logger.info(
            f"JPDB batch: {len(batch)} segments. Offset: {offset}"
        )
        try:
            resp = requests.post(cfg['JPDB_API_URL'], headers=headers, json=payload)
            current_app.logger.info(f"JPDB API response status: {resp.status_code}")
            resp.raise_for_status()
            jpdb_data = resp.json()
            current_app.logger.debug(
                f"JPDB API parsed JSON data (sample): {str(jpdb_data)[:500]}..."
            )
            results.extend(
                parse_jpdb_tokens(
                    jpdb_data,
                    batch,
                    cfg['JPDB_TOKEN_FIELDS'],
                    cfg['JPDB_VOCAB_FIELDS'],
                    offset,
                )
            )
        except requests.exceptions.HTTPError as http_err:
            detail = "Unknown error"
            status_code = resp.status_code if resp is not None else 500
            try:
                detail = resp.json().get('error_message', resp.text)
            except Exception:
                detail = resp.text
            current_app.logger.error(
                f"JPDB HTTP error: {http_err} - Detail: {detail}", exc_info=True
            )
            return jsonify({
                'error': str(http_err),
                'jpdb_error': detail,
                'status_code': status_code,
                'partial_results': results,
            }), status_code
        except requests.exceptions.RequestException as req_err:
            current_app.logger.error(
                f"JPDB Request failed: {req_err}", exc_info=True
            )
            return jsonify({'error': str(req_err), 'partial_results': results}), 500
        except Exception as exc:
            current_app.logger.error(
                f"JPDB Unexpected error: {exc}", exc_info=True
            )
            return jsonify({'error': f'Unexpected error: {exc}', 'partial_results': results}), 500

    current_app.logger.info(
        f"JPDB data processed. Total tokens: {len(results)}"
    )
    return jsonify(results)
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
    if not rating or rating not in ('nothing', 'something', 'hard', 'good', 'easy', 'pass', 'fail', 'known', 'unknown'):
        return jsonify({"error": "Invalid rating"}), 400

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
