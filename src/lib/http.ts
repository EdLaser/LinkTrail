import { eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import { db } from "~/db/index.ts";
import { appUsers } from "~/db/schema.ts";

/** Validates the user_id param (a uuid column would otherwise fail with a DB error) and loads the user. */
export async function requireUser(userId: string | undefined) {
  if (!userId) {
    throw new HTTPException(400, { message: "Missing required parameter: user_id" });
  }
  if (!z.uuid().safeParse(userId).success) {
    throw new HTTPException(400, { message: "Invalid user_id" });
  }

  const [user] = await db.select().from(appUsers).where(eq(appUsers.id, userId)).limit(1);
  if (!user) {
    throw new HTTPException(404, { message: "User not found" });
  }
  return user;
}
