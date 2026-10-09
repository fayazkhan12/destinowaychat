import type { Request, Response } from 'express';
import { authService, type IssuedAuth } from '../services/authService';
import { env } from '../config/env';
import { cookieOptions } from '../middlewares/security';
import { ACCESS_COOKIE } from '../middlewares/authenticate';
import { randomToken, safeEqual } from '../utils/crypto';
import { redis } from '../config/redis';
import { badRequest } from '../utils/errors';

export const REFRESH_COOKIE = 'dw_rt';
const REFRESH_PATH = '/api/v1/auth';

const client = (req: Request) => ({ ip: req.ip, userAgent: req.headers['user-agent'] });
const domain = env.COOKIE_DOMAIN ? { domain: env.COOKIE_DOMAIN } : {};

function setAuthCookies(res: Response, a: IssuedAuth) {
  res.cookie(ACCESS_COOKIE, a.accessToken, { ...cookieOptions(env.ACCESS_TOKEN_TTL_SECONDS * 1000), ...domain });
  res.cookie(REFRESH_COOKIE, a.refreshCookie, { ...cookieOptions(a.refreshExpiresAt.getTime() - Date.now(), REFRESH_PATH), ...domain });
}
export function clearAuthCookies(res: Response) {
  res.clearCookie(ACCESS_COOKIE, { path: '/', ...domain });
  res.clearCookie(REFRESH_COOKIE, { path: REFRESH_PATH, ...domain });
}

export const authController = {
  async register(req: Request, res: Response) {
    await authService.register(req.body, client(req));
    res.status(202).json({ message: 'If this email can be registered, a verification link has been sent.' });
  },
  async login(req: Request, res: Response) {
    const a = await authService.login(req.body, client(req));
    setAuthCookies(res, a);
    res.json({ user: a.user });
  },
  async refresh(req: Request, res: Response) {
    try {
      const a = await authService.refresh(req.cookies?.[REFRESH_COOKIE], client(req));
      setAuthCookies(res, a);
      res.json({ user: a.user });
    } catch (e) {
      if ((e as { code?: string }).code !== 'REFRESH_RACE') clearAuthCookies(res);
      throw e;
    }
  },
  async logout(req: Request, res: Response) {
    if (req.auth) await authService.logout(req.auth, req.ip);
    clearAuthCookies(res);
    res.status(204).end();
  },
  async logoutAll(req: Request, res: Response) {
    await authService.logoutAll(req.auth!, req.ip);
    clearAuthCookies(res);
    res.status(204).end();
  },
  async verifyEmail(req: Request, res: Response) { await authService.verifyEmail(req.body.token); res.json({ ok: true }); },
  async resendVerification(req: Request, res: Response) { await authService.resendVerification(req.auth!.userId); res.status(202).json({ ok: true }); },
  async forgot(req: Request, res: Response) { await authService.forgotPassword(req.body.email, client(req)); res.status(202).json({ message: 'If that account exists, a reset link has been sent.' }); },
  async reset(req: Request, res: Response) { await authService.resetPassword(req.body.token, req.body.password, client(req)); clearAuthCookies(res); res.json({ ok: true }); },

  async googleStart(_req: Request, res: Response) {
    const state = randomToken(24);
    await redis.set(`oauth:state:${state}`, '1', 'EX', 600);
    res.cookie('dw_oauth_state', state, { ...cookieOptions(600_000, '/api/v1/auth/google'), ...domain });
    const url = authService.googleClient().generateAuthUrl({ scope: ['openid', 'email', 'profile'], state, prompt: 'select_account' });
    res.redirect(url);
  },
  async googleCallback(req: Request, res: Response) {
    const { code, state } = req.query as Record<string, string | undefined>;
    const cookieState = req.cookies?.dw_oauth_state as string | undefined;
    if (!code || !state || !cookieState || !safeEqual(state, cookieState) || (await redis.del(`oauth:state:${state}`)) !== 1) throw badRequest('Invalid OAuth state', 'OAUTH_STATE');
    const a = await authService.googleLogin(code, client(req));
    res.clearCookie('dw_oauth_state', { path: '/api/v1/auth/google', ...domain });
    setAuthCookies(res, a);
    res.redirect(`${env.FRONTEND_ORIGIN}/plan`);
  },
};
