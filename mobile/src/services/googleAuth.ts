import * as AuthSession from "expo-auth-session";
import * as SecureStore from "expo-secure-store";
import * as WebBrowser from "expo-web-browser";
import { GOOGLE_CLIENT_ID, GCAL_SCOPES } from "../config";
import type { GoogleToken } from "../types";

WebBrowser.maybeCompleteAuthSession();

const SECURE_STORE_KEY = "pomodoroom_google_token";
const DISCOVERY = {
  authorizationEndpoint: "https://accounts.google.com/o/oauth2/v2/auth",
  tokenEndpoint: "https://oauth2.googleapis.com/token",
  revocationEndpoint: "https://oauth2.googleapis.com/revoke",
};

export function useGoogleAuth() {
  const redirectUri = AuthSession.makeRedirectUri({ scheme: "com.pomodoroom.mobile" });

  const [request, response, promptAsync] = AuthSession.useAuthRequest(
    {
      clientId: GOOGLE_CLIENT_ID,
      scopes: GCAL_SCOPES,
      redirectUri,
      responseType: AuthSession.ResponseType.Code,
      usePKCE: true,
    },
    DISCOVERY,
  );

  return { request, response, promptAsync, redirectUri };
}

export async function exchangeCodeForToken(
  code: string,
  redirectUri: string,
  codeVerifier: string,
): Promise<GoogleToken> {
  const res = await fetch(DISCOVERY.tokenEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: GOOGLE_CLIENT_ID,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
      code_verifier: codeVerifier,
    }).toString(),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Token exchange failed: ${err}`);
  }

  const data = await res.json();
  const token: GoogleToken = {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: Date.now() + data.expires_in * 1000,
    tokenType: data.token_type,
    scope: data.scope,
  };

  await SecureStore.setItemAsync(SECURE_STORE_KEY, JSON.stringify(token));
  return token;
}

export async function getStoredToken(): Promise<GoogleToken | null> {
  const raw = await SecureStore.getItemAsync(SECURE_STORE_KEY);
  if (!raw) return null;
  return JSON.parse(raw) as GoogleToken;
}

export async function getValidToken(): Promise<GoogleToken | null> {
  const token = await getStoredToken();
  if (!token) return null;

  // If more than 5 minutes until expiry, reuse
  if (token.expiresAt - Date.now() > 5 * 60 * 1000) return token;

  // Attempt refresh
  if (!token.refreshToken) return null;
  return refreshAccessToken(token.refreshToken);
}

export async function refreshAccessToken(
  storedRefreshToken: string,
): Promise<GoogleToken | null> {
  const res = await fetch(DISCOVERY.tokenEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: storedRefreshToken,
      client_id: GOOGLE_CLIENT_ID,
      grant_type: "refresh_token",
    }).toString(),
  });

  if (!res.ok) {
    await SecureStore.deleteItemAsync(SECURE_STORE_KEY);
    return null;
  }

  const data = await res.json();
  const newToken: GoogleToken = {
    accessToken: data.access_token,
    refreshToken: storedRefreshToken,
    expiresAt: Date.now() + data.expires_in * 1000,
    tokenType: data.token_type,
    scope: data.scope,
  };

  await SecureStore.setItemAsync(SECURE_STORE_KEY, JSON.stringify(newToken));
  return newToken;
}

export async function revokeAuth(): Promise<void> {
  const token = await getStoredToken();
  if (token) {
    try {
      await fetch(
        `${DISCOVERY.revocationEndpoint}?token=${token.accessToken}`,
      );
    } catch {
      // Ignore network errors during revocation
    }
    await SecureStore.deleteItemAsync(SECURE_STORE_KEY);
  }
}

export async function isAuthenticated(): Promise<boolean> {
  const token = await getValidToken();
  return token !== null;
}
