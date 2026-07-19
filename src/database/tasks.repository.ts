// database/tasks.repository.ts — persistence for tasks: a JSON file.
//
// This module's exports are the STORAGE CONTRACT: the service calls these
// five functions and nothing else. Phase 9 reimplements them against
// MongoDB; the service will not change shape.
//
// Model: the file is the truth AT REST; the in-memory cache is the truth
// AT RUNTIME. Reads hit the cache (loaded lazily once); every mutation
// writes through to disk.

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config';
import type { Task } from '../types/task';

let cache: Task[] | null = null;

async function load(): Promise<Task[]> {
  if (cache !== null) {
    return cache;
  }
  try {
    const raw = await readFile(config.dataFile, 'utf8');
    cache = JSON.parse(raw) as Task[];
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      cache = []; // first boot: the file doesn't exist yet — empty store
    } else {
      throw err; // corrupted JSON or real I/O failure — surface loudly
    }
  }
  return cache;
}

// Writes must be:
//  (a) ATOMIC — a crash mid-write must never leave a half-written file.
//      Technique: write a temp file, then rename() over the real one —
//      rename within a filesystem is atomic; readers see old or new,
//      never a torn mix.
//  (b) SERIALIZED — two requests mutating concurrently must not interleave
//      their writes. Technique: chain every write onto the previous one's
//      promise (a one-line write queue).
let writeQueue: Promise<void> = Promise.resolve();

function persist(snapshot: Task[]): Promise<void> {
  const serialized = JSON.stringify(snapshot, null, 2);
  writeQueue = writeQueue.then(async () => {
    await mkdir(path.dirname(config.dataFile), { recursive: true });
    const tmp = `${config.dataFile}.tmp`;
    await writeFile(tmp, serialized, 'utf8');
    await rename(tmp, config.dataFile);
  });
  return writeQueue;
}

export async function findAll(): Promise<Task[]> {
  return [...(await load())]; // a copy — callers may filter/sort freely
}

export async function findById(id: string): Promise<Task | undefined> {
  return (await load()).find((t) => t.id === id);
}

export async function insert(task: Task): Promise<void> {
  const all = await load();
  all.push(task);
  await persist(all);
}

export async function update(updated: Task): Promise<void> {
  const all = await load();
  const index = all.findIndex((t) => t.id === updated.id);
  if (index === -1) {
    return; // caller verified existence; a lost race is a no-op here
  }
  all[index] = updated;
  await persist(all);
}

export async function remove(id: string): Promise<boolean> {
  const all = await load();
  const index = all.findIndex((t) => t.id === id);
  if (index === -1) {
    return false;
  }
  all.splice(index, 1);
  await persist(all);
  return true;
}
