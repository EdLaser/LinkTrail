/**
 * Checksum utilities for route file validation
 */

import { createHash } from "crypto"

/**
 * Compute SHA-256 checksum of a buffer
 * Returns hex-encoded digest
 */
export function computeChecksum(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex")
}

/**
 * Compute SHA-256 checksum from readable stream
 * Useful for large files
 */
export async function computeChecksumFromStream(
  readable: ReadableStream<Uint8Array>,
): Promise<string> {
  const hash = createHash("sha256")

  const reader = readable.getReader()
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      hash.update(value)
    }
  } finally {
    reader.releaseLock()
  }

  return hash.digest("hex")
}

/**
 * Verify checksum of a buffer against expected value
 */
export function verifyChecksum(buffer: Buffer, expectedChecksum: string): boolean {
  const computed = computeChecksum(buffer)
  return computed === expectedChecksum
}
