import type { Understanding } from './types';
import { findMentions } from './locations';
import { todayIST } from '../utils/time';

/**
 * Deterministic multilingual extractor (English / Hinglish / Hindi). Used (a) in MOCK LLM mode and
 * (b) as the safety-net when the real LLM is down or returns invalid JSON. Real LLMs handle the other Indian languages.
 */
export type Expecting = 'origin' | 'destination' | 'date' | 'travellers' | undefined;

import { resolveLanguage } from './languageResolver';
import { extractDate } from './dateExtraction';

export const detectLanguage = (t: string): string => resolveLanguage(t).language;
export const parseDate = (t: string, today = todayIST()): string | undefined => extractDate(t, today);

function parseMoney(t: string): number | undefined {
  const s = t.toLowerCase().replace(/,/g, '');
  const unit = (n: number, u?: string) => (!u ? n : /^(lakh|lac|lakhs|l)$/.test(u) ? n * 1e5 : /^(k|hazar|hazaar)$/.test(u) ? n * 1e3 : /^(crore|cr)$/.test(u) ? n * 1e7 : n);
  let m = s.match(/(?:₹|rs\.?|inr)\s*(\d+(?:\.\d+)?)\s*(lakhs?|lac|l|k|crore|cr)?\b/);
  if (m) return unit(Number(m[1]), m[2]);
  m = s.match(/\b(\d+(?:\.\d+)?)\s*(lakhs?|lac|k|crore|cr|hazar|hazaar)\b/);
  if (m) return unit(Number(m[1]), m[2]);
  m = s.match(/(?:budget|under|within|upto|up to|andar|tak|around|approx|about)\D{0,12}(\d{4,9})\b|\b(\d{4,9})\s*(?:budget|tak|ke andar|inr|rupees|rupaye)/);
  if (m) return Number(m[1] ?? m[2]);
  return undefined;
}

