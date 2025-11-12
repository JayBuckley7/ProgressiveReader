from typing import List, Optional

from app.domains.vocabulary.integrations import JpdbProvider
from app.domains.vocabulary.schemas import Deck, DueCard
from app.domains.vocabulary.service import VocabularyService


class _MockJpdb(JpdbProvider):
    def fetch_due_cards(
        self,
        *,
        username: Optional[str],
        password: Optional[str],
        cookie_string: Optional[str],
    ) -> List[DueCard]:
        return [DueCard(id="1", term="誰", meaning="who")]

    def fetch_user_decks(
        self,
        *,
        username: Optional[str],
        password: Optional[str],
        cookie_string: Optional[str],
    ) -> List[Deck]:
        return [Deck(id="d1", name="Core", words=100)]


def test_due_cards_service():
    svc = VocabularyService(_MockJpdb())
    cards = svc.get_due_cards(username=None, password=None, cookie_string="cookie")
    assert len(cards) == 1
    assert cards[0].term == "誰"


def test_decks_service():
    svc = VocabularyService(_MockJpdb())
    decks = svc.get_user_decks(username=None, password=None, cookie_string="cookie")
    assert len(decks) == 1
    assert decks[0].name == "Core"


class _EmptyJpdb(JpdbProvider):
    def fetch_due_cards(self, *, username=None, password=None, cookie_string=None):
        return []

    def fetch_user_decks(self, *, username=None, password=None, cookie_string=None):
        return []


def test_empty_results():
    svc = VocabularyService(_EmptyJpdb())
    assert svc.get_due_cards(username=None, password=None, cookie_string=None) == []
    assert svc.get_user_decks(username=None, password=None, cookie_string=None) == []


class _ErrorJpdb(JpdbProvider):
    def fetch_due_cards(self, *, username=None, password=None, cookie_string=None):
        raise RuntimeError("boom")

    def fetch_user_decks(self, *, username=None, password=None, cookie_string=None):
        raise RuntimeError("boom2")


def test_provider_error_propagates():
    svc = VocabularyService(_ErrorJpdb())
    try:
        _ = svc.get_due_cards(username=None, password=None, cookie_string=None)
        assert False, "expected exception"
    except RuntimeError:
        pass
    try:
        _ = svc.get_user_decks(username=None, password=None, cookie_string=None)
        assert False, "expected exception"
    except RuntimeError:
        pass




