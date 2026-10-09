import type { Location } from './types';

interface Entry { city: string; code: string; country: string; aliases: string[] }
const E: Entry[] = [
  { city: 'Jaipur', code: 'JAI', country: 'IN', aliases: ['jaipur', 'jaypur', 'जयपुर'] },
  { city: 'Delhi', code: 'DEL', country: 'IN', aliases: ['delhi', 'new delhi', 'dilli', 'दिल्ली'] },
  { city: 'Mumbai', code: 'BOM', country: 'IN', aliases: ['mumbai', 'bombay', 'मुंबई'] },
  { city: 'Goa', code: 'GOI', country: 'IN', aliases: ['goa', 'गोवा'] },
  { city: 'Bengaluru', code: 'BLR', country: 'IN', aliases: ['bengaluru', 'bangalore', 'blr', 'बेंगलुरु'] },
  { city: 'Hyderabad', code: 'HYD', country: 'IN', aliases: ['hyderabad', 'हैदराबाद'] },
  { city: 'Chennai', code: 'MAA', country: 'IN', aliases: ['chennai', 'madras', 'சென்னை'] },
  { city: 'Kolkata', code: 'CCU', country: 'IN', aliases: ['kolkata', 'calcutta', 'কলকাতা'] },
  { city: 'Kochi', code: 'COK', country: 'IN', aliases: ['kochi', 'cochin'] },
  { city: 'Ahmedabad', code: 'AMD', country: 'IN', aliases: ['ahmedabad'] },
  { city: 'Pune', code: 'PNQ', country: 'IN', aliases: ['pune'] },
  { city: 'Lucknow', code: 'LKO', country: 'IN', aliases: ['lucknow'] },
  { city: 'Udaipur', code: 'UDR', country: 'IN', aliases: ['udaipur'] },
  { city: 'Dubai', code: 'DXB', country: 'AE', aliases: ['dubai', 'dxb', 'दुबई'] },
  { city: 'Abu Dhabi', code: 'AUH', country: 'AE', aliases: ['abu dhabi'] },
  { city: 'Singapore', code: 'SIN', country: 'SG', aliases: ['singapore'] },
  { city: 'Bangkok', code: 'BKK', country: 'TH', aliases: ['bangkok'] },
  { city: 'Bali', code: 'DPS', country: 'ID', aliases: ['bali', 'denpasar'] },
  { city: 'London', code: 'LHR', country: 'GB', aliases: ['london'] },
  { city: 'Paris', code: 'CDG', country: 'FR', aliases: ['paris'] },
  { city: 'New York', code: 'JFK', country: 'US', aliases: ['new york', 'nyc'] },
  { city: 'Kathmandu', code: 'KTM', country: 'NP', aliases: ['kathmandu'] },
  { city: 'Colombo', code: 'CMB', country: 'LK', aliases: ['colombo'] },
];

/** Static seed list. In production back this with the provider's location/autocomplete API + a cached airports table. */
export function resolveLocation(name: string | undefined): Location | undefined {
  if (!name) return undefined;
  const n = name.trim().toLowerCase();
  const byCode = /^[a-z]{3}$/.test(n) ? E.find((e) => e.code.toLowerCase() === n) : undefined;
  const hit = byCode ?? E.find((e) => e.aliases.includes(n));
  return hit ? { city: hit.city, code: hit.code, country: hit.country } : undefined;
}

export interface Mention { loc: Location; index: number; end: number }
/** Find all known place mentions in text, longest alias first, in order of appearance. */
export function findMentions(text: string): Mention[] {
  const lower = text.toLowerCase();
  const all: Mention[] = [];
  const aliases = E.flatMap((e) => e.aliases.map((a) => ({ a, e }))).sort((x, y) => y.a.length - x.a.length);
  const taken: Array<[number, number]> = [];
  for (const { a, e } of aliases) {
    if (a.length === 3 && !/^[a-z]+$/.test(a)) continue;
    const re = new RegExp(`(?<![\\p{L}\\p{N}])${a.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}\\p{N}])`, 'gu');
    for (const m of lower.matchAll(re)) {
      const s = m.index!, en = s + a.length;
      if (taken.some(([ts, te]) => s < te && en > ts)) continue;
      taken.push([s, en]);
      all.push({ loc: { city: e.city, code: e.code, country: e.country }, index: s, end: en });
    }
  }
  return all.sort((a, b) => a.index - b.index);
}
