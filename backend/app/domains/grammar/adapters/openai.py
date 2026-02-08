from __future__ import annotations

from typing import Optional, Any
import json

from openai import OpenAI

from ..ports import GrammarProvider
from ..schemas import (
    ValidateExamplesRequest,
    ValidateExamplesResponse,
    GrammarValidateMatch,
    Span,
    TeachExamplesRequest,
    TeachExamplesResponse,
    TeachExampleOut,
)


class OpenAIProvider(GrammarProvider):
    def __init__(self, api_key: Optional[str] = None) -> None:
        self._api_key = api_key

    def _call_openai_json(self, *, model: str, messages: list[dict[str, str]], temperature: float = 0) -> Any:
        client = OpenAI(api_key=self._api_key)
        completion = client.chat.completions.create(
            model=model,
            messages=messages,
            temperature=temperature,
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
            "IMPORTANT: Treat grammar.meaning as the authoritative target sense. If the surface form appears but the\n"
            "sentence uses a different sense/usage than grammar.meaning, you MUST set isMatch=false.\n"
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
            "- Set isMatch=true for at most maxResults candidates total.\n"
            "- Be conservative with polysemous/common items; prefer false if uncertain.\n"
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
                "Only mark up to maxResults candidates as isMatch=true.\n"
                "If you are unsure OR the usage doesn't match grammar.meaning, mark isMatch=false with low confidence.\n"
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

    def teach_examples(self, req: TeachExamplesRequest) -> TeachExamplesResponse:
        # Build a small JSON-only prompt (the route caps length/count).
        payload = {
            "grammar": req.grammar.model_dump(),
            "examples": [
                {
                    "exampleId": e.exampleId,
                    "sentence": e.sentence,
                    "before": e.before,
                    "after": e.after,
                    "matchSpan": e.matchSpan.model_dump() if e.matchSpan else None,
                }
                for e in req.examples
            ],
            "task": (
                "For each example, produce:\n"
                "- translation: a natural English translation (1 sentence)\n"
                "- breakdown: a short segment gloss line like 'X (meaning) Y (meaning)'\n"
                "- usageNote: a short note explaining how the grammar is functioning in THIS sentence (1 sentence)\n"
                "- contrast: rewrite the sentence swapping the grammar for a close alternative when reasonable "
                "(e.g. だから vs ので/ですから), plus a short note about tone/nuance.\n"
                "Keep everything concise."
            ),
            "output_shape": {
                "teachings": [
                    {
                        "exampleId": "string",
                        "translation": "string",
                        "breakdown": "string",
                        "usageNote": "string",
                        "contrast": {"alternative": "string", "note": "string"},
                    }
                ]
            },
        }

        system_prompt = (
            "You are a Japanese teacher. You must output ONLY valid JSON.\n"
            "Do not include markdown. Keep notes short and accurate.\n"
            "If a contrast rewrite is unnatural, set contrast to null.\n"
        )

        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": json.dumps(payload, ensure_ascii=False)},
        ]

        data_out = self._call_openai_json(model=req.model or "gpt-4o-mini", messages=messages, temperature=0.2)

        teachings = data_out.get("teachings") if isinstance(data_out, dict) else None
        if not isinstance(teachings, list):
            return TeachExamplesResponse(teachings=[])

        normalized: list[TeachExampleOut] = []
        for row in teachings:
            if not isinstance(row, dict):
                continue
            example_id = row.get("exampleId")
            if not isinstance(example_id, str) or not example_id:
                continue

            translation = row.get("translation") if isinstance(row.get("translation"), str) else None
            breakdown = row.get("breakdown") if isinstance(row.get("breakdown"), str) else None
            usage_note = row.get("usageNote") if isinstance(row.get("usageNote"), str) else None

            contrast = row.get("contrast")
            if not isinstance(contrast, dict):
                contrast_out = None
            else:
                alt = contrast.get("alternative")
                note = contrast.get("note")
                if not isinstance(alt, str) or not isinstance(note, str):
                    contrast_out = None
                else:
                    contrast_out = {"alternative": alt, "note": note}

            normalized.append(
                TeachExampleOut(
                    exampleId=example_id,
                    translation=translation,
                    breakdown=breakdown,
                    usageNote=usage_note,
                    contrast=contrast_out,
                )
            )

        return TeachExamplesResponse(teachings=normalized)


__all__ = ["OpenAIProvider"]

