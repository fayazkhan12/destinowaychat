import type { ApprovalStore, Approval } from '../tools/approvalStore';
import { canonicalize } from '../utils/canonical';
import { sha256 } from '../utils/crypto';

/** Human-in-the-loop. Approval is bound to exact user + trip + tool + input hash, expires in 10 min and can be spent once. */
export class ConfirmationManager {
  constructor(private store: ApprovalStore) {}
  request(p: { userId: string; tripId: string; toolId: string; input: unknown; summary: string; amount?: number; currency?: string }): Promise<Approval> {
    return this.store.create({ userId: p.userId, tripId: p.tripId, toolId: p.toolId, inputHash: sha256(canonicalize(p.input)), summary: p.summary, amount: p.amount, currency: p.currency });
  }
  pending(tripId: string, userId: string) { return this.store.pendingForTrip(tripId, userId); }
  grant(id: string, userId: string) { return this.store.grant(id, userId); }
  decline(id: string, userId: string) { return this.store.decline(id, userId); }
}

const YES = /^\s*(yes|y|yeah|yep|yup|sure|ok(ay)?|confirm(ed)?|proceed|go ahead|do it|haan|han|ha|haa|ji|ji haan|theek hai|thik hai|kar do|karo|kardo|sahi hai|हाँ|हां|जी|ஆம்|అవును|হ্যাঁ|होय|હા|ಹೌದು|അതെ)\W*$/i;
const NO = /^\s*(no|n|nope|nah|cancel|stop|don'?t|not now|nahi|nahin|nhi|mat karo|ruko|रुको|नहीं|नही|இல்லை|కాదు|না|नाही|ના|ಇಲ್ಲ|അല്ല)\W*$/i;
/** Deterministic - never delegated to an LLM, so injected text can never "say yes" for the user. */
export const isAffirmative = (t: string) => YES.test(t);
export const isNegative = (t: string) => NO.test(t);
