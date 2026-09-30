import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { db } from "~/db/index.ts";
import { hammerheadAccounts } from "~/db/schema.ts";
import { decryptToken } from "~/lib/crypto.ts";
import { hammerheadClient } from "~/lib/hammerhead/client.ts";
import { HAMMERHEAD_SCOPES } from "~/lib/hammerhead/types.ts";
import { requireUser } from "~/lib/http.ts";
import { createState, validateAndConsumeState } from "~/lib/stateStore.ts";
import { deleteAccount, saveTokens } from "~/lib/tokenService.ts";

export const oauthRoutes = new Hono();

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : "Unknown error";
}

// Query: user_id (required), redirect_uri (optional, where the client goes after the callback)
oauthRoutes.get("/oauth/start", async (c) => {
  const user = await requireUser(c.req.query("user_id"));

  const [existing] = await db
    .select({ id: hammerheadAccounts.id })
    .from(hammerheadAccounts)
    .where(eq(hammerheadAccounts.appUserId, user.id))
    .limit(1);
  if (existing) {
    throw new HTTPException(409, { message: "This user is already connected to Hammerhead" });
  }

  const state = createState(user.id, c.req.query("redirect_uri"));
  const authorizeUrl = hammerheadClient.buildAuthorizeUrl(state, [
    HAMMERHEAD_SCOPES.ROUTE_WRITE,
    HAMMERHEAD_SCOPES.ROUTE_READ,
  ]);

  return c.redirect(authorizeUrl);
});

// The user is identified by the state token, never by a query param.
oauthRoutes.get("/oauth/callback", async (c) => {
  const { code, state, error, error_description: errorDescription } = c.req.query();

  if (error) {
    throw new HTTPException(400, { message: `Authorization denied: ${errorDescription || error}` });
  }
  if (!code || !state) {
    throw new HTTPException(400, {
      message: "Missing required parameters: code and state are required",
    });
  }

  const stateResult = validateAndConsumeState(state);
  if (!stateResult.valid || !stateResult.userId) {
    throw new HTTPException(400, { message: "Invalid or expired state parameter" });
  }

  const user = await requireUser(stateResult.userId);

  let tokenResponse;
  try {
    tokenResponse = await hammerheadClient.exchangeCodeForToken(code);
  } catch (err) {
    throw new HTTPException(401, {
      message: `Failed to exchange authorization code: ${errorMessage(err)}`,
    });
  }

  // TODO: fetch the real Hammerhead user id once a userinfo endpoint is available
  const hammerheadUserId = `${user.email}_${Date.now()}`;

  try {
    await saveTokens(user.id, hammerheadUserId, tokenResponse);
  } catch (err) {
    throw new HTTPException(500, {
      message: `Failed to save authentication tokens: ${errorMessage(err)}`,
    });
  }

  return c.json({
    success: true,
    message: "Successfully connected to Hammerhead",
    redirectTo: stateResult.redirectTo || "/account/connected",
    userId: user.id,
  });
});

// TODO: take user_id from a session/JWT instead of the request
oauthRoutes.post("/api/oauth/disconnect", async (c) => {
  const body = await c.req.json<{ user_id?: string }>().catch(() => ({ user_id: undefined }));
  const user = await requireUser(body.user_id ?? c.req.query("user_id"));

  const [account] = await db
    .select()
    .from(hammerheadAccounts)
    .where(eq(hammerheadAccounts.appUserId, user.id))
    .limit(1);

  if (!account) {
    return c.json({ success: true, message: "Hammerhead account is not connected" });
  }

  // Best-effort: local data is deleted even if Hammerhead can't be reached
  try {
    await hammerheadClient.deauthorize(decryptToken(account.accessToken));
  } catch (err) {
    console.warn(`Failed to revoke Hammerhead access: ${errorMessage(err)}`);
  }

  try {
    await deleteAccount(user.id);
  } catch (err) {
    throw new HTTPException(500, {
      message: `Failed to disconnect account: ${errorMessage(err)}`,
    });
  }

  return c.json({ success: true, message: "Successfully disconnected from Hammerhead" });
});
