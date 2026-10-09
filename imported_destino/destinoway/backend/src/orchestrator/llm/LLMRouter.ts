import { env } from '../../config/env';
import { llmCostUsd, llmLatency, llmTokens } from '../../observability/metrics';
import { logger } from '../../observability/logger';
import { AnthropicProvider, GeminiProvider, MockLLMProvider, OpenAIProvider } from './providers';
import { LLMError, type LLMProviderInterface, type LLMRequest, type LLMResponse } from './types';

/**
 * Optional pricing table in USD per 1M tokens, e.g. LLM_PRICE_PER_MTOK_JSON='{"claude-haiku-4-5-20251001":[1,5]}'
 * (input, output). Not hard-coded because vendor prices change. Unknown model => cost recorded as 0 (tokens are still tracked).
 */
function pricing(): Record<string, [number, number]> { try { return JSON.parse(process.env.LLM_PRICE_PER_MTOK_JSON ?? '{}'); } catch { return {}; } }

export class LLMRouter {
  constructor(private provider: LLMProviderInterface) {}
  get isMock() { return this.provider.isMock; }

  async complete(req: LLMRequest): Promise<LLMResponse> {
    let lastErr: unknown;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const res = await this.provider.complete(req);
        llmLatency.observe({ provider: this.provider.name, model: res.model, tier: req.tier }, res.latencyMs / 1000);
        llmTokens.inc({ provider: this.provider.name, model: res.model, direction: 'in' }, res.usage.inputTokens);
        llmTokens.inc({ provider: this.provider.name, model: res.model, direction: 'out' }, res.usage.outputTokens);
        const price = pricing()[res.model];
        if (price) llmCostUsd.inc({ provider: this.provider.name, model: res.model }, (res.usage.inputTokens * price[0] + res.usage.outputTokens * price[1]) / 1e6);
        return res;
      } catch (e) {
        lastErr = e;
        if (!(e instanceof LLMError && e.retryable)) break;
        logger.warn({ provider: this.provider.name, attempt }, 'llm retry');
      }
    }
    throw lastErr;
  }
}

export function buildLLMRouter(): LLMRouter {
  const p = env.LLM_PROVIDER === 'anthropic' ? new AnthropicProvider() : env.LLM_PROVIDER === 'openai' ? new OpenAIProvider() : env.LLM_PROVIDER === 'gemini' ? new GeminiProvider() : new MockLLMProvider();
  return new LLMRouter(p);
}
