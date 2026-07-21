// scripts/seed.ts — POST the sample tasks to a RUNNING API instance.
//
// Usage:  npm run dev            (in one terminal)
//         npm run seed           (in another)
// Target override:  SEED_TARGET=http://localhost:3100 npm run seed
// Seed user override: SEED_EMAIL / SEED_PASSWORD (defaults below)
//
// Deliberately goes through the real HTTP boundary (fetch → POST) instead
// of inserting via the repository: every sample passes validation exactly
// like a real client's request, and the seed doubles as an end-to-end
// smoke test.
//
// Since Phase 10 the task routes require authentication, and since Phase 11
// each task belongs to its creator — so the seeder now registers (or reuses)
// a seed USER, logs in, and posts the samples with that user's token. The
// seeded tasks are owned by the seed user and appear when you log in as them.

import { readFile } from 'node:fs/promises';
import path from 'node:path';

const BASE = process.env.SEED_TARGET ?? 'http://localhost:3000';
const SEED_EMAIL = process.env.SEED_EMAIL ?? 'seed@example.com';
const SEED_PASSWORD = process.env.SEED_PASSWORD ?? 'seed-user-password';

// Ensure the seed user exists and return a bearer token for it.
async function authenticate(): Promise<string> {
  // Register is idempotent-ish for our purposes: 201 (created) and 409
  // (already registered) are BOTH fine — we only need the account to exist.
  const reg = await fetch(`${BASE}/api/v1/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: SEED_EMAIL, password: SEED_PASSWORD }),
  });
  if (reg.status !== 201 && reg.status !== 409) {
    throw new Error(`seed user registration failed (${reg.status}): ${await reg.text()}`);
  }
  console.log(
    reg.status === 201
      ? `registered seed user ${SEED_EMAIL}`
      : `seed user ${SEED_EMAIL} already exists — reusing`,
  );

  const login = await fetch(`${BASE}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: SEED_EMAIL, password: SEED_PASSWORD }),
  });
  if (login.status !== 200) {
    throw new Error(`seed user login failed (${login.status}): ${await login.text()}`);
  }
  const { token } = (await login.json()) as { token: string };
  return token;
}

async function main(): Promise<void> {
  const token = await authenticate();

  const raw = await readFile(path.join(__dirname, 'sample-tasks.json'), 'utf8');
  const samples = JSON.parse(raw) as unknown[];

  let created = 0;
  for (const sample of samples) {
    const res = await fetch(`${BASE}/api/v1/tasks`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`, // the token from the seed user
      },
      body: JSON.stringify(sample),
    });

    if (res.status === 201) {
      const task = (await res.json()) as { title: string };
      console.log(`created: ${task.title}`);
      created += 1;
    } else {
      console.error(`FAILED (${res.status}): ${await res.text()}`);
    }
  }

  console.log(`\n${created}/${samples.length} sample tasks created on ${BASE} as ${SEED_EMAIL}`);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
