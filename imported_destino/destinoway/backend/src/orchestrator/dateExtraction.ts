import { addDays, getTodayInIndia, resolveRelativeDate } from '../utils/dateResolver';

const MONTHS: Record<string, number> = { jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4, may: 5, jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9, september: 9, oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12 };
const MONTH_RE = Object.keys(MONTHS).sort((a, b) => b.length - a.length).join('|');
const WEEKDAYS = 'sunday|sun|monday|mon|tuesday|tue|wednesday|wed|thursday|thu|friday|fri|saturday|sat|ravivaar|ravivar|somvaar|somvar|mangalvaar|mangalvar|budhvaar|budhvar|guruvaar|guruvar|shukravaar|shukravar|shanivaar|shanivar';
const pad = (n: number) => String(n).padStart(2, '0');

function valid(y: number, m: number, d: number): string | undefined {
  if (m < 1 || m > 12 || d < 1 || d > 31) return undefined;
  const iso = `${y}-${pad(m)}-${pad(d)}`;
  const dt = new Date(iso + 'T00:00:00Z');
  return dt.getUTCFullYear() === y && dt.getUTCMonth() + 1 === m && dt.getUTCDate() === d ? iso : undefined; // rejects 31 Feb etc.
}

/** Absolute dates: "15 November", "Nov 15", "15/11", "15-11-2026", "2026-11-15". Past dates roll to next year unless a year was given. */
export function extractAbsoluteDate(text: string, today = getTodayInIndia()): string | undefined {
  const s = text.toLowerCase();
  const [ty, tm, td] = today.split('-').map(Number) as [number, number, number];
  const roll = (m: number, d: number, y?: number) => {
    let year = y ?? ty;
    if (!y && (m < tm || (m === tm && d < td))) year = ty + 1;
    return valid(year, m, d);
  };
  let m = s.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/); if (m) return valid(+m[1]!, +m[2]!, +m[3]!);
  m = s.match(new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s*(?:of\\s*)?(${MONTH_RE})\\b(?:\\s*,?\\s*(\\d{4}))?`)); if (m) return roll(MONTHS[m[2]!]!, +m[1]!, m[3] ? +m[3] : undefined);
  m = s.match(new RegExp(`\\b(${MONTH_RE})\\s*(\\d{1,2})(?:st|nd|rd|th)?\\b(?:\\s*,?\\s*(\\d{4}))?`)); if (m) return roll(MONTHS[m[1]!]!, +m[2]!, m[3] ? +m[3] : undefined);
  m = s.match(/\b(\d{1,2})[\/\-.](\d{1,2})(?:[\/\-.](\d{2,4}))?\b/);
  if (m) return roll(+m[2]!, +m[1]!, m[3] ? (m[3].length === 2 ? 2000 + +m[3] : +m[3]) : undefined);
  return undefined;
}

const REL_PATTERNS: RegExp[] = [
  /\bday after tomorrow\b/, /\bparso\b|\bparson\b/, /\btomorrow\b|\btmrw\b/, /\bkal\b/, /\btoday\b|\baaj\b/,
  /\bin\s+\d{1,3}\s+days?\b/, /\b\d{1,3}\s+days?\s+later\b/,
  new RegExp(`\\b(?:next|coming|agle|this|is)\\s+(?:${WEEKDAYS})\\b`),
  /\b(?:this|next|is|ye|iss|agle)\s+weekend\b/,
];
/** Relative dates found *inside* a sentence, resolved by the deterministic IST date resolver. */
export function extractRelativeDate(text: string, today = getTodayInIndia()): string | undefined {
  const s = text.toLowerCase().replace(/\s+/g, ' ');
  const dinBaad = s.match(/\b(\d{1,3})\s+din\s+(?:baad|mein|me)\b/); // "5 din baad" = in 5 days
  if (dinBaad) return addDays(today, +dinBaad[1]!);
  for (const re of REL_PATTERNS) {
    const m = s.match(re);
    if (m) { const r = resolveRelativeDate(m[0], today); if (r) return r.date; }
  }
  return undefined;
}

export function extractDate(text: string, today = getTodayInIndia()): string | undefined {
  return extractAbsoluteDate(text, today) ?? extractRelativeDate(text, today);
}
