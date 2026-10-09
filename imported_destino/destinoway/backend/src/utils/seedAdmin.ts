// Usage: SEED_ADMIN_EMAIL=you@x.com SEED_ADMIN_PASSWORD='long-pass-123' npm run seed:admin -w backend
import { connectMongo, disconnectMongo } from '../config/database';
import { User } from '../models/User';
import { hashPassword } from '../auth/password';

(async () => {
  const email = process.env.SEED_ADMIN_EMAIL?.toLowerCase(); const pw = process.env.SEED_ADMIN_PASSWORD;
  if (!email || !pw || pw.length < 12) throw new Error('Set SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD (>=12 chars)');
  await connectMongo();
  await User.updateOne({ email }, { $set: { name: 'Super Admin', role: 'SUPER_ADMIN', emailVerified: true, passwordHash: await hashPassword(pw) } }, { upsert: true });
  console.log(`SUPER_ADMIN ready: ${email}`);
  await disconnectMongo();
})().catch((e) => { console.error(e.message); process.exit(1); });
