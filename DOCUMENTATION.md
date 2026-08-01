# NexusWager SDK Backend — Developer Documentation

**Version:** 1.0.0 · **Language:** TypeScript (compiled to CommonJS) · **Database:** MySQL (Sequelize) · **Message Broker:** RabbitMQ

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Installation](#2-installation)
3. [Authentication](#3-authentication)
4. [API Reference](#4-api-reference)
5. [Middleware](#5-middleware)
6. [Database Models](#6-database-models)
7. [Services](#7-services)
8. [Utilities](#8-utilities)
9. [SDK Integration Examples](#9-sdk-integration-examples)
10. [Postman Examples](#10-postman-examples)
11. [OpenAPI Specification](#11-openapi-specification)
12. [Error Codes Reference](#12-error-codes-reference)
13. [Security](#13-security)
14. [Known Issues / Bugs Detected in Source](#14-known-issues--bugs-detected-in-source)
15. [Assumptions](#15-assumptions)

---

## 1. Project Overview

### Purpose

NexusWager SDK Backend is a RESTful Express.js API that game developers integrate with to register wager-enabled games, record match sessions, and record match results on the NexusWager platform. It also emits domain events (`WAGER_BALANCE_LOCKED`, `WAGER_SETTLED`) to a RabbitMQ exchange so that a separate wallet/ledger service can lock and settle player funds.

### Features

- Multi-step (3-step) game registration wizard with Cloudinary media upload
- Game session recording when a match starts (triggers a wager-lock event)
- Game result recording when a match ends (triggers a wager-settlement event)
- Admin-wide and developer-scoped read endpoints
- Shared SDK API key authentication (no JWT/session auth is implemented, despite the `jsonwebtoken`-style dependency footprint referenced in the legacy docs — it is **not** present in this codebase's `package.json`)
- MySQL persistence via Sequelize ORM
- RabbitMQ event publishing with auto-reconnect

### Architecture

```
┌────────────────────────────┐
│   Game Client / SDK        │
└──────────────┬─────────────┘
               │ HTTPS + sdk-api-key header
┌──────────────▼─────────────────────────────────────────────┐
│                   Express.js Server (src/index.ts)          │
│                                                              │
│  routes/sdk_routes.ts                                        │
│      │                                                       │
│      ├─▶ sdkController/mutation.ts  (upload, session, result)│
│      ├─▶ sdkController/queries.ts   (data, session lookup)   │
│      ├─▶ admin/queries.ts           (admin reads)            │
│      └─▶ developer/queries.ts       (developer-scoped reads) │
│                                                              │
│  utils/zodValidation.ts + utils/uploadValidation.ts (Zod)    │
└───────┬───────────────────────┬─────────────────┬───────────┘
        │                       │                  │
        ▼                       ▼                  ▼
┌───────────────┐     ┌──────────────────┐   ┌─────────────────┐
│ MySQL (Sequelize) │  │ Cloudinary CDN   │   │ RabbitMQ Exchange│
│ GameData          │  │ (thumbnail/file) │   │ "wager-events"   │
│ GameSession        │  └──────────────────┘   │ (topic)          │
│ GameResult         │                          └─────────────────┘
└───────────────┘
```

**Request flow:**
1. Client sends a request with an `sdk-api-key` header.
2. The target controller function reads `req.headers["sdk-api-key"]` and compares it inline against `process.env.key`. There is **no centralized auth middleware** — every controller repeats this check itself.
3. Zod schemas validate the request body for the multi-step upload flow only (`/upload`). `/session` and `/result` have **no schema validation** on their bodies.
4. The controller interacts with Sequelize models.
5. For step 3 of upload, the thumbnail and game file are uploaded to Cloudinary concurrently.
6. For `/session` and `/result`, a wager event (`WAGER_BALANCE_LOCKED` / `WAGER_SETTLED`) is published to RabbitMQ before/alongside the database write.
7. A JSON response is returned.

### Technology Stack

| Technology | Version (from `package.json`) | Purpose |
|---|---|---|
| Node.js | Not pinned in `package.json`; `mysql2` requires `>= 8.0`, `sequelize` requires `>= 10.0.0` | Runtime |
| TypeScript | — (compiled via `tsc`) | Language |
| Express.js | ^4.19.2 | HTTP framework |
| Sequelize | ^6.37.3 | ORM for MySQL |
| MySQL2 | ^3.22.5 | MySQL driver |
| Cloudinary | ^2.10.0 | Media storage for game thumbnails/files |
| Zod | ^4.4.3 | Schema validation (upload flow only) |
| Joi | ^17.13.0 | Declared as a dependency but **not referenced anywhere in `src/`** |
| amqplib | ^0.10.7 | RabbitMQ client (event publishing) |
| Morgan | ^1.10.0 | HTTP request logging |
| CORS | ^2.8.5 | Cross-origin resource sharing (default wide-open config) |
| dotenv | ^16.4.5 | Environment variable loading |
| crypto | ^1.0.1 | Deprecated npm shim; Node's built-in `crypto` module is what's actually used (`crypto.randomUUID()`) |
| nodemon | ^3.1.0 | Dev-time auto reload |

> **Note:** The legacy bundled documentation lists `jsonwebtoken` and `uuid` as dependencies. Neither appears in the actual `package.json`/`package-lock.json` provided in this codebase. JWT-based auth is **not implemented anywhere** in the current source.

### Folder Structure

```
nexuswager_sdk_backend/
├── src/
│   ├── index.ts                  # App entry: Express setup, DB sync, Cloudinary warmup, RabbitMQ connect, server start
│   ├── admin/
│   │   └── queries.ts            # Admin-scoped read controllers
│   ├── database/
│   │   ├── databaseConnection.ts # Sequelize MySQL connection singleton
│   │   └── gameFileBucket.ts     # Cloudinary upload helpers
│   ├── developer/
│   │   └── queries.ts            # Developer-scoped read controllers
│   ├── events/
│   │   ├── eventPubisher.ts      # WagerEventsPublisher (RabbitMQ event publishing) — note filename typo "Pubisher"
│   │   └── eventTypes.ts         # Event payload TypeScript interfaces
│   ├── model/
│   │   ├── gameResult.ts         # GameResult Sequelize model + types
│   │   ├── gameSessionModel.ts   # GameSession Sequelize model + types
│   │   └── gameSystemUpload.ts   # Game (GameData) Sequelize model + types
│   ├── rabbitmq/
│   │   ├── config.ts             # RabbitMQ connection config + URL builder
│   │   └── connection.ts         # RabbitMQConnectionManager singleton (auto-reconnect)
│   ├── routes/
│   │   └── sdk_routes.ts         # All Express route definitions
│   ├── sdkController/
│   │   ├── mutation.ts           # Write controllers: uploadGame, registerGameSession, registerGameResult
│   │   └── queries.ts            # Read controllers: getGameData, getGameSession
│   └── utils/
│       ├── info.ts               # `engineCode` lookup map — declared but not exported/used anywhere
│       ├── uploadValidation.ts   # Zod schemas for the 3-step upload flow
│       └── zodValidation.ts      # Generic Zod schema runner
├── scripts/
│   └── bundle-sdk.js             # Dev utility that bundles source into a single context markdown file
├── package.json
├── tsconfig.json
└── dist/                         # Compiled JS output (generated by `tsc`, gitignored implicitly)
```

---

## 2. Installation

### Requirements

- Node.js (version not pinned; recommend Node 18+ given `@types/node` in the lockfile)
- MySQL database (Sequelize `dialect: "mysql"`, driver `mysql2`)
- A running RabbitMQ broker (topic exchange)
- A Cloudinary account (cloud name, API key, API secret)
- npm

### Installation

```bash
git clone <repo-url>
cd nexuswager_sdk_backend
npm install
```

### Environment Variables

Create a `.env` file in the project root. Variables are read via `dotenv` in `databaseConnection.ts`, `gameFileBucket.ts`, `mutation.ts`, `queries.ts` (both admin/developer/sdkController), and `rabbitmq/config.ts`.

| Variable | Required | Used In | Description |
|---|---|---|---|
| `PORT` | Yes | `index.ts` | Port the Express server listens on |
| `DATABASE_URL` | Yes | `databaseConnection.ts` | MySQL connection string, e.g. `mysql://user:pass@host:3306/db` |
| `key` | Yes | every controller | Shared SDK API key compared against the `sdk-api-key` header |
| `CLOUD_NAME` | Yes | `gameFileBucket.ts` | Cloudinary cloud name |
| `CLOUD_API_KEY` | Yes | `gameFileBucket.ts` | Cloudinary API key |
| `CLOUD_API_SECRET` | Yes | `gameFileBucket.ts` | Cloudinary API secret |
| `RABBITMQ_HOST` | No (default `localhost`) | `rabbitmq/config.ts` | RabbitMQ host |
| `RABBITMQ_PORT` | No (default `5672`) | `rabbitmq/config.ts` | RabbitMQ port |
| `RABBITMQ_USERNAME` | No (default `guest`) | `rabbitmq/config.ts` | RabbitMQ username |
| `RABBITMQ_PASSWORD` | No (default `guest`) | `rabbitmq/config.ts` | RabbitMQ password |
| `RABBITMQ_VHOST` | No (default `/`) | `rabbitmq/config.ts` | RabbitMQ virtual host |
| `RABBITMQ_EXCHANGE` | No (default `wager-events`) | `rabbitmq/config.ts` | Topic exchange name used for publishing |

```env
PORT=3000
DATABASE_URL=mysql://username:password@hostname:3306/nexuswager_db
key=your_secure_sdk_api_key_here
CLOUD_NAME=your_cloudinary_cloud_name
CLOUD_API_KEY=your_cloudinary_api_key
CLOUD_API_SECRET=your_cloudinary_api_secret
RABBITMQ_HOST=localhost
RABBITMQ_PORT=5672
RABBITMQ_USERNAME=guest
RABBITMQ_PASSWORD=guest
RABBITMQ_VHOST=/
RABBITMQ_EXCHANGE=wager-events
```

### Database Setup

The database schema is auto-synced on startup via `nexusWagerDatabase.sync()` in `index.ts`. Tables created: `GameData`, `GameSession`, `GameResult`.

```bash
mysql -u root -p -e "CREATE DATABASE nexuswager_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
```

> **Assumption:** There is no Sequelize CLI migration setup or `migrations/` folder in the provided source. Schema changes are applied purely through `Model.init()` definitions and `sync()`. For production, consider `sync({ alter: true })` or a real migration tool — this is not currently implemented.

### Running Locally

```bash
npm install
npm run build      # compiles TypeScript -> dist/
npm start          # runs `nodemon dist/index.js` (per package.json's "start" script)
```

> **Note:** In `package.json`, the `start` script runs `nodemon dist/index.js`, and the `begin` script runs `node dist/index.js` directly. This is the reverse of what many projects conventionally do (nodemon is usually reserved for a `dev`-style script) — documented here as-is from the source.

### Build

```bash
npm run build      # one-off compile: tsc
npm run compile    # watch mode: tsc -w
```

### Production Deployment

```bash
npm run build
npm run begin       # node dist/index.js
```

Recommended (not implemented in-repo, but standard practice for this stack):

```bash
npm install -g pm2
pm2 start dist/index.js --name nexuswager-sdk
pm2 save
pm2 startup
```

```nginx
server {
    listen 443 ssl;
    server_name api.yourdomain.com;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    location /sdk {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

> **Assumption:** Nginx/PM2/CI-CD configuration is not present in the provided source files; the above reflects standard practice for this stack, not something discovered in the repo.

---

## 3. Authentication

### Mechanism

**Shared SDK API key authentication only.** There is no user login, no JWT issuance, no refresh tokens, and no role-based access control anywhere in the source.

### How It Works

Every protected controller performs the same inline check at the top of its function body:

```ts
const token = req.headers["sdk-api-key"];

if (token) {
  if (token !== key) {
    return res.status(403).json({ success: false, message: "Invalid SDK API key" });
  }
  // ... business logic
} else {
  return res.status(401).json({ success: false, message: "API key is required" });
}
```

`key` is read from `process.env.key` via `dotenv`.

### Authentication Flow

```
Client Request
      │
      ▼
Controller reads req.headers["sdk-api-key"]
      │
      ├─── Not present ──────▶ 401 Unauthorized
      │                        { "success": false, "message": "API key is required" }
      │
      └─── Present
                │
                ├─── !== process.env.key ──▶ 403 Forbidden
                │                             { "success": false, "message": "Invalid SDK API key" }
                │
                └─── Matches ──▶ Proceed to business logic
```

### Authorization

There is no per-role or per-developer key scoping. Any caller holding the single shared key can:
- Read/write data for **any** `developerId`
- Call every admin, developer, and SDK endpoint

`developerId` in request bodies/params is **trust-asserted**, not cryptographically tied to the caller. See [Security](#13-security).

### JWT / Tokens

Not implemented. No token issuance, expiry, or refresh flow exists in the source.

### Refresh Tokens

Not implemented.

### Permission System

Not implemented. All authenticated callers have identical, unscoped access.

---

## 4. API Reference

All endpoints are mounted under the `/sdk` prefix (see `src/index.ts`: `app.use("/sdk", sdkRoutes)`).

### Quick Reference

| Method | Path | Controller | Description |
|---|---|---|---|
| POST | `/sdk/upload` | `uploadGame` | Multi-step (1–3) game registration |
| POST | `/sdk/session` | `registerGameSession` | Register the start of a match/session |
| POST | `/sdk/result` | `registerGameResult` | Register the outcome of a match |
| GET | `/sdk/data/:gameId` | `getGameData` | Fetch a completed game's configuration |
| GET | `/sdk/session` | `getGameSession` | Fetch a session by `matchId` (read from request **body**, see note) |
| GET | `/sdk/admin/games/` | `getAllGames` | Admin: all completed games |
| GET | `/sdk/admin/results` | `getGameResults` | Admin: all match results |
| GET | `/sdk/dev/games/:developerId` | `allGames` | Developer: all their games (complete + incomplete) |
| GET | `/sdk/dev/incompletegame/:developerId` | `incompleteGames` | Developer: draft (incomplete) games |
| GET | `/sdk/dev/results/:developerId` | `playerResults` | Developer: their match results |

All endpoints require the `sdk-api-key` header. All return `401`/`403` per the [Authentication](#3-authentication) flow when the header is missing/invalid.

---

### 4.1 Multi-Step Game Upload

**POST** `/sdk/upload`

Registers a new game through a 3-step flow. The `step` field in the body determines which sub-schema and DB operation runs. Steps must be called in order for the same `developerId`.

**Common Headers**

| Header | Required | Value |
|---|---|---|
| `sdk-api-key` | Yes | Your SDK API key |
| `Content-Type` | Yes | `application/json` |

#### Step 1 — Engine Registration

**Request Body**

```json
{
  "step": 1,
  "developerId": "dev_abc123",
  "data": { "engine": "101" }
}
```

**Validation (`stepOneSchema`):**

| Field | Rule |
|---|---|
| `engine` | Required. Trimmed if a string. Must be one of: `"101"`, `"102"`, `"103"`, `"104"`, `"105"`, `"106"`, `"107"`, `"108"` |

> **Note:** The schema now accepts 8 engine codes (`101`–`108`). Only `101`–`104` have a documented meaning (see `utils/info.ts`): `101 = Unity`, `102 = Unreal`, `103 = HTML5/Web`, `104 = Godot`, `105 = ""` (blank/unassigned). `106`, `107`, `108` have **no known mapping** anywhere in the source. See [Assumptions](#15-assumptions).

**Business logic (as implemented):**
```ts
const existingGame = await Game.findOne({ where: { isCompleted: false } });
```
This checks for **any** incomplete game system-wide — it is **not** filtered by `developerId`. See [Known Issues](#14-known-issues--bugs-detected-in-source) — this is a functional bug, not the "per-developer draft" behavior described in the legacy docs.

- If no incomplete game exists anywhere: creates a new `Game` row with `isCompleted: false`, `registrationStep: 1`, and all other fields defaulted (`""`/`0`).
- If one already exists (from any developer): returns success without creating anything, silently reusing that record's step-2/3 continuation for the **wrong** developer.

**Success Response (200)**
```json
{ "success": true, "message": "Step 1 game upload completed" }
```

**Error Responses**

| Status | Body | Cause |
|---|---|---|
| 400 | `{ "success": false, "message": [...ZodIssue[]] }` | Invalid `engine` value |
| 401 | `{ "success": false, "message": "API key is required" }` | Missing header |
| 403 | `{ "success": false, "message": "Invalid SDK API key" }` | Wrong key |
| 500 | `{ "success": false, "message": "Step 1 game upload failed", "errorMessage": {...} }` | DB error |

---

#### Step 2 — Game Configuration

**Request Body**

```json
{
  "step": 2,
  "developerId": "dev_abc123",
  "data": {
    "minPlayers": 2,
    "maxPlayers": 4,
    "skillTierRange": { "min": "bronze", "max": "gold" },
    "minEntryFee": 100,
    "maxEntryFee": 1000,
    "matchTimeOutSeconds": 300,
    "gracePeriod": 30,
    "reconnectTimeout": 60,
    "platformCommission": 10,
    "developerCommission": 5
  }
}
```

**Validation (`stepTwoSchema`):**

| Field | Rule |
|---|---|
| `minPlayers` | Coerced to number, integer, min 1 |
| `maxPlayers` | Coerced to number, integer, min 1, refined ≥ `minPlayers` |
| `skillTierRange` | Passthrough object; string values trimmed |
| `minEntryFee` | Coerced to number, min 0 |
| `maxEntryFee` | Coerced to number, min 0, refined ≥ `minEntryFee` |
| `matchTimeOutSeconds` | Coerced to number, integer, min 0 |
| `gracePeriod` | Coerced to number, integer, min 0 |
| `reconnectTimeout` | Coerced to number, integer, min 0 |
| `platformCommission` | Coerced to number, integer, min 0 — **new field, not in legacy docs** |
| `developerCommission` | Coerced to number, integer, min 0 — **new field, not in legacy docs** |

**Business logic:** looks up an incomplete `Game` scoped by `developerId` (this lookup **is** correctly scoped, unlike step 1). Updates all listed fields plus `registrationStep: 2`. `platformCommission`/`developerCommission` are persisted on the `Game` row and later read back during result settlement (see [§7.3](#73-result-service-sdkcontrollermutationts--registergameresult)).

**Success Response (200)**
```json
{ "success": true, "message": "Step 2 game upload completed" }
```

**Error Responses**

| Status | Body | Cause |
|---|---|---|
| 400 | `{ "success": false, "message": [...ZodIssue[]] }` | Validation failure |
| 404 | `{ "success": false, "message": "Game not found" }` | No incomplete game for this `developerId` |
| 401 / 403 | as above | Auth failure |
| 500 | `{ "success": false, "message": "Step 2 game upload failed", "errorMessage": {...} }` | DB error |

---

#### Step 3 — Media & Finalization

**Request Body**

```json
{
  "step": 3,
  "developerId": "dev_abc123",
  "data": {
    "title": "Super Shooter Arena",
    "genre": "Action",
    "description": "A fast-paced multiplayer arena shooter with wagering.",
    "thumbnail": "data:image/png;base64,iVBORw0KGgo...",
    "file": "data:application/zip;base64,UEsDBBQA..."
  }
}
```

**Validation (`stepThreeSchema`):**

| Field | Rule |
|---|---|
| `title` | Required, trimmed, 3–255 chars |
| `genre` | Optional, defaults to `"Action"` |
| `description` | Required, trimmed, 20–5000 chars |
| `thumbnail` | Required, trimmed, min 1 char |
| `file` | Required, trimmed, min 1 char |

**Business logic:** looks up the incomplete `Game` for `developerId`. Uploads `thumbnail` and `file` to Cloudinary concurrently (public IDs `thumbnail-{gameId}` and `game-{gameId}`). If **both** uploads return a `url`, updates the game row with `title`, `genre`, `description`, the two Cloudinary URLs, `registrationStep: 3`, `isCompleted: true`.

> **Bug:** If either upload fails (no `.url`), the handler executes:
> ```ts
> return thumbnailUpload ? thumbnailUpload : gameFileUpload ? gameFileUpload : value ? value : "";
> ```
> This **returns a raw JavaScript object directly from the Express handler without calling `res.status()`/`res.json()`**. No HTTP response is actually sent through this path in the way the rest of the API responds — see [Known Issues](#14-known-issues--bugs-detected-in-source).

**Success Response (200)**
```json
{ "success": true, "message": "Step 3 game upload completed" }
```

**Error Responses**

| Status | Body | Cause |
|---|---|---|
| 400 | `{ "success": false, "message": [...ZodIssue[]] }` | Validation failure |
| 404 | `{ "success": false, "message": "Game not found" }` | No incomplete game for this developer |
| 401 / 403 | as above | Auth failure |
| 500 | `{ "success": false, "message": "Step 3 game upload failed", "errorMessage": {...} }` | DB/Cloudinary exception |
| — | raw Cloudinary error/validation object, no status code set | Partial upload failure (see bug note above) |

---

### 4.2 Register Game Session

**POST** `/sdk/session`

Records the start of a match and triggers a `WAGER_BALANCE_LOCKED` event before persisting the session. Idempotent on `matchId`.

**Headers:** `sdk-api-key` (required), `Content-Type: application/json`

**Request Body (as consumed by the controller):**

```json
{
  "matchId": "match_7f3a9b12",
  "gameId": "game_abc123",
  "developerId": "dev_abc123",
  "title": "Super Shooter Arena",
  "genre": "Action",
  "stake": 500,
  "currency": "NGN",
  "players": [
    { "id": "user_001", "username": "PlayerOne", "walletId": "wallet_001" },
    { "id": "user_002", "username": "PlayerTwo", "walletId": "wallet_002" }
  ]
}
```

| Field | Type | Required | Notes |
|---|---|---|---|
| `matchId` | string | Yes | Unique match identifier; used for idempotency |
| `gameId` | string | Yes | Reference to a `GameData.gameId` |
| `developerId` | string | Yes | Not verified against an authenticated identity |
| `title` | string | Yes | Stored on the session row |
| `genre` | string | Yes | Stored on the session row |
| `stake` | number | Yes | Per-player stake; `totalStake = stake * players.length` |
| `currency` | string | Yes | Currency code |
| `players` | array | Yes | Each item must include `id` and, per the wager-lock event logic, **`walletId`** — see [Assumptions](#15-assumptions) |

> **No request body schema validation is applied to this endpoint** (no Zod/Joi schema is invoked in `registerGameSession`).

**Business logic:**
1. Look up an existing `GameSession` by `matchId` only.
2. If none exists: build a `WagerInitParticipant[]` from `players` (`userId = player.id`, `walletId = player.walletId`, `amount = stake`) and call `wagerEventsPublisher.publishInitiateWager({ gameId, participants })`. This always resolves with a generated `eventId` string (see [§7.4](#74-rabbitmq-event-publishing-eventseventpubisherts)) — it does **not** guarantee the message was actually delivered to the broker.
3. Create the `GameSession` row with `totalStake = stake * players.length` (generalized for N players, not hardcoded to 2 as in the legacy docs).
4. If a session already exists for `matchId`: respond success without re-creating.

**Success Responses (200)**
```json
{ "success": true, "message": "Game session stored successfully" }
```
```json
{ "success": true, "message": "Game session has already been stored" }
```

**Error Responses**

| Status | Body | Cause |
|---|---|---|
| 400 | `{ "success": false, "message": "Failed to register game session" }` | DB create failure, or wager-init "failure" (practically unreachable — see note above) |
| 400 | `{ "success": false, "message": "Failed to initiate wager" }` | `publishInitiateWager` did not resolve truthy |
| 401 / 403 | as above | Auth failure |
| 200 | `{ "success": false, "message": "Game session already exists" }` | `UniqueConstraintError` caught (unusual: 200 status with `success: false`) |
| 500 | `{ "success": false, "message": "Failed to register game session", "errorMessage": {...} }` | Unexpected error |

---

### 4.3 Register Game Result

**POST** `/sdk/result`

Records the outcome of a match, computes financial data, and triggers a `WAGER_SETTLED` event. Idempotent on `matchId`.

**Headers:** `sdk-api-key` (required), `Content-Type: application/json`

**Request Body (fields actually read by `registerGameResult`):**

```json
{
  "matchId": "match_7f3a9b12",
  "developerId": "dev_abc123",
  "winningTeam": "TeamA",
  "losingTeam": "TeamB",
  "isDraw": false,
  "outcomeReason": "completed",
  "startedAt": "2024-05-01T10:00:00Z",
  "endedAt": "2024-05-01T10:08:32Z",
  "durationMs": 512000,
  "roundsPlayed": "5",
  "additionalGameData": { "mapPlayed": "Dust2", "gameMode": "Deathmatch" },
  "results": { "user_001": 2400, "user_002": 1100 },
  "deviceType": "mobile",
  "platform": "android"
}
```

> **This differs significantly from the legacy documentation**, which described `winnerId`/`loserId` and a `players[]` array with per-player scores in the result payload. The current controller:
> - Reads `results.winningTeam` / `results.losingTeam` (**not** `winnerId`/`loserId`)
> - Does **not** read a `players` array from the request body at all — it uses `session.dataValues.players` (the player list captured at session-creation time) for the stored result's `players` field
> - Reads a `results` field (arbitrary shape) into the new `playersPoints` column
> - **No player-ID-matching validation is performed.** The `"Players Ids do not match"` / `400` behavior described in the legacy docs does **not exist** in this codebase. See [Known Issues](#14-known-issues--bugs-detected-in-source).

| Field | Type | Required | Notes |
|---|---|---|---|
| `matchId` | string | Yes | Must match an existing `GameSession.matchId` (see lookup note below) |
| `developerId` | string | Yes | Session lookup is filtered by **both** `matchId` and `developerId` |
| `winningTeam` | string | No | Stored as `GameResult.winner`; also used to compute per-player win/loss via `player.team === winningTeam` |
| `losingTeam` | string | No | Stored as `GameResult.loser` |
| `isDraw` | boolean | No (default `false`) | If true, all session players are treated as "winners" and split the pot evenly |
| `outcomeReason` | string | No (default `""`) | Free text/enum, not validated against a fixed set in code |
| `startedAt` / `endedAt` / `durationMs` / `roundsPlayed` | — | No | Fallbacks: `startedAt` → session `createdAt`; `endedAt` → `new Date()`; `durationMs` → `0`; `roundsPlayed` → `0` |
| `additionalGameData` | object | No | Stored as-is, no schema enforced |
| `results` | any | No | Stored verbatim into `GameResult.playersPoints` |
| `deviceType` | string | No (default `"phone"`) | |
| `platform` | string | No (default `"mobile"`) | |

> **No request body schema validation is applied to this endpoint.**

**Financial Calculation (`financial` object, stored on `GameResult.financial`):**

| Field | Calculation |
|---|---|
| `stake` | `session.totalStake` |
| `currency` | `session.currency` |
| `winnerPayout` | `session.totalStake` |
| `platformFee` | `session.totalStake * 0.5` |
| `developerFee` | `session.totalStake * 0.86` |

> ⚠️ As in the legacy docs, `platformFee + developerFee` exceeds `totalStake` (1.36×). This hardcoded 0.5/0.86 split still exists in the code **and coexists with a second, independent fee calculation** used only for the RabbitMQ event payload — see below and [Known Issues](#14-known-issues--bugs-detected-in-source).

**Separate Event-Only Fee Calculation** (used solely for the `WAGER_SETTLED` event, **not** stored in `financial`):

```ts
const platformFee = gameInfo ? (gameInfo.platformCommission / 100) * financial.stake : 0;
const developerFee = gameInfo ? (gameInfo.developerCommission / 100) * financial.stake : 0;
```

These use the `platformCommission`/`developerCommission` percentages configured in step 2 of upload — a **different number** than the `financial.platformFee`/`financial.developerFee` persisted on the `GameResult` row.

**Business logic:**
1. Find `GameSession` where `matchId` **and** `developerId` both match. 404 if not found.
2. Find the owning `Game` by `developerId` + `session.gameId` (used only for commission percentages).
3. Build the `financial` object (0.5/0.86 split, as above).
4. Build the `GameResult` payload (`winner`/`loser` from `winningTeam`/`losingTeam`, `players` from the **session's** player list, `title` = `session.genre` — the legacy "title/genre swap" bug is still present).
5. Check for an existing `GameResult` by `matchId`. If none:
   - Compute `winners` = all session players if `isDraw`, else players whose `player.team === winningTeam`.
   - Compute `payoutPerWinner = totalPot / winners.length`.
   - Build `WagerParticipant[]` for the event using `player.walletId` and `player.team` — **both fields are assumed to exist on the session's stored `players` JSON**, though the `/session` request/response documentation only shows `id`/`username`/`walletId`. There is **no `team` field ever captured** by `/session`. See [Assumptions](#15-assumptions).
   - Publish `WAGER_SETTLED` via `wagerEventsPublisher.publishWagerSettled(...)`.
   - If publish resolves (always truthy, same caveat as `/session`): create the `GameResult` row.
6. If a `GameResult` for this `matchId` already exists: respond success without re-creating ("Game result already registered").

**Success Responses (200)**
```json
{ "success": true, "message": "Game result registered" }
```
```json
{ "success": true, "message": "Game result already registered" }
```

**Error Responses**

| Status | Body | Cause |
|---|---|---|
| 404 | `{ "success": false, "message": "Game session not found" }` | No session for this `matchId` + `developerId` combination |
| 400 | `{ "success": false, "message": "Failed to register game result" }` | DB create failure |
| 400 | `{ "success": false, "message": "Failed to complete wager" }` | `publishWagerSettled` did not resolve truthy |
| 401 / 403 | as above | Auth failure |
| 200 | `{ "success": false, "message": "Game result already exists" }` | `UniqueConstraintError` caught |
| 500 | `{ "success": false, "message": "Failed to register game result", "errorMessage": {...} }` | Unexpected error |

---

### 4.4 Get Game Data

**GET** `/sdk/data/:gameId`

**Path Parameters:** `gameId` (string, required)

**Headers:** `sdk-api-key` (required)

**Business logic:** `Game.findOne({ where: { gameId, isCompleted: true } })`.

**Success Response (200)**
```json
{
  "success": true,
  "data": {
    "id": "uuid-xxxx",
    "gameId": "game_abc123",
    "developerId": "dev_abc123",
    "title": "Super Shooter Arena",
    "genre": "Action",
    "description": "A fast-paced multiplayer arena shooter with wagering.",
    "thumbnail": "https://res.cloudinary.com/.../thumbnail-game_abc123",
    "file": "https://res.cloudinary.com/.../game-game_abc123",
    "engine": "101",
    "minPlayers": 2,
    "maxPlayers": 4,
    "skillTierRange": { "min": "bronze", "max": "gold" },
    "minEntryFee": 100,
    "maxEntryFee": 1000,
    "matchTimeOutSeconds": 300,
    "registrationStep": 3,
    "gracePeriod": 30,
    "platformCommission": 10,
    "developerCommission": 5,
    "reconnectTimeout": 60,
    "isCompleted": true,
    "createdAt": "2024-05-01T09:00:00.000Z"
  }
}
```

**Error Responses**

| Status | Body | Cause |
|---|---|---|
| 404 | `{ "success": false, "message": "Game data not found" }` | No completed game with this `gameId` |
| 401 / 403 | as above | Auth failure |
| 500 | `{ "success": false, "message": "Failed to get game data", "errorMessage": {...} }` | DB error |

---

### 4.5 Get Game Session

**GET** `/sdk/session`

> **Design note:** This is a `GET` route, but the controller (`getGameSession`) reads its lookup key from `req.body.matchId`, not from a query string or path parameter. Standard HTTP semantics discourage bodies on `GET` requests, and many HTTP clients/proxies strip them — callers must use an HTTP client capable of sending a JSON body on `GET` (e.g., `axios({ method: 'get', url, data: {...} })`, not `fetch` with a body on GET, which browsers reject). This route also shares the `/session` path with the `POST /sdk/session` endpoint above (differentiated only by HTTP method).

**Headers:** `sdk-api-key` (required), `Content-Type: application/json`

**Request Body:**
```json
{ "matchId": "match_7f3a9b12" }
```

**Success Response (200)**

> **Inconsistency:** unlike every other read endpoint in this API, the session data is returned under the `message` key, not `data`.

```json
{
  "success": true,
  "message": {
    "id": "uuid-xxxx",
    "matchId": "match_7f3a9b12",
    "gameId": "game_abc123",
    "developerId": "dev_abc123",
    "title": "Super Shooter Arena",
    "genre": "Action",
    "totalStake": 1000,
    "currency": "NGN",
    "players": [ { "id": "user_001", "username": "PlayerOne", "walletId": "wallet_001" } ],
    "createdAt": "2024-05-01T10:00:00.000Z"
  }
}
```

**Error Responses**

| Status | Body | Cause |
|---|---|---|
| 404 | `{ "success": false, "message": "Game session not found" }` | No session for `matchId` |
| 401 / 403 | as above | Auth failure |
| 500 | `{ "success": false, "message": "Failed to get game session", "errorMessage": {...} }` | DB error |

---

### 4.6 Admin — Get All Games

**GET** `/sdk/admin/games/`

**Headers:** `sdk-api-key` (required)

**Business logic:** `Game.findAll({ where: { isCompleted: true }, attributes: [gameId, title, description, genre, engine, thumbnail], order: [[createdAt, DESC]] })`.

**Success Response (200)**
```json
{
  "success": true,
  "data": [
    {
      "gameId": "game_abc123",
      "title": "Super Shooter Arena",
      "description": "A fast-paced multiplayer arena shooter with wagering.",
      "genre": "Action",
      "engine": "101",
      "thumbnail": "https://res.cloudinary.com/.../thumbnail-game_abc123"
    }
  ]
}
```

**Error Responses**

| Status | Body | Cause |
|---|---|---|
| 404 | `{ "success": false, "message": "Games not found" }` | No completed games exist |
| 401 / 403 | as above | Auth failure |
| 500 | `{ "success": false, "message": "Failed to get game data", "errorMessage": {...} }` | DB error |

> **Note:** the actual `getAllGames` implementation only performs the outer `if (token) { if (token !== key) {...} }` check — no nested duplicate here (that pattern only appears in `getGameResults`, see below).

---

### 4.7 Admin — Get All Game Results

**GET** `/sdk/admin/results`

**Headers:** `sdk-api-key` (required)

**Business logic:**
```ts
GameResult.findAll({
  attributes: ["matchId", "winnerId", "loserId", "isDraw", "outcomeReason",
               "players", "title", "developerId", "financial", "additionalGameData"],
  order: [["createdAt", "DESC"]],
});
```

> ⚠️ **Critical mismatch:** the `GameResult` Sequelize model (see [§6.3](#63-gameresult)) defines columns named `winner` and `loser` — **not** `winnerId`/`loserId`. Requesting non-existent column names in Sequelize's `attributes` array will typically produce a database error (`Unknown column`) at query time. This endpoint is very likely broken as shipped. See [Known Issues](#14-known-issues--bugs-detected-in-source).

Also contains a redundant nested auth check:
```ts
if (token !== key!) {
  if (token !== key) {
    return res.status(403).json({ success: false, message: "Invalid SDK API key" });
  }
}
```
This is harmless but dead/duplicated logic.

**Success Response (200)** *(as intended, pending the column-name fix)*
```json
{
  "success": true,
  "data": [
    {
      "matchId": "match_7f3a9b12",
      "isDraw": false,
      "outcomeReason": "completed",
      "players": [ "..." ],
      "title": "Action",
      "developerId": "dev_abc123",
      "financial": {
        "stake": 1000,
        "currency": "NGN",
        "winnerPayout": 1000,
        "platformFee": 500,
        "developerFee": 860
      },
      "additionalGameData": { "...": "..." }
    }
  ]
}
```

**Error Responses**

| Status | Body | Cause |
|---|---|---|
| 404 | `{ "success": false, "message": "Game results not found" }` | No results exist |
| 401 / 403 | as above | Auth failure |
| 500 | `{ "success": false, "message": "Failed to get game results", "errorMessage": {...} }` | DB error (likely, given the column mismatch above) |

---

### 4.8 Developer — Get All Games

**GET** `/sdk/dev/games/:developerId`

**Path Parameters:** `developerId` (string, required)

**Business logic:** `Game.findAll({ where: { developerId }, order: [[createdAt, DESC]] })` — returns both complete and incomplete games, all fields.

**Success Response (200)** — array of full `Game` records (see [§6.1](#61-gamedata-game))

**Error Responses**

| Status | Body | Cause |
|---|---|---|
| 404 | `{ "success": false, "message": "Games not found" }` | No games for this developer |
| 401 / 403 | as above | Auth failure |
| 500 | `{ "success": false, "message": "Failed to get games", "errorMessage": {...} }` | DB error |

---

### 4.9 Developer — Get Incomplete Games

**GET** `/sdk/dev/incompletegame/:developerId`

**Business logic:** `Game.findAll({ where: { developerId, isCompleted: false } })`.

**Error Responses**

| Status | Body | Cause |
|---|---|---|
| 404 | `{ "success": false, "message": "Game not found" }` | *(singular message despite `findAll`)* |
| 401 / 403 | as above | Auth failure |
| 500 | `{ "success": false, "message": "Failed to get game", "errorMessage": {...} }` | DB error |

---

### 4.10 Developer — Get Player Results

**GET** `/sdk/dev/results/:developerId`

**Business logic:**
```ts
GameResult.findAll({
  where: { developerId },
  attributes: ["matchId", "winnerId", "loserId", "isDraw", "outcomeReason",
               "players", "title", "financial", "additionalGameData"],
  order: [["createdAt", "DESC"]],
});
```

> ⚠️ Same `winnerId`/`loserId` column-name mismatch as [§4.7](#47-admin--get-all-game-results). See [Known Issues](#14-known-issues--bugs-detected-in-source).

**Error Responses**

| Status | Body | Cause |
|---|---|---|
| 404 | `{ "success": false, "message": "Results not found" }` | No results for developer |
| 401 / 403 | as above | Auth failure |
| 500 | `{ "success": false, "message": "Failed to get results", "errorMessage": {...} }` | DB error |

---

## 5. Middleware

Registered globally in `src/index.ts`, in this order:

| Middleware | Purpose | Execution Flow | Request/Response Effects |
|---|---|---|---|
| `cors()` | Enables cross-origin requests | Runs first, before routing | Adds permissive `Access-Control-Allow-*` headers to every response; default config allows **any origin** |
| `express.json()` | Parses JSON request bodies | Runs before route handlers | Populates `req.body` for `Content-Type: application/json` requests |
| `logger("dev")` (Morgan) | HTTP request logging | Runs on every request | Writes colorized request logs (method, URL, status, response time) to stdout; no request/response mutation |
| `express.urlencoded({ extended: false })` | Parses URL-encoded bodies | Runs before route handlers | Populates `req.body` for form-encoded requests |

**Route-level "middleware":** There is **no dedicated authentication middleware function**. Each controller in `sdkController/`, `admin/`, and `developer/` repeats the same `sdk-api-key` check inline (see [§3](#3-authentication)). This is a maintenance/consistency risk — a new endpoint added without copying this exact block would be unauthenticated by default.

**Route registration order** (`routes/sdk_routes.ts`):
```ts
router.post("/upload", uploadGame);
router.post("/session", registerGameSession);
router.post("/result", registerGameResult);
router.get("/data/:gameId", getGameData);
router.get("/session", getGameSession);
router.get("/admin/games/", getAllGames);
router.get("/admin/results", getGameResults);
router.get("/dev/games/:developerId", allGames);
router.get("/dev/incompletegame/:developerId", incompleteGames);
router.get("/dev/results/:developerId", playerResults);
```

---

## 6. Database Models

All models are defined with `timestamps: false` (Sequelize's automatic `createdAt`/`updatedAt` management is disabled; each model manages its own `createdAt` column manually where present).

### 6.1 GameData (`Game`)

**Table name:** `GameData`

| Column | Type | Nullable | Default | Constraints | Description |
|---|---|---|---|---|---|
| `id` | STRING | No | — | PRIMARY KEY | Internal UUID (`crypto.randomUUID()`) |
| `gameId` | STRING | No | — | UNIQUE | Public game identifier (`crypto.randomUUID()`) |
| `developerId` | STRING | No | `""` | — | Developer owner ID |
| `title` | STRING | No | `""` | — | Game display title |
| `genre` | STRING | No | `""` | — | Game genre |
| `description` | TEXT | No | `""` | — | Game description |
| `thumbnail` | STRING | No | `""` | — | Cloudinary URL for thumbnail |
| `file` | STRING | No | `""` | — | Cloudinary URL for game file |
| `engine` | STRING | No | `""` | — | Engine code (`101`–`108`, see [§4.1](#41-multi-step-game-upload)) |
| `minPlayers` | INTEGER | No | `0` | — | Minimum players per match |
| `maxPlayers` | INTEGER | No | `0` | — | Maximum players per match |
| `skillTierRange` | JSON | Yes | `null` | — | Optional skill tier constraints |
| `minEntryFee` | INTEGER | No | `0` | — | Minimum wager per player |
| `maxEntryFee` | INTEGER | No | `0` | — | Maximum wager per player |
| `matchTimeOutSeconds` | INTEGER | No | `0` | — | Match timeout duration |
| `registrationStep` | INTEGER | No | `1` | — | Current upload step (1, 2, or 3) |
| `gracePeriod` | INTEGER | No | `0` | — | Connection grace period (seconds) |
| `platformCommission` | INTEGER | No | `0` | — | **New column** — percentage used in result-settlement fee calc |
| `developerCommission` | INTEGER | No | `0` | — | **New column** — percentage used in result-settlement fee calc |
| `reconnectTimeout` | INTEGER | No | `0` | — | Reconnect window (seconds) |
| `isCompleted` | BOOLEAN | No | `false` | — | Whether registration is complete |
| `createdAt` | DATE | No | `NOW` | — | Creation timestamp |

**Relationships:** Referenced logically by `GameSession.gameId` and `GameResult.gameId` (no Sequelize `belongsTo`/`hasMany` associations are declared in code — the relationship is enforced only by convention, not by foreign key constraints).

**Indexes:** `gameId` is `UNIQUE`. No other explicit indexes are declared.

**Example Record**
```json
{
  "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "gameId": "game_abc123",
  "developerId": "dev_abc123",
  "title": "Super Shooter Arena",
  "genre": "Action",
  "description": "A fast-paced multiplayer arena shooter for mobile devices.",
  "thumbnail": "https://res.cloudinary.com/demo/image/upload/thumbnail-game_abc123",
  "file": "https://res.cloudinary.com/demo/raw/upload/game-game_abc123",
  "engine": "101",
  "minPlayers": 2,
  "maxPlayers": 2,
  "skillTierRange": { "min": "bronze", "max": "gold" },
  "minEntryFee": 100,
  "maxEntryFee": 1000,
  "matchTimeOutSeconds": 300,
  "registrationStep": 3,
  "gracePeriod": 30,
  "platformCommission": 10,
  "developerCommission": 5,
  "reconnectTimeout": 60,
  "isCompleted": true,
  "createdAt": "2024-05-01T09:00:00.000Z"
}
```

---

### 6.2 GameSession

**Table name:** `GameSession`

| Column | Type | Nullable | Constraints | Description |
|---|---|---|---|---|
| `id` | STRING | No | PRIMARY KEY | Internal UUID |
| `matchId` | STRING | No | UNIQUE | Match identifier from the game server; idempotency key |
| `gameId` | STRING | No | — | Reference to `GameData.gameId` (no FK constraint) |
| `developerId` | STRING | No | — | Developer who owns the game |
| `title` | STRING | No | — | Game title |
| `genre` | STRING | No | — | Game genre |
| `totalStake` | INTEGER | No | — | `stake * players.length` |
| `currency` | STRING | No | — | Currency code |
| `players` | JSON | No | — | Array of player objects (see note below) |
| `createdAt` | DATE | No | default `NOW` | Session creation timestamp |

> **Note on `players`:** The Sequelize type (`PLAYER = { id, username }`) only declares `id` and `username`. However, downstream logic in `registerGameSession` (wager-lock event) and `registerGameResult` (wager-settlement event, winner/loser computation) reads `player.walletId` and `player.team` from this same JSON blob. Neither field is part of the declared type nor validated on input. See [Assumptions](#15-assumptions).

**Example Record**
```json
{
  "id": "b2c3d4e5-f6a7-8901-bcde-f01234567891",
  "matchId": "match_7f3a9b12",
  "gameId": "game_abc123",
  "developerId": "dev_abc123",
  "title": "Super Shooter Arena",
  "genre": "Action",
  "totalStake": 1000,
  "currency": "NGN",
  "players": [
    { "id": "user_001", "username": "PlayerOne", "walletId": "wallet_001", "team": "TeamA" },
    { "id": "user_002", "username": "PlayerTwo", "walletId": "wallet_002", "team": "TeamB" }
  ],
  "createdAt": "2024-05-01T10:00:00.000Z"
}
```

---

### 6.3 GameResult

**Table name:** `GameResult`

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | STRING | No | — | PRIMARY KEY, internal UUID |
| `matchId` | STRING | No | — | UNIQUE, idempotency key |
| `winner` | STRING | No | `""` | Winning team/player identifier (from `winningTeam`) — **not** `winnerId` |
| `loser` | STRING | No | `""` | Losing team/player identifier (from `losingTeam`) — **not** `loserId` |
| `isDraw` | BOOLEAN | No | `false` | Whether the match was a draw |
| `outcomeReason` | STRING | Yes | — | Free text (no ENUM constraint in the current model, despite being described as one previously) |
| `startedAt` | STRING | Yes | — | ISO timestamp string |
| `endedAt` | STRING | Yes | — | ISO timestamp string |
| `durationMs` | BIGINT | Yes | — | Match duration in ms |
| `roundsPlayed` | STRING | Yes | `null` | Rounds completed |
| `players` | JSON | No | — | Copied from the originating `GameSession.players` |
| `additionalGameData` | JSON | Yes | — | Custom game-specific data |
| `playersPoints` | JSON | Yes | — | **New column** — stores the raw `results` field from the request body |
| `developerId` | STRING | No | — | Developer ID |
| `gameId` | STRING | No | — | Game ID |
| `title` | STRING | Yes | — | ⚠️ Populated from `session.genre`, not `session.title` (legacy bug, still present) |
| `genre` | STRING | Yes | — | Game genre |
| `financial` | JSON | Yes | — | Financial breakdown object (see [§4.3](#43-register-game-result)) |
| `timestamp` | STRING | Yes | — | ISO timestamp of result registration |
| `deviceType` | STRING | Yes | — | Player device type |
| `platform` | STRING | Yes | — | Player platform |

> ⚠️ **The `winner`/`loser` column names directly contradict the `attributes` arrays used in `admin/queries.ts` (`getGameResults`) and `developer/queries.ts` (`playerResults`), which both request `winnerId`/`loserId`.** This is the single most important discrepancy to resolve in this codebase. See [Known Issues](#14-known-issues--bugs-detected-in-source).

**RESULT_PLAYER / FINANCIAL types:** The TypeScript type `RESULT_PLAYER` is declared as `any` in `gameResult.ts` — no shape is enforced at the type level for individual player entries.

**Example Record**
```json
{
  "id": "c3d4e5f6-a7b8-9012-cdef-012345678912",
  "matchId": "match_7f3a9b12",
  "winner": "TeamA",
  "loser": "TeamB",
  "isDraw": false,
  "outcomeReason": "completed",
  "startedAt": "2024-05-01T10:00:00.000Z",
  "endedAt": "2024-05-01T10:08:32.000Z",
  "durationMs": 512000,
  "roundsPlayed": "5",
  "players": [
    { "id": "user_001", "username": "PlayerOne", "walletId": "wallet_001", "team": "TeamA" },
    { "id": "user_002", "username": "PlayerTwo", "walletId": "wallet_002", "team": "TeamB" }
  ],
  "additionalGameData": { "mapPlayed": "Dust2", "gameMode": "Deathmatch" },
  "playersPoints": { "user_001": 2400, "user_002": 1100 },
  "developerId": "dev_abc123",
  "gameId": "game_abc123",
  "title": "Action",
  "genre": "Action",
  "financial": {
    "stake": 1000,
    "currency": "NGN",
    "winnerPayout": 1000,
    "platformFee": 500,
    "developerFee": 860
  },
  "timestamp": "2024-05-01T10:08:35.000Z",
  "deviceType": "mobile",
  "platform": "android"
}
```

---

## 7. Services

### 7.1 Game Upload Service (`sdkController/mutation.ts` → `uploadGame`)

**Responsibilities:** Drive the 3-step game registration wizard.

**Workflow:**
```
Step 1: validate engine → find ANY incomplete game (not scoped by developerId) → create if none, else no-op success
Step 2: validate config → find incomplete game scoped by developerId → update with limits/fees/timing/commissions
Step 3: validate media → find incomplete game scoped by developerId → upload thumbnail+file to Cloudinary → finalize (isCompleted=true)
```

**Business rules (as implemented):**
- A game is only publicly queryable via `/data/:gameId` and `/admin/games/` once `isCompleted = true`.
- Step 1's "one incomplete game" check is **global**, not per-developer — see [Known Issues](#14-known-issues--bugs-detected-in-source).
- Files passed to step 3 must be Cloudinary-acceptable content (base64 data URIs or accessible URLs); `resource_type: "auto"` is used, so images, video, and raw files are all supported.

### 7.2 Session Service (`sdkController/mutation.ts` → `registerGameSession`)

**Responsibilities:** Record match starts and trigger a wallet balance lock.

**Workflow:**
1. Check for an existing session by `matchId`.
2. If none: publish a `WAGER_BALANCE_LOCKED` event, then create the session with `totalStake = stake * players.length`.
3. If one exists: respond success without side effects ("already stored").

**Business rules:**
- `totalStake` is the source of truth for financial data used later in result settlement.
- The wager-lock event is published **before** the session row is persisted — if the process crashes between the publish and the `create()` call, an event will have been emitted with no corresponding session record.

### 7.3 Result Service (`sdkController/mutation.ts` → `registerGameResult`)

**Responsibilities:** Finalize a match, compute settlement figures, and trigger a wallet settlement.

**Workflow:**
1. Find the session by `matchId` + `developerId` — 404 if not found.
2. Look up the owning `Game` for commission percentages (best-effort; `gameInfo` may be `null`, in which case both event-fee variables default to `0`).
3. Compute the persisted `financial` object using the fixed `0.5`/`0.86` split (unchanged legacy bug).
4. Build the `GameResult` payload from the session's stored player list (not from the request body's players).
5. Check for an existing result by `matchId`; if none, compute per-winner payout, publish `WAGER_SETTLED`, then create the `GameResult` row.

**Financial calculation (persisted):**
- `winnerPayout = totalStake`
- `platformFee = totalStake * 0.5`
- `developerFee = totalStake * 0.86`

> ⚠️ These two fees still sum to 1.36× `totalStake`. A **second**, unrelated fee calculation (using `gameInfo.platformCommission`/`developerCommission` percentages) is computed purely for the outbound RabbitMQ event and is **not** reconciled with the persisted `financial` object. Define and enforce one consistent fee model before production use.

### 7.4 RabbitMQ Event Publishing (`events/eventPubisher.ts`)

**Responsibilities:** Publish domain events describing wager lifecycle transitions to a topic exchange.

**Public methods:**
- `publishWagerSettled(params)` — builds a `WagerSettledEvent` (`eventType: "WAGER_SETTLED"`, routing key `wager.settled`) and publishes it. Returns the generated `eventId`.
- `publishInitiateWager(params)` — builds a `WagerInitEvent` (`eventType: "WAGER_BALANCE_LOCKED"`, routing key `wager.balance.locked`) with a freshly generated `escrow_id` and `wagerId` (both random UUID-based, **not** derived from the caller's `matchId`). Returns the generated `eventId`.

**Internal `publish()` behavior:**
```ts
const published = channel.publish(exchange, routingKey, buffer, {
  persistent: true, contentType: "application/json",
  messageId: payload.eventId, timestamp: Date.now(),
});
if (!published) {
  console.warn("[RabbitMQ] publish buffer full, message queued internally");
}
```
`channel.publish()`'s boolean return value (whether the write buffer accepted the message) is only logged, **never surfaced to the caller**. Both `publishWagerSettled` and `publishInitiateWager` unconditionally return their generated `eventId`, so callers in `mutation.ts` treat the "wager event" step as always successful — this makes the `eventComplete` truthiness checks in `registerGameSession`/`registerGameResult` effectively dead code (they can only be falsy if `publish()` throws synchronously, which it does not appear to do based on the shown implementation).

### 7.5 RabbitMQ Connection Manager (`rabbitmq/connection.ts`)

**Responsibilities:** Maintain a single AMQP connection/channel, with lazy connect and automatic reconnection.

- `connect()` is idempotent — if already connected or a connection attempt is in flight, it reuses the existing promise.
- Asserts a durable topic exchange (`rabbitmqConfig.exchange`) on connect.
- On the underlying connection's `"close"` event, nulls out internal state and schedules a reconnect after `reconnectDelayMs` (2000 ms).
- `getChannel()` lazily triggers `connect()` if no channel exists yet.
- `close()` gracefully shuts down the channel and connection (called from `SIGTERM`/`SIGINT` handlers in `index.ts`).

### 7.6 Cloudinary Integration (`database/gameFileBucket.ts`)

**Functions:**
- `uploadToCloudinary({ uploadId, file })` — uploads with a deterministic `public_id` (`thumbnail-{gameId}` / `game-{gameId}`) and `resource_type: "auto"`. Returns `{ url, publicId }` on success, or `{ success: false, message: "Game file upload failed", response: error }` on failure (note: this error shape has a `success` key but the success path does **not** — inconsistent shape between the two branches).
- `readyCloudinary()` — pings the Cloudinary API on startup (`cloudinary.api.ping()`) to warm the connection and verify credentials; logs success/failure only, does not block startup or throw.

### 7.7 Validation Utility (`utils/zodValidation.ts`)

`validate(schema, payload)` runs `schema.safeParse(payload)`:
- On failure: returns `result.error.issues` (an array).
- On success: returns `result.data` (an object, given the current schemas).

Controllers detect failure via `if (value.length)`, which works only because Zod issue arrays are non-empty on failure and the parsed data for all current schemas is a plain object (whose `.length` is `undefined`, which is falsy). This remains a fragile pattern if any schema is ever changed to return an array.

---

## 8. Utilities

| File | Export(s) | Purpose |
|---|---|---|
| `utils/zodValidation.ts` | `validate<T>(schema, payload)` | Generic Zod schema runner (see [§7.7](#77-validation-utility-utilszodvalidationts)) |
| `utils/uploadValidation.ts` | `stepOneSchema`, `stepTwoSchema`, `stepThreeSchema` | Zod schemas for the 3-step upload flow (see [§4.1](#41-multi-step-game-upload)) |
| `utils/info.ts` | `engineCode` (const, **not exported**) | A `{ code: engineName }` lookup map for engine codes `101`–`105`. Declared with `const engineCode = {...}` and no `export` keyword — it is **not imported anywhere else in the codebase** and is effectively dead code as shipped. Update this map and export it if engine-name display is needed elsewhere. |

---

## 9. SDK Integration Examples

### 9.1 JavaScript (Browser / CommonJS)

```javascript
const SDK_API_KEY = "your_sdk_api_key_here";
const BASE_URL = "https://your-api-domain.com/sdk";

const headers = {
  "sdk-api-key": SDK_API_KEY,
  "Content-Type": "application/json",
};

async function uploadGameStep1(developerId, engine) {
  const res = await fetch(`${BASE_URL}/upload`, {
    method: "POST",
    headers,
    body: JSON.stringify({ step: 1, developerId, data: { engine } }),
  });
  return res.json();
}

async function uploadGameStep2(developerId, config) {
  const res = await fetch(`${BASE_URL}/upload`, {
    method: "POST",
    headers,
    body: JSON.stringify({ step: 2, developerId, data: config }),
  });
  return res.json();
}

async function uploadGameStep3(developerId, mediaData) {
  const res = await fetch(`${BASE_URL}/upload`, {
    method: "POST",
    headers,
    body: JSON.stringify({ step: 3, developerId, data: mediaData }),
  });
  return res.json();
}

async function registerSession(sessionData) {
  const res = await fetch(`${BASE_URL}/session`, {
    method: "POST",
    headers,
    body: JSON.stringify(sessionData),
  });
  return res.json();
}

async function registerResult(resultData) {
  const res = await fetch(`${BASE_URL}/result`, {
    method: "POST",
    headers,
    body: JSON.stringify(resultData),
  });
  return res.json();
}

async function getGame(gameId) {
  const res = await fetch(`${BASE_URL}/data/${gameId}`, { headers });
  return res.json();
}

(async () => {
  const DEV_ID = "dev_abc123";

  await uploadGameStep1(DEV_ID, "101");

  await uploadGameStep2(DEV_ID, {
    minPlayers: 2,
    maxPlayers: 2,
    skillTierRange: {},
    minEntryFee: 100,
    maxEntryFee: 5000,
    matchTimeOutSeconds: 300,
    gracePeriod: 30,
    reconnectTimeout: 60,
    platformCommission: 10,
    developerCommission: 5,
  });

  await uploadGameStep3(DEV_ID, {
    title: "My Wager Game",
    genre: "Action",
    description: "An exciting multiplayer wagering game for mobile players.",
    thumbnail: "data:image/png;base64,iVBORw0KGgoAAA...",
    file: "data:application/zip;base64,UEsDBBQAAAYI...",
  });

  const session = await registerSession({
    matchId: "match_001",
    gameId: "game_xyz",
    developerId: DEV_ID,
    title: "My Wager Game",
    genre: "Action",
    stake: 500,
    currency: "NGN",
    players: [
      { id: "user_A", username: "Alice", walletId: "wallet_A", team: "TeamA" },
      { id: "user_B", username: "Bob", walletId: "wallet_B", team: "TeamB" },
    ],
  });
  console.log(session);
})();
```

### 9.2 TypeScript

```typescript
const SDK_API_KEY: string = process.env.SDK_API_KEY!;
const BASE_URL = "https://your-api-domain.com/sdk";

interface Player {
  id: string;
  username: string;
  walletId: string; // required by the wager-lock/settlement logic even though not enforced by schema
  team?: string;     // required for winner/loser computation on result registration
}

interface SessionPayload {
  matchId: string;
  gameId: string;
  developerId: string;
  title: string;
  genre: string;
  stake: number;
  currency: string;
  players: Player[];
}

interface ResultPayload {
  matchId: string;
  developerId: string;
  winningTeam?: string;
  losingTeam?: string;
  isDraw: boolean;
  outcomeReason?: string;
  startedAt?: string;
  endedAt?: string;
  durationMs?: number;
  roundsPlayed?: string;
  additionalGameData?: Record<string, unknown>;
  results?: Record<string, unknown>;
  deviceType?: string;
  platform?: string;
}

interface ApiResponse<T = unknown> {
  success: boolean;
  message?: string | T;
  data?: T;
}

const defaultHeaders: HeadersInit = {
  "sdk-api-key": SDK_API_KEY,
  "Content-Type": "application/json",
};

async function apiRequest<T>(path: string, options: RequestInit = {}): Promise<ApiResponse<T>> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: { ...defaultHeaders, ...options.headers },
  });
  return res.json() as Promise<ApiResponse<T>>;
}

async function registerSession(payload: SessionPayload): Promise<ApiResponse> {
  return apiRequest("/session", { method: "POST", body: JSON.stringify(payload) });
}

async function registerResult(payload: ResultPayload): Promise<ApiResponse> {
  return apiRequest("/result", { method: "POST", body: JSON.stringify(payload) });
}

async function getGameData(gameId: string): Promise<ApiResponse> {
  return apiRequest(`/data/${gameId}`);
}

(async () => {
  const result = await registerResult({
    matchId: "match_001",
    developerId: "dev_abc123",
    winningTeam: "TeamA",
    losingTeam: "TeamB",
    isDraw: false,
    outcomeReason: "completed",
    startedAt: new Date(Date.now() - 300000).toISOString(),
    endedAt: new Date().toISOString(),
    durationMs: 300000,
    additionalGameData: { mapPlayed: "Arena1" },
    results: { user_A: 3000, user_B: 1200 },
    deviceType: "mobile",
    platform: "android",
  });

  console.log(result);
})();
```

### 9.3 Node.js (axios)

```javascript
const axios = require("axios");

const client = axios.create({
  baseURL: "https://your-api-domain.com/sdk",
  headers: {
    "sdk-api-key": process.env.SDK_API_KEY,
    "Content-Type": "application/json",
  },
});

async function registerSession(data) {
  const { data: response } = await client.post("/session", data);
  return response;
}

async function registerResult(data) {
  const { data: response } = await client.post("/result", data);
  return response;
}

async function getDeveloperGames(developerId) {
  const { data: response } = await client.get(`/dev/games/${developerId}`);
  return response;
}

// GET /sdk/session requires a body on a GET request — axios supports this via `data`
async function getGameSession(matchId) {
  const { data: response } = await client.request({
    method: "get",
    url: "/session",
    data: { matchId },
  });
  return response;
}

async function safeCall(fn, ...args) {
  try {
    return await fn(...args);
  } catch (err) {
    if (err.response) {
      console.error(`API Error ${err.response.status}:`, err.response.data);
    } else {
      console.error("Network Error:", err.message);
    }
    throw err;
  }
}

module.exports = { registerSession, registerResult, getDeveloperGames, getGameSession, safeCall };
```

---

## 10. Postman Examples

### Environment Variables

```
BASE_URL = https://your-api-domain.com/sdk
SDK_API_KEY = your_sdk_api_key_here
DEVELOPER_ID = dev_abc123
GAME_ID = game_abc123
MATCH_ID = match_001
```

### Upload Game — Step 1
```
POST {{BASE_URL}}/upload
Headers:
  sdk-api-key: {{SDK_API_KEY}}
  Content-Type: application/json

Body:
{
  "step": 1,
  "developerId": "{{DEVELOPER_ID}}",
  "data": { "engine": "101" }
}
```

### Upload Game — Step 2
```
POST {{BASE_URL}}/upload
Headers:
  sdk-api-key: {{SDK_API_KEY}}
  Content-Type: application/json

Body:
{
  "step": 2,
  "developerId": "{{DEVELOPER_ID}}",
  "data": {
    "minPlayers": 2,
    "maxPlayers": 2,
    "skillTierRange": {},
    "minEntryFee": 100,
    "maxEntryFee": 5000,
    "matchTimeOutSeconds": 300,
    "gracePeriod": 30,
    "reconnectTimeout": 60,
    "platformCommission": 10,
    "developerCommission": 5
  }
}
```

### Upload Game — Step 3
```
POST {{BASE_URL}}/upload
Headers:
  sdk-api-key: {{SDK_API_KEY}}
  Content-Type: application/json

Body:
{
  "step": 3,
  "developerId": "{{DEVELOPER_ID}}",
  "data": {
    "title": "My Wager Game",
    "genre": "Action",
    "description": "An exciting multiplayer wagering game with real stakes.",
    "thumbnail": "<base64_data_uri_or_url>",
    "file": "<base64_data_uri_or_url>"
  }
}
```

### Register Session
```
POST {{BASE_URL}}/session
Headers:
  sdk-api-key: {{SDK_API_KEY}}
  Content-Type: application/json

Body:
{
  "matchId": "{{MATCH_ID}}",
  "gameId": "{{GAME_ID}}",
  "developerId": "{{DEVELOPER_ID}}",
  "title": "My Wager Game",
  "genre": "Action",
  "stake": 500,
  "currency": "NGN",
  "players": [
    { "id": "user_001", "username": "Alice", "walletId": "wallet_001", "team": "TeamA" },
    { "id": "user_002", "username": "Bob", "walletId": "wallet_002", "team": "TeamB" }
  ]
}
```

### Register Result
```
POST {{BASE_URL}}/result
Headers:
  sdk-api-key: {{SDK_API_KEY}}
  Content-Type: application/json

Body:
{
  "matchId": "{{MATCH_ID}}",
  "developerId": "{{DEVELOPER_ID}}",
  "winningTeam": "TeamA",
  "losingTeam": "TeamB",
  "isDraw": false,
  "outcomeReason": "completed",
  "startedAt": "2024-05-01T10:00:00Z",
  "endedAt": "2024-05-01T10:05:00Z",
  "durationMs": 300000,
  "roundsPlayed": "3",
  "additionalGameData": { "mapPlayed": "Arena1" },
  "results": { "user_001": 3000, "user_002": 1200 },
  "deviceType": "mobile",
  "platform": "android"
}
```

### Get Game Data
```
GET {{BASE_URL}}/data/{{GAME_ID}}
Headers:
  sdk-api-key: {{SDK_API_KEY}}
```

### Get Game Session (body on GET)
```
GET {{BASE_URL}}/session
Headers:
  sdk-api-key: {{SDK_API_KEY}}
  Content-Type: application/json

Body:
{ "matchId": "{{MATCH_ID}}" }
```

### Admin — Get All Games
```
GET {{BASE_URL}}/admin/games/
Headers:
  sdk-api-key: {{SDK_API_KEY}}
```

### Admin — Get All Results
```
GET {{BASE_URL}}/admin/results
Headers:
  sdk-api-key: {{SDK_API_KEY}}
```

### Developer — Get All Games
```
GET {{BASE_URL}}/dev/games/{{DEVELOPER_ID}}
Headers:
  sdk-api-key: {{SDK_API_KEY}}
```

### Developer — Get Incomplete Games
```
GET {{BASE_URL}}/dev/incompletegame/{{DEVELOPER_ID}}
Headers:
  sdk-api-key: {{SDK_API_KEY}}
```

### Developer — Get Player Results
```
GET {{BASE_URL}}/dev/results/{{DEVELOPER_ID}}
Headers:
  sdk-api-key: {{SDK_API_KEY}}
```

---

## 11. OpenAPI Specification

```yaml
openapi: 3.0.3
info:
  title: NexusWager SDK API
  version: 1.0.0
  description: >
    SDK backend for registering games, sessions, and results on the NexusWager
    wagering platform. This spec reflects the current source code, including
    known inconsistencies (see the accompanying documentation's "Known Issues"
    section) that are marked inline where relevant.

servers:
  - url: https://your-api-domain.com/sdk
    description: Production

components:
  securitySchemes:
    ApiKeyAuth:
      type: apiKey
      in: header
      name: sdk-api-key

  schemas:
    Player:
      type: object
      required: [id, username]
      properties:
        id:
          type: string
        username:
          type: string
        walletId:
          type: string
          description: Not enforced by schema, but required by downstream wager-event logic.
        team:
          type: string
          description: Not enforced by schema, but required for winner/loser computation in /result.

    Financial:
      type: object
      properties:
        stake: { type: number }
        currency: { type: string }
        winnerPayout: { type: number }
        platformFee: { type: number }
        developerFee: { type: number }

    SuccessResponse:
      type: object
      properties:
        success: { type: boolean, example: true }
        message: { type: string }

    ErrorResponse:
      type: object
      properties:
        success: { type: boolean, example: false }
        message: { type: string }

security:
  - ApiKeyAuth: []

paths:
  /upload:
    post:
      summary: Multi-step game upload
      description: Upload a game in 3 steps. Set 'step' to 1, 2, or 3 in sequence.
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [step, developerId, data]
              properties:
                step: { type: integer, enum: [1, 2, 3] }
                developerId: { type: string }
                data: { type: object }
      responses:
        '200':
          description: Step completed successfully
          content:
            application/json:
              schema: { $ref: '#/components/schemas/SuccessResponse' }
        '400':
          description: Validation error
          content:
            application/json:
              schema: { $ref: '#/components/schemas/ErrorResponse' }
        '401': { description: Missing API key }
        '403': { description: Invalid API key }
        '404': { description: Incomplete game not found (steps 2 and 3) }
        '500': { description: Server error }

  /session:
    post:
      summary: Register a game session
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [matchId, gameId, developerId, title, genre, stake, currency, players]
              properties:
                matchId: { type: string }
                gameId: { type: string }
                developerId: { type: string }
                title: { type: string }
                genre: { type: string }
                stake: { type: number }
                currency: { type: string }
                players:
                  type: array
                  items: { $ref: '#/components/schemas/Player' }
      responses:
        '200': { description: Session registered or already exists }
        '401': { description: Missing API key }
        '403': { description: Invalid API key }
        '500': { description: Server error }
    get:
      summary: Get a game session (body-based lookup; non-standard GET usage)
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [matchId]
              properties:
                matchId: { type: string }
      responses:
        '200': { description: Session found, returned under the "message" key }
        '404': { description: Session not found }
        '401': { description: Missing API key }
        '403': { description: Invalid API key }
        '500': { description: Server error }

  /result:
    post:
      summary: Register a game result
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [matchId, developerId, isDraw]
              properties:
                matchId: { type: string }
                developerId: { type: string }
                winningTeam: { type: string }
                losingTeam: { type: string }
                isDraw: { type: boolean }
                outcomeReason: { type: string }
                startedAt: { type: string, format: date-time }
                endedAt: { type: string, format: date-time }
                durationMs: { type: integer }
                roundsPlayed: { type: string }
                additionalGameData: { type: object }
                results: { type: object }
                deviceType: { type: string }
                platform: { type: string }
      responses:
        '200': { description: Result registered or already exists }
        '401': { description: Missing API key }
        '403': { description: Invalid API key }
        '404': { description: Session not found for matchId + developerId }
        '500': { description: Server error }

  /data/{gameId}:
    get:
      summary: Get game data
      parameters:
        - name: gameId
          in: path
          required: true
          schema: { type: string }
      responses:
        '200': { description: Game data returned }
        '401': { description: Missing API key }
        '403': { description: Invalid API key }
        '404': { description: Game not found }
        '500': { description: Server error }

  /admin/games/:
    get:
      summary: Admin — get all completed games
      responses:
        '200': { description: List of completed games }
        '401': { description: Missing API key }
        '403': { description: Invalid API key }
        '404': { description: No games found }
        '500': { description: Server error }

  /admin/results:
    get:
      summary: Admin — get all game results
      description: >
        NOTE: current implementation queries non-existent columns
        (`winnerId`/`loserId`); the GameResult model defines `winner`/`loser`.
        Likely to error at runtime until reconciled.
      responses:
        '200': { description: List of all results }
        '401': { description: Missing API key }
        '403': { description: Invalid API key }
        '404': { description: No results found }
        '500': { description: Server error }

  /dev/games/{developerId}:
    get:
      summary: Developer — get all their games
      parameters:
        - name: developerId
          in: path
          required: true
          schema: { type: string }
      responses:
        '200': { description: Developer games list }
        '401': { description: Missing API key }
        '403': { description: Invalid API key }
        '404': { description: No games found }
        '500': { description: Server error }

  /dev/incompletegame/{developerId}:
    get:
      summary: Developer — get incomplete games
      parameters:
        - name: developerId
          in: path
          required: true
          schema: { type: string }
      responses:
        '200': { description: Incomplete games list }
        '404': { description: No games found }

  /dev/results/{developerId}:
    get:
      summary: Developer — get player results
      description: >
        NOTE: same `winnerId`/`loserId` column mismatch as /admin/results.
      parameters:
        - name: developerId
          in: path
          required: true
          schema: { type: string }
      responses:
        '200': { description: Developer results list }
        '404': { description: No results found }
```

---

## 12. Error Codes Reference

### HTTP Status Codes Used

| Status Code | Meaning | Common Causes | Recommended Fix |
|---|---|---|---|
| `200` | Success (also used for some "failure" cases — see below) | Request processed, or a caught `UniqueConstraintError` | N/A / review whether `200` is appropriate for the failure cases |
| `400` | Bad Request | Zod validation failure, DB create failure, wager-event "failure" | Check request body against the relevant schema; check server logs |
| `401` | Unauthorized | Missing `sdk-api-key` header | Add the `sdk-api-key` header |
| `403` | Forbidden | Incorrect `sdk-api-key` value | Verify the key matches `process.env.key` |
| `404` | Not Found | Resource doesn't exist (`gameId`/`matchId`/`developerId` combination) | Confirm the identifier and that any prerequisite step (e.g., session before result) was completed |
| `500` | Internal Server Error | DB error, Cloudinary error, unhandled exception | Check server logs; verify DB/RabbitMQ/Cloudinary connectivity |

### Application-Level Error Messages

| Message | Status | Cause |
|---|---|---|
| `"API key is required"` | 401 | `sdk-api-key` header absent |
| `"Invalid SDK API key"` | 403 | Header present but doesn't match `key` env var |
| `"Game not found"` | 404 | No incomplete game record for developer (step 2/3), or no incomplete games at all (`incompleteGames`, message is singular despite `findAll`) |
| `"Game data not found"` | 404 | No completed game with the given `gameId` |
| `"Game session not found"` | 404 | No session with the given `matchId` (+ `developerId` for `/result`) |
| `"Games not found"` | 404 | No games in query result (admin/developer game lists) |
| `"Game results not found"` | 404 | No results in admin query result |
| `"Results not found"` | 404 | No developer-scoped results found |
| `"Game session already exists"` | 200 | `UniqueConstraintError` on session create — note the 200 status despite `success: false` |
| `"Game result already exists"` | 200 | `UniqueConstraintError` on result create — same 200/`success:false` pattern |
| `"Game session has already been stored"` | 200 | Idempotent re-submission of a known `matchId` |
| `"Game result already registered"` | 200 | Idempotent re-submission of a known `matchId` |
| `"Step 1 game upload failed"` | 400/500 | DB create failure |
| `"Step 2 game upload failed"` | 400/500 | DB update failure |
| `"Step 3 game upload failed"` | 400/500 | DB/Cloudinary failure |
| `"Failed to register game session"` | 400/500 | DB write failure |
| `"Failed to initiate wager"` | 400 | `publishInitiateWager` resolved falsy (practically unreachable given current implementation) |
| `"Failed to register game result"` | 400/500 | DB write failure |
| `"Failed to complete wager"` | 400 | `publishWagerSettled` resolved falsy (practically unreachable given current implementation) |
| `"Failed to get game data"` | 500 | DB read failure |
| `"Failed to get games"` / `"Failed to get game"` | 500 | DB read failure |
| `"Failed to get game session"` | 500 | DB read failure |
| `"Game file upload failed"` | — | Cloudinary upload exception, returned as a plain object (see step 3 bug) |

---
