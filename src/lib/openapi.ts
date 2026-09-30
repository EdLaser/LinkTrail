import { OpenAPIHono, z } from "@hono/zod-openapi";
import type { AppEnv } from "~/lib/deps.ts";

export const ErrorSchema = z.object({ error: z.string() }).openapi("Error");

export function errorResponse(description: string) {
  return {
    description,
    content: { "application/json": { schema: ErrorSchema } },
  };
}

/** OpenAPIHono with shared deps typing and a default 400 for request validation failures. */
export function createRouter() {
  return new OpenAPIHono<AppEnv>({
    defaultHook: (result, c) => {
      if (!result.success) {
        const message = result.error.issues
          .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
          .join("; ");
        return c.json({ error: message }, 400);
      }
    },
  });
}
