# Destinoway — Architecture

## 1. Risks identified up-front (and the mitigation built)
| Risk | Mitigation |
|---|---|
| LLM hallucinates prices/availability/bookings | LLM never produces money facts: prices come only from tool results → `Fact[]`; LLM replies are validated (every ₹ amount must exist in facts, no URLs) else deterministic template is used. "Booking confirmed" can only come from a backend fact. |
| Prompt / indirect injection, tool abuse | LLM **cannot call tools**. It outputs schema-validated JSON (`Understanding`); deterministic code calls `ToolExecutor` (agent allow-list → RBAC → input schema → risk gate → timeout → output schema → audit). Provider text is sanitised. Injection heuristics log + audit. |
| LLM "says yes" to a payment | Confirmation is deterministic (regex on the *user's own* message) and bound to an approval (user+trip+tool+input-hash, 10-min TTL, single use, atomic `GETDEL`). |
| Provider outage/slow API | Timeout + retry (exp. backoff + jitter, retryable only) + circuit breaker + parallel multi-provider fan-out; failure of one provider degrades results, never the app. |
| Price changes between search and booking | `revalidateFlightPrice` on selection (fail-closed); changed price is surfaced, never silently booked. |
| Token theft | 15-min access JWT (HS256 pinned, iss/aud), opaque refresh token in HttpOnly cookie scoped to `/api/v1/auth`, rotation + **reuse detection** (kills session), instant revocation via Redis liveness flag. |
| CSRF / XSS | SameSite=Lax + Origin allow-list + custom header; nonce-based CSP on the web app; strict CSP on the API. |
| NoSQL injection / IDOR | `sanitizeFilter`, payload key stripping, zod `.strict()` bodies; ownership enforced *inside* queries (`{_id, userId}`). |
| Single-process assumptions | No in-memory sessions; Redis for sessions flags, rate limits, locks, events, queues; Mongo replica set; stateless Node. |
| Unbounded documents | Messages in own collection; TripState capped (≤10 shortlist items); search blobs not stored. |

## 2. System diagram
```mermaid
flowchart LR
  subgraph Browser
    UI[Next.js UI<br/>Chat + Live Trip Workspace]
  end
  UI -- HTTPS + HttpOnly cookies --> API[Express API /api/v1]
  UI -- Socket.IO (cookie auth) --> WS[Realtime Gateway]
  API --> AUTH[Auth / RBAC / Rate limit / CSRF]
  WS --> ORCH
  API --> ORCH[UniversalAIOrchestrator]
  ORCH --> REG[(Agent / Domain / Capability registries)]
  ORCH --> LLM[LLMRouter → Anthropic · OpenAI · Gemini · Mock]
  ORCH --> TE[ToolExecutor<br/>permission layer + approvals]
  TE --> AG[Agents: FlightAgent …]
  AG --> PR[ProviderRegistry<br/>breaker · retry · timeout]
  PR --> AK[AkbarTravelProvider] & MK[MockFlightProvider]
  ORCH --> DB[(MongoDB)]
  ORCH --> RD[(Redis: locks, approvals, limits, pub/sub)]
  ORCH -- publish --> BUS[EventBus (Redis pub/sub)]
  BUS --> WS
  BUS --> WK[BullMQ workers: email, reconciliation…]
```

## 3. Orchestrator turn (deterministic skeleton, LLM only for language)
`sanitize → injection scan → load TripState (+Redis trip lock) → pending approval? (deterministic yes/no) → understand (LLM fast-tier JSON or heuristic) → merge into TripState → pick capabilities (CapabilityRegistry) → find agents (AgentRegistry by domain+service+capability) → ask ≤1 missing slot → run agents in parallel → apply state patches → compose grounded reply → stream tokens → persist state (optimistic version) → emit TripState`.

**Adding a domain** (e.g. ECOMMERCE): create `domains/ecommerce/index.ts` that calls `domainRegistry.register`, `agentRegistry.register(new ProductSearchAgent())`, `toolRegistry.register(...)`; call it in `bootstrap.ts`. `UniversalAIOrchestrator` is not edited. Mixed trips ("suitcase for Dubai") work because the orchestrator maps *services → domains → agents* per request.

## 4. Agent contract
```ts
interface Agent { id; domain; services[]; capabilities[]; description;
  missingSlots(state, task): Slot[];
  execute(task, ctx): Promise<{ agentId; status; statePatch?; facts: Fact[] }> }
```
Agents never talk to HTTP/Provider formats directly: they call `ctx.callTool(toolId, input)` (permission-checked).

## 5. Tool contract
`{ toolId, description, requiredPermissions, inputSchema(zod), outputSchema(zod), riskLevel LOW|MEDIUM|HIGH|CRITICAL, allowedAgents, timeoutMs, handler }`
Implemented: `searchFlights` (LOW), `revalidateFlightPrice` (LOW). Phase 5: `createFlightBooking`/`cancelFlightBooking` (HIGH), `createPayment`/`refund` (CRITICAL) — these *cannot execute* without a consumed, matching approval and a verified email.

## 6. Provider contract (`FlightProviderInterface`)
`searchFlights · getFlightDetails · checkAvailability · revalidatePrice · createBooking · confirmBooking · cancelBooking · getBookingDetails · healthCheck`, mapped to the internal `FlightOffer` zod schema (`priceType: LIVE | DEMO`). Add provider B = implement interface + `registry.register()`.

### Akbar integration architecture
`AkbarTravelProvider → AkbarClient (server-only, https-enforced, no redirects, timeout/abort, creds from env, sanitised debug logs) → mapper (zod; malformed offers skipped, malformed envelope = INVALID_RESPONSE)`. Wrapped by `withResilience` per provider. **Status: adapter skeleton — needs Akbar's real spec** (paths/auth/schema).

## 7. Authentication architecture
`Next.js → Express → AuthService → MongoDB (+Redis liveness)`
Email/password (bcrypt cost 12 with SHA-256 pre-hash, constant-time dummy compare, lockout after 5 fails/15 min, per-IP+email rate limit), Google OAuth (code flow, state in Redis+cookie, verified-email only), email verify + password reset (single-use hashed tokens), logout / logout-all / per-device revoke, role change ⇒ force re-login. Phone-OTP: provider-agnostic `OtpProvider` slot reserved (not enabled).

## 8. Security architecture checklist
Helmet · CORS allow-list · rate limits per tier (anonymous, authenticated, ai, search, booking, admin, authSensitive, highRisk) · zod validation (`strict`) · NoSQL sanitisation · CSRF triple-guard · JWT pinned alg · refresh rotation/reuse detection · session revocation · AES-256-GCM field encryption · immutable audit log (ODM-blocked mutations + integrity hash; ship to WORM/SIEM in prod) · log redaction · `/metrics` token-protected · docs disabled in prod · mock modes rejected at boot in prod · gitleaks + `npm audit` in CI.

## 9. Data model (Mongo)
`users, sessions, authtokens, conversations, messages, trips, tripstates, preferences, auditlogs` (implemented). Planned: `bookings, payments, searches, notifications, supporttickets, agents, providers`; ecommerce: `products, categories, sellers, inventory, carts, cartitems, orders, orderitems, shipments, returns, refunds, reviews, coupons`.
Key indexes: `users.email (unique)`, `sessions.sessionId (unique), {userId,revokedAt}, TTL(expiresAt)`, `messages {conversationId,createdAt}`, `trips {userId,updatedAt}`, `tripstates.tripId (unique)`, `auditlogs {actorId,createdAt}`.
Redis keys: `sess:*` `rl:*` `lock:*` `approval:*` `oauth:state:*` + pub/sub `dw:events` + BullMQ queues.

## 10. Real-time events
Socket.IO (cookie-authenticated handshake, origin check, per-event token/session re-check). Client↔server: `chat:send` → `chat:start / chat:progress / chat:token / chat:done / trip:state / chat:error`. Domain events on the Redis bus (`USER_MESSAGE, AI_RESPONSE, FLIGHT_SEARCH_STARTED/COMPLETED, PRICE_CHANGED, BOOKING_*, PAYMENT_*, REFUND_CREATED …`) fan out to `user:{id}` rooms on any instance. Note: tokens are streamed in chunks of the already-validated reply (grounding check needs the full text).

## 11. API contracts
See `backend/openapi.yaml` (`/api/v1`; `/v2` can mount beside it).

## 12. Roadmap / status
| Phase | Scope | Status |
|---|---|---|
| 1 | Foundation, auth, sessions, RBAC, security, logging | ✅ implemented; verified by 21 integration tests on real Mongo + Redis |
| 2 | Orchestrator, TripState, memory (prefs API), streaming | ✅ implemented; WebSocket path integration-tested. Anthropic/OpenAI/Gemini adapters are unit-tested with stubbed HTTP but **not yet exercised against the live APIs** |
| 3 | Provider abstraction, FlightAgent, search, revalidation | ✅ with Mock; ⚠️ **Akbar mapping pending API spec** |
| 4 | Hotel / Cab / Activity / Itinerary / Budget agents | ⏳ next (extension points ready, UI tabs stubbed honestly) |
| 5 | Booking engine, PaymentService (Razorpay/Stripe), UniversalCart/Order engine | ⏳ (approval gate + booking hook already in place; booking is disabled, never faked) |
| 6 | Live booking updates, notification engine (email/SMS/WhatsApp/push) | ◐ event bus + sockets done |
| 7 | Admin panel UI, support dashboard + handoff, analytics, OTel exporter, load/security test suites | ◐ admin API + metrics done |
| 8 | RAG knowledge base, personalization | ⏳ (FAQ intentionally refuses until RAG exists) |
| 9 | Ecommerce domains | ⏳ (registries ready) |


## 13. Verification status (what is actually proven)
- **77 unit tests**: JWT attacks, RBAC, password/crypto, prompt-injection guard, tool-permission layer (approvals bound to input, single use), provider resilience (retry/timeout/circuit breaker/fallback), Akbar mapper, date/language resolvers, orchestrator behaviour, LLM adapters (stubbed HTTP).
- **21 integration tests** on real MongoDB + Redis: registration/verification, lockout, CSRF, refresh rotation + reuse detection + multi-tab race, device revocation, password reset, RBAC, immutable audit log, IDOR, distributed lock, full conversation persistence, Socket.IO handshake/streaming/rate-limit/revocation.
- `next build` + ESLint + `tsc` pass; production server verified to serve every route with a per-request CSP nonce.
- `npm audit --omit=dev`: 0 vulnerabilities (Next.js 16.4, nodemailer 10).
- **Not yet verified**: live Akbar API (needs spec + credentials), live LLM providers, real SMTP, Google OAuth round-trip, load testing, a real browser E2E.

## 14. Lessons encoded as rules
- `mongoose.set('sanitizeFilter', true)` wraps `$` operators; internal operator queries must use `trusted({...})`.
- Never persist `undefined`/`null` for optional state fields: `ignoreUndefined` at the driver + `stripNullish` on save/load.
- Rate-limit key functions run before validation — they must never assume body types.
- `TRUST_PROXY_HOPS` must equal the number of real proxies in front of the API, otherwise `X-Forwarded-For` can be spoofed.
