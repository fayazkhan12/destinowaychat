export const ROLES = ['USER', 'TRAVEL_AGENT', 'SUPPORT_AGENT', 'ADMIN', 'SUPER_ADMIN', 'SELLER', 'VENDOR', 'PARTNER'] as const;
export type Role = (typeof ROLES)[number];

export type Permission =
  | 'chat:use' | 'flight:search' | 'trip:read:own' | 'trip:write:own' | 'preferences:manage:own' | 'session:manage:own'
  | 'booking:create' | 'booking:cancel' | 'payment:create'
  | 'trip:read:any' | 'support:read' | 'support:takeover'
  | 'admin:users:read' | 'admin:users:write' | 'admin:sessions:manage' | 'admin:audit:read' | 'admin:providers:read'
  | 'admin:roles:write';

const USER: Permission[] = ['chat:use', 'flight:search', 'trip:read:own', 'trip:write:own', 'preferences:manage:own', 'session:manage:own', 'booking:create', 'booking:cancel', 'payment:create'];
const SUPPORT: Permission[] = [...USER, 'trip:read:any', 'support:read', 'support:takeover'];
const ADMIN: Permission[] = [...SUPPORT, 'admin:users:read', 'admin:users:write', 'admin:sessions:manage', 'admin:audit:read', 'admin:providers:read'];

const MATRIX: Record<Role, ReadonlySet<Permission>> = {
  USER: new Set(USER),
  TRAVEL_AGENT: new Set([...USER, 'trip:read:any']),
  SUPPORT_AGENT: new Set(SUPPORT),
  ADMIN: new Set(ADMIN),
  SUPER_ADMIN: new Set<Permission>([...ADMIN, 'admin:roles:write']),
  // Future marketplace roles: no permissions until their domain modules define them.
  SELLER: new Set(),
  VENDOR: new Set(),
  PARTNER: new Set(),
};

export const hasPermission = (role: Role, perm: Permission) => MATRIX[role]?.has(perm) ?? false;
export const permissionsFor = (role: Role): Permission[] => [...(MATRIX[role] ?? [])];
