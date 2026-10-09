import bcrypt from 'bcryptjs';
import { createHash } from 'node:crypto';

const COST = 12;
// bcrypt silently truncates input at 72 bytes. Pre-hash so long passphrases keep their full entropy.
const prehash = (pw: string) => createHash('sha256').update(pw, 'utf8').digest('base64');

export const hashPassword = (pw: string) => bcrypt.hash(prehash(pw), COST);
export const verifyPassword = (pw: string, hash: string) => bcrypt.compare(prehash(pw), hash);
/** Constant-ish time defence against user-enumeration via response timing. */
export const DUMMY_HASH = bcrypt.hashSync('dummy-password-for-timing', COST);
