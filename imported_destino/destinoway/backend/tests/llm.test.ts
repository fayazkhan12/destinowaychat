import { describe, it, expect, vi, afterEach } from 'vitest';
import { GeminiProvider, AnthropicProvider } from '../src/orchestrator/llm/providers';
import { LLMError } from '../src/orchestrator/llm/types';
import { replyAmountsAreGrounded } from '../src/orchestrator/guard';

afterEach(() => vi.unstubAllGlobals());
const stub = (json: unknown, status = 200) => { const f = vi.fn(async () => new Response(JSON.stringify(json), { status })); vi.stubGlobal('fetch', f); return f; };

describe('LLM adapters (no network: fetch is stubbed)', () => {
  it('Gemini: key travels in a header (never in the URL), thought parts are dropped, tiers fall back to the configured fast model', async () => {
    const f = stub({ candidates: [{ content: { parts: [{ text: 'internal reasoning', thought: true }, { text: '{"intent":"OTHER"}' }] } }], usageMetadata: { promptTokenCount: 11, candidatesTokenCount: 7 } });
    const r = await new GeminiProvider().complete({ tier: 'advanced', system: 's', messages: [{ role: 'user', content: 'hi' }], json: true });
    expect(r.text).toBe('{"intent":"OTHER"}'); expect(r.usage).toEqual({ inputTokens: 11, outputTokens: 7 });
    expect(r.model).toBe('test-fast-model');
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain('test-fast-model:generateContent'); expect(url).not.toContain('key=');
    expect((init.headers as Record<string, string>)['x-goog-api-key']).toBeTruthy();
    expect(JSON.parse(init.body as string).generationConfig.responseMimeType).toBe('application/json');
  });
  it('maps 429/5xx to retryable errors and 4xx to non-retryable, without leaking response bodies', async () => {
    stub({ error: 'rate limited, secret detail' }, 429);
    await expect(new AnthropicProvider().complete({ tier: 'fast', system: 's', messages: [] })).rejects.toMatchObject({ retryable: true });
    stub({}, 400);
    const e = await new AnthropicProvider().complete({ tier: 'fast', system: 's', messages: [] }).catch((x) => x as LLMError);
    expect(e).toBeInstanceOf(LLMError); expect((e as LLMError).retryable).toBe(false); expect((e as Error).message).not.toMatch(/secret/);
  });
  it('grounding check rejects an LLM reply that invents a price', () => {
    expect(replyAmountsAreGrounded('Cheapest is ₹3,100', [3200, 4100])).toBe(false);
    expect(replyAmountsAreGrounded('Cheapest is ₹3,200', [3200, 4100])).toBe(true);
  });
});
