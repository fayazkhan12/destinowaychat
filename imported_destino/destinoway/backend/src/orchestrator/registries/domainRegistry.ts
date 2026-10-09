import type { Domain } from '../types';

export interface DomainDefinition { id: Domain; displayName: string; services: string[]; enabled: boolean }

/** Adding a domain = register a DomainDefinition + its agents/tools. UniversalAIOrchestrator is never edited. */
class DomainRegistry {
  private domains = new Map<Domain, DomainDefinition>();
  register(d: DomainDefinition) { this.domains.set(d.id, d); }
  get(id: Domain) { return this.domains.get(id); }
  enabled() { return [...this.domains.values()].filter((d) => d.enabled); }
  domainForService(service: string): Domain | undefined {
    return this.enabled().find((d) => d.services.includes(service))?.id;
  }
  knownServices(): string[] { return this.enabled().flatMap((d) => d.services); }
}
export const domainRegistry = new DomainRegistry();
