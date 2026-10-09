export type Tier = 'fast' | 'medium' | 'advanced';
export interface LLMMessage { role: 'user' | 'assistant'; content: string }
export interface LLMRequest { tier: Tier; system: string; messages: LLMMessage[]; maxTokens?: number; json?: boolean; temperature?: number; signal?: AbortSignal }
export interface LLMResponse { text: string; model: string; usage: { inputTokens: number; outputTokens: number }; latencyMs: number }

/** Orchestrator depends ONLY on this interface - never on a vendor SDK/format. */
export interface LLMProviderInterface {
  readonly name: string;
  readonly isMock: boolean;
  complete(req: LLMRequest): Promise<LLMResponse>;
}
export class LLMError extends Error {
  constructor(public provider: string, message: string, public retryable = false) { super(message); }
}
