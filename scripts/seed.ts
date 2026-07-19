// scripts/seed.ts — POST the sample tasks to a RUNNING API instance.
//
// Usage:  npm run dev            (in one terminal)
//         npm run seed           (in another)
// Target override: SEED_TARGET=http://localhost:3100 npm run seed
//
// Deliberately goes through the real HTTP boundary (fetch → POST) instead
// of inserting via the repository: every sample passes validation exactly
// like a real client's request, and the seed doubles as an end-to-end
// smoke test.

import { readFile } from 'node:fs/promises';
import path from 'node:path';

const BASE = process.env.SEED_TARGET ?? 'http://localhost:3000';

async function main(): Promise<void> {
  const raw = await readFile(path.join(__dirname, 'sample-tasks.json'), 'utf8');
  const samples = JSON.parse(raw) as unknown[];

  let created = 0;
  for (const sample of samples) {
    const res = await fetch(`${BASE}/api/v1/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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

  console.log(`\n${created}/${samples.length} sample tasks created on ${BASE}`);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
