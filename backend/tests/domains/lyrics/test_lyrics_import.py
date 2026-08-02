from unittest.mock import Mock

import pytest
from flask import Flask

from app.domains.lyrics.adapters.uta_net import parse_uta_net_kanji_lyrics
from app.domains.lyrics.routes import lyrics_bp
from app.domains.lyrics.schemas import ImportedLyrics
from app.domains.lyrics.service import LyricsService


def test_parse_uta_net_kanji_lyrics_preserves_lines_and_ignores_romaji():
    html = """
        <html><body>
          <h1>
            <span>星の歌(hoshi no uta)</span>
            <span class="artist-name">試験バンド(shiken bando)</span>
          </h1>
          <div id="kashi-area" itemprop="text" style="display: none">
            夜空を見上げる<br>星が光っている
          </div>
          <div id="romaji-area">yozora wo miageru</div>
        </body></html>
    """

    parsed = parse_uta_net_kanji_lyrics(html)

    assert parsed == {
        "title": "星の歌",
        "artist": "試験バンド",
        "text": "夜空を見上げる\n星が光っている",
    }


def test_service_rejects_non_uta_net_urls_without_fetching():
    provider = Mock()
    service = LyricsService(provider)

    with pytest.raises(ValueError, match="Uta-Net"):
        service.import_kanji_lyrics("https://example.com/global/en/lyric/335761/")

    provider.fetch_kanji_lyrics.assert_not_called()


def test_service_strips_tracking_query_before_fetching():
    provider = Mock()
    provider.fetch_kanji_lyrics.return_value = {
        "title": "星の歌",
        "artist": "試験バンド",
        "text": "夜空を見上げる",
    }
    service = LyricsService(provider)

    result = service.import_kanji_lyrics(
        "https://www.uta-net.com/global/en/lyric/335761/?utm_source=chatgpt.com"
    )

    canonical = "https://www.uta-net.com/global/en/lyric/335761/"
    provider.fetch_kanji_lyrics.assert_called_once_with(canonical)
    assert result.source_url == canonical


def test_import_route_returns_kanji_lyrics():
    app = Flask(__name__)
    app.config["TESTING"] = True
    service = Mock(spec=LyricsService)
    service.import_kanji_lyrics.return_value = ImportedLyrics(
        title="星の歌",
        artist="試験バンド",
        text="夜空を見上げる",
        source_url="https://www.uta-net.com/global/en/lyric/335761/",
    )
    container = Mock()
    container.lyrics_service = service
    app.extensions["container"] = container
    app.register_blueprint(lyrics_bp)

    response = app.test_client().post(
        "/api/lyrics/import",
        json={"url": "https://www.uta-net.com/global/en/lyric/335761/"},
    )

    assert response.status_code == 200
    assert response.get_json()["text"] == "夜空を見上げる"
