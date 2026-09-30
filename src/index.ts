import { app } from "~/app";

// Config is only readable through a request context (env(c)), so probe once to fail fast on bad env
const probe = await app.request("/health");
if (!probe.ok) {
  throw new Error("Invalid configuration, see the error above");
}

// Bun picks the port from the PORT env var (default 3000)
export default {
  fetch: app.fetch,
};
