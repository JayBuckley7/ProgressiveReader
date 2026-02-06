from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Optional, Any
import json

from openai import OpenAI

from .schemas import ValidateExamplesRequest, ValidateExamplesResponse, GrammarValidateMatch, Span


class GrammarProvider(ABC):
    @abstractmethod
    def validate_examples(self, req: ValidateExamplesRequest) -> ValidateExamplesResponse:
        raise NotImplementedError


class OpenAIProvider(GrammarProvider):
    def __init__(self, api_key: Optional[str] = None) -> None:
        self._api_key = api_key

    def _call_openai_json(self, *, model: str, messages: list[dict[str, str]]) -> Any:
        client = OpenAI(api_key=self._api_key)
        completion = client.chat.completions.create(
            model=model,
            messages=messages,
            temperature=0,
            response_format={"type": "json_object"},
        )
        content = completion.choices[0].message.content or ""
        return json.loads(content)

    def validate_examples(self, req: ValidateExamplesRequest) -> ValidateExamplesResponse:
        grammar = req.grammar

        # Keep prompts short and deterministic; the caller caps candidate count/length.
        system_prompt = (
            "You are a strict Japanese grammar validator.\n"
            "Given a grammar point and candidate sentences, decide whether the grammar point is actually used.\n"
            "Return ONLY valid JSON with this exact shape:\n"
            "{ \"matches\": [ { \"candidateId\": string, \"isMatch\": boolean, \"confidence\": number, "
            "\"matchSpan\": {\"start\": number, \"end\": number, \"text\": string} | null, "
            "\"explanation\": string | null } ] }\n"
            "Rules:\n"
            "- confidence is 0..1.\n"
            "- matchSpan.start/end are indices into candidate.sentence (JS string indices).\n"
            "- matchSpan.text must equal sentence[start:end].\n"
            "- Keep explanation <= 25 words.\n"
            "- If not a match, set matchSpan null.\n"
        )

        # Provide structured candidate input so the model can reliably reference ids.
        user_payload = {
            "grammar": {
                "id": grammar.id,
                "title": grammar.title,
                "meaning": grammar.meaning,
                "level": grammar.level,
            },
            "candidates": [
                {
                    "id": c.id,
                    "sentence": c.sentence,
                    "before": c.before,
                    "after": c.after,
                    "hintSpan": c.hintSpan.model_dump() if c.hintSpan else None,
                }
                for c in req.candidates
            ],
            "maxResults": req.maxResults,
            "instructions": (
                "Evaluate each candidate. Output one matches entry per candidate id.\n"
                "Sort matches so that the best true matches come first (highest confidence).\n"
                "If you are unsure, mark isMatch=false with low confidence.\n"
            ),
        }

        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": json.dumps(user_payload, ensure_ascii=False)},
        ]

        try:
            data = self._call_openai_json(model=req.model or "gpt-4o-mini", messages=messages)
        except Exception:
            # Retry once with an even stricter instruction.
            messages_retry = [
                {"role": "system", "content": system_prompt + "\nYou MUST output valid JSON. No markdown."},
                {"role": "user", "content": json.dumps(user_payload, ensure_ascii=False)},
            ]
            data = self._call_openai_json(model=req.model or "gpt-4o-mini", messages=messages_retry)

        raw_matches = data.get("matches") if isinstance(data, dict) else None
        if not isinstance(raw_matches, list):
            return ValidateExamplesResponse(matches=[])

        matches: list[GrammarValidateMatch] = []
        for row in raw_matches:
            if not isinstance(row, dict):
                continue
            candidate_id = row.get("candidateId")
            if not isinstance(candidate_id, str) or not candidate_id:
                continue
            is_match = bool(row.get("isMatch"))
            confidence = row.get("confidence")
            if isinstance(confidence, (int, float)):
                confidence = max(0.0, min(1.0, float(confidence)))
            else:
                confidence = None

            match_span = None
            span = row.get("matchSpan")
            if is_match and isinstance(span, dict):
                start = span.get("start")
                end = span.get("end")
                text = span.get("text")
                if isinstance(start, int) and isinstance(end, int) and end >= start:
                    if isinstance(text, str) and text:
                        match_span = Span(start=start, end=end, text=text)
                    else:
                        match_span = Span(start=start, end=end, text=None)

            explanation = row.get("explanation")
            if not isinstance(explanation, str):
                explanation = None

            matches.append(
                GrammarValidateMatch(
                    candidateId=candidate_id,
                    isMatch=is_match,
                    confidence=confidence,
                    matchSpan=match_span,
                    explanation=explanation,
                )
            )

        # Sort: true matches first, then confidence desc. Keep the list stable for non-matches.
        def _sort_key(m: GrammarValidateMatch):
            return (1 if m.isMatch else 0, float(m.confidence or 0.0))

        matches.sort(key=_sort_key, reverse=True)

        return ValidateExamplesResponse(matches=matches)

