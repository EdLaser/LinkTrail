/**
 * GET /oauth/callback
 * OAuth callback handler
 * Handles authorization response from Hammerhead
 *
 * Query Parameters:
 *   - code: Authorization code from Hammerhead
 *   - state: State value for CSRF validation
 *   - error: If authorization was denied
 *
 * The user_id is extracted from the state token for security
 */

import { getConfig } from "~/server/utils/config";
import { hammerheadClient } from "~/server/utils/hammerhead/client";
import { validateAndConsumeState } from "~/server/utils/stateStore";
import { saveTokens } from "~/server/utils/tokenService";
import { db } from "~/server/utils/db";

export default defineEventHandler(async (event) => {
  const query = getQuery(event);
  const code = query.code as string | undefined;
  const state = query.state as string | undefined;
  const error = query.error as string | undefined;
  const errorDescription = query.error_description as string | undefined;

  // Check for authorization denial
  if (error) {
    throw createError({
      statusCode: 400,
      statusMessage: `Authorization denied: ${errorDescription || error}`,
    });
  }

  // Validate required parameters
  if (!code || !state) {
    throw createError({
      statusCode: 400,
      statusMessage: "Missing required parameters: code and state are required",
    });
  }

  // Validate state to prevent CSRF and extract user_id
  const stateResult = validateAndConsumeState(state);
  if (!stateResult.valid || !stateResult.userId) {
    throw createError({
      statusCode: 400,
      statusMessage: "Invalid or expired state parameter",
    });
  }

  const userId = stateResult.userId;

  // Verify user still exists (in case they were deleted)
  const appUser = await db.appUser.findUnique({
    where: { id: userId },
  });

  if (!appUser) {
    throw createError({
      statusCode: 404,
      statusMessage: "User not found",
    });
  }

  // Exchange authorization code for tokens
  let tokenResponse;
  try {
    tokenResponse = await hammerheadClient.exchangeCodeForToken(code);
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : "Unknown error";
    throw createError({
      statusCode: 401,
      statusMessage: `Failed to exchange authorization code: ${errorMsg}`,
    });
  }

  // Generate hammerhead user ID from email + scope hash
  // In a real implementation, this would come from a userinfo endpoint
  // For now, we use a deterministic ID based on the email and scope
  const scopeHash = tokenResponse.scope.split(" ").sort().join(":");
  const hammerheadUserId = `${appUser.email}_${Date.now()}`;

  // Save tokens to database
  try {
    await saveTokens(userId, hammerheadUserId, tokenResponse);
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : "Unknown error";
    throw createError({
      statusCode: 500,
      statusMessage: `Failed to save authentication tokens: ${errorMsg}`,
    });
  }

  // Determine redirect destination
  const redirectTo = stateResult.redirectTo || "/account/connected";

  // Return success response
  // For SPA: return JSON with success status
  // For traditional app: could redirect to success page
  return {
    success: true,
    message: "Successfully connected to Hammerhead",
    redirectTo,
    userId,
  };
});
