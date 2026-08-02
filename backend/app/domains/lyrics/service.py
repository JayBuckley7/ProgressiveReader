from __future__ import annotations

import re
from urllib.parse import urlsplit, urlunsplit

from .ports import LyricsPageProviderPort
from .schemas import ImportedLyrics


_UTA_NET_HOSTS = {"uta-net.com", "www.uta-net.com"}
_UTA_NET_LYRIC_PATH = re.compile(r"^/global/[a-z]{2}/lyric/(?P<lyric_id>\d+)/?$")


class LyricsService:
    def __init__(self, page_provider: LyricsPageProviderPort) -> None:
        self._page_provider = page_provider

    def import_kanji_lyrics(self, url: str) -> ImportedLyrics:
        source_url = self._normalize_uta_net_url(url)
        parsed = self._page_provider.fetch_kanji_lyrics(source_url)
        return ImportedLyrics(source_url=source_url, **parsed)

    @staticmethod
    def _normalize_uta_net_url(raw_url: str) -> str:
        value = (raw_url or "").strip()
        parts = urlsplit(value)
        host = (parts.hostname or "").lower().rstrip(".")
        if parts.scheme != "https" or host not in _UTA_NET_HOSTS:
            raise ValueError("Enter an HTTPS Uta-Net lyrics URL")
        if parts.username or parts.password or parts.port:
            raise ValueError("Invalid Uta-Net lyrics URL")
        if not _UTA_NET_LYRIC_PATH.fullmatch(parts.path):
            raise ValueError("Only Uta-Net global lyrics pages are supported")

        return urlunsplit(("https", "www.uta-net.com", parts.path.rstrip("/") + "/", "", ""))


__all__ = ["LyricsService"]
