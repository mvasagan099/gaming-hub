# Gaming Hub Auth Fix

This patch fixes the web authentication flow for:
- signup confirmation callback
- password recovery callback
- password reset session handling
- Capacitor/web compatibility by keeping the callback on the HTTPS frontend

## Files changed

- apps/web/src/pages/Auth/AuthCallbackPage.tsx (new)
- apps/web/src/pages/Auth/ResetPasswordPage.tsx
- apps/web/src/pages/Auth/ForgotPasswordPage.tsx
- apps/web/src/pages/Auth/SignupPage.tsx
- apps/web/src/router/index.tsx

## Supabase Dashboard settings

Authentication -> URL Configuration:

Site URL:
https://gaming-hub-frontend.onrender.com

Redirect URLs:
https://gaming-hub-frontend.onrender.com/**
https://gaming-hub-frontend.onrender.com/auth/callback
https://gaming-hub-frontend.onrender.com/reset-password

Authentication -> Sign In / Providers -> Email:

- Enable Email provider
- Enable Confirm Email if you want signup confirmation
- Keep password sign-in enabled

Authentication -> Email Templates:

Confirm signup:
<a href="{{ .ConfirmationURL }}">Confirm your Gaming Hub account</a>

Reset password:
<a href="{{ .ConfirmationURL }}">Reset your Gaming Hub password</a>

Magic link:
<a href="{{ .ConfirmationURL }}">Sign in to Gaming Hub</a>

If Gmail SMTP is configured, disable click/link tracking in the SMTP provider.

## Build

From repository root:

npm install
npm run build -w @gaming-hub/web

For Capacitor:

cd apps/web
npm run cap:sync
npm run cap:open

The email callback intentionally remains HTTPS. Do not put the Android custom scheme directly in Supabase email templates until Android deep-link/app-link handling is configured.
