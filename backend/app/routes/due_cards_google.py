from flask import Blueprint, request, jsonify
import logging
import requests
from ..utils.clerk_auth import require_auth
from ..utils.jpdb_due import fetch_all_due_cards

logger = logging.getLogger(__name__)

due_cards_google_bp = Blueprint('due_cards_google', __name__)

@due_cards_google_bp.route('/api/due_cards/google-oauth', methods=['POST'])
@require_auth
def fetch_due_cards_google_oauth():
    """Fetch JPDB due cards using Google OAuth token from Clerk."""
    try:
        # Get the user ID from the authenticated request
        user_id = request.clerk_user_id
        
        # Get Google OAuth token from Clerk
        google_token = get_google_oauth_token(user_id)
        if not google_token:
            return jsonify({'error': 'No Google OAuth token found'}), 401
        
        # Get request data
        data = request.get_json() or {}
        offset = data.get('offset', 0)
        
        # Try to authenticate with JPDB using Google OAuth
        cards = authenticate_jpdb_with_google(google_token, offset)
        
        return jsonify(cards)
        
    except Exception as e:
        logger.error(f"Error fetching due cards with Google OAuth: {e}")
        return jsonify({'error': str(e)}), 500

def get_google_oauth_token(user_id: str) -> str:
    """Get Google OAuth token for user from Clerk."""
    try:
        import os
        from clerk_backend_api import Clerk
        
        # Initialize Clerk client
        clerk = Clerk(bearer_auth=os.getenv('CLERK_SECRET_KEY'))
        
        # Get Google OAuth token for the user
        response = clerk.users.get_o_auth_access_token(
            user_id=user_id,
            provider='google'
        )
        
        if response and hasattr(response, 'token'):
            return response.token
        
        return None
        
    except Exception as e:
        logger.error(f"Failed to get Google OAuth token: {e}")
        return None

def authenticate_jpdb_with_google(google_token: str, offset: int = 0) -> list:
    """Attempt to authenticate with JPDB using Google OAuth token."""
    try:
        # NOTE: Direct Google OAuth token usage with JPDB won't work because:
        # 1. JPDB's Google OAuth is separate from our app's Google OAuth
        # 2. OAuth tokens are domain-specific and can't be shared between services
        # 3. JPDB would need to accept our app's Google OAuth tokens (which it doesn't)
        
        # This is a placeholder that will always fail, but we keep it for future
        # implementation if JPDB ever provides an API that accepts third-party OAuth tokens
        
        logger.info("Attempting Google OAuth with JPDB (experimental)")
        
        # For now, this will always fail and fall back to manual credentials
        raise Exception("Google OAuth with JPDB not yet supported - JPDB doesn't accept third-party OAuth tokens")
        
    except Exception as e:
        logger.error(f"Google OAuth authentication with JPDB failed (expected): {e}")
        raise Exception(f"Google OAuth authentication with JPDB failed: {e}")

def fetch_all_due_cards_with_session(session: requests.Session, offset: int = 0) -> list:
    """Fetch due cards using an existing session."""
    try:
        import os
        from bs4 import BeautifulSoup
        
        DECK_URL = "https://jpdb.io/deck"
        DECK_ID = os.getenv("JPDB_DECK_ID", "")
        SHOW_ONLY = "due"
        PAGE_SIZE = 50
        
        params = {"id": DECK_ID, "show_only": SHOW_ONLY, "offset": offset}
        
        response = session.get(DECK_URL, params=params)
        response.raise_for_status()
        
        # Check if we're redirected to login (authentication failed)
        if 'login' in response.url.lower():
            raise Exception("Authentication failed - redirected to login")
        
        # Parse the response
        soup = BeautifulSoup(response.text, "html.parser")
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
        
    except Exception as e:
        logger.error(f"Failed to fetch due cards with session: {e}")
        raise e
