import { z } from "zod";

const configSchema = z.object({
  port: z.coerce.number().int().positive().default(3000),
  nodeEnv: z.enum(["development", "production", "test"]).default("development"),
  baseUrl: z.string().url().default("http://localhost:3000"),
  databaseUrl: z.string().url(),
  hammerheadApiBaseUrl: z.string().url().default("https://api.hammerhead.io/v1"),
  hammerheadClientId: z.string().min(1),
  hammerheadClientSecret: z.string().min(1),
  hammerheadRedirectUri: z.string().url(),
  hammerheadScopes: z.string().default("route:write route:read"),
  // 32-byte key as hex for AES-256-GCM
  tokenEncryptionKey: z.string().regex(/^[0-9a-f]{64}$/),
});

export type AppConfig = z.infer<typeof configSchema>;

let cached: AppConfig | undefined;

/** Validates process.env once and returns typed config; throws on invalid input. */
export function getConfig(): AppConfig {
  if (cached) return cached;

  const env = process.env;
  const parsed = configSchema.safeParse({
    port: env.PORT,
    nodeEnv: env.NODE_ENV,
    baseUrl: env.BASE_URL,
    databaseUrl: env.DATABASE_URL,
    hammerheadApiBaseUrl: env.HAMMERHEAD_API_BASE_URL,
    hammerheadClientId: env.HAMMERHEAD_CLIENT_ID,
    hammerheadClientSecret: env.HAMMERHEAD_CLIENT_SECRET,
    hammerheadRedirectUri: env.HAMMERHEAD_REDIRECT_URI,
    hammerheadScopes: env.HAMMERHEAD_SCOPES,
    tokenEncryptionKey: env.TOKEN_ENCRYPTION_KEY,
  });

  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Invalid configuration:\n${issues}`);
  }

  cached = parsed.data;
  return cached;
}
