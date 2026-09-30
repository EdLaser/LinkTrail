/**
 * GET /oauth/start
 * Initiates OAuth flow by redirecting to Hammerhead authorization endpoint
 *
 * Query Parameters:
 *   - user_id (required): App user ID initiating OAuth
 *   - redirect_uri (optional): Where to redirect after OAuth callback completes
 */

import { getConfig } from "~/server/utils/config.ts"
import { hammerheadClient } from "~/server/utils/hammerhead/client.ts"
import { createState } from "~/server/utils/stateStore.ts"
import { HAMMERHEAD_SCOPES } from "~/server/utils/hammerhead/types.ts"
import { db } from "~/server/utils/db.ts"

export default defineEventHandler(async (event) => {
  const query = getQuery(event);
  const userId = query.user_id as string | undefined;
  const redirectUri = query.redirect_uri as string | undefined;

  // Validate user_id is provided
  if (!userId) {
    throw createError({
      statusCode: 400,
      statusMessage: "Missing required parameter: user_id",
    });
  }

  // Verify user exists
  const appUser = await db.appUser.findUnique({
    where: { id: userId },
  });

  if (!appUser) {
    throw createError({
      statusCode: 404,
      statusMessage: "User not found",
    });
  }

  // Check if already connected
  const existingAccount = await db.hammerheadAccount.findUnique({
    where: { appUserId: userId },
  });

  if (existingAccount) {
    throw createError({
      statusCode: 409,
      statusMessage: "This user is already connected to Hammerhead",
    });
  }

  // Generate state for CSRF protection, embedding user_id
  const state = createState(userId, redirectUri);

  // Request the OAuth scopes we need
  const scopes = [HAMMERHEAD_SCOPES.ROUTE_WRITE, HAMMERHEAD_SCOPES.ROUTE_READ];

  // Build the authorization URL
  const authorizeUrl = hammerheadClient.buildAuthorizeUrl(state, scopes);

  // Redirect to Hammerhead authorization endpoint
  return sendRedirect(event, authorizeUrl);
});
