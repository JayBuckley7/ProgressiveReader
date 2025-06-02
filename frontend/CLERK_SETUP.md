# Clerk Authentication Setup Guide

## 1. Create a Clerk Account

1. Go to [https://clerk.com](https://clerk.com) and sign up for a free account
2. Create a new application in the Clerk Dashboard

## 2. Configure Authentication Methods

In your Clerk Dashboard:
1. Navigate to "User & Authentication" → "Email, Phone, Username"
2. Enable Email authentication
3. Navigate to "User & Authentication" → "Social Connections" 
4. Enable Google OAuth (and any other providers you want)

## 3. Get Your API Keys

1. In the Clerk Dashboard, go to "API Keys"
2. Copy your "Publishable Key" (starts with `pk_test_` or `pk_live_`)

## 4. Set Up Environment Variables

1. Copy `frontend/.env.example` to `frontend/.env`
2. Replace the placeholder with your actual Clerk publishable key:
   ```
   VITE_CLERK_PUBLISHABLE_KEY=pk_test_your_actual_key_here
   ```

## 5. Configure Redirect URLs (for production)

When deploying to production:
1. In Clerk Dashboard → "Paths"
2. Update the redirect URLs to match your production domain

## 6. Customize Sign-In/Sign-Up Experience

You can customize the appearance of Clerk's components by:
1. Using the Clerk Dashboard's "Customization" section
2. Passing custom styles to the `appearance` prop in the components

## 7. Backend Integration

The Flask backend will need to verify Clerk session tokens. You'll need to:
1. Install the Clerk Python SDK in your backend
2. Use Clerk's session verification middleware
3. Update the Flask `/api/auth/status` endpoint to check Clerk sessions

## Next Steps

- Test authentication by running `npm run dev` in the frontend directory
- Implement Flask endpoints to work with Clerk authentication
- Update the storage service to pass Clerk session tokens to Flask API calls 