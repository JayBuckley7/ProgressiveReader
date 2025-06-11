import logging
import os
import json
import time
from typing import List, Optional

import requests
from bs4 import BeautifulSoup

logger = logging.getLogger(__name__)

BASE_URL = "https://jpdb.io"
LOGIN_URL = f"{BASE_URL}/login"
DECK_URL = f"{BASE_URL}/deck"
DECK_ID = os.getenv("JPDB_DECK_ID", "")
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


def authenticate_session(session: requests.Session, *, username: Optional[str] = None, password: Optional[str] = None, cookie_string: Optional[str] = None) -> bool:
    if cookie_string:
        logger.info("Authenticating using cookie string")
        return set_cookies(session, cookie_string)
    if username and password:
        logger.info("Authenticating using username/password")
        return login_with_credentials(session, username, password)
    logger.info("Using fallback hardcoded cookie")
    hardcoded = "sid=f9ad768d62a1763a07d22c440a230b10"
    return set_cookies(session, hardcoded)


def fetch_page(session: requests.Session, offset: int = 0) -> str:
    params = {"id": DECK_ID, "show_only": SHOW_ONLY, "offset": offset}
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


def fetch_all_due_cards(username: Optional[str] = None, password: Optional[str] = None, cookie_string: Optional[str] = None) -> List[dict]:
    """Iterate over pages until no more overdue cards remain."""
    logger.info("Starting to fetch all due cards")
    session = requests.Session()
    session.headers.update({
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
    })

    if not authenticate_session(session, username=username, password=password, cookie_string=cookie_string):
        logger.error("Authentication failed. Cannot fetch cards.")
        return []

    all_cards: List[dict] = []
    offset = 0
    while True:
        html = fetch_page(session, offset)
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


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    env_username = os.getenv("JPDB_USERNAME")
    env_password = os.getenv("JPDB_PASSWORD")
    env_cookie = os.getenv("JPDB_COOKIE")
    cards = fetch_all_due_cards(username=env_username, password=env_password, cookie_string=env_cookie)
    with open("due_cards.json", "w", encoding="utf-8") as f:
        json.dump(cards, f, ensure_ascii=False, indent=2)
    print(f"Saved {len(cards)} cards to due_cards.json")
