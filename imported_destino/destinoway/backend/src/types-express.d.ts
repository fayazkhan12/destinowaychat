import type { Role } from './security/rbac';
declare global {
  namespace Express {
    interface Request {
      requestId: string;
      auth?: { userId: string; sessionId: string; role: Role; emailVerified: boolean };
    }
  }
}
export {};
