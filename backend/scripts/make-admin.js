#!/usr/bin/env node
// Promote (or demote) an account from the command line.
//
//   npm run make-admin -- student@example.com
//   npm run make-admin -- student@example.com --remove
//   npm run make-admin -- --list
//
// Works with whichever database the app is configured to use.
require('dotenv').config();
const db = require('../db');

async function main() {
  const args = process.argv.slice(2).filter((a) => a !== '--');
  const list = args.includes('--list');
  const remove = args.includes('--remove') || args.includes('--demote');
  const identifier = args.find((a) => !a.startsWith('--'));

  await db.init();

  if (list) {
    const admins = await db.prepare(
      "SELECT id, full_name, email, is_active FROM users WHERE role = 'admin' ORDER BY id",
    ).all();
    if (!admins.length) {
      console.log('No admins yet. Create one with:  npm run make-admin -- your@email.com');
    } else {
      console.log(`${admins.length} admin account(s):`);
      for (const a of admins) {
        console.log(`  #${a.id}  ${a.full_name} <${a.email}>${a.is_active ? '' : '  [SUSPENDED]'}`);
      }
    }
    return;
  }

  if (!identifier) {
    console.error('Usage: npm run make-admin -- <email-or-admission-number> [--remove]');
    console.error('       npm run make-admin -- --list');
    process.exitCode = 1;
    return;
  }

  const user = await db.prepare(`
    SELECT id, full_name, email, role FROM users
    WHERE LOWER(email) = LOWER(?) OR UPPER(admission_number) = UPPER(?)
  `).get(identifier, identifier);

  if (!user) {
    console.error(`No account found for "${identifier}".`);
    console.error('Register in the app first, then run this command.');
    process.exitCode = 1;
    return;
  }

  const role = remove ? 'student' : 'admin';

  if (remove) {
    const { count } = await db.prepare(
      "SELECT COUNT(*) AS count FROM users WHERE role = 'admin'",
    ).get();
    if (user.role === 'admin' && Number(count) <= 1) {
      console.error('Refusing to demote the only admin — promote someone else first.');
      process.exitCode = 1;
      return;
    }
  }

  await db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, user.id);
  console.log(`${user.full_name} <${user.email}> is now ${role === 'admin' ? 'an ADMIN' : 'a student'}.`);
}

main()
  .then(() => process.exit(process.exitCode || 0))
  .catch((err) => {
    console.error('Failed:', err.message);
    process.exit(1);
  });
