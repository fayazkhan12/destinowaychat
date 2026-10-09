import { env } from '../../config/env';
import { LLMError, type LLMProviderInterface, type LLMRequest, type LLMResponse, type Tier } from './types';

const DEFAULT_MODELS: Record<'anthropic' | 'openai' | 'gemini', Record<Tier, string>> = {
  anthropic: { fast: 'claude-haiku-4-5-20251001', medium: 'claude-sonnet-5-5', advanced: 'claude-opus-5-5' },
  openai: { fast: 'gpt-4o-mini', medium: 'gpt-4o', advanced: 'gpt-4o' },        // override via LLM_MODEL_* if you prefer others
  gemini: { fast: 'gemini-2.0-flash', medium: 'gemini-2.0-flash', advanced: 'gemini-1.5-pro' },
};
/** Explicit LLM_MODEL_* wins; a higher tier with no explicit model falls back to the fast model you configured (so a single custom model name just works). */
const modelFor = (p: keyof typeof DEFAULT_MODELS, tier: Tier) =>
  (tier === 'fast' ? env.LLM_MODEL_FAST : tier === 'medium' ? (env.LLM_MODEL_MEDIUM ?? env.LLM_MODEL_FAST) : (env.LLM_MODEL_ADVANCED ?? env.LLM_MODEL_MEDIUM ?? env.LLM_MODEL_FAST)) ?? DEFAULT_MODELS[p][tier];

async function post(provider: string, url: string, headers: Record<string, string>, body: unknown, signal?: AbortSignal) {
  let res: Response;
  try {
    res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body), signal: signal ?? AbortSignal.timeout(30_000) });
  } catch (e) { throw new LLMError(provider, (e as Error).name === 'TimeoutError' ? 'timeout' : 'network', true); }
  if (!res.ok) throw new LLMError(provider, `http ${res.status}`, res.status === 429 || res.status >= 500);
  return res.json() as Promise<any>; // eslint-disable-line @typescript-eslint/no-explicit-any
}

export class MockLLMProvider implements LLMProviderInterface {
  readonly name = 'mock'; readonly isMock = true;
  async complete(): Promise<LLMResponse> { return { text: '', model: 'mock', usage: { inputTokens: 0, outputTokens: 0 }, latencyMs: 0 }; }
}

export class AnthropicProvider implements LLMProviderInterface {
  readonly name = 'anthropic'; readonly isMock = false;
  async complete(r: LLMRequest): Promise<LLMResponse> {
    const model = modelFor('anthropic', r.tier); const t0 = Date.now();
    const j = await post('anthropic', 'https://api.anthropic.com/v1/messages', { 'x-api-key': env.ANTHROPIC_API_KEY!, 'anthropic-version': '2023-06-01' },
      { model, max_tokens: r.maxTokens ?? 1024, temperature: r.temperature ?? 0.2, system: r.system, messages: r.messages }, r.signal);
    const text = (j.content ?? []).filter((b: { type: string }) => b.type === 'text').map((b: { text: string }) => b.text).join('');
    return { text, model, usage: { inputTokens: j.usage?.input_tokens ?? 0, outputTokens: j.usage?.output_tokens ?? 0 }, latencyMs: Date.now() - t0 };
  }
}

export class OpenAIProvider implements LLMProviderInterface {
  readonly name = 'openai'; readonly isMock = false;
  async complete(r: LLMRequest): Promise<LLMResponse> {
    const model = modelFor('openai', r.tier); const t0 = Date.now();
    const j = await post('openai', 'https://api.openai.com/v1/chat/completions', { authorization: `Bearer ${env.OPENAI_API_KEY}` },
      { model, max_tokens: r.maxTokens ?? 1024, temperature: r.temperature ?? 0.2, ...(r.json ? { response_format: { type: 'json_object' } } : {}), messages: [{ role: 'system', content: r.system }, ...r.messages] }, r.signal);
    return { text: j.choices?.[0]?.message?.content ?? '', model, usage: { inputTokens: j.usage?.prompt_tokens ?? 0, outputTokens: j.usage?.completion_tokens ?? 0 }, latencyMs: Date.now() - t0 };
  }
}

export class GeminiProvider implements LLMProviderInterface {
  readonly name = 'gemini'; readonly isMock = false;
  async complete(r: LLMRequest): Promise<LLMResponse> {
    const model = modelFor('gemini', r.tier); const t0 = Date.now();
    const j = await post('gemini', `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, { 'x-goog-api-key': env.GEMINI_API_KEY! },
      { systemInstruction: { parts: [{ text: r.system }] }, contents: r.messages.map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })),
        generationConfig: { maxOutputTokens: r.maxTokens ?? 1024, temperature: r.temperature ?? 0.2, ...(r.json ? { responseMimeType: 'application/json' } : {}) } }, r.signal);
    const text = (j.candidates?.[0]?.content?.parts ?? []).filter((p: { thought?: boolean }) => !p.thought).map((p: { text?: string }) => p.text ?? '').join('');
    return { text, model, usage: { inputTokens: j.usageMetadata?.promptTokenCount ?? 0, outputTokens: j.usageMetadata?.candidatesTokenCount ?? 0 }, latencyMs: Date.now() - t0 };
  }
}
