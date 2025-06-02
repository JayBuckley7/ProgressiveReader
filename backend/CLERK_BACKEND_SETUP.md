# Clerk Backend Setup Guide

## Overview
The backend is configured to authenticate requests using Clerk session tokens passed from the frontend.

## 1. Get Your Clerk Secret Key

1. Go to your Clerk Dashboard
2. Navigate to "API Keys"
3. Copy your "Secret Key" (starts with `sk_test_` or `sk_live_`)

## 2. Set Environment Variable

Add the following to your `.env` file in the root directory:

```
CLERK_SECRET_KEY=sk_test_your_actual_secret_key_here
```

## 3. How It Works

### Authentication Flow:
1. Frontend uses Clerk components for authentication
2. When making API calls, frontend gets session token: `window.Clerk.session.getToken()`
3. Frontend includes token in Authorization header: `Authorization: Bearer <token>`
4. Backend middleware (`clerk_auth.py`) verifies the token with Clerk
5. If valid, user info is available in Flask routes via `g.user`

### Protected Routes:
Routes are protected using decorators:

```python
from app.utils.clerk_auth import require_auth, get_user_id

@api_bp.route('/books', methods=['GET'])
@require_auth
def get_books():
    user_id = get_user_id()  # Get authenticated user's ID
    # ... route logic
```

### Available Decorators:
- `@require_auth` - Requires authentication, returns 401 if not authenticated
- `@optional_auth` - Authentication optional, `g.user` may be None

### Helper Functions:
- `get_user_id()` - Returns current user's Clerk ID
- `get_user_email()` - Returns current user's primary email

## 4. Testing

1. Start the Flask backend:
   ```bash
   cd backend
   flask run
   ```

2. Start the frontend:
   ```bash
   cd frontend
   npm run dev
   ```

3. Sign in via the frontend
4. Check browser DevTools Network tab - API requests should include Authorization header
5. Backend logs should show successful authentication

## 5. Common Issues

### "CLERK_SECRET_KEY not found"
- Make sure your `.env` file is in the backend root directory
- Verify the environment variable is loaded (`python-dotenv` should handle this)

### 401 Unauthorized errors
- Check that frontend is sending the Authorization header
- Verify your Clerk secret key is correct
- Ensure the Clerk application ID matches between frontend and backend

### CORS issues
- The backend may need CORS configuration if frontend/backend are on different ports
- Add Flask-CORS if needed

## 6. Next Steps

- Implement user data synchronization between Clerk and your database
- Add role-based access control if needed
- Configure webhook endpoints for Clerk events (user created, updated, etc.) 