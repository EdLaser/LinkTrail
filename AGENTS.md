This project is based on [Hono](https://hono.dev/), running on [Bun](https://bun.com), with [Drizzle ORM](https://orm.drizzle.team) for PostgreSQL. Use `bun` / `bunx` for all commands.

## Project Structure

`src/index.ts` is the Bun entrypoint (validates config, exports `{ port, fetch }`), `src/app.ts` builds the Hono app, `src/routes/` holds route modules, `src/db/` holds the Drizzle schema (`schema.ts`) and client (`index.ts`), and `src/lib/` holds config, crypto, token/sync services and the Hammerhead client. Generated migrations live in `drizzle/` (`bun run db:generate`, `bun run db:migrate`). Config files: `drizzle.config.ts`, `tsconfig.json`.

## Conventions

- Path alias `~/*` (tsconfig), use explicit `.ts` extensions
