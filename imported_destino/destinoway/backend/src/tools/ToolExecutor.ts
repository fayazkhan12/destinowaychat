import { hasPermission } from '../security/rbac';
import { ToolError, type ToolContext } from './types';
import type { toolRegistry } from './ToolRegistry';
import type { ApprovalStore } from './approvalStore';
import type { AuditSink } from '../repositories/auditRepository';
import { sha256 } from '../utils/crypto';
import { canonicalize } from '../utils/canonical';
import { toolCalls } from '../observability/metrics';
import { logger, sanitizeForLog } from '../observability/logger';

type RegistryLike = Pick<typeof toolRegistry, 'get'>;

/**
 * THE permission layer. The LLM never calls tools. Deterministic orchestrator code calls this executor, which enforces, in order:
 * 1 tool exists  2 agent allow-list  3 user RBAC permission  4 input schema  5 risk gating (explicit user approval for HIGH/CRITICAL)
 * 6 timeout  7 output schema  8 audit + metrics.
 */
export class ToolExecutor {
  constructor(private registry: RegistryLike, private approvals: ApprovalStore, private audit: AuditSink) {}

  async execute<T = unknown>(toolId: string, rawInput: unknown, ctx: ToolContext): Promise<T> {
    const tool = this.registry.get(toolId);
    const base = { action: `TOOL_${toolId}`, actorId: ctx.userId, actorRole: ctx.role, targetType: 'trip', targetId: ctx.tripId } as const;
    const deny = async (code: ConstructorParameters<typeof ToolError>[0], msg: string): Promise<never> => {
      toolCalls.inc({ tool: toolId, outcome: code });
      await this.audit.record({ ...base, outcome: 'DENIED', metadata: { code, agent: ctx.agentId, riskLevel: tool?.riskLevel } });
      throw new ToolError(code, msg);
    };
    if (!tool) return deny('TOOL_NOT_FOUND', 'Unknown tool');
    if (!tool.allowedAgents.includes(ctx.agentId)) return deny('AGENT_NOT_ALLOWED', `Agent ${ctx.agentId} may not use ${toolId}`);
    for (const p of tool.requiredPermissions) if (!hasPermission(ctx.role, p)) return deny('PERMISSION_DENIED', `Missing permission ${p}`);

    const parsed = tool.inputSchema.safeParse(rawInput);
    if (!parsed.success) return deny('INVALID_INPUT', 'Invalid tool input');
    const input = parsed.data;

    if (tool.riskLevel === 'HIGH' || tool.riskLevel === 'CRITICAL') {
      if (!ctx.emailVerified) return deny('EMAIL_NOT_VERIFIED', 'Email verification required');
      if (!ctx.approvalId) return deny('APPROVAL_REQUIRED', 'Explicit user confirmation required');
      const ok = await this.approvals.consume(ctx.approvalId, { userId: ctx.userId, tripId: ctx.tripId, toolId, inputHash: sha256(canonicalize(input)) });
      if (!ok) return deny('APPROVAL_REQUIRED', 'Approval missing, expired, already used, or does not match this action');
    }

    const started = Date.now();
    let timer: NodeJS.Timeout | undefined;
    try {
      const out = await Promise.race([
        tool.handler(input, ctx),
        new Promise<never>((_, rej) => { timer = setTimeout(() => rej(new ToolError('TIMEOUT', 'Tool timed out')), tool.timeoutMs ?? 30_000); }),
      ]);
      const outParsed = tool.outputSchema.safeParse(out);
      if (!outParsed.success) throw new ToolError('INVALID_OUTPUT', 'Tool returned invalid output');
      toolCalls.inc({ tool: toolId, outcome: 'ok' });
      if (tool.riskLevel !== 'LOW') await this.audit.record({ ...base, outcome: 'SUCCESS', metadata: { agent: ctx.agentId, riskLevel: tool.riskLevel, ms: Date.now() - started, approvalId: ctx.approvalId, input: sanitizeForLog(input) } });
      return outParsed.data as T;
    } catch (e) {
      const code = e instanceof ToolError ? e.code : 'FAILED';
      toolCalls.inc({ tool: toolId, outcome: code });
      logger.warn({ tool: toolId, code, err: (e as Error).message }, 'tool failed');
      await this.audit.record({ ...base, outcome: 'FAILURE', metadata: { agent: ctx.agentId, code, ms: Date.now() - started } });
      throw e instanceof ToolError ? e : new ToolError('FAILED', 'Tool execution failed');
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
}
