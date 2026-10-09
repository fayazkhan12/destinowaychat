import { UniversalAIOrchestrator } from './UniversalAIOrchestrator';
import { buildLLMRouter } from './llm/LLMRouter';
import { ToolExecutor } from '../tools/ToolExecutor';
import { toolRegistry } from '../tools/ToolRegistry';
import { redisApprovalStore } from '../tools/approvalStore';
import { ConfirmationManager } from './ConfirmationManager';
import { tripStateService } from '../services/tripStateService';
import { auditRepository } from '../repositories/auditRepository';
import { acquireLock } from '../utils/lock';
import { registerTravelDomain } from '../domains/travel';

/** Domain modules are enabled here. Adding ECOMMERCE later = registerEcommerceDomain(); the orchestrator is untouched. */
export function buildOrchestrator() {
  registerTravelDomain();
  // registerEcommerceDomain(); registerInsuranceDomain(); ...
  const tools = new ToolExecutor(toolRegistry, redisApprovalStore, auditRepository);
  return new UniversalAIOrchestrator({
    llm: buildLLMRouter(), tools, confirmations: new ConfirmationManager(redisApprovalStore),
    store: tripStateService, audit: auditRepository, lock: (k) => acquireLock(k, 90_000),
  });
}
