from types import SimpleNamespace
from unittest.mock import Mock
import pytest
from flask import Flask

from app.bootstrap.web import register_error_handlers
from app.bootstrap.wiring import register_domain_blueprints
from app.infrastructure.sqlalchemy.db import db
from app.infrastructure.sqlalchemy.models import Vocabulary, Bookmark
from app.domains.vocabulary.adapters.sqlalchemy_repository import SqlAlchemyVocabularyRepository
from app.domains.books.adapters.sqlalchemy_repository import SqlAlchemyBooksRepository
from app.domains.vocabulary.service import VocabularyService
from app.domains.books.service import BooksService
from app.core.errors import AppError
from app.adapters.llm_api_key_resolver import DefaultApiKeyResolver
from app.adapters.memory_key_pool import InMemoryApiKeyPool


@pytest.fixture
def secured():
    app = Flask(__name__)
    app.config.update(TESTING=True, SQLALCHEMY_DATABASE_URI="sqlite:///:memory:")
    db.init_app(app)
    register_error_handlers(app)
    register_domain_blueprints(app)
    def identity(headers):
        token = headers.get("Authorization", "")
        return SimpleNamespace(id=token[7:]) if token in ("Bearer alice", "Bearer bob") else None
    vr = SqlAlchemyVocabularyRepository(db.session)
    br = SqlAlchemyBooksRepository(db.session)
    container = SimpleNamespace(
        auth_service=SimpleNamespace(get_current_user_from_headers=identity, is_admin=lambda uid: False),
        vocabulary_service=VocabularyService(None, None, repository=vr),
        books_service=BooksService(br, None, None),
        make_translation_service=Mock(), make_grammar_service=Mock(), make_mix_service=Mock(),
        ocr_service=Mock(), ocr_layout_service=Mock(),
    )
    app.extensions['container'] = container
    with app.app_context():
        db.create_all()
        db.session.add_all([
            Vocabulary(id=1, user_id='alice', word='private', translation='secret'),
            Vocabulary(id=2, user_id='bob', word='other', translation='other'),
            Bookmark(user_id='alice', book_id='book', chapter_index=0, position=0, note='private'),
        ])
        db.session.commit()
        yield app.test_client(), container, vr, br
        db.session.remove()
        db.drop_all()


@pytest.mark.parametrize('token', ['', 'Bearer invalid'])
def test_anonymous_and_invalid_tokens_cannot_read_or_write(secured, token):
    client, _, _, _ = secured
    headers = {'Authorization': token}
    assert client.get('/api/vocabulary', headers=headers).status_code == 401
    assert client.get('/api/bookmarks?bookId=book', headers=headers).status_code == 401
    assert client.patch('/api/vocabulary/1/mastered', json={'mastered': True}, headers=headers).status_code == 401
    assert client.post('/api/bookmarks', json={}, headers=headers).status_code == 401


def test_owner_filter_and_cross_user_update(secured):
    client, _, _, _ = secured
    bob = {'Authorization': 'Bearer bob'}
    assert [v['word'] for v in client.get('/api/vocabulary', headers=bob).json] == ['other']
    assert client.get('/api/bookmarks?bookId=book', headers=bob).json == []
    assert client.patch('/api/vocabulary/1/mastered', json={'mastered': True}, headers=bob).status_code == 404
    own = client.patch('/api/vocabulary/2/mastered', json={'mastered': True}, headers=bob)
    assert own.status_code == 200 and own.json['mastered'] is True


def test_repositories_fail_closed_without_http(secured):
    _, _, vr, br = secured
    for call in [lambda: vr.get_user_vocabulary(None), lambda: vr.toggle_mastered(None, 1, True), lambda: br.get_bookmarks('book')]:
        with pytest.raises(AppError):
            call()


@pytest.mark.parametrize('path', ['/api/translate/chapter', '/api/translate/segments', '/api/grammar/validate-examples', '/api/grammar/teach-examples', '/api/mix/refine', '/api/ocr/process', '/api/ocr/layout/page'])
def test_server_funded_calls_never_invoke_providers(secured, path):
    client, container, _, _ = secured
    assert client.post(path, json={'content': 'test'}).status_code == 401
    result = client.post(path, json={'content': 'test'}, headers={'Authorization': 'Bearer alice'})
    assert result.status_code == 403 and result.json['code'] == 'SERVER_AI_DISABLED'
    container.make_translation_service.assert_not_called()
    container.make_grammar_service.assert_not_called()
    container.make_mix_service.assert_not_called()
    container.ocr_service.assert_not_called()
    container.ocr_layout_service.assert_not_called()


def test_resolver_never_falls_back_to_server_credentials():
    pool = InMemoryApiKeyPool()
    pool.add_key('server')
    resolver = DefaultApiKeyResolver(pool=pool, fallback_key='fallback')
    assert resolver.resolve(None) is None
    assert resolver.resolve('  own-key  ') == 'own-key'
