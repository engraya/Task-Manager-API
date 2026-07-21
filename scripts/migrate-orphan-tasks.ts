// scripts/migrate-orphan-tasks.ts — a ONE-OFF data migration.
//
// The problem: Phase 11 gave tasks a required `ownerId`, but tasks created
// before then (the Phase 9 seed data) have no owner. Mongoose's `required`
// only validates on WRITE, so these rows loaded fine — but they belong to
// nobody and are now invisible through the owner-scoped API. Dead weight.
//
// This script finds those orphans and removes them. It is a MIGRATION, not
// app code: run by hand, against a specific database, once.
//
// SAFE BY DEFAULT: a bare run only REPORTS (dry run). It deletes nothing
// until you pass --apply. Data-destroying scripts should never do their
// damage on an accidental invocation — the extra flag is the seatbelt.
//
// Usage:
//   npm run migrate:orphans          # dry run — counts, changes nothing
//   npm run migrate:orphans -- --apply   # actually delete the orphans

import {
  connectToDatabase,
  disconnectFromDatabase,
} from '../src/database/connection';
import { TaskModel } from '../src/models/task.model';

// Orphan = the ownerId field is missing OR null. Both mean "no owner".
const ORPHAN_QUERY = {
  $or: [{ ownerId: { $exists: false } }, { ownerId: null }],
} as const;

async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');

  await connectToDatabase();

  const orphanCount = await TaskModel.countDocuments(ORPHAN_QUERY);
  const totalCount = await TaskModel.countDocuments({});
  console.log(`Collection holds ${totalCount} tasks; ${orphanCount} are orphaned (no owner).`);

  if (orphanCount === 0) {
    console.log('Nothing to migrate. Done.');
    return;
  }

  if (!apply) {
    // Show a sample so the operator can eyeball WHAT would be deleted before
    // committing — "trust but verify" applied to your own migration.
    const sample = await TaskModel.find(ORPHAN_QUERY)
      .limit(5)
      .lean<{ _id: string; title: string }[]>();
    console.log('\nDRY RUN — would delete these (showing up to 5):');
    for (const t of sample) console.log(`  - ${t._id}  "${t.title}"`);
    console.log(`\nRe-run with --apply to delete all ${orphanCount}.`);
    return;
  }

  const result = await TaskModel.deleteMany(ORPHAN_QUERY);
  console.log(`\nDeleted ${result.deletedCount} orphaned tasks.`);
}

main()
  .catch((err: unknown) => {
    console.error(err);
    process.exitCode = 1;
  })
  // finally: always close the connection, success or failure, so the script
  // exits cleanly instead of hanging on an open Mongo socket.
  .finally(() => disconnectFromDatabase());
