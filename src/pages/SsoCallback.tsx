import { AuthenticateWithRedirectCallback } from '@clerk/react';

// Where Google/OAuth sign-in comes back to complete. Reachable regardless of
// sign-in state (see App.tsx) since the session doesn't exist yet while this
// is running. On native, the app never actually navigates here as a real
// page load — the OS hands the redirect back via a custom URL scheme, and
// the appUrlOpen bridge (App.tsx) re-enters the already-running app at this
// route with the same query params Clerk needs to finish the exchange.
const SsoCallback = () => (
  <AuthenticateWithRedirectCallback
    signInFallbackRedirectUrl="/"
    signUpFallbackRedirectUrl="/"
  />
);

export default SsoCallback;
