import type { Request, Response, NextFunction, RequestHandler } from 'express';
export const ah = (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler => (req, res, next) => { fn(req, res, next).catch(next); };
