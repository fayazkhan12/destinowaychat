import client from 'prom-client';

export const registry = new client.Registry();
client.collectDefaultMetrics({ register: registry, prefix: 'dw_' });

const hist = (name: string, help: string, labelNames: string[], buckets: number[]) =>
  new client.Histogram({ name: `dw_${name}`, help, labelNames, buckets, registers: [registry] });
const counter = (name: string, help: string, labelNames: string[]) =>
  new client.Counter({ name: `dw_${name}`, help, labelNames, registers: [registry] });

export const httpLatency = hist('http_request_duration_seconds', 'HTTP latency', ['method', 'route', 'status'], [0.01, 0.05, 0.1, 0.3, 1, 3, 10]);
export const agentLatency = hist('agent_duration_seconds', 'Agent latency', ['agent', 'status'], [0.05, 0.2, 0.5, 1, 3, 8, 20]);
export const llmLatency = hist('llm_duration_seconds', 'LLM latency', ['provider', 'model', 'tier'], [0.2, 0.5, 1, 2, 5, 10, 30]);
export const providerLatency = hist('provider_duration_seconds', 'Travel provider latency', ['provider', 'op', 'status'], [0.1, 0.5, 1, 3, 8, 15, 30]);
export const providerFailures = counter('provider_failures_total', 'Provider failures', ['provider', 'op', 'reason']);
export const bookingFailures = counter('booking_failures_total', 'Booking failures', ['provider', 'reason']);
export const llmTokens = counter('llm_tokens_total', 'LLM tokens', ['provider', 'model', 'direction']);
export const llmCostUsd = counter('llm_cost_usd_total', 'Estimated LLM cost (USD)', ['provider', 'model']);
export const securityEvents = counter('security_events_total', 'Security events', ['type']);
export const toolCalls = counter('tool_calls_total', 'Tool executions', ['tool', 'outcome']);
export const searchesTotal = counter('searches_total', 'Searches performed', ['service']);
