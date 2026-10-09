/**
 * ============================ ADAPT TO AKBAR'S API DOCUMENTATION ============================
 * Paths, auth scheme and payload/response shapes below are PLACEHOLDERS because the real Akbar
 * Travels API specification was not available while building this scaffold.
 * Only THIS folder (akbar/) needs to change once you have the spec:
 *   - endpoints.ts  -> real paths + HTTP methods
 *   - client.ts     -> real auth (API key header / bearer login / HMAC ...)
 *   - mapper.ts     -> real response -> internal FlightOffer mapping (zod-validated)
 * The orchestrator, agents, tools, UI and tests never see Akbar's format.
 * ===========================================================================================
 */
export const AKBAR_ENDPOINTS = {
  search: { method: 'POST', path: '/flights/search' },
  details: { method: 'POST', path: '/flights/details' },
  availability: { method: 'POST', path: '/flights/availability' },
  revalidate: { method: 'POST', path: '/flights/reprice' },
  createBooking: { method: 'POST', path: '/bookings' },
  confirmBooking: { method: 'POST', path: '/bookings/:id/confirm' },
  cancelBooking: { method: 'POST', path: '/bookings/:id/cancel' },
  getBooking: { method: 'GET', path: '/bookings/:id' },
  health: { method: 'GET', path: '/health' },
} as const;
