from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Optional
from openai import OpenAI


class TranslationProvider(ABC):
    """Abstraction over translation providers (OpenAI, Anthropic, etc.)."""

    @abstractmethod
    def translate_chapter(
        self,
        *,
        content: str,
        target_lang: str,
        use_cefr: bool = False,
        cefr_level: Optional[str] = None,
        model: Optional[str] = None,
    ) -> str:
        """Return translated HTML string for the given chapter content."""
        raise NotImplementedError


class MockProvider(TranslationProvider):
    """Simple mock for tests and local development."""

    def translate_chapter(
        self,
        *,
        content: str,
        target_lang: str,
        use_cefr: bool = False,
        cefr_level: Optional[str] = None,
        model: Optional[str] = None,
    ) -> str:
        return f"<div>MOCK({target_lang}{' CEFR:'+str(cefr_level) if use_cefr and cefr_level else ''}) {len(content)}</div>"


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

        user_prompt = (
            f"Translate this chapter into {target_lang}. Return only HTML without backticks."
        )

        full_user_prompt = f"{user_prompt}\n\nHTML Content:\n```html\n{content}\n```"

        completion = client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": full_user_prompt},
            ],
            temperature=0.3,
        )
        translated_text = completion.choices[0].message.content.strip()

        # Clean code fences if present
        if translated_text.startswith("```html"):
            translated_text = translated_text[7:].strip()
        elif translated_text.startswith("```"):
            translated_text = translated_text[3:].strip()
        if translated_text.endswith("```"):
            translated_text = translated_text[:-3].strip()

        return translated_text

    def stream_translate_chapter(
        self,
        *,
        content: str,
        target_lang: str,
        use_cefr: bool = False,
        cefr_level: Optional[str] = None,
        model: Optional[str] = None,
    ):
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

        user_prompt = (
            f"Translate this chapter into {target_lang}. Return only HTML without backticks."
        )

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
    ) -> str:
        """Translate vocabulary (short words/phrases) with optimized settings."""
        client = OpenAI(api_key=self._api_key)
        model = "gpt-3.5-turbo"  # Faster model for vocabulary

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
            temperature=0.1,  # Very low temperature for consistent vocabulary translations
            max_tokens=50,  # Limit tokens for vocabulary responses
        )
        translated_text = completion.choices[0].message.content.strip()
        return translated_text

