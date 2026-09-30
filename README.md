# LinkTrail
Hammherad Dashboard Integration of external Routing Providers

Here's a complete `README.md` for the repository, matching the architecture and stack from the backend code above.

A backend service that syncs routes from external route providers (currently [Bikemap](https://web.bikemap.net/discover)) to your [Hammerhead Karoo](https://www.hammerhead.io/) bike computer via the official [Hammerhead Developer API](https://api.hammerhead.io/v1/docs).

Once a user connects their Hammerhead account, routes are fetched from the provider and pushed to their Hammerhead Dashboard account, from which they automatically sync to their paired Karoo device over WiFi or the Hammerhead Companion App.

---

## Table of Contents

- [LinkTrail](#linktrail)
  - [Table of Contents](#table-of-contents)
  - [Architecture](#architecture)
  - [Tech Stack](#tech-stack)
  - [Prerequisites](#prerequisites)
  - [Getting a Hammerhead API Client](#getting-a-hammerhead-api-client)
  - [Local Setup](#local-setup)
  - [Environment Variables](#environment-variables)
  - [Database](#database)
  - [Running the Service](#running-the-service)
  - [Project Structure](#project-structure)
  - [API Endpoints](#api-endpoints)
  - [OAuth Flow Walkthrough](#oauth-flow-walkthrough)
  - [Webhook Signature Verification](#webhook-signature-verification)

---

## Architecture

```
┌────────────┐      1. Connect (OAuth)      ┌──────────────────────┐      3. Push route (GPX)      ┌─────────────┐
│   User's   │ ───────────────────────────▶ │  This Backend Service │ ─────────────────────────────▶ │  Hammerhead │
│  Browser   │ ◀─────────────────────────── │ (Fastify + Postgres)  │ ◀───────────────────────────── │   Cloud API │
└────────────┘   2. Redirect w/ auth code   └──────────────────────┘   4. Webhook: activity events  └─────────────┘
                                                       ▲
                                                       │ Route file (fetched by the server)
                                                       │
                                               ┌────────────────┐
                                               │ Route provider │
                                               │   (Bikemap)    │
                                               └────────────────┘
                                                       │
                                                       ▼
                                               synced automatically to
                                               the user's Karoo device
                                               (WiFi / Companion App)
```

**Flow summary:**
1. User initiates "Connect to Hammerhead" from your app.
2. Your backend redirects them through Hammerhead's OAuth2 authorization screen.
3. Hammerhead redirects back to your `redirect_uri` with an authorization `code`.
4. Backend exchanges the code for an `access_token` / `refresh_token` pair and stores them (encrypted) in Postgres.
5. When a sync is requested for a provider route (`provider` + `source_route_id`), the service downloads the route file from the provider and pushes it to `/routes/file` on behalf of the user.
6. Hammerhead's cloud syncs the route to the user's Karoo automatically.
7. Hammerhead sends activity webhooks to this service, which are signature-verified and stored/processed.

---

## Tech Stack

| Layer | Choice | Reason |
|---|---|---|
| Language | TypeScript | Type safety across API contracts and DB models |
| Runtime | [Bun](https://bun.com) | Fast TypeScript runtime, package manager and server |
| Web Framework | [Hono](https://hono.dev) | Small, fast, Web-standards HTTP framework |
| ORM | [Drizzle ORM](https://orm.drizzle.team) | Type-safe SQL for Postgres with SQL migrations via drizzle-kit |
| Database | PostgreSQL 16 | Relational storage for users, tokens, and route sync mappings |
| Validation | [Zod](https://zod.dev/) | Runtime validation of env vars and webhook payloads |
| HTTP requests | Web `fetch` | Built-in fetch API for Hammerhead API calls |
| Containerization | Docker Compose | Local Postgres instance for development |

---

## Prerequisites

- [Bun](https://bun.com) **≥ 1.2**
- Docker & Docker Compose (for local Postgres), or an existing Postgres 14+ instance
- A publicly reachable HTTPS domain for production (required for OAuth `redirect_uri` and webhooks) — e.g. via a reverse proxy, Cloudflare Tunnel, or your hosting provider's domain
- A registered **Hammerhead API Client** (see below)

---

## Getting a Hammerhead API Client

1. Log in to the [Hammerhead Dashboard](https://dashboard.hammerhead.io).
2. Navigate to **Developer Settings** and create a new API client/app.
3. Provide:
   - App name & logo (shown to users when they connect your app)
   - **Redirect URI** — e.g. `https://yourdomain.com/oauth/callback`
   - **Webhook URL** — e.g. `https://yourdomain.com/webhooks/hammerhead`
4. Accept the API Licensing Agreement.
5. Copy the issued **Client ID** and **Client Secret** — you'll need these for your `.env` file.

---

## Local Setup

```bash
# 1. Clone the repo
git clone https://github.com/your-org/hammerhead-bikemap-sync.git
cd hammerhead-bikemap-sync

# 2. Install dependencies
bun install

# 3. fill in values for the env file
cp .env

# 4. Start local Postgres
docker compose up -d

# 5. Apply database migrations
bun run db:migrate

# 6. Start the dev server (hot reload)
bun run dev
```

The server will start on `http://localhost:3000` by default (configurable via `PORT` env var).

For local OAuth/webhook testing against Hammerhead's cloud, expose your local server with a tunneling tool such as [ngrok](https://ngrok.com/) or [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/), and register the generated HTTPS URL as your redirect URI / webhook URL in the Hammerhead developer dashboard.

---

## Environment Variables

Create a `.env` file based on `.env.example`:

```dotenv
# Server
PORT=3000
NODE_ENV=development
BASE_URL=http://localhost:3000          # Or your public HTTPS URL in production

# Database
DATABASE_URL=postgresql://hammerhead:hammerhead@localhost:5432/hammerhead_sync

# Hammerhead API
HAMMERHEAD_API_BASE_URL=https://api.hammerhead.io/v1
HAMMERHEAD_CLIENT_ID=your_client_id_here
HAMMERHEAD_CLIENT_SECRET=your_client_secret_here
HAMMERHEAD_REDIRECT_URI=https://yourdomain.com/oauth/callback
HAMMERHEAD_SCOPES=routes:write activities:read
HAMMERHEAD_WEBHOOK_SECRET=your_webhook_signing_secret_here

# Token encryption (32-byte hex key for AES-256-GCM)
TOKEN_ENCRYPTION_KEY=generate_with_openssl_rand_hex_32

# Route providers
# URL the Bikemap provider downloads a GPX from; {id} is replaced by the route ID
BIKEMAP_GPX_URL_TEMPLATE=https://example.com/routes/{id}.gpx

# API auth: HS256 secret used to verify bearer tokens (min 32 chars)
JWT_SECRET=generate_with_openssl_rand_hex_32
```

Generate a secure encryption key:

```bash
openssl rand -hex 32
```

> ⚠️ Never commit `.env` to version control. It is already included in `.gitignore`.

---

## Database

Schema is managed via Drizzle (`src/db/schema.ts`), with generated SQL migrations in `drizzle/`. Core tables:

- **`app_users`** — a user of your service
- **`hammerhead_accounts`** — the OAuth token pair + metadata linked to an app user
- **`synced_routes`** — mapping between a provider route (`provider` + `source_route_id`) and the resulting Hammerhead route ID, used to avoid duplicate pushes

To inspect the data visually:

```bash
bun run db:studio
```

To create and apply a migration after editing the schema:

```bash
bun run db:generate
bun run db:migrate
```

---

## Running the Service

| Command | Description |
|---|---|
| `bun run dev` | Start in development mode (hot reload) |
| `bun run start` | Start for production |
| `bun run typecheck` | Type-check the project |
| `bun run db:generate` | Generate a SQL migration from schema changes |
| `bun run db:migrate` | Apply migrations (local and production) |
| `bun run db:studio` | Open Drizzle Studio |

---

## Project Structure

This is a **Hono** application running on **Bun**. Key directories:

```
src/
  ├── index.ts       # Bun entrypoint (validates config, exports the fetch handler)
  ├── app.ts         # Hono app, error handling, route mounting
  ├── routes/        # Route modules (oauth, sync)
  ├── db/            # Drizzle schema and client
  └── lib/           # Config, crypto, token service, sync service, Hammerhead client

drizzle/            # Generated SQL migrations (commit these)

.env                # Environment variables (local development, loaded by Bun)
drizzle.config.ts   # drizzle-kit configuration (PostgreSQL dialect)
```

Routes are Hono routers in `src/routes/` mounted in `src/app.ts`. For example:
- `src/routes/oauth.ts` → `GET /oauth/start`, `GET /oauth/callback`, `POST /api/oauth/disconnect`
- `src/routes/sync.ts` → `POST /api/sync/route`

---

## API Endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/oauth/start` | Redirects the user to Hammerhead's OAuth authorization screen |
| `GET` | `/oauth/callback` | Receives the authorization code, exchanges it for tokens, stores them |
| `POST` | `/webhooks/hammerhead` | Receives and verifies Hammerhead activity notification webhooks |
| `POST` | `/api/sync/route` | Fetches a route from a provider and pushes it to the connected Hammerhead account (bearer token) |
| `POST` | `/api/oauth/disconnect` | Revokes and removes the Hammerhead connection (bearer token) |
| `GET` | `/health` | Basic health check |

Example: sync a route for a connected user

```bash
curl -X POST "https://yourdomain.com/api/sync/route" \
  -H "Authorization: Bearer <jwt>" \
  -H "Content-Type: application/json" \
  -d '{ "provider": "bikemap", "source_route_id": "123456" }'
```

### Authentication

`/api/*` endpoints expect an `Authorization: Bearer <jwt>` header. The service only verifies tokens, it does not issue them: your own app signs an HS256 JWT with `JWT_SECRET`, with the app user's ID (a UUID from `app_users`) as the `sub` claim and a short `exp`. For local testing:

```ts
import { sign } from "hono/jwt";
const token = await sign({ sub: "<app-user-id>", exp: Math.floor(Date.now() / 1000) + 600 }, process.env.JWT_SECRET!);
```

`GET /oauth/start` still takes a `user_id` query parameter because it is opened as a browser redirect.

The response `action` is `created`, `updated` or `skipped` depending on whether the file changed since the last sync. The OpenAPI spec is served at `GET /doc`.

### Adding a route provider

1. Add the provider ID to `PROVIDER_IDS` in `src/lib/providers/index.ts`.
2. Implement `RouteProvider` (`fetchRoute(sourceRouteId)`) in `src/lib/providers/<name>.ts` and register it in `createProviders`. TypeScript reports an error until every ID has an implementation.
3. Add any provider config to `src/lib/config.ts`.

---

## OAuth Flow Walkthrough

1. User visits `GET /oauth/start?appUserId=<id>` on your service.
2. Your backend redirects them to:
   ```
   GET https://api.hammerhead.io/v1/auth/oauth/authorize
     ?client_id=...
     &redirect_uri=...
     &response_type=code
     &scope=...
     &state=<signed state containing appUserId>
   ```
3. User logs in and approves access on Hammerhead's site.
4. Hammerhead redirects to `GET /oauth/callback?code=...&state=...`.
5. Backend validates `state`, then exchanges `code` for tokens:
   ```
   POST https://api.hammerhead.io/v1/auth/oauth/token
   Content-Type: application/x-www-form-urlencoded

   client_id=...&client_secret=...&grant_type=authorization_code&code=...&redirect_uri=...
   ```
6. Tokens are encrypted (AES-256-GCM) and stored in the `HammerheadAccount` table, linked to the `AppUser`.

---

## Webhook Signature Verification

Hammerhead signs webhook payloads with an `X-Hmac-Signature` header (HMAC-SHA256). Incoming requests to `/webhooks/hammerhead` are verified against `HAMMERHEAD_WEBHOOK_SECRET` before processing.

In Hono, the raw request body is available via `c.req.text()`:

```typescript
// src/routes/webhooks.ts
import { createHmac } from 'crypto'
import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'

export const webhookRoutes = new Hono()

webhookRoutes.post('/webhooks/hammerhead', async (c) => {
  const signature = c.req.header('x-hmac-signature')
  const rawBody = await c.req.text()
  
  // Verify HMAC-SHA256
  const hash = createHmac('sha256', process.env.HAMMERHEAD_WEBHOOK_SECRET!)
    .update(rawBody)
    .digest('hex')
  
  if (hash !== signature) {
    throw new HTTPException(401, { message: 'Invalid webhook signature' })
  }
  
  const payload = JSON.parse(rawBody)
  // Process webhook...
  return c.json({ received: true })
})
```

This ensures webhook authenticity and prevents replay attacks.
