from __future__ import annotations

from typing import Iterator, Optional

from openai import OpenAI

from ..ports import TranslationProvider


class OpenAIProvider(TranslationProvider):
    def __init__(self, api_key: Optional[str] = None) -> None:
        self._api_key = api_key

    def translate_chapter(
        self,
        *,
        content: str,
        target_lang: str,
        use_cefr: bool = False,
        cefr_level: Optional[str] = None,
        model: Optional[str] = None,
    ) -> str:
        client = OpenAI(api_key=self._api_key)
        model = model or "gpt-4o-mini"

        system_prompt = (
            "You are a professional translator specializing in literary content. "
            "Translate the provided chapter HTML into the target language. Preserve all HTML formatting, including headings, paragraphs, and emphasis. "
            "Do not add explanations or extra text beyond the translation."
        )

        if use_cefr and cefr_level:
            system_prompt += (
                f" Aim for a CEFR level of {cefr_level}. Simplify complex expressions while keeping the meaning."
            )

        user_prompt = f"Translate this chapter into {target_lang}. Return only HTML without backticks."
        full_user_prompt = f"{user_prompt}\n\nHTML Content:\n```html\n{content}\n```"

        completion = client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": full_user_prompt},
            ],
            temperature=0.3,
        )
        translated_text = (completion.choices[0].message.content or "").strip()
        return translated_text

    def stream_translate_chapter(
        self,
        *,
        content: str,
        target_lang: str,
        use_cefr: bool = False,
        cefr_level: Optional[str] = None,
        model: Optional[str] = None,
    ) -> Iterator[str]:
        client = OpenAI(api_key=self._api_key)
        model = model or "gpt-4o-mini"

        system_prompt = (
            "You are a professional translator specializing in literary content. "
            "Translate the provided chapter HTML into the target language. Preserve all HTML formatting, including headings, paragraphs, and emphasis. "
            "Do not add explanations or extra text beyond the translation."
        )

        if use_cefr and cefr_level:
            system_prompt += (
                f" Aim for a CEFR level of {cefr_level}. Simplify complex expressions while keeping the meaning."
            )

        user_prompt = f"Translate this chapter into {target_lang}. Return only HTML without backticks."
        full_user_prompt = f"{user_prompt}\n\nHTML Content:\n```html\n{content}\n```"

        completion = client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": full_user_prompt},
            ],
            stream=True,
            temperature=0.3,
        )
        for chunk in completion:
            part = chunk.choices[0].delta.content
            if part is not None:
                yield part

    def translate_vocabulary(
        self,
        *,
        content: str,
        target_lang: str,
        model: Optional[str] = None,
    ) -> str:
        client = OpenAI(api_key=self._api_key)
        model = model or "gpt-4o-mini"

        system_prompt = (
            "You are a precise translator for vocabulary learning. "
            "Translate the given word or short phrase accurately and concisely. "
            "Provide only the translation, no explanations or extra text."
        )
        user_prompt = f"Translate '{content}' to {target_lang}"

        completion = client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            temperature=0.1,
            max_tokens=50,
        )
        translated_text = completion.choices[0].message.content.strip()
        return translated_text


__all__ = ["OpenAIProvider"]

