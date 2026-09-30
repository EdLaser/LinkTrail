import { defineConfig } from "nitro";

export default defineConfig({
  serverDir: "./server",
  experimental: {
    tasks: true,
  },
  alias: {
    "~": new URL(".", import.meta.url).pathname,
  },
  runtimeConfig: {
    // Server
    port: process.env.PORT || "3000",
    nodeEnv: process.env.NODE_ENV || "development",
    baseUrl: process.env.BASE_URL || "http://localhost:3000",

    // Database
    databaseUrl: process.env.DATABASE_URL || "",

    // Hammerhead OAuth
    hammerheadApiBaseUrl: process.env.HAMMERHEAD_API_BASE_URL || "https://api.hammerhead.io/v1",
    hammerheadClientId: process.env.HAMMERHEAD_CLIENT_ID || "",
    hammerheadClientSecret: process.env.HAMMERHEAD_CLIENT_SECRET || "",
    hammerheadRedirectUri: process.env.HAMMERHEAD_REDIRECT_URI || "",
    hammerheadScopes: process.env.HAMMERHEAD_SCOPES || "route:write route:read",

    // Token Encryption
    tokenEncryptionKey: process.env.TOKEN_ENCRYPTION_KEY || "",
  },
});
