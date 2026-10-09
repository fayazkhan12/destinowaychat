# DestinoWay — Premium Multilingual Travel Agent (V2)

## Original problem statement
User wants a production-grade PanJourney-inspired travel agent. Supports flights, hotels, buses, cabs with full search → detail → checkout flow. Multilingual AI concierge (text + voice) in Hindi, Hinglish, Bengali, Tamil, Telugu, English, Marathi. Razorpay checkout. Google + Email/Password login. Only Akbar/Travelportal API credentials should be needed to switch from demo to live inventory.

## Architecture
- React 19 + react-router-dom v7 frontend (modular pages/components, Shadcn UI pieces for Toaster, Playfair Display + Manrope typography, premium dark luxury theme).
- FastAPI backend on 0.0.0.0:8001 behind /api, Motor async MongoDB, service-shaped `/api/travel/search` with pluggable Akbar/Travelportal hotel adapter.
- Auth: JWT (bcrypt) for email/password + Emergent-managed Google OAuth with session cookie + JWT fallback. Unified `_user_from_request` resolves either.
- Payments: Razorpay orders + verify + webhook; demo-confirm path when keys missing so flow is still testable.
- AI concierge: Gemini 3.1 Pro via Emergent LLM key, streaming SSE; multilingual auto-detect; browser native SpeechRecognition + SpeechSynthesis.

## Personas
- Indian/global traveller who prefers chatting in their native language.
- Family / honeymoon couple comparing flight + hotel combos.
- Travel advisor sharing curated trip links with clients.

## Core requirements (static)
- Unified search for flights/hotels/buses/cabs with filters and sort.
- Hotel adapter (Akbar/Travelportal) plugs in by env (`AKBAR_API_HOST`, `AKBAR_API_TOKEN`, `AKBAR_SESSION_KEY`, `AKBAR_AGENT_CODE`, `AKBAR_API_WC_HOST`).
- Razorpay INR checkout with signature verification + webhook idempotency.
- Multilingual AI chat + browser voice input/output.
- Saved trips with shareable links, booking history, user profile.

## What's been implemented
### 2026-02-10
- Replaced V1 monolith with modular V2 PanJourney-style app: Home, Results, Detail, Checkout, BookingConfirm, Dashboard, Login, AuthCallback, TripShare, floating AIConcierge.
- Backend overhaul: auth (JWT + Emergent Google), featured destinations/collections, search cache, bookings, Razorpay order/verify/webhook with demo fallback, Gemini 3.1 Pro SSE chat.
- Added `httpx`, `razorpay`, `bcrypt`, `pyjwt` to requirements. Razorpay 2.0.1 + setuptools installed.
- 100% backend + 100% frontend e2e tests passed via testing agent.

## Prioritized backlog
- P0: User to upload Akbar WSDL/Postman + credentials → wire remaining flight/bus/cab adapters (hotel contract already mapped).
- P0: User to provide Razorpay test key_id/secret → live checkout.
- P1: Rich hotel detail (gallery, room options, cancellation grid) once live API returns inventory.
- P1: Add server-side search caching so detail links survive new sessions.
- P1: Ownership check on `/api/bookings/demo-confirm` and `/api/trips`.
- P2: Richer voice (whisper STT fallback), language toggle in UI, booking email via Resend.

## Next tasks
- Wait for Akbar API docs + Razorpay keys from user; then flip adapter envs.
- Add admin dashboard for operators to see bookings pipeline.
