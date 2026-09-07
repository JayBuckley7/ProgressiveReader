from __future__ import annotations

import re

import requests
from bs4 import BeautifulSoup

from ..ports import LyricsPageProviderPort


_MAX_HTML_BYTES = 1_000_000
_USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
)


class UtaNetPageProvider(LyricsPageProviderPort):
    def fetch_kanji_lyrics(self, url: str) -> dict[str, str]:
        try:
            response = requests.get(
                url,
                headers={
                    "User-Agent": _USER_AGENT,
                    "Accept": "text/html,application/xhtml+xml",
                    "Accept-Language": "ja,en-US;q=0.9,en;q=0.8",
                },
                timeout=(5, 15),
                allow_redirects=False,
            )
            response.raise_for_status()
        except requests.RequestException as exc:
            raise RuntimeError("Uta-Net could not be reached") from exc

        if len(response.content) > _MAX_HTML_BYTES:
            raise RuntimeError("Uta-Net returned an unexpectedly large page")

        response.encoding = response.apparent_encoding or response.encoding or "utf-8"
        html = response.text
        if "challenge-error-text" in html or "Enable JavaScript and cookies to continue" in html:
            raise RuntimeError("Uta-Net temporarily blocked the import request; try again shortly")
        return parse_uta_net_kanji_lyrics(html)


def _clean_lines(value: str) -> str:
    lines = [line.strip() for line in value.replace("\r\n", "\n").replace("\r", "\n").split("\n")]
    cleaned: list[str] = []
    for line in lines:
        if line or (cleaned and cleaned[-1]):
            cleaned.append(line)
    return "\n".join(cleaned).strip()


def _strip_romaji_suffix(value: str) -> str:
    return re.sub(r"\s*\([A-Za-z0-9 '\-]+\)\s*$", "", value).strip()


def parse_uta_net_kanji_lyrics(html: str) -> dict[str, str]:
    soup = BeautifulSoup(html, "html.parser")
    lyrics_node = soup.select_one("#kashi-area")
    if lyrics_node is None:
        raise RuntimeError("Uta-Net's Japanese lyric section was not found")

    text = _clean_lines(lyrics_node.get_text("\n"))
    if not text or not re.search(r"[\u3040-\u30ff\u3400-\u9fff]", text):
        raise RuntimeError("The page did not contain Japanese lyrics")

    heading = soup.select_one("h1")
    heading_parts = heading.find_all("span", recursive=False) if heading else []
    title = _strip_romaji_suffix(heading_parts[0].get_text(" ", strip=True)) if heading_parts else "Imported lyrics"
    artist_node = soup.select_one("h1 .artist-name")
    artist = _strip_romaji_suffix(artist_node.get_text(" ", strip=True)) if artist_node else ""

    return {"title": title or "Imported lyrics", "artist": artist, "text": text}


__all__ = ["UtaNetPageProvider", "parse_uta_net_kanji_lyrics"]
