/**
 * Simple in-memory store for OAuth state tokens
 * Each state is valid for 15 minutes
 */

const STATE_EXPIRY_MS = 15 * 60 * 1000 // 15 minutes
const stateMap = new Map<
  string,
  {
    createdAt: number
    userId: string // AppUser ID who initiated OAuth
    redirectTo?: string
  }
>()

/**
 * Generate and store OAuth state for CSRF protection
 */
export function createState(userId: string, redirectTo?: string): string {
  const state = crypto.getRandomValues(new Uint8Array(32))
  const stateHex = Array.from(state)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")

  stateMap.set(stateHex, {
    createdAt: Date.now(),
    userId,
    redirectTo,
  })

  return stateHex
}

/**
 * Validate and consume state token (can only be used once)
 */
export function validateAndConsumeState(state: string): {
  valid: boolean
  userId?: string
  redirectTo?: string
} {
  const entry = stateMap.get(state)

  if (!entry) {
    return { valid: false }
  }

  // Check if state has expired
  const ageMs = Date.now() - entry.createdAt
  if (ageMs > STATE_EXPIRY_MS) {
    stateMap.delete(state)
    return { valid: false }
  }

  // Consume state (delete it so it can't be reused)
  stateMap.delete(state)

  return {
    valid: true,
    userId: entry.userId,
    redirectTo: entry.redirectTo,
  }
}

/**
 * Clean up expired states (run periodically)
 */
export function cleanupExpiredStates(): void {
  const now = Date.now()
  for (const [state, entry] of stateMap.entries()) {
    if (now - entry.createdAt > STATE_EXPIRY_MS) {
      stateMap.delete(state)
    }
  }
}

// Cleanup every 5 minutes
setInterval(cleanupExpiredStates, 5 * 60 * 1000)
