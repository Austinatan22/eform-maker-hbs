// scripts/create-user.js (ESM)
import crypto from 'crypto';
import { sequelize } from '../src/server/db.js';
import { User } from '../src/server/models/User.js';

async function main(){
  const email = process.env.NEW_USER_EMAIL || 'tester@example.com';
  const password = process.env.NEW_USER_PASSWORD || 'test1234';
  const role = process.env.NEW_USER_ROLE || 'editor';

  if (!email || !password) {
    console.error('Provide NEW_USER_EMAIL and NEW_USER_PASSWORD');
    process.exit(1);
  }

  try {
    await sequelize.authenticate();
    await User.sync();
    const existed = await User.findOne({ where: { email: String(email).toLowerCase() } });
    if (existed) {
      console.log(`User already exists: ${email}`);
      process.exit(0);
    }
    const bcrypt = await import('bcryptjs');
    const hash = bcrypt.hashSync(String(password), 10);
    const id = 'u-' + crypto.randomBytes(9).toString('base64url');
    await User.create({ id, email: String(email).toLowerCase(), passwordHash: hash, role });
    console.log(`Created user: ${email} (role: ${role})`);
  } catch (e) {
    console.error('Create user error:', e);
    process.exit(1);
  } finally {
    try { await sequelize.close(); } catch {}
  }
}

main();

