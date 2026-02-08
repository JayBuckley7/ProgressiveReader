"""JPDB scraping adapter helpers (due cards + deck listing).

This module is intentionally kept under adapters/ because it depends on:
- requests
- BeautifulSoup (bs4)

It is used by `JpdbModuleProvider` as a legacy fallback when callers provide
username/password/cookies instead of an API key.
"""

from __future__ import annotations

import logging
import time
from typing import List, Optional

import requests
from bs4 import BeautifulSoup

logger = logging.getLogger(__name__)

BASE_URL = "https://jpdb.io"
LOGIN_URL = f"{BASE_URL}/login"
DECK_URL = f"{BASE_URL}/deck"
SHOW_ONLY = "due"
PAGE_SIZE = 50


def login_with_credentials(session: requests.Session, username: str, password: str) -> bool:
    """Login to jpdb.io with username and password."""
    logger.info("Attempting credential login for %s", username)
    try:
        resp = session.get(LOGIN_URL)
        resp.raise_for_status()
        soup = BeautifulSoup(resp.text, "html.parser")
        form = soup.find("form")
        if not form:
            logger.error("Login form not found")
            return False
        inputs = {i.get("name"): i.get("value", "") for i in form.find_all("input") if i.get("name")}
        inputs["username"] = username
        inputs["password"] = password
        login_resp = session.post(LOGIN_URL, data=inputs, allow_redirects=True)
        login_resp.raise_for_status()
        final_soup = BeautifulSoup(login_resp.text, "html.parser")
        if "Log in" in final_soup.text or LOGIN_URL in login_resp.url:
            logger.warning("Credential login failed")
            return False
        logger.info("Credential login succeeded")
        return True
    except requests.RequestException as exc:
        logger.error("Error during credential login: %s", exc)
        return False


def set_cookies(session: requests.Session, cookie_string: str) -> bool:
    """Set cookies on the session from a raw cookie string."""
    if not cookie_string:
        logger.warning("No cookie string provided")
        return False
    try:
        for pair in cookie_string.split(";"):
            if "=" in pair:
                name, value = pair.strip().split("=", 1)
                session.cookies.set(name, value)
        return True
    except Exception as exc:
        logger.error("Failed to set cookies: %s", exc)
        return False


def authenticate_session(
    session: requests.Session,
    *,
    username: Optional[str] = None,
    password: Optional[str] = None,
    cookie_string: Optional[str] = None,
) -> bool:
    if cookie_string:
        logger.info("Authenticating using cookie string")
        return set_cookies(session, cookie_string)
    if username and password:
        logger.info("Authenticating using username/password")
        return login_with_credentials(session, username, password)
    logger.error("No JPDB authentication provided (cookie string or username/password required)")
    return False


def fetch_page(session: requests.Session, *, deck_id: str, offset: int = 0) -> str:
    params = {"id": deck_id, "show_only": SHOW_ONLY, "offset": offset}
    logger.info("Fetching page with offset %s", offset)
    resp = session.get(DECK_URL, params=params)
    resp.raise_for_status()
    return resp.text


def parse_cards(html: str) -> List[dict]:
    soup = BeautifulSoup(html, "html.parser")
    cards = []
    for div in soup.select("div[data-card-id]"):
        card_id = div.get("data-card-id")
        term_elem = div.select_one(".term, .word, span.ja")
        meaning_elem = div.select_one(".meaning, span.en")
        if term_elem and meaning_elem:
            term = term_elem.get_text(strip=True)
            meaning = meaning_elem.get_text(strip=True)
            cards.append({"id": card_id, "term": term, "meaning": meaning})
    return cards


def fetch_all_due_cards(
    username: Optional[str] = None,
    password: Optional[str] = None,
    cookie_string: Optional[str] = None,
    *,
    deck_id: str,
) -> List[dict]:
    """Iterate over pages until no more overdue cards remain."""
    logger.info("Starting to fetch all due cards")
    if not deck_id:
        logger.error("JPDB deck_id not configured; cannot scrape due cards")
        return []
    session = requests.Session()
    session.headers.update(
        {
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/91.0.4472.124 Safari/537.36"
            )
        }
    )

    if not authenticate_session(session, username=username, password=password, cookie_string=cookie_string):
        logger.error("Authentication failed. Cannot fetch cards.")
        return []

    all_cards: List[dict] = []
    offset = 0
    while True:
        html = fetch_page(session, deck_id=deck_id, offset=offset)
        if LOGIN_URL in html[:1000]:
            logger.warning("Redirected to login page, stopping fetch")
            break
        cards_on_page = parse_cards(html)
        if not cards_on_page:
            break
        all_cards.extend(cards_on_page)
        offset += PAGE_SIZE
        time.sleep(1)

    logger.info("Finished fetching %s cards", len(all_cards))
    return all_cards


def fetch_user_decks(
    username: Optional[str] = None,
    password: Optional[str] = None,
    cookie_string: Optional[str] = None,
) -> Optional[List[dict]]:
    """Fetch the user's JPDB decks with id, name, and word count (best-effort scraping)."""
    logger.info("Fetching user decks from JPDB")

    session = requests.Session()
    session.headers.update(
        {
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/91.0.4472.124 Safari/537.36"
            )
        }
    )

    if not authenticate_session(session, username=username, password=password, cookie_string=cookie_string):
        logger.error("Authentication failed. Cannot fetch decks.")
        return None

    try:
        # Navigate to decks page
        decks_url = f"{BASE_URL}/decks"
        response = session.get(decks_url)
        response.raise_for_status()

        # Check if redirected to login (auth failed)
        if LOGIN_URL in response.url:
            logger.error("Redirected to login, authentication may have failed")
            return None

        soup = BeautifulSoup(response.text, "html.parser")
        decks = []

        deck_elements = soup.find_all("div", class_="deck") or soup.find_all("a", href=lambda x: x and "/deck" in x)

        for deck_elem in deck_elements:
            try:
                deck_link = deck_elem.get("href") or deck_elem.find("a", href=True)
                if isinstance(deck_link, str):
                    deck_href = deck_link
                else:
                    deck_href = deck_link.get("href") if deck_link else ""

                if not deck_href or "deck" not in deck_href:
                    continue

                deck_id = None
                if "id=" in deck_href:
                    try:
                        deck_id = deck_href.split("id=")[1].split("&")[0]
                    except (IndexError, ValueError):
                        continue

                deck_name = deck_elem.get_text(strip=True)
                if deck_elem.find("a"):
                    deck_name = deck_elem.find("a").get_text(strip=True)

                word_count = 0
                count_elem = deck_elem.find(text=lambda x: x and "cards" in x.lower())
                if count_elem:
                    try:
                        import re

                        count_match = re.search(r"(\\d+(?:,\\d+)*)", count_elem)
                        if count_match:
                            word_count = int(count_match.group(1).replace(",", ""))
                    except (ValueError, AttributeError):
                        pass

                if deck_id and deck_name:
                    decks.append({"id": deck_id, "name": deck_name, "word_count": word_count})
            except Exception as e:
                logger.warning("Error parsing deck element: %s", e)
                continue

        logger.info("Found %s decks", len(decks))
        return decks

    except requests.RequestException as e:
        logger.error("Error fetching decks page: %s", e)
        return None
    except Exception as e:
        logger.error("Unexpected error fetching decks: %s", e)
        return None


__all__ = [
    "fetch_all_due_cards",
    "fetch_user_decks",
]
