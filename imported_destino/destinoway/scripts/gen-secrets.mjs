// Prints fresh random secrets to paste into backend/.env
import { randomBytes } from 'node:crypto';
const b64 = (n) => randomBytes(n).toString('base64url');
console.log(`JWT_ACCESS_SECRET=${b64(48)}`);
console.log(`REFRESH_TOKEN_PEPPER=${b64(48)}`);
console.log(`FIELD_ENCRYPTION_KEY=${randomBytes(32).toString('hex')}`);
console.log(`METRICS_TOKEN=${b64(24)}`);
