from app.domains.translation.integrations import TranslationProvider
from app.domains.translation.service import TranslationService
from app.domains.translation.schemas import TranslateRequest


class _MockProvider(TranslationProvider):
    def __init__(self) -> None:
        self.last = {}

    def translate_chapter(self, *, content: str, target_lang: str, use_cefr=False, cefr_level=None, model=None) -> str:
        self.last = {
            'content': content,
            'target_lang': target_lang,
            'use_cefr': use_cefr,
            'cefr_level': cefr_level,
            'model': model,
        }
        return f"<div>MOCK-{target_lang}-{len(content)}</div>"


def test_translate_chapter_basic():
    provider = _MockProvider()
    service = TranslationService(provider)

    req = TranslateRequest(content="<p>hello</p>", target_lang="English", use_cefr=False)
    res = service.translate_chapter(req)

    assert res.translated_text.startswith("<div>MOCK-English-")
    assert "hello" not in res.translated_text  # provider returns mock, not echo


def test_translate_chapter_cefr_propagation():
    provider = _MockProvider()
    service = TranslationService(provider)

    req = TranslateRequest(
        content="<p>text</p>",
        target_lang="English",
        use_cefr=True,
        cefr_level="B2",
        model="gpt-4o-mini",
    )
    _ = service.translate_chapter(req)

    assert provider.last['use_cefr'] is True
    assert provider.last['cefr_level'] == "B2"
    assert provider.last['model'] == "gpt-4o-mini"



