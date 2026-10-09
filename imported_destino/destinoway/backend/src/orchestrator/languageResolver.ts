/**
 * Language detection for Destinoway (no external dependency, no ESM issues).
 * Native-script languages are identified from their Unicode block with ~certainty; Romanised Hindi ("Hinglish") from a
 * marker lexicon; everything else defaults to English. Real LLM mode additionally returns its own language tag.
 */
export type SupportedLanguage = 'en' | 'hi' | 'hinglish' | 'ta' | 'te' | 'bn' | 'mr' | 'gu' | 'kn' | 'ml' | 'pa' | 'ur' | 'other';

export interface LanguageResult { language: SupportedLanguage; confidence: number; script: string; isRomanized: boolean }

const SCRIPTS: Array<[string, RegExp, SupportedLanguage]> = [
  ['Devanagari', /[\u0900-\u097F]/u, 'hi'], ['Tamil', /[\u0B80-\u0BFF]/u, 'ta'], ['Telugu', /[\u0C00-\u0C7F]/u, 'te'],
  ['Bengali', /[\u0980-\u09FF]/u, 'bn'], ['Gujarati', /[\u0A80-\u0AFF]/u, 'gu'], ['Kannada', /[\u0C80-\u0CFF]/u, 'kn'],
  ['Malayalam', /[\u0D00-\u0D7F]/u, 'ml'], ['Gurmukhi', /[\u0A00-\u0A7F]/u, 'pa'], ['Arabic', /[\u0600-\u06FF]/u, 'ur'],
];
const OTHER_SCRIPTS = /[\u4E00-\u9FFF\u3040-\u30FF\uAC00-\uD7AF\u0400-\u04FF\u0370-\u03FF\u0590-\u05FF\u0E00-\u0E7F]/u;

// Devanagari is shared by Hindi and Marathi: tell them apart by common Marathi function words.
const MARATHI_MARKERS = /(आहे|आहेत|मला|तुम्ही|पाहिजे|हवे|हवी|करायचे|जायचे|नाही\b|कृपया|आणि|मध्ये|साठी|ला जा)/u;

const HINGLISH = new Set(['mujhe', 'mujhko', 'mera', 'meri', 'mere', 'aap', 'aapka', 'aapki', 'apka', 'apki', 'hai', 'hain', 'ho', 'hoga', 'hogi', 'karna', 'karni', 'karne', 'karo', 'krna', 'krni', 'krne', 'kardo', 'chahiye', 'chaiye', 'chahta', 'chahti', 'chahte', 'jana', 'jaana', 'jaa', 'kaha', 'kahan', 'kahaan', 'kab', 'kitna', 'kitne', 'kitni', 'wala', 'wali', 'wale', 'se', 'mein', 'ke', 'ka', 'ki', 'ko', 'liye', 'batao', 'btao', 'dikhao', 'dikha', 'dikhana', 'sasti', 'sasta', 'nahi', 'nahin', 'haan', 'han', 'kal', 'aaj', 'parso', 'din', 'raat', 'log', 'bhi', 'abhi', 'tak', 'andar', 'jagah', 'sakta', 'sakti', 'sakte', 'lakh', 'hazar', 'bacche', 'bachche', 'akela', 'akele', 'kya', 'kaise', 'aur', 'ye', 'yeh', 'wo', 'woh', 'isko', 'iska', 'lelo', 'karo', 'baad']);
const EN_MARKERS = new Set(['the', 'to', 'from', 'for', 'and', 'with', 'i', 'want', 'need', 'please', 'flight', 'flights', 'hotel', 'trip', 'plan', 'cheapest', 'cheap', 'book', 'show', 'find', 'me', 'my', 'on', 'in', 'under', 'budget', 'people', 'adults', 'tomorrow', 'today', 'next', 'a', 'an', 'is', 'are', 'can', 'you', 'of']);

export function detectScript(text: string): string {
  for (const [name, re] of SCRIPTS) if (re.test(text)) return name;
  if (OTHER_SCRIPTS.test(text)) return 'Other';
  return /\p{L}/u.test(text) ? 'Latin' : 'None';
}

export function resolveLanguage(text: string): LanguageResult {
  const t = text.replace(/\s+/g, ' ').trim();
  if (!t) return { language: 'en', confidence: 0, script: 'None', isRomanized: false };
  const script = detectScript(t);
  if (script === 'Devanagari') return { language: MARATHI_MARKERS.test(t) ? 'mr' : 'hi', confidence: 0.97, script, isRomanized: false };
  const native = SCRIPTS.find(([n]) => n === script);
  if (native) return { language: native[2], confidence: 0.97, script, isRomanized: false };
  if (script === 'Other') return { language: 'other', confidence: 0.6, script, isRomanized: false };
  if (script === 'None') return { language: 'en', confidence: 0.2, script, isRomanized: false };

  const words = t.toLowerCase().replace(/[^\p{L}\s]/gu, ' ').split(/\s+/).filter(Boolean);
  const hi = words.filter((w) => HINGLISH.has(w)).length;
  const en = words.filter((w) => EN_MARKERS.has(w)).length;
  // ≥2 Hindi function words (or ≥20% of a short message) and more Hindi than English markers => Hinglish.
  if (hi >= 2 && hi >= en && hi / words.length >= 0.15) return { language: 'hinglish', confidence: Math.min(0.95, 0.6 + hi / words.length), script: 'Latin', isRomanized: true };
  if (hi >= 1 && words.length <= 3 && en === 0) return { language: 'hinglish', confidence: 0.55, script: 'Latin', isRomanized: true };
  return { language: 'en', confidence: en ? 0.9 : 0.5, script: 'Latin', isRomanized: false };
}
