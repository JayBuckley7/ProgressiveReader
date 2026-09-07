from app.domains.translation.ports import TranslationProvider
from app.domains.translation.service import TranslationService
from app.domains.translation.schemas import TranslateRequest, TranslateSegmentsRequest


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

    def stream_translate_chapter(self, *, content: str, target_lang: str, use_cefr=False, cefr_level=None, model=None):
        yield self.translate_chapter(
            content=content,
            target_lang=target_lang,
            use_cefr=use_cefr,
            cefr_level=cefr_level,
            model=model,
        )

    def translate_vocabulary(self, *, content: str, target_lang: str, model=None) -> str:
        return f"MOCK-{target_lang}-{content}"


class _BatchProvider(_MockProvider):
    def __init__(self) -> None:
        super().__init__()
        self.translate_calls = 0
        self.stream_calls = 0

    @staticmethod
    def _translate(content: str) -> str:
        return content.replace("<p>one</p>", "<p>ONE</p>").replace("<em>two</em>", "<em>TWO</em>")

    def translate_chapter(self, *, content: str, target_lang: str, use_cefr=False, cefr_level=None, model=None) -> str:
        self.translate_calls += 1
        self.last = {
            'content': content,
            'target_lang': target_lang,
            'use_cefr': use_cefr,
            'cefr_level': cefr_level,
            'model': model,
        }
        return self._translate(content)

    def stream_translate_chapter(self, *, content: str, target_lang: str, use_cefr=False, cefr_level=None, model=None):
        self.stream_calls += 1
        self.last = {
            'content': content,
            'target_lang': target_lang,
            'use_cefr': use_cefr,
            'cefr_level': cefr_level,
            'model': model,
        }
        translated = self._translate(content)
        midpoint = len(translated) // 2
        yield translated[:midpoint]
        yield translated[midpoint:]


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


def test_translate_segments_batches_one_provider_call_and_preserves_ids():
    provider = _BatchProvider()
    service = TranslationService(provider)
    req = TranslateSegmentsRequest.model_validate({
        "segments": [
            {"id": "s-1", "html": "<p>one</p>", "sourceHash": "hash-1"},
            {"id": "s-2", "html": "<em>two</em>"},
        ],
        "targetLanguage": "English",
        "useCefr": True,
        "cefrLevel": "B2",
        "model": "gpt-4o-mini",
        "promptVersion": "segments-v1",
    })

    result = service.translate_segments(req)

    assert provider.translate_calls == 1
    assert provider.stream_calls == 0
    assert provider.last["target_lang"] == "English"
    assert provider.last["use_cefr"] is True
    assert provider.last["cefr_level"] == "B2"
    assert [segment.id for segment in result.segments] == ["s-1", "s-2"]
    assert [segment.translated_html for segment in result.segments] == ["<p>ONE</p>", "<em>TWO</em>"]
    assert result.segments[0].source_hash == "hash-1"
    assert result.model_used == "gpt-4o-mini"


def test_stream_translate_segments_uses_one_streaming_provider_call():
    provider = _BatchProvider()
    service = TranslationService(provider)
    req = TranslateSegmentsRequest.model_validate({
        "segments": [
            {"id": "s-1", "html": "<p>one</p>"},
            {"id": "s-2", "html": "<em>two</em>"},
        ],
        "target_lang": "English",
        "stream": True,
    })

    result = service.stream_translate_segments(req)

    assert provider.translate_calls == 0
    assert provider.stream_calls == 1
    assert [segment.translated_html for segment in result.segments] == ["<p>ONE</p>", "<em>TWO</em>"]


def test_translate_segments_repairs_only_the_missing_segment_once():
    class _PartialProvider(_BatchProvider):
        def __init__(self) -> None:
            super().__init__()
            self.contents: list[str] = []

        def translate_chapter(self, *, content: str, target_lang: str, use_cefr=False, cefr_level=None, model=None) -> str:
            self.translate_calls += 1
            self.contents.append(content)
            if self.translate_calls == 1:
                return '<pr-translation-segment data-pr-index="0"><p>ONE</p></pr-translation-segment>'
            return '<pr-translation-segment data-pr-index="0"><em>TWO</em></pr-translation-segment>'

    provider = _PartialProvider()
    service = TranslationService(provider)
    req = TranslateSegmentsRequest.model_validate({
        "segments": [
            {"id": "s-1", "html": "<p>one</p>"},
            {"id": "s-2", "html": "<em>two</em>"},
        ],
        "targetLanguage": "English",
    })

    result = service.translate_segments(req)

    assert provider.translate_calls == 2
    assert "<p>one</p>" in provider.contents[0]
    assert "<em>two</em>" in provider.contents[0]
    assert "<p>one</p>" not in provider.contents[1]
    assert "<em>two</em>" in provider.contents[1]
    assert [segment.id for segment in result.segments] == ["s-1", "s-2"]
    assert [segment.translated_html for segment in result.segments] == ["<p>ONE</p>", "<em>TWO</em>"]


def test_translate_segments_repairs_only_an_empty_segment_once():
    class _EmptySegmentProvider(_BatchProvider):
        def __init__(self) -> None:
            super().__init__()
            self.contents: list[str] = []

        def translate_chapter(self, *, content: str, target_lang: str, use_cefr=False, cefr_level=None, model=None) -> str:
            self.translate_calls += 1
            self.contents.append(content)
            if self.translate_calls == 1:
                return (
                    '<pr-translation-segment data-pr-index="0"><p>ONE</p></pr-translation-segment>'
                    '<pr-translation-segment data-pr-index="1">   </pr-translation-segment>'
                )
            return '<pr-translation-segment data-pr-index="0"><em>TWO</em></pr-translation-segment>'

    provider = _EmptySegmentProvider()
    service = TranslationService(provider)
    req = TranslateSegmentsRequest.model_validate({
        "segments": [
            {"id": "s-1", "html": "<p>one</p>"},
            {"id": "s-2", "html": "<em>two</em>"},
        ],
        "targetLanguage": "English",
    })

    result = service.translate_segments(req)

    assert provider.translate_calls == 2
    assert "<p>one</p>" not in provider.contents[1]
    assert "<em>two</em>" in provider.contents[1]
    assert [segment.translated_html for segment in result.segments] == ["<p>ONE</p>", "<em>TWO</em>"]


def test_translate_segments_returns_trustworthy_subset_after_repair_is_exhausted():
    class _ExhaustedRepairProvider(_BatchProvider):
        def __init__(self) -> None:
            super().__init__()
            self.contents: list[str] = []

        def translate_chapter(self, *, content: str, target_lang: str, use_cefr=False, cefr_level=None, model=None) -> str:
            self.translate_calls += 1
            self.contents.append(content)
            if self.translate_calls == 1:
                return '<pr-translation-segment data-pr-index="0"><p>ONE</p></pr-translation-segment>'
            return '<p>repair without a trustworthy boundary</p>'

    provider = _ExhaustedRepairProvider()
    service = TranslationService(provider)
    req = TranslateSegmentsRequest.model_validate({
        "segments": [
            {"id": "s-1", "html": "<p>one</p>", "sourceHash": "hash-1"},
            {"id": "s-2", "html": "<em>two</em>", "sourceHash": "hash-2"},
        ],
        "targetLanguage": "English",
    })

    result = service.translate_segments(req)

    assert provider.translate_calls == 2
    assert "<p>one</p>" not in provider.contents[1]
    assert "<em>two</em>" in provider.contents[1]
    assert [segment.id for segment in result.segments] == ["s-1"]
    assert result.segments[0].translated_html == "<p>ONE</p>"
    assert result.segments[0].source_hash == "hash-1"
