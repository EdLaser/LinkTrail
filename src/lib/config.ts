import { z } from "zod";

const configSchema = z.object({
  nodeEnv: z.enum(["development", "production", "test"]).default("development"),
  baseUrl: z.url().default("http://localhost:3000"),
  databaseUrl: z.url(),
  hammerheadApiBaseUrl: z.url().default("https://api.hammerhead.io/v1"),
  hammerheadClientId: z.string().min(1),
  hammerheadClientSecret: z.string().min(1),
  hammerheadRedirectUri: z.url(),
  hammerheadScopes: z.string().default("route:write route:read"),
  // 32-byte key as hex for AES-256-GCM
  tokenEncryptionKey: z.string().regex(/^[0-9a-f]{64}$/),
  // HS256 secret used to verify API bearer tokens
  jwtSecret: z.string().min(32),
  // e.g. https://example.com/routes/{id}.gpx
  bikemapGpxUrlTemplate: z
    .string()
    .refine((v) => v.includes("{id}"), "must contain {id}")
    .optional(),
});

export type AppConfig = z.infer<typeof configSchema>;

/** Validates raw environment variables (e.g. from Hono's `env(c)`); throws on invalid input. */
export function parseConfig(env: Record<string, string | undefined>): AppConfig {
  const parsed = configSchema.safeParse({
    nodeEnv: env.NODE_ENV,
    baseUrl: env.BASE_URL,
    databaseUrl: env.DATABASE_URL,
    hammerheadApiBaseUrl: env.HAMMERHEAD_API_BASE_URL,
    hammerheadClientId: env.HAMMERHEAD_CLIENT_ID,
    hammerheadClientSecret: env.HAMMERHEAD_CLIENT_SECRET,
    hammerheadRedirectUri: env.HAMMERHEAD_REDIRECT_URI,
    hammerheadScopes: env.HAMMERHEAD_SCOPES,
    tokenEncryptionKey: env.TOKEN_ENCRYPTION_KEY,
    jwtSecret: env.JWT_SECRET,
    bikemapGpxUrlTemplate: env.BIKEMAP_GPX_URL_TEMPLATE || undefined,
  });

  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Invalid configuration:\n${issues}`);
  }

  return parsed.data;
}
