import type { ToolDefinition } from './types';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyTool = ToolDefinition<any, any>;

class ToolRegistry {
  private tools = new Map<string, AnyTool>();
  register(t: AnyTool) {
    if (this.tools.has(t.toolId)) throw new Error(`Tool already registered: ${t.toolId}`);
    this.tools.set(t.toolId, t);
  }
  get(id: string) { return this.tools.get(id); }
  /** Metadata only (never handlers) - safe for the admin panel. */
  describe() { return [...this.tools.values()].map(({ toolId, description, requiredPermissions, riskLevel, allowedAgents }) => ({ toolId, description, requiredPermissions, riskLevel, allowedAgents })); }
}
export const toolRegistry = new ToolRegistry();