export interface KnownTrip { origin?: string; destination?: string }
export function heuristicUnderstand(text: string, opts: { expecting?: Expecting; today?: string; known?: KnownTrip } = {}): Understanding {
  const t = text.trim();
  const s = t.toLowerCase();
  const today = opts.today ?? todayIST();
  const language = detectLanguage(t);
  const out: Understanding = { intent: 'OTHER', language, services: [] };

  // --- places ---
  const mentions = findMentions(t);
  const known = opts.known ?? {};
  if (mentions.length >= 2) {
    const [a, b] = mentions;
    const between = s.slice(a!.end, b!.index);
    const before = s.slice(Math.max(0, a!.index - 8), a!.index);
    const replaceAfter = /\b(ki jagah|ke bajay|ke badle|ki bajaye)\b/.test(between);   // "X ki jagah Y"  => Y is new
    const replaceBefore = /\b(instead of|rather than|not)\b/.test(between);              // "Y instead of X" => Y is new
    const marker = /\b(to|se)\b|->|→|>|\s-\s/.test(between) || /\bfrom\b/.test(before);
    if (replaceAfter) out.destination = b!.loc.city;
    else if (replaceBefore) out.destination = a!.loc.city;
    else if (marker) { out.origin = a!.loc.city; out.destination = b!.loc.city; }
    else if (/\b(to|se)\b/.test(s.slice(0, a!.index))) { out.destination = a!.loc.city; out.origin = b!.loc.city; }
    else if (known.origin || known.destination) {
      // No route marker and we already know the trip: treat it as a destination change, never silently swap the origin.
      const fresh = [...mentions].reverse().find((m) => m.loc.city !== known.origin);
      if (fresh) out.destination = fresh.loc.city;
    } else { out.origin = a!.loc.city; out.destination = b!.loc.city; }
  } else if (mentions.length === 1) {
    const m = mentions[0]!;
    const after = s.slice(m.end, m.end + 8);
    const before = s.slice(Math.max(0, m.index - 8), m.index);
    if (opts.expecting === 'origin' && !/\bto\s*$/.test(before)) out.origin = m.loc.city;
    else if (/\bfrom\s*$/.test(before) || /^\s*se\b/.test(after)) out.origin = m.loc.city;
    else out.destination = m.loc.city;
  }

  // --- dates / duration ---
  out.departureDate = parseDate(t, today);
  const dur = s.match(/(\d{1,2})\s*-?\s*(?:day|days|din|night|nights|raat)\b/);
  if (dur) out.durationDays = Math.min(90, Math.max(1, Number(dur[1])));
  const ret = s.match(/\b(?:return(?:ing)?|back|wapas|vapas)\b[^.]*$/);
  if (ret) { const rd = parseDate(ret[0], today); if (rd && rd !== out.departureDate) out.returnDate = rd; }

  // --- travellers ---
  const adults = s.match(/(\d)\s*(?:adults?|people|persons?|travell?ers?|log|jan|members?|pax|passengers?)\b/);
  if (adults) out.adults = Number(adults[1]);
  else if (/\b(couple|honeymoon)\b/.test(s)) out.adults = 2;
  else if (/\b(solo|alone|akela|akele|myself)\b/.test(s)) out.adults = 1;
  const kids = s.match(/(\d)\s*(?:child|children|kids?|bacch[ae]|bachch[ae])\b/);
  if (kids) out.children = Number(kids[1]);
  if (opts.expecting === 'travellers' && out.adults === undefined) { const n = s.match(/^\D*(\d)\D*$/); if (n) out.adults = Number(n[1]); }

  // --- budget ---
  const money = parseMoney(t);
  if (money && money >= 500) { out.budgetAmount = money; out.budgetCurrency = 'INR'; }

  // --- services ---
  if (/flight|flights|fly|flying|airfare|air ticket|ticket|udaan|hawai/.test(s)) out.services.push('FLIGHT');
  if (/hotel|resort|stay|room|villa/.test(s)) out.services.push('HOTEL');
  if (/\b(cab|taxi|transfer|pickup|pick-up|airport drop)\b/.test(s)) out.services.push('CAB');
  if (/activit|sightseeing|tour|experience|things to do|desert safari|adventure/.test(s)) out.services.push('ACTIVITY');
  if (/insurance|bima/.test(s)) out.services.push('INSURANCE');
  if (/\bvisa\b/.test(s)) out.services.push('VISA');

  // --- preferences ---
  if (/\b(cheap|cheapest|sasti|sasta|lowest|least expensive)\b/.test(s)) out.sortPreference = 'cheapest';
  else if (/\b(fastest|quickest|jaldi|shortest|non-?stop|direct)\b/.test(s)) out.sortPreference = 'fastest';
  else if (/\b(best value|balanced|best option)\b/.test(s)) out.sortPreference = 'best_value';

  // --- selection ---
  const ord: Array<[RegExp, string]> = [[/\b(first|1st|pehla|pehli|pahla)\b/, '1'], [/\b(second|2nd|doosra|dusra|doosri)\b/, '2'], [/\b(third|3rd|teesra|tisra)\b/, '3']];
  const num = s.match(/\b(?:option|number|no\.?|#|flight)\s*(\d)\b/);
  const sel = num?.[1] ?? ord.find(([re]) => re.test(s))?.[1];
  const selVerb = /\b(select|choose|pick|take|book|go with|i('| wi)ll take|le lo|lelo|ye wala|yeh wala|isko|iska)\b/.test(s);
  if (sel && (selVerb || /^\s*(option|number|#|no\.?)/.test(s))) out.selection = sel;
  else if (selVerb && out.sortPreference) out.selection = out.sortPreference;

  // --- intent ---
  const hasRoute = Boolean(out.origin || out.destination);
  if (/^\s*(hi+|hello+|hey+|namaste|namaskar|hola|good (morning|evening|afternoon))\W*$/i.test(t)) out.intent = 'SMALLTALK';
  else if (/\b(human|real person|support agent|customer care|complaint|speak to (an )?agent)\b/.test(s)) out.intent = 'SUPPORT';
  else if (/\b(cancel|refund)\b/.test(s) && /\b(booking|ticket|trip|flight|my)\b/.test(s)) out.intent = 'CANCEL';
  else if (out.selection) out.intent = 'SELECT_OPTION';
  else if (/\b(book|proceed|confirm|pay|payment|buy|reserve)\b|book (kar|karo)\b/.test(s) && !hasRoute) out.intent = 'BOOK';
  else if (/\b(visa|baggage|policy|rules|allowed|documents? required)\b/.test(s) && !hasRoute) out.intent = 'FAQ';
  else if (/\b(plan|trip|itinerary|honeymoon|package|holiday|vacation|tour)\b/.test(s) || out.services.length > 1) out.intent = 'PLAN_TRIP';
  else if (out.services.includes('HOTEL') && !out.services.includes('FLIGHT')) out.intent = 'SEARCH_HOTEL';
  else if (out.services.includes('FLIGHT') || hasRoute || out.departureDate) out.intent = 'SEARCH_FLIGHT';
  else if (opts.expecting && (out.adults || out.departureDate || out.budgetAmount)) out.intent = 'MODIFY_TRIP';
  return out;
}
