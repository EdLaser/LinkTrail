# LinkTrail
Hammherad Dashboard Integration of external Routing Providers

Here's a complete `README.md` for the repository, matching the architecture and stack from the backend code above.

A backend service that connects [Bikemap](https://web.bikemap.net/discover) routes to your [Hammerhead Karoo](https://www.hammerhead.io/) bike computer via the official [Hammerhead Developer API](https://api.hammerhead.io/v1/docs).

Once a user connects their Hammerhead account, routes are converted to GPX and pushed to their Hammerhead Dashboard account, from which they automatically sync to their paired Karoo device over WiFi or the Hammerhead Companion App.

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
                                                       │ Route data (GPX/URL upload)
                                                       │
                                               ┌────────────────┐
                                               │  Bikemap route  │
                                               │ (manual/export) │
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
5. When a Bikemap route is submitted to your service, it's converted to GPX and pushed to `/routes/file` on behalf of the user.
6. Hammerhead's cloud syncs the route to the user's Karoo automatically.
7. Hammerhead sends activity webhooks to this service, which are signature-verified and stored/processed.

---

## Tech Stack

| Layer | Choice | Reason |
|---|---|---|
| Language | TypeScript | Type safety across API contracts and DB models |
| Runtime/Framework | [Nitro v3](https://nitro.build) | Modern, full-stack Nitro framework with built-in TS support and native middleware |
| Server Library | [h3](https://h3.dev/) | Minimal HTTP framework for Nitro handlers |
| ORM | [Prisma v7](https://www.prisma.io/) | Type-safe Postgres access + migrations with PostgreSQL adapter |
| Database | PostgreSQL 16 | Relational storage for users, tokens, and route sync mappings |
| Validation | [Zod](https://zod.dev/) | Runtime validation of env vars and webhook payloads |
| HTTP requests | Node.js native | Built-in fetch API for Hammerhead API calls |
| Containerization | Docker Compose | Local Postgres instance for development |

---

## Prerequisites

- Node.js **≥ 20**
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
pnpm install

# 3. Copy environment template and fill in values
cp .env.example .env

# 4. Start local Postgres
docker compose up -d

# 5. Run Prisma migrations
pnpm prisma:migrate

# 6. Start the dev server (hot reload with Nitro)
pnpm dev
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
```

Generate a secure encryption key:

```bash
openssl rand -hex 32
```

> ⚠️ Never commit `.env` to version control. It is already included in `.gitignore`.

---

## Database

Schema is managed via Prisma (`prisma/schema.prisma`). Core models:

- **`AppUser`** — a user of your service (e.g. a Bikemap account holder)
- **`HammerheadAccount`** — the OAuth token pair + metadata linked to an `AppUser`
- **`SyncedRoute`** — mapping between a Bikemap route ID and the resulting Hammerhead route ID, used to avoid duplicate pushes

To inspect the schema visually:

```bash
pnpm prisma studio
```

To create a new migration after editing the schema:

```bash
pnpm prisma:migrate --name your_migration_name
```

---

## Running the Service

| Command | Description |
|---|---|
| `pnpm dev` | Start in development mode (hot reload with Nitro) |
| `pnpm build` | Compile & bundle for production (outputs to `.output/`) |
| `pnpm preview` | Preview production build locally |
| `pnpm prisma:migrate` | Apply migrations locally |
| `pnpm prisma:deploy` | Apply migrations in production (non-interactive) |
| `pnpm prisma:seed` | Run database seed script |

---

## Project Structure

This is a **Nitro v3** full-stack application. Key directories:

```
server/
  ├── api/           # API route handlers (auto-prefixed with /api)
  ├── routes/        # HTTP routes (file-based routing)
  ├── middleware/    # Request middleware
  ├── utils/         # Shared utilities and helpers
  └── plugins/       # Server plugins and initialization

prisma/
  ├── schema.prisma  # Database schema (Prisma ORM)
  ├── migrations/    # Prisma migration files
  └── seed.ts        # Database seed script

public/             # Static assets (served directly)

.env                # Environment variables (local development)
nitro.config.ts     # Nitro server configuration
prisma.config.ts    # Prisma configuration (PostgreSQL dialect)
```

Route handlers are created as files in `server/api/` or `server/routes/`. Nitro automatically creates HTTP endpoints based on file structure. For example:
- `server/api/oauth/start.get.ts` → `GET /api/oauth/start`
- `server/routes/webhooks/hammerhead.post.ts` → `POST /webhooks/hammerhead`

---

## API Endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/oauth/start` | Redirects the user to Hammerhead's OAuth authorization screen |
| `GET` | `/oauth/callback` | Receives the authorization code, exchanges it for tokens, stores them |
| `POST` | `/webhooks/hammerhead` | Receives and verifies Hammerhead activity notification webhooks |
| `POST` | `/sync/route` | Accepts a Bikemap route (GPX file or URL) and pushes it to the connected Hammerhead account |
| `GET` | `/health` | Basic health check |

Example: trigger a manual route sync for a connected user

```bash
curl -X POST https://yourdomain.com/sync/route \
  -H "Content-Type: application/json" \
  -d '{
        "appUserId": "uuid-of-app-user",
        "bikemapRouteId": "123456",
        "gpxUrl": "https://web.bikemap.net/route/123456.gpx"
      }'
```

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

In Nitro, raw request body is accessible via `readRawBody()` in the event handler:

```typescript
// server/routes/webhooks/hammerhead.post.ts
import { createHmac } from 'crypto'

export default defineEventHandler(async (event) => {
  const signature = getHeader(event, 'x-hmac-signature')
  const rawBody = await readRawBody(event)
  
  // Verify HMAC-SHA256
  const hash = createHmac('sha256', process.env.HAMMERHEAD_WEBHOOK_SECRET!)
    .update(rawBody)
    .digest('hex')
  
  if (hash !== signature) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Invalid webhook signature'
    })
  }
  
  const payload = JSON.parse(rawBody)
  // Process webhook...
})
```

This ensures webhook authenticity and prevents replay attacks.
