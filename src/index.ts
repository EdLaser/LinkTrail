import { app } from "~/app.ts";
import { getConfig } from "~/lib/config.ts";

// Fail fast on invalid environment before serving requests
const config = getConfig();
console.log(`Configuration loaded: ${config.nodeEnv} mode on port ${config.port}`);

export default {
  port: config.port,
  fetch: app.fetch,
};
