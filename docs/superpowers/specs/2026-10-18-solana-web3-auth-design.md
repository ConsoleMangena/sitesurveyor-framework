# Design — Replace Email/Google Auth with Solana Web3 Wallet Auth

Date: 2026-10-18
Status: Draft (pending user review)
Scope: apps/web — authentication (Login/Signup/Forgot/Reset pages), session handling (lib/auth/session.ts, App.tsx), auth UI components

## Context

User requested replacing email/Google auth with Supabase Web3 Solana wallet auth (@supabase/auth-js 2.108.2 supports signInWithWeb3 with chain 'solana').

Current: email/password + Google OAuth; LoginPage/SignupPage/ForgotPasswordPage/ResetPasswordPage; GoogleSignInButton; App.tsx manages sessions.

## Decision

Full redesign to Solana wallet SSO only.

## Design

### 1) lib/auth/session.ts
- Remove: signInWithGoogle, signInWithEmail, signUpWithEmail, SignInInput, SignUpInput, SignUpResult, resendSignupConfirmation
- Add: signInWithSolanaWallet(wallet?: any, options?: any) calling supabase.auth.signInWithWeb3({ chain: 'solana', wallet, options })
- Keep: getCurrentSession, getCurrentUser, signOut, onAuthStateChange, loadStoredSession

### 2) Auth pages
- Replace LoginPage + SignupPage with single WalletLoginPage; remove ForgotPassword/ResetPassword UI/routes or redirect to /login.
- Flow: connect Solana wallet → sign SIWS via Supabase → signed in.

### 3) Wallet integration
- Use @solana/wallet-adapter-react; prefer passing connected adapter to signInWithWeb3.
- Handle not installed/connecting/signing errors.

### 4) Routing/guards
- /login becomes wallet login; remove /signup, /forgot-password, /reset-password or redirect.
- ProtectedRoute unchanged.

### 5) Identity
- Supabase auth user created via Web3 (provider web3). Profile bootstrap via existing mapUserWithRetries/getCurrentAppUserWithDiagnostics must continue; may need sensible defaults if triggers expect email.

### 6) Cleanup
- Remove GoogleSignInButton, update tests (LoginPage/SignupPage), remove dead types/imports.

### 7) Security
- SIWS message from Supabase (domain/URI/issuedAt; nonce optional). Session via Supabase.

## Trade-offs
- Pros: passwordless, Web3-native, simpler.
- Cons: breaks existing email accounts (wallet auth different identity), email recovery gone.

## Testing
- Unit: session helpers; Integration: wallet sign-in; Smoke: login→dashboard, sign out→login.

## Implementation (high level)
1. session.ts rewrite
2. WalletLoginPage + route updates
3. Wire wallet adapter
4. Update/remove tests/components/routes
5. Lint/typecheck/test/build
