import { eq } from "drizzle-orm";
import { db } from "~/db/index.ts";
import { hammerheadAccounts, syncedRoutes } from "~/db/schema.ts";
import { encryptToken, decryptToken } from "~/lib/crypto.ts";
import { getConfig } from "~/lib/config.ts";

/**
 * Type for token response from Hammerhead OAuth
 */
export interface HammerheadTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
  scope: string;
}

/**
 * Token lifecycle management: save, retrieve with auto-refresh, delete
 */

const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000; // Refresh 5 minutes before actual expiry

/**
 * Save OAuth tokens to database (encrypted).
 * Called immediately after successful OAuth exchange.
 */
export async function saveTokens(
  appUserId: string,
  hammerheadUserId: string,
  tokenResponse: HammerheadTokenResponse,
): Promise<void> {
  const expiresAt = new Date(Date.now() + tokenResponse.expires_in * 1000);

  // Encrypt tokens before storing
  const encryptedAccessToken = encryptToken(tokenResponse.access_token);
  const encryptedRefreshToken = encryptToken(tokenResponse.refresh_token);

  // Upsert HammerheadAccount
  const values = {
    hammerheadUserId,
    accessToken: encryptedAccessToken,
    refreshToken: encryptedRefreshToken,
    expiresAt,
    scope: tokenResponse.scope,
  };
  await db
    .insert(hammerheadAccounts)
    .values({ appUserId, ...values })
    .onConflictDoUpdate({ target: hammerheadAccounts.appUserId, set: values });
}

/**
 * Retrieve a valid access token, auto-refreshing if necessary.
 * If token is expired or expiring soon, refresh it automatically.
 * @throws Error if user has no linked Hammerhead account or refresh fails
 */
export async function getValidAccessToken(appUserId: string): Promise<string> {
  const [account] = await db
    .select()
    .from(hammerheadAccounts)
    .where(eq(hammerheadAccounts.appUserId, appUserId))
    .limit(1);

  if (!account) {
    throw new Error(`No Hammerhead account linked for user ${appUserId}`);
  }

  // Check if token needs refresh
  const now = Date.now();
  const expiresAtMs = account.expiresAt.getTime();
  const needsRefresh = now + TOKEN_REFRESH_BUFFER_MS >= expiresAtMs;

  if (!needsRefresh) {
    // Token is still valid, decrypt and return it
    try {
      return decryptToken(account.accessToken);
    } catch (e) {
      throw new Error(`Failed to decrypt access token for user ${appUserId}`);
    }
  }

  // Token expired or expiring soon, refresh it
  try {
    const decryptedRefreshToken = decryptToken(account.refreshToken);
    const newTokenResponse = await refreshAccessToken(decryptedRefreshToken);

    // Update database with new tokens
    await saveTokens(appUserId, account.hammerheadUserId, newTokenResponse);

    return newTokenResponse.access_token;
  } catch (e) {
    throw new Error(
      `Failed to refresh token for user ${appUserId}: ${e instanceof Error ? e.message : String(e)}`,
    );
  }
}

/**
 * Call Hammerhead OAuth token endpoint to refresh an access token.
 * This is a direct HTTP call to Hammerhead's API.
 */
export async function refreshAccessToken(refreshToken: string): Promise<HammerheadTokenResponse> {
  const config = getConfig();

  const response = await fetch(`${config.hammerheadApiBaseUrl}/auth/oauth/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      client_id: config.hammerheadClientId,
      client_secret: config.hammerheadClientSecret,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }).toString(),
  });

  if (!response.ok) {
    throw new Error(`Hammerhead token refresh failed: ${response.status} ${response.statusText}`);
  }

  return response.json() as Promise<HammerheadTokenResponse>;
}

/**
 * Delete a user's Hammerhead account and all associated data.
 * Called when user disconnects or Hammerhead revokes access.
 */
export async function deleteAccount(appUserId: string): Promise<void> {
  // Delete associated SyncedRoutes first (cascade would work, but explicit is clearer)
  await db.delete(syncedRoutes).where(eq(syncedRoutes.appUserId, appUserId));

  await db.delete(hammerheadAccounts).where(eq(hammerheadAccounts.appUserId, appUserId));
}
