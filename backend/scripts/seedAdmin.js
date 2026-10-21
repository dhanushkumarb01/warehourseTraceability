/**
 * First-Admin Bootstrap Script
 *
 *   npm run seed:admin
 *
 * Creates the initial ADMIN user from environment variables so the system is
 * never left without a way to log in. Idempotent and safe to re-run:
 *   - If an ADMIN already exists, it does nothing.
 *   - If the bootstrap email/username is already taken, it reports and exits.
 *
 * Required env (see .env):
 *   BOOTSTRAP_ADMIN_USERNAME
 *   BOOTSTRAP_ADMIN_EMAIL
 *   BOOTSTRAP_ADMIN_PASSWORD   (min 8 chars, with upper/lower/number)
 *
 * Never hardcodes credentials. For production, set strong values in the
 * environment and rotate the password after first login.
 */

'use strict';

require('dotenv').config();

const prisma = require('../src/config/prisma');
const { hashPassword } = require('../src/utils/password');
const env = require('../src/config/env');

const log = (msg) => console.log(`[seed:admin] ${msg}`);

async function main() {
  const username = env.BOOTSTRAP_ADMIN_USERNAME;
  const email = env.BOOTSTRAP_ADMIN_EMAIL;
  const password = env.BOOTSTRAP_ADMIN_PASSWORD;

  if (!username || !email || !password) {
    throw new Error(
      'Missing bootstrap credentials. Set BOOTSTRAP_ADMIN_USERNAME, ' +
      'BOOTSTRAP_ADMIN_EMAIL and BOOTSTRAP_ADMIN_PASSWORD in your .env.'
    );
  }
  if (password.length < 8) {
    throw new Error('BOOTSTRAP_ADMIN_PASSWORD must be at least 8 characters.');
  }

  const existingAdmin = await prisma.user.findFirst({ where: { role: 'ADMIN' } });
  if (existingAdmin) {
    log(`An ADMIN already exists (username: ${existingAdmin.username}). Nothing to do.`);
    return;
  }

  const clash = await prisma.user.findFirst({ where: { OR: [{ username }, { email }] } });
  if (clash) {
    throw new Error(`A user with username "${username}" or email "${email}" already exists.`);
  }

  const hashed = await hashPassword(password);
  const admin = await prisma.user.create({
    data: { username, email, password: hashed, role: 'ADMIN', status: 'ACTIVE' },
  });

  // Record the bootstrap in the audit trail, attributed to the admin itself.
  await prisma.auditLog.create({
    data: { userId: admin.id, module: 'AUTH', action: 'BOOTSTRAP_ADMIN', entityId: admin.id, remarks: 'Initial administrator created via seed script' },
  });

  log(`Created ADMIN user "${username}" <${email}>.`);
  log('You can now log in. Change this password after first login.');
}

main()
  .catch((err) => {
    console.error(`[seed:admin] FAILED: ${err.message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
