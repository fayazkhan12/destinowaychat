/** Input hygiene + prompt-injection heuristics. Detection is advisory: the REAL defence is architectural (LLM can't call tools, outputs are schema-validated, money is only from tool results). */
const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u200b-\u200f\u202a-\u202e\u2066-\u2069]/g; // control + zero-width + bidi override chars

export function sanitizeUserText(raw: string, max = 2000): string {
  return raw.normalize('NFKC').replace(CONTROL, '').replace(/\s+/g, ' ').trim().slice(0, max);
}

const INJECTION = [
  /ignore (all |any )?(previous|prior|above) (instructions|prompts?|rules)/i,
  /disregard (the )?(system|previous) (prompt|instructions)/i,
  /(reveal|show|print|repeat|leak) (me )?(your |the )?(system|hidden|initial) (prompt|instructions|message)/i,
  /you are now (dan|developer mode|jailbroken)/i,
  /\b(act as|pretend to be) (an? )?(unrestricted|admin|root|developer)/i,
  /(api[_ -]?key|secret|password|jwt|token)s?\b.{0,20}\b(show|print|give|send|reveal)/i,
  /(show|print|give|send|reveal|tell)( me)?( the| your)? (api[_ -]?keys?|secrets?|passwords?|jwt|tokens?|credentials)/i,
  /<\s*\/?\s*(system|assistant|tool)\s*>/i,
  /\b(execute|run)\b.{0,20}\b(command|shell|bash|sql|script)\b/i,
];
export function looksLikeInjection(text: string): boolean { return INJECTION.some((r) => r.test(text)); }

/** Provider-/tool-sourced strings are untrusted too (indirect injection): strip markup & control chars, cap length. */
export function sanitizeExternalText(s: string, max = 80): string {
  return s.replace(CONTROL, '').replace(/[<>`{}]/g, '').replace(/\s+/g, ' ').trim().slice(0, max);
}

/** Output validation: every ₹/INR amount in an LLM-written reply must exist in the verified facts. */
export function amountsInText(text: string): number[] {
  const out: number[] = [];
  for (const m of text.matchAll(/(?:₹|rs\.?\s?|inr\s?)\s*([\d,]+(?:\.\d+)?)/gi)) out.push(Number(m[1]!.replace(/,/g, '')));
  return out;
}
export function replyAmountsAreGrounded(text: string, allowed: Iterable<number>): boolean {
  const set = new Set(allowed);
  return amountsInText(text).every((a) => set.has(a));
}
const URL_RE = /\bhttps?:\/\/[^\s)]+/gi;
export const containsUrl = (t: string) => URL_RE.test(t);
