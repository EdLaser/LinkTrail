import { getConfig } from "~/server/utils/config";

/**
 * Nitro plugin that validates environment configuration on server startup.
 * Fails fast if any required vars are missing or invalid.
 */
export default defineNitroPlugin(() => {
  const config = getConfig();
  console.log(`✓ Configuration loaded: ${config.nodeEnv} mode on port ${config.port}`);
  console.log(`✓ Hammerhead API base: ${config.hammerheadApiBaseUrl}`);
  console.log(`✓ Database configured`);
});
