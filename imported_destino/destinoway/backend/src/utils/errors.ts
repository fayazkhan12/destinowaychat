export class AppError extends Error {
  constructor(public status: number, public code: string, message: string, public details?: unknown) {
    super(message);
  }
}
export const badRequest = (msg = 'Bad request', code = 'BAD_REQUEST', d?: unknown) => new AppError(400, code, msg, d);
export const unauthorized = (msg = 'Authentication required', code = 'UNAUTHENTICATED') => new AppError(401, code, msg);
export const forbidden = (msg = 'Forbidden', code = 'FORBIDDEN') => new AppError(403, code, msg);
export const notFound = (msg = 'Not found', code = 'NOT_FOUND') => new AppError(404, code, msg);
export const conflict = (msg = 'Conflict', code = 'CONFLICT') => new AppError(409, code, msg);
export const tooMany = (msg = 'Too many requests', code = 'RATE_LIMITED') => new AppError(429, code, msg);
