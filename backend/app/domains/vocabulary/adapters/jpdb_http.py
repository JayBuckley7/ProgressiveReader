from __future__ import annotations

import logging
import time
from typing import List, Optional, Dict, Any, Tuple, Union

import requests

from ..ports import JpdbApiProvider


logger = logging.getLogger(__name__)


class JpdbHttpProvider(JpdbApiProvider):
    JPDB_API_BASE_URL = "https://jpdb.io/api/v1"

    def post_endpoint(
        self,
        endpoint: str,
        *,
        jpdb_api_key: str,
        payload: dict,
        timeout: Tuple[float, float] = (5.0, 30.0),
        retries: int = 3,
        user_agent: str = "ProgressiveReader/jpdb-proxy",
    ) -> Dict[str, Any]:
        """POST to a JPDB API endpoint with basic retries and error normalization."""
        url = f"{self.JPDB_API_BASE_URL}/{endpoint.lstrip('/')}"
        headers = {
            "Authorization": f"Bearer {jpdb_api_key}",
            "Content-Type": "application/json",
            "Accept": "application/json",
            "User-Agent": user_agent,
        }

        delay = 0.25
        last_exc: Exception | None = None
        for attempt in range(max(1, retries)):
            try:
                response = requests.post(url, headers=headers, json=payload, timeout=timeout)
                if response.status_code != 200:
                    try:
                        error_payload = response.json()
                        message = error_payload.get("error_message") or error_payload.get("error") or str(error_payload)
                    except Exception:
                        message = response.text
                    raise ValueError(message or f"JPDB API error ({response.status_code})")

                data = response.json() or {}
                if isinstance(data, dict) and data.get("error"):
                    raise ValueError(data.get("error_message") or data.get("error") or "JPDB API error")
                return data
            except Exception as exc:
                last_exc = exc
                if attempt >= max(1, retries) - 1:
                    raise
                time.sleep(delay)
                delay *= 2

        raise last_exc or RuntimeError("JPDB request failed")

    def post_tokens_batch(
        self,
        *,
        text_batch: List[str],
        token_fields: List[str],
        vocab_fields: List[str],
        api_url: str,
        headers: Dict[str, str],
        timeout_connect: float = 5.0,
        timeout_read: float = 30.0,
    ) -> Dict[str, Any]:
        payload = {
            "text": text_batch,
            "position_length_encoding": "utf16",
            "token_fields": token_fields,
            "vocabulary_fields": vocab_fields,
        }
        response = requests.post(api_url, headers=headers, json=payload, timeout=(timeout_connect, timeout_read))
        response.raise_for_status()
        return response.json()

    def _deck_add_vocabulary(self, *, deck_id: Union[int, str], vid: int, sid: int, jpdb_api_key: str) -> Dict[str, Any]:
        return self.post_endpoint(
            "deck/add-vocabulary",
            jpdb_api_key=jpdb_api_key,
            payload={"id": deck_id, "vocabulary": [[vid, sid]]},
        )

    def _deck_remove_vocabulary(self, *, deck_id: Union[int, str], vid: int, sid: int, jpdb_api_key: str) -> Dict[str, Any]:
        return self.post_endpoint(
            "deck/remove-vocabulary",
            jpdb_api_key=jpdb_api_key,
            payload={"id": deck_id, "vocabulary": [[vid, sid]]},
        )

    def _set_card_sentence(self, *, vid: int, sid: int, jpdb_api_key: str, sentence: str) -> Dict[str, Any]:
        return self.post_endpoint(
            "set-card-sentence",
            jpdb_api_key=jpdb_api_key,
            payload={
                "vid": vid,
                "sid": sid,
                "sentence": sentence,
                "translation": "",
                "clear_audio": True,
                "clear_image": True,
            },
            retries=1,
        )

    def mine_word(
        self,
        *,
        vid: int,
        sid: int,
        jpdb_api_key: str,
        mining_deck_id: Optional[int],
        forq: Optional[bool] = None,
        forq_deck_id: Optional[int] = None,
        sentence: Optional[str] = None,
    ) -> Dict[str, Any]:
        if mining_deck_id is None:
            raise ValueError("mining_deck_id is required to mine a word")

        self._deck_add_vocabulary(deck_id=mining_deck_id, vid=vid, sid=sid, jpdb_api_key=jpdb_api_key)

        if bool(forq) and forq_deck_id is not None:
            self._deck_add_vocabulary(deck_id=forq_deck_id, vid=vid, sid=sid, jpdb_api_key=jpdb_api_key)

        result: Dict[str, Any] = {"success": True}
        if isinstance(sentence, str) and sentence.strip():
            try:
                self._set_card_sentence(vid=vid, sid=sid, jpdb_api_key=jpdb_api_key, sentence=sentence.strip())
            except Exception as exc:
                logger.warning("JPDB sentence attachment failed after vocabulary add: %s", exc)
                result["sentence_warning"] = str(exc)

        return result

    def update_word_state(
        self,
        *,
        vid: int,
        sid: int,
        flag: str,
        state: Any,
        jpdb_api_key: str,
        blacklist_deck_id: Optional[int] = None,
        never_forget_deck_id: Optional[int] = None,
        forq_deck_id: Optional[int] = None,
    ) -> Dict[str, Any]:
        deck_id: Union[int, str]
        if flag == "blacklist":
            deck_id = blacklist_deck_id if blacklist_deck_id is not None else "blacklist"
        elif flag == "never-forget":
            deck_id = never_forget_deck_id if never_forget_deck_id is not None else "never-forget"
        elif flag == "forq":
            if forq_deck_id is None:
                raise ValueError("forq_deck_id is required when flag='forq'")
            deck_id = forq_deck_id
        else:
            raise ValueError(f"Unknown flag: {flag}")

        if bool(state):
            self._deck_add_vocabulary(deck_id=deck_id, vid=vid, sid=sid, jpdb_api_key=jpdb_api_key)
        else:
            self._deck_remove_vocabulary(deck_id=deck_id, vid=vid, sid=sid, jpdb_api_key=jpdb_api_key)

        return {"success": True}

    def review_card(self, *, vid: int, sid: int, rating: str, jpdb_api_key: str, review_url: str) -> Dict[str, Any]:
        headers = {
            "Authorization": f"Bearer {jpdb_api_key}",
            "Content-Type": "application/json",
            "Accept": "application/json",
        }
        payload = {"vid": vid, "sid": sid, "grade": "okay" if rating == "good" else rating}
        response = requests.post(review_url, headers=headers, json=payload)
        response.raise_for_status()
        return {"success": True}


__all__ = ["JpdbHttpProvider"]

