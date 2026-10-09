import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';
import { ToolExecutor } from '../src/tools/ToolExecutor';
import { defineTool, ToolError, type ToolContext } from '../src/tools/types';
import { createMemoryApprovalStore } from '../src/tools/approvalStore';
import { ConfirmationManager } from '../src/orchestrator/ConfirmationManager';

const audit = { record: vi.fn(async () => undefined) };
const handler = vi.fn(async () => ({ ok: true }));
const low = defineTool({ toolId: 'low', description: 'x', riskLevel: 'LOW', requiredPermissions: ['flight:search'], allowedAgents: ['A'], inputSchema: z.object({ n: z.number() }), outputSchema: z.object({ ok: z.boolean() }), handler });
const high = defineTool({ toolId: 'createBooking', description: 'x', riskLevel: 'HIGH', requiredPermissions: ['booking:create'], allowedAgents: ['A'], inputSchema: z.object({ offer: z.string() }), outputSchema: z.object({ ok: z.boolean() }), handler });
const reg = new Map<string, any>([['low', low], ['createBooking', high]]);
const ctx: ToolContext = { userId: 'u1', role: 'USER', emailVerified: true, agentId: 'A', tripId: 't1' };
const mk = () => { const approvals = createMemoryApprovalStore(); return { approvals, ex: new ToolExecutor({ get: (id: string) => reg.get(id) }, approvals, audit), cm: new ConfirmationManager(approvals) }; };
const code = async (p: Promise<unknown>) => p.then(() => 'ok', (e) => (e as ToolError).code);

describe('ToolExecutor permission layer', () => {
  it('runs low-risk tools', async () => { const { ex } = mk(); expect(await ex.execute('low', { n: 1 }, ctx)).toEqual({ ok: true }); });
  it('blocks unknown tools, unlisted agents, missing permissions, bad input', async () => {
    const { ex } = mk();
    expect(await code(ex.execute('nope', {}, ctx))).toBe('TOOL_NOT_FOUND');
    expect(await code(ex.execute('low', { n: 1 }, { ...ctx, agentId: 'Evil' }))).toBe('AGENT_NOT_ALLOWED');
    expect(await code(ex.execute('low', { n: 1 }, { ...ctx, role: 'SELLER' }))).toBe('PERMISSION_DENIED');
    expect(await code(ex.execute('low', { n: 'x' }, ctx))).toBe('INVALID_INPUT');
  });
  it('HIGH risk requires explicit approval, verified email', async () => {
    const { ex } = mk();
    expect(await code(ex.execute('createBooking', { offer: 'o' }, ctx))).toBe('APPROVAL_REQUIRED');
    expect(await code(ex.execute('createBooking', { offer: 'o' }, { ...ctx, emailVerified: false }))).toBe('EMAIL_NOT_VERIFIED');
  });
  it('approval is bound to exact input, user, and is single-use', async () => {
    const { ex, cm } = mk();
    const input = { offer: 'o1' };
    const a = await cm.request({ userId: 'u1', tripId: 't1', toolId: 'createBooking', input, summary: 's' });
    expect(await code(ex.execute('createBooking', input, { ...ctx, approvalId: a.approvalId }))).toBe('APPROVAL_REQUIRED'); // not yet granted by the user
    await cm.grant(a.approvalId, 'u1');
    expect(await code(ex.execute('createBooking', { offer: 'DIFFERENT' }, { ...ctx, approvalId: a.approvalId }))).toBe('APPROVAL_REQUIRED'); // changed input
    const b = await cm.request({ userId: 'u1', tripId: 't1', toolId: 'createBooking', input, summary: 's' });
    await cm.grant(b.approvalId, 'u1');
    expect(await code(ex.execute('createBooking', input, { ...ctx, approvalId: b.approvalId }))).toBe('ok');
    expect(await code(ex.execute('createBooking', input, { ...ctx, approvalId: b.approvalId }))).toBe('APPROVAL_REQUIRED'); // replay blocked
  });
  it("another user cannot grant someone else's approval", async () => {
    const { cm } = mk();
    const a = await cm.request({ userId: 'u1', tripId: 't1', toolId: 'createBooking', input: {}, summary: 's' });
    expect(await cm.grant(a.approvalId, 'attacker')).toBeNull();
  });
});
