# Production checklist (do these before real users)

## Secrets & config
- [ ] Generate **new** secrets per environment (`npm run secrets`); dev/staging/prod must never share secrets, DBs, Redis or payment keys.
- [ ] Store secrets in your platform's secret manager (not in the repo, not in images).
- [ ] Rotate any key that was ever shared outside your machine (e.g. in a zip or chat).
- [ ] `NODE_ENV=production`, `TRAVEL_PROVIDER_MODE=production`, `LLM_PROVIDER` = a real provider (the API refuses to boot with mock modes in production).
- [ ] `FRONTEND_ORIGIN=https://app.yourdomain.com`, `COOKIE_DOMAIN=.yourdomain.com` (app + api on sibling subdomains, HTTPS only).
- [ ] `TRUST_PROXY_HOPS` = number of load balancers/proxies in front of the API.
- [ ] `NEXT_PUBLIC_API_URL=https://api.yourdomain.com` at **build time** of the frontend image.

## Infrastructure
- [ ] MongoDB replica set with auth + TLS + automated backups (point-in-time restore tested). Create indexes via a migration job (autoIndex is off in prod).
- [ ] Redis with auth + TLS + persistence (sessions flags, rate limits, approvals, queues live here).
- [ ] Run API (≥2 instances) and the worker (`npm run start:worker`) as separate deployments; `RUN_WORKERS_INLINE=false`.
- [ ] TLS termination + WAF/CDN in front; sticky sessions are **not** required.
- [ ] Ship logs/metrics: scrape `/metrics` (bearer `METRICS_TOKEN`) or add an OpenTelemetry collector; alert on provider failure rate, 5xx, auth failures, `security_events_total`.
- [ ] Ship the `auditlogs` collection to immutable/WORM storage.

## Integrations
- [ ] **Akbar Travels**: provide the API spec, then finish `backend/src/providers/akbar/{endpoints,client,mapper}.ts`; test against their sandbox.
- [ ] SMTP provider (SPF/DKIM/DMARC) for verification + reset emails.
- [ ] Google OAuth: authorized redirect URI = `https://api.yourdomain.com/api/v1/auth/google/callback`.
- [ ] LLM key with a spend limit; set `LLM_PRICE_PER_MTOK_JSON` to track cost.

## Before enabling payments (Phase 5)
- [ ] Payment gateway webhooks with signature verification + idempotency keys; refunds; reconciliation job.
- [ ] Pen-test, load test, privacy policy / T&Cs / refund policy, PCI scope review (use hosted checkout so card data never touches your servers).
