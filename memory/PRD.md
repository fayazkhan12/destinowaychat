# DestinoWay Intelligent Travel Agent — Product Memory

## Original problem statement
User wants a highly intelligent, scalable travel agent for flights, hotels, buses and cabs. It should understand any language and reply in that language through text and voice, with only a future Akbar Travels API configuration needed to move from demo data to live travel inventory. The existing DestinoWay project and uploaded travel API collection should be preserved and expanded.

## Architecture decisions
- React frontend remains on the provided CRA environment and uses the protected `REACT_APP_BACKEND_URL`.
- FastAPI backend remains on port 8001 and uses the protected MongoDB connection.
- Travel inventory is behind a stable service-shaped API (`/api/travel/search`) so the current DEMO provider can be replaced by Akbar without changing the UI contract.
- Gemini-capable AI is accessed through the Emergent universal key and streamed through SSE at `/api/chat/stream`.
- Browser SpeechRecognition and SpeechSynthesis provide voice input and spoken replies without a second voice vendor key.
- Saved trips and chat messages persist in MongoDB; saved trips expose safe share IDs and never return MongoDB `_id` values.

## Personas
- Independent traveller planning in English, Hindi, Hinglish or another familiar language.
- Family or couple comparing price, duration and convenience across transport and stays.
- Travel advisor who wants a polished conversational workspace and a clean handoff to a provider.

## Core requirements (static)
- Search flights, hotels, buses and cabs.
- Compare and filter options with clear demo/live labeling.
- Conversational multilingual travel planning by text and browser voice.
- Itinerary pinning, save/share links and provider booking handoff.
- Provider abstraction so future Akbar credentials are the only integration configuration change.

## What's been implemented

### 2026-10-09
- Replaced the starter screen with a luxury, responsive DestinoWay travel workspace.
- Added DEMO searches for all four services with service tabs, result cards, price, duration, ratings and pin-to-trip behavior.
- Added Gemini-backed streaming AI concierge with same-language intent and graceful fallback messaging.
- Added browser microphone input, automatic spoken AI replies, language toggle, suggestions and accessible test IDs.
- Added MongoDB-backed trip save/share endpoints and persisted chat records.
- Added DEMO mode labeling so no mock option is presented as a real booking.
- Validated backend search, persistence, SSE chat, desktop UI, mobile layout, voice capability handling and no horizontal overflow.
- Fixed singular trip-board copy for one pinned pick.

## Prioritized backlog
- P0: Add the real Akbar Travels adapter behind the existing travel search contract.
- P0: Add provider-specific deep-link mapping and live availability/revalidation safeguards.
- P1: Add richer itinerary day cards with drag ordering, notes and per-day budget.
- P1: Add authenticated accounts and private saved-trip ownership.
- P2: Add live maps, destination imagery and collaborative trip editing.

## P0/P1/P2 remaining and next tasks
- P0: Configure Akbar credentials and map the supplied hotel collection into the provider adapter.
- P0: Expand live provider coverage from flight-only assumptions to hotel, bus and cab contracts.
- P1: Add result filters for price, duration, stops, rating and cancellation.
- P1: Add explicit share-link route rendering and copy-to-clipboard confirmation.
- P2: Add voice language auto-detection and richer spoken response controls.