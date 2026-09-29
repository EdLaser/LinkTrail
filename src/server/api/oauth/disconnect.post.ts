/**
 * POST /api/oauth/disconnect
 * Disconnect Hammerhead account and revoke access
 *
 * Request Body:
 *   - user_id: App user ID (in real app, should come from session/JWT)
 *
 * Response:
 *   - success: boolean
 *   - message: string
 */

import { getConfig } from "~/server/utils/config"
import { hammerheadClient } from "~/server/utils/hammerhead/client"
import { deleteAccount } from "~/server/utils/tokenService"
import { db } from "~/server/utils/db"

export default defineEventHandler(async (event) => {
  // TODO: In production, get user_id from session/JWT in Authorization header
  // For now, accept it from request body for testing
  const body = await readBody<{ user_id: string }>(event).catch(() => ({}))
  const userId = body?.user_id || (getQuery(event).user_id as string)

  if (!userId) {
    throw createError({
      statusCode: 400,
      statusMessage: "Missing required parameter: user_id",
    })
  }

  // Verify user exists
  const appUser = await db.appUser.findUnique({
    where: { id: userId },
  })

  if (!appUser) {
    throw createError({
      statusCode: 404,
      statusMessage: "User not found",
    })
  }

  // Get Hammerhead account if it exists
  const hammerheadAccount = await db.hammerheadAccount.findUnique({
    where: { appUserId: userId },
  })

  if (!hammerheadAccount) {
    // Already disconnected
    return {
      success: true,
      message: "Hammerhead account is not connected",
    }
  }

  // Attempt to revoke access on Hammerhead side
  // This is best-effort; if it fails, we still delete locally
  try {
    await hammerheadClient.deauthorize(hammerheadAccount.accessToken)
  } catch (err) {
    // Log but don't throw - we still want to delete locally
    const errorMsg = err instanceof Error ? err.message : "Unknown error"
    console.warn(`Failed to revoke Hammerhead access: ${errorMsg}`)
  }

  // Delete account from database (cascades to SyncedRoute entries)
  try {
    await deleteAccount(userId)
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : "Unknown error"
    throw createError({
      statusCode: 500,
      statusMessage: `Failed to disconnect account: ${errorMsg}`,
    })
  }

  return {
    success: true,
    message: "Successfully disconnected from Hammerhead",
  }
})
