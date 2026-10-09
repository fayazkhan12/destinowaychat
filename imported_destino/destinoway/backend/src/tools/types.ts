import type { z, ZodTypeAny } from 'zod';
import type { Permission, Role } from '../security/rbac';

export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface ToolContext {
  userId: string; role: Role; emailVerified: boolean;
  agentId: string; tripId: string; requestId?: string;
  /** Required for HIGH / CRITICAL tools: id of an approval the USER granted for exactly this tool + input. */
  approvalId?: string;
}

export interface ToolDefinition<I extends ZodTypeAny = ZodTypeAny, O extends ZodTypeAny = ZodTypeAny> {
  toolId: string;
  description: string;
  requiredPermissions: Permission[];
  inputSchema: I;
  outputSchema: O;
  riskLevel: RiskLevel;
  /** Only these agents may invoke the tool (agent permission layer). */
  allowedAgents: string[];
  timeoutMs?: number;
  handler: (input: z.infer<I>, ctx: ToolContext) => Promise<z.infer<O>>;
}
export const defineTool = <I extends ZodTypeAny, O extends ZodTypeAny>(t: ToolDefinition<I, O>) => t;

export class ToolError extends Error {
  constructor(public code: 'TOOL_NOT_FOUND' | 'AGENT_NOT_ALLOWED' | 'PERMISSION_DENIED' | 'INVALID_INPUT' | 'APPROVAL_REQUIRED' | 'EMAIL_NOT_VERIFIED' | 'TIMEOUT' | 'INVALID_OUTPUT' | 'FAILED', message: string) {
    super(message);
  }
}
