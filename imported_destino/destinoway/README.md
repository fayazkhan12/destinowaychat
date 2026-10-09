# Destinoway

AI-first Travel + Commerce platform. **Travel is the first domain**; the core (`UniversalAIOrchestrator`, registries, tool-permission layer, provider abstraction) is domain-agnostic.

Stack: **Next.js 16 (App Router, React 19, TypeScript)** · **Node.js + Express (TypeScript)** · MongoDB · Redis · BullMQ · Socket.IO.

## Run locally in VS Code (Windows / macOS / Linux)

**Prerequisites:** Node.js **20.11+** (22 LTS recommended), **Docker Desktop** (for MongoDB + Redis), VS Code.

1. **Open the folder:** VS Code → *File → Open Folder…* → `destinoway`. Accept the "install recommended extensions" prompt.
2. **Open the terminal:** *Terminal → New Terminal* (`` Ctrl+` ``).
3. **Start MongoDB + Redis:**
   ```bash
   npm run infra:up
   ```
   (Wait ~15 s the first time; Mongo is started as a single-node replica set.)
4. **Install dependencies (once):**
   ```bash
   npm install
   ```
5. **Create env files:**
   ```bash
   cp backend/.env.example backend/.env
   cp frontend/.env.example frontend/.env.local
   npm run secrets
   ```
   Paste the 4 printed lines (`JWT_ACCESS_SECRET`, `REFRESH_TOKEN_PEPPER`, `FIELD_ENCRYPTION_KEY`, `METRICS_TOKEN`) into `backend/.env`, replacing the placeholders. (Windows PowerShell: use `copy` instead of `cp`.)
6. **Run everything:**
   ```bash
   npm run dev
   ```
   - Web: http://localhost:3000  
   - API: http://localhost:4000 · health: `/health` · docs: http://localhost:4000/docs
7. **Try it:** Register → the verification link is printed in the **API terminal** (no SMTP in dev) → open it → go to *Start planning* and type: `Jaipur se Dubai ki sasti flight dikhao`.
   Debugging: *Run and Debug → "Destinoway: API + Web"*.

Optional: make yourself admin → `SEED_ADMIN_EMAIL=you@mail.com SEED_ADMIN_PASSWORD='a-long-password-1' npm run seed:admin -w backend`.

## Modes — MOCK vs PRODUCTION (never mixed)
| Setting | Dev default | Meaning |
|---|---|---|
| `TRAVEL_PROVIDER_MODE=mock` | ✅ | `MockFlightProvider`: results are labelled **DEMO**, never bookable. **Refused at boot when `NODE_ENV=production`.** |
| `TRAVEL_PROVIDER_MODE=production` | | Only real providers (Akbar) are registered. Needs `AKBAR_*`. |
| `LLM_PROVIDER=mock` | ✅ | Rule-based multilingual extractor + templates (no API key). Set `anthropic`/`openai`/`gemini` + key for the real LLM. |

## Using Gemini / Claude / OpenAI (real AI instead of the mock)
In `backend/.env` set `LLM_PROVIDER=gemini` (or `anthropic` / `openai`), the matching `*_API_KEY`, and `LLM_MODEL_FAST=<model name>`.
If `LLM_MODEL_MEDIUM` / `LLM_MODEL_ADVANCED` are empty they reuse the fast model. Restart `npm run dev`.
**Never share or commit `backend/.env`** (it is git-ignored). If a key ever leaves your machine (zip, chat, screenshot), rotate it immediately.

## Commands
| Command | What it does |
|---|---|
| `npm run dev` | API + web with hot reload |
| `npm run check` | typecheck + lint + unit tests (run before every commit) |
| `npm test` | 77 backend unit tests (no database needed) |
| `npm run test:integration` | 21 end-to-end tests against **real MongoDB + Redis** (auth, sessions, RBAC, CSRF, WebSocket chat, IDOR…). Needs `npm run infra:up` |
| `npm run build` | production build of both apps |
| `npm run infra:down` | stop MongoDB + Redis |

## Docs
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — architecture, risks, schema, contracts, security, roadmap
- [`docs/PRODUCTION_CHECKLIST.md`](docs/PRODUCTION_CHECKLIST.md) — everything to do before going live
- OpenAPI: `backend/openapi.yaml` (served at `/docs` outside production)

## Akbar Travels — what you must do
`backend/src/providers/akbar/` is the **only** place that knows Akbar's format. Endpoints/auth/response shapes there are **placeholders** until you supply Akbar's API documentation + a sample search response. Edit `endpoints.ts`, `client.ts`, `mapper.ts`; nothing else changes.
