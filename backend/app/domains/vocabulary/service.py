from __future__ import annotations

from typing import List, Optional, Dict, Any

from .integrations import JpdbProvider, JpdbApiProvider
from .repository import VocabularyRepository
from .schemas import (
    DueCard,
    Deck,
    GetJpdbDataRequest,
    ProcessedToken,
    MineWordRequest,
    UpdateWordStateRequest,
    ReviewCardRequest,
    AddVocabularyWordRequest,
    Vocabulary as VocabularySchema,
)


class VocabularyService:
    def __init__(
        self,
        provider: JpdbProvider,
        api_provider: Optional[JpdbApiProvider] = None,
        repository: Optional[VocabularyRepository] = None,
    ) -> None:
        self._provider = provider
        self._api_provider = api_provider
        self._repository = repository or VocabularyRepository()

    def get_due_cards(self, *, username: Optional[str], password: Optional[str], cookie_string: Optional[str]) -> List[DueCard]:
        return self._provider.fetch_due_cards(username=username, password=password, cookie_string=cookie_string)

    def get_user_decks(self, *, username: Optional[str], password: Optional[str], cookie_string: Optional[str]) -> List[Deck]:
        return self._provider.fetch_user_decks(username=username, password=password, cookie_string=cookie_string)

    # --- JPDB API flows ---
    def get_jpdb_data(
        self,
        *,
        request: GetJpdbDataRequest,
        config: Dict[str, Any],
    ) -> List[ProcessedToken]:
        assert self._api_provider is not None, "JpdbApiProvider not configured"

        text_segments_raw = request.text_segments
        # Normalize segments (trim whitespace and collapse)
        all_clean_segments: List[str] = []
        for segment_text in text_segments_raw:
            normalized_segment = " ".join(segment_text.split())
            if normalized_segment:
                all_clean_segments.append(normalized_segment)

        if not all_clean_segments:
            return []

        MAX_BYTES_PER_API_BATCH = config['MAX_BYTES_PER_API_BATCH']
        MAX_SEGMENTS_PER_API_BATCH = config['MAX_SEGMENTS_PER_API_BATCH']
        TOKEN_FIELDS = config['JPDB_TOKEN_FIELDS']
        VOCAB_FIELDS = config['JPDB_VOCAB_FIELDS']
        jpdb_api_url: str = config['JPDB_API_URL']

        def _utf8_len(s: str) -> int:
            return len(s.encode('utf-8'))

        def _split_by_bytes(s: str, max_bytes: int) -> List[str]:
            chunks: List[str] = []
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
                if end == start:
                    end = start + 1
                chunks.append(s[start:end])
                start = end
            return chunks

        # Expand any over-limit segments
        expanded_segments: List[str] = []
        for seg in all_clean_segments:
            if _utf8_len(seg) > MAX_BYTES_PER_API_BATCH:
                # try sentence-aware first
                import re
                sentence_parts = re.split(r'(?<=[。！？!?])', seg)
                if len(sentence_parts) > 1:
                    acc = ''
                    out: List[str] = []
                    for part in sentence_parts:
                        if not part:
                            continue
                        if _utf8_len(acc) + _utf8_len(part) <= MAX_BYTES_PER_API_BATCH:
                            acc += part
                        else:
                            if acc:
                                out.append(acc)
                                acc = ''
                            if _utf8_len(part) <= MAX_BYTES_PER_API_BATCH:
                                acc = part
                            else:
                                out.extend(_split_by_bytes(part, MAX_BYTES_PER_API_BATCH))
                                acc = ''
                    if acc:
                        out.append(acc)
                    expanded_segments.extend(out)
                else:
                    expanded_segments.extend(_split_by_bytes(seg, MAX_BYTES_PER_API_BATCH))
            else:
                expanded_segments.append(seg)

        # Now batch and call provider
        headers = {
            'Authorization': f'Bearer {request.jpdb_api_key}',
            'Content-Type': 'application/json',
            'Accept': 'application/json',
        }

        all_processed: List[ProcessedToken] = []
        global_offset_processed_across_batches = 0
        current_segment_list_start_index = 0

        while current_segment_list_start_index < len(expanded_segments):
            segments_for_this_batch: List[str] = []
            bytes_in_this_batch = 0
            temp_next_segment_start_index = current_segment_list_start_index

            for i in range(current_segment_list_start_index, len(expanded_segments)):
                seg = expanded_segments[i]
                seg_bytes = _utf8_len(seg)
                if len(segments_for_this_batch) < MAX_SEGMENTS_PER_API_BATCH and bytes_in_this_batch + seg_bytes <= MAX_BYTES_PER_API_BATCH:
                    segments_for_this_batch.append(seg)
                    bytes_in_this_batch += seg_bytes
                    temp_next_segment_start_index = i + 1
                else:
                    break

            current_segment_list_start_index = temp_next_segment_start_index
            if not segments_for_this_batch:
                break

            # Call provider for this batch
            jpdb_data = self._api_provider.post_tokens_batch(
                text_batch=segments_for_this_batch,
                token_fields=TOKEN_FIELDS,
                vocab_fields=VOCAB_FIELDS,
                api_url=jpdb_api_url,
                headers=headers,
            )

            # Map vocabulary entries
            vocab_list = jpdb_data.get('vocabulary', [])
            vocab_map: List[Dict[str, Any]] = []
            for v_entry in vocab_list:
                # map by indices from VOCAB_FIELDS
                def _idx(field: str) -> int:
                    return VOCAB_FIELDS.index(field)
                entry_data = {
                    'vid': v_entry[_idx('vid')] if len(v_entry) > _idx('vid') else None,
                    'sid': v_entry[_idx('sid')] if len(v_entry) > _idx('sid') else None,
                    'rid': v_entry[_idx('rid')] if len(v_entry) > _idx('rid') else None,
                    'spelling': v_entry[_idx('spelling')] if len(v_entry) > _idx('spelling') else None,
                    'reading': v_entry[_idx('reading')] if len(v_entry) > _idx('reading') else None,
                    'frequencyRank': v_entry[_idx('frequency_rank')] if len(v_entry) > _idx('frequency_rank') else None,
                    'partOfSpeech': v_entry[_idx('part_of_speech')] if len(v_entry) > _idx('part_of_speech') else None,
                    'meaningsChunks': v_entry[_idx('meanings_chunks')] if len(v_entry) > _idx('meanings_chunks') else [],
                    'meaningsPartOfSpeech': v_entry[_idx('meanings_part_of_speech')] if len(v_entry) > _idx('meanings_part_of_speech') else [],
                    'state': v_entry[_idx('card_state')] if len(v_entry) > _idx('card_state') else ['not-in-deck'],
                    'pitchAccent': v_entry[_idx('pitch_accent')] if len(v_entry) > _idx('pitch_accent') else [],
                }
                # construct meanings
                meanings: List[Dict[str, Any]] = []
                for i, glosses in enumerate(entry_data['meaningsChunks'] or []):
                    if i < len(entry_data['meaningsPartOfSpeech'] or []):
                        meanings.append({'glosses': glosses, 'partOfSpeech': entry_data['meaningsPartOfSpeech'][i]})
                entry_data.pop('meaningsChunks', None)
                entry_data.pop('meaningsPartOfSpeech', None)
                entry_data['meanings'] = meanings
                vocab_map.append(entry_data)

            # Map tokens to processed tokens with global offsets
            def _tidx(field: str) -> int:
                return TOKEN_FIELDS.index(field)

            tokens_data = jpdb_data.get('tokens', [])
            character_offset_within_this_api_batch = 0
            for seg_idx_in_batch, tokens_for_one_segment in enumerate(tokens_data):
                if seg_idx_in_batch >= len(segments_for_this_batch):
                    break
                current_segment_text = segments_for_this_batch[seg_idx_in_batch]
                for raw_token in tokens_for_one_segment:
                    try:
                        vocab_idx = raw_token[_tidx('vocabulary_index')]
                        position_in_segment = raw_token[_tidx('position')]
                        length = raw_token[_tidx('length')]
                        furigana_data = raw_token[_tidx('furigana')]
                    except Exception:
                        continue

                    if not isinstance(position_in_segment, int) or not isinstance(length, int):
                        continue
                    # select card data
                    if isinstance(vocab_idx, int) and 0 <= vocab_idx < len(vocab_map):
                        card_data = vocab_map[vocab_idx]
                    else:
                        card_data = {'state': ['unknown']}

                    # compute rubies
                    rubies: List[Dict[str, Any]] = []
                    if furigana_data and isinstance(furigana_data, list):
                        current_offset_in_token_surface = 0
                        for part in furigana_data:
                            if isinstance(part, str):
                                current_offset_in_token_surface += len(part)
                            elif isinstance(part, list) and len(part) == 2:
                                base_text_segment_part, ruby_text = part
                                if isinstance(base_text_segment_part, str) and isinstance(ruby_text, str):
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
                        global_offset_processed_across_batches
                        + character_offset_within_this_api_batch
                        + position_in_segment
                    )
                    all_processed.append(ProcessedToken(
                        start=token_start_global,
                        length=length,
                        end=token_start_global + length,
                        card=card_data,
                        rubies=rubies,
                    ))
                character_offset_within_this_api_batch += len(current_segment_text)

            chars_processed_in_this_batch = sum(len(s) for s in segments_for_this_batch)
            global_offset_processed_across_batches += chars_processed_in_this_batch

        return all_processed

    def mine_word(self, *, request: MineWordRequest) -> Dict[str, Any]:
        assert self._api_provider is not None, "JpdbApiProvider not configured"
        return self._api_provider.mine_word(
            vid=request.vid, sid=request.sid, jpdb_api_key=request.jpdb_api_key, mining_deck_id=request.mining_deck_id
        )

    def update_word_state(self, *, request: UpdateWordStateRequest) -> Dict[str, Any]:
        assert self._api_provider is not None, "JpdbApiProvider not configured"
        return self._api_provider.update_word_state(
            vid=request.vid, sid=request.sid, flag=request.flag, state=request.state, jpdb_api_key=request.jpdb_api_key
        )

    def review_card(self, *, request: ReviewCardRequest, review_url: str) -> Dict[str, Any]:
        assert self._api_provider is not None, "JpdbApiProvider not configured"
        return self._api_provider.review_card(
            vid=request.vid, sid=request.sid, rating=request.rating, jpdb_api_key=request.jpdb_api_key, review_url=review_url
        )

    def add_vocabulary_word(self, *, request: AddVocabularyWordRequest, user_id: Optional[str]) -> VocabularySchema:
        """Add a vocabulary word to the user's collection."""
        return self._repository.add_vocabulary_word(
            user_id=user_id,
            word=request.word,
            translation=request.translation,
            language=request.language,
            book_id=request.bookId,
            context=request.context,
            difficulty=request.difficulty,
        )

    def toggle_mastered(self, *, user_id: Optional[str], word_id: int, mastered: bool) -> Optional[VocabularySchema]:
        """Toggle mastered status for a vocabulary word."""
        return self._repository.toggle_mastered(user_id=user_id, word_id=word_id, mastered=mastered)

    def get_user_vocabulary(
        self,
        *,
        user_id: Optional[str],
        language: Optional[str] = None,
        mastered: Optional[bool] = None,
        book_id: Optional[str] = None,
    ) -> List[VocabularySchema]:
        """Get user's vocabulary words with optional filters."""
        return self._repository.get_user_vocabulary(
            user_id=user_id,
            language=language,
            mastered=mastered,
            book_id=book_id,
        )



