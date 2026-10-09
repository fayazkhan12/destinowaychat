import type { Agent, Capability, Domain } from '../types';

class AgentRegistry {
  private agents = new Map<string, Agent>();
  register(a: Agent) {
    if (this.agents.has(a.id)) throw new Error(`Agent already registered: ${a.id}`);
    this.agents.set(a.id, a);
  }
  unregister(id: string) { this.agents.delete(id); }
  get(id: string) { return this.agents.get(id); }
  list() { return [...this.agents.values()]; }
  find(q: { domain?: Domain; service?: string; capability?: Capability }): Agent[] {
    return this.list().filter((a) =>
      (!q.domain || a.domain === q.domain) && (!q.service || a.services.includes(q.service)) && (!q.capability || a.capabilities.includes(q.capability)));
  }
}
export const agentRegistry = new AgentRegistry();
