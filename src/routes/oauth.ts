import { createRoute, z } from "@hono/zod-openapi";
import { eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { hammerheadAccounts } from "~/db/schema.ts";
import { decryptToken } from "~/lib/crypto.ts";
import { HAMMERHEAD_SCOPES } from "~/lib/hammerhead/types.ts";
import { requireUser } from "~/lib/http.ts";
import { createRouter, errorResponse } from "~/lib/openapi.ts";
import { createState, validateAndConsumeState } from "~/lib/stateStore.ts";
import { deleteAccount, saveTokens } from "~/lib/tokenService.ts";

export const oauthRoutes = createRouter();

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : "Unknown error";
}

const startRoute = createRoute({
  method: "get",
  path: "/oauth/start",
  tags: ["OAuth"],
  summary: "Start the Hammerhead OAuth flow",
  request: {
    query: z.object({
      user_id: z.uuid().openapi({ description: "App user ID initiating OAuth" }),
      redirect_uri: z
        .string()
        .optional()
        .openapi({ description: "Where the client goes after the callback completes" }),
    }),
  },
  responses: {
    302: { description: "Redirect to the Hammerhead authorization page" },
    400: errorResponse("Invalid parameters"),
    404: errorResponse("User not found"),
    409: errorResponse("User is already connected to Hammerhead"),
  },
});

oauthRoutes.openapi(startRoute, async (c) => {
  const { db, hammerhead } = c.var;
  const query = c.req.valid("query");
  const user = await requireUser(db, query.user_id);

  const [existing] = await db
    .select({ id: hammerheadAccounts.id })
    .from(hammerheadAccounts)
    .where(eq(hammerheadAccounts.appUserId, user.id))
    .limit(1);
  if (existing) {
    throw new HTTPException(409, { message: "This user is already connected to Hammerhead" });
  }

  const state = createState(user.id, query.redirect_uri);
  const authorizeUrl = hammerhead.buildAuthorizeUrl(state, [
    HAMMERHEAD_SCOPES.ROUTE_WRITE,
    HAMMERHEAD_SCOPES.ROUTE_READ,
  ]);

  return c.redirect(authorizeUrl);
});

const callbackRoute = createRoute({
  method: "get",
  path: "/oauth/callback",
  tags: ["OAuth"],
  summary: "Hammerhead OAuth callback",
  description: "The user is identified by the state token, never by a query param.",
  request: {
    query: z.object({
      code: z.string().optional(),
      state: z.string().optional(),
      error: z.string().optional(),
      error_description: z.string().optional(),
    }),
  },
  responses: {
    200: {
      description: "Account connected",
      content: {
        "application/json": {
          schema: z.object({
            success: z.boolean(),
            message: z.string(),
            redirectTo: z.string(),
            userId: z.string(),
          }),
        },
      },
    },
    400: errorResponse("Authorization denied, or missing/invalid code or state"),
    401: errorResponse("Authorization code exchange failed"),
    404: errorResponse("User not found"),
    500: errorResponse("Failed to save tokens"),
  },
});

oauthRoutes.openapi(callbackRoute, async (c) => {
  const { db, hammerhead } = c.var;
  const { code, state, error, error_description: errorDescription } = c.req.valid("query");

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

  const user = await requireUser(db, stateResult.userId);

  let tokenResponse;
  try {
    tokenResponse = await hammerhead.exchangeCodeForToken(code);
  } catch (err) {
    throw new HTTPException(401, {
      message: `Failed to exchange authorization code: ${errorMessage(err)}`,
    });
  }

  // TODO: fetch the real Hammerhead user id once a userinfo endpoint is available
  const hammerheadUserId = `${user.email}_${Date.now()}`;

  try {
    await saveTokens(c.var, user.id, hammerheadUserId, tokenResponse);
  } catch (err) {
    throw new HTTPException(500, {
      message: `Failed to save authentication tokens: ${errorMessage(err)}`,
    });
  }

  return c.json(
    {
      success: true,
      message: "Successfully connected to Hammerhead",
      redirectTo: stateResult.redirectTo || "/account/connected",
      userId: user.id,
    },
    200,
  );
});

const disconnectRoute = createRoute({
  method: "post",
  path: "/api/oauth/disconnect",
  tags: ["OAuth"],
  summary: "Disconnect the Hammerhead account and revoke access",
  // TODO: take user_id from a session/JWT instead of the request
  request: {
    query: z.object({ user_id: z.uuid().optional() }),
    body: {
      content: {
        "application/json": { schema: z.object({ user_id: z.uuid().optional() }) },
      },
    },
  },
  responses: {
    200: {
      description: "Disconnected, or nothing was connected",
      content: {
        "application/json": {
          schema: z.object({ success: z.boolean(), message: z.string() }),
        },
      },
    },
    400: errorResponse("Missing or invalid user_id"),
    404: errorResponse("User not found"),
    500: errorResponse("Failed to delete the account"),
  },
});

oauthRoutes.openapi(disconnectRoute, async (c) => {
  const { db, config, hammerhead } = c.var;
  const userId = c.req.valid("json").user_id ?? c.req.valid("query").user_id;
  const user = await requireUser(db, userId);

  const [account] = await db
    .select()
    .from(hammerheadAccounts)
    .where(eq(hammerheadAccounts.appUserId, user.id))
    .limit(1);

  if (!account) {
    return c.json({ success: true, message: "Hammerhead account is not connected" }, 200);
  }

  // Best-effort: local data is deleted even if Hammerhead can't be reached
  try {
    await hammerhead.deauthorize(decryptToken(account.accessToken, config.tokenEncryptionKey));
  } catch (err) {
    console.warn(`Failed to revoke Hammerhead access: ${errorMessage(err)}`);
  }

  try {
    await deleteAccount(c.var, user.id);
  } catch (err) {
    throw new HTTPException(500, {
      message: `Failed to disconnect account: ${errorMessage(err)}`,
    });
  }

  return c.json({ success: true, message: "Successfully disconnected from Hammerhead" }, 200);
});
