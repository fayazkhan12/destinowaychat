import { Router } from 'express';
import { authController as c } from '../controllers/authController';
import { ah } from '../middlewares/asyncHandler';
import { validateBody } from '../middlewares/validate';
import { rateLimit } from '../middlewares/rateLimit';
import { authenticate } from '../middlewares/authenticate';
import { registerBody, loginBody, verifyEmailBody, forgotBody, resetBody } from '../validators/auth';

export const authRouter = Router();
// Body is untrusted at this point (validation runs after rate limiting): never assume types.
const byEmail = (req: { body?: { email?: unknown } }) => (typeof req.body?.email === 'string' ? req.body.email.toLowerCase().slice(0, 254) : undefined);

authRouter.post('/register', rateLimit('authSensitive'), validateBody(registerBody), ah(c.register));
authRouter.post('/login', rateLimit('authSensitive', byEmail), validateBody(loginBody), ah(c.login));
authRouter.post('/refresh', rateLimit('authenticated'), ah(c.refresh));
authRouter.post('/logout', authenticate, ah(c.logout));
authRouter.post('/logout-all', authenticate, ah(c.logoutAll));
authRouter.post('/verify-email', rateLimit('authSensitive'), validateBody(verifyEmailBody), ah(c.verifyEmail));
authRouter.post('/resend-verification', authenticate, rateLimit('authSensitive'), ah(c.resendVerification));
authRouter.post('/forgot-password', rateLimit('authSensitive', byEmail), validateBody(forgotBody), ah(c.forgot));
authRouter.post('/reset-password', rateLimit('authSensitive'), validateBody(resetBody), ah(c.reset));
authRouter.get('/google/start', rateLimit('authSensitive'), ah(c.googleStart));
authRouter.get('/google/callback', rateLimit('authSensitive'), ah(c.googleCallback));
