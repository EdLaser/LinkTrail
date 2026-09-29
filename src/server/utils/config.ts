import { z } from "zod";
import { useRuntimeConfig } from "nitro/runtime-config";

/**
 * Configuration interface with type safety.
 * Uses Nitro's runtimeConfig for environment variables.
 */
export interface AppConfig {
  // Server
  port: number;
  nodeEnv: "development" | "production" | "test";
  baseUrl: string;

  // Database
  databaseUrl: string;

  // Hammerhead OAuth
  hammerheadApiBaseUrl: string;
  hammerheadClientId: string;
  hammerheadClientSecret: string;
  hammerheadRedirectUri: string;
  hammerheadScopes: string;

  // Token Encryption
  tokenEncryptionKey: string;
}

/**
 * Validation schema for runtime config.
 * Applied at startup to catch configuration issues early.
 */
const configSchema = z.object({
  port: z.coerce.number().int().positive(),
  nodeEnv: z.enum(["development", "production", "test"]),
  baseUrl: z.string().url(),
  databaseUrl: z.string().url(),
  hammerheadApiBaseUrl: z.string().url(),
  hammerheadClientId: z.string().min(1),
  hammerheadClientSecret: z.string().min(1),
  hammerheadRedirectUri: z.string().url(),
  hammerheadScopes: z.string(),
  tokenEncryptionKey: z.string().regex(/^[0-9a-f]{64}$/),
});

type ValidatedConfig = z.infer<typeof configSchema>;

/**
 * Get and validate runtime configuration.
 * Throws immediately if validation fails.
 */
export function getConfig(): AppConfig {
  const config = useRuntimeConfig();

  const parsed = configSchema.safeParse({
    port: config.port,
    nodeEnv: config.nodeEnv,
    baseUrl: config.baseUrl,
    databaseUrl: config.databaseUrl,
    hammerheadApiBaseUrl: config.hammerheadApiBaseUrl,
    hammerheadClientId: config.hammerheadClientId,
    hammerheadClientSecret: config.hammerheadClientSecret,
    hammerheadRedirectUri: config.hammerheadRedirectUri,
    hammerheadScopes: config.hammerheadScopes,
    tokenEncryptionKey: config.tokenEncryptionKey,
  });

  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`).join("\n");
    console.error("Configuration validation failed:\n" + issues);
    throw new Error("Invalid configuration");
  }

  return parsed.data as AppConfig;
}
