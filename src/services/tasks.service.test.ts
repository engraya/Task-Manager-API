// services/tasks.service.test.ts — unit tests for the service's OWN logic.
//
// The service calls the repository, which calls MongoDB. We do NOT want a
// database in a unit test — it would be slow, flaky, and would test Mongo
// instead of our sorting/merge rules. So we replace the repository with a
// TEST DOUBLE (a fake) and test the service in isolation.
//
// This is only clean because of the architecture: the service depends on the
// repository's five-function CONTRACT, not on Mongo. A fake that satisfies the
// contract is indistinguishable to the service — the seam we built for
// swapping storage (array → file → Mongo) is the same seam we mock through.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as tasksRepository from '../database/tasks.repository';
import {
  listTasks,
  createTask,
  updateTask,
  getTaskById,
  deleteTask,
} from './tasks.service';
import type { Task } from '../types/task';

// Replace every export of the repository module with an auto-generated
// vi.fn(). vi.mock is HOISTED to the top of the file by Vitest, so it takes
// effect before the service (which imported the repository) ever runs.
vi.mock('../database/tasks.repository');

// A typed helper so each test states only the fields it cares about.
function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'id-default',
    ownerId: 'owner-1',
    title: 'A task',
    description: '',
    completed: false,
    priority: 'medium',
    dueDate: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

// Fresh mock state before every test — no leakage of call history or
// configured return values between cases.
beforeEach(() => {
  vi.clearAllMocks();
});

describe('listTasks — sorting (the service brain)', () => {
  it('passes the owner and filters straight through to the repository', async () => {
    vi.mocked(tasksRepository.findAll).mockResolvedValue([]);

    await listTasks('owner-1', { completed: true, priority: 'high' });

    // Assert the INTERACTION, not just the output: the filter must reach the
    // database (pushed down), owner first.
    expect(tasksRepository.findAll).toHaveBeenCalledWith('owner-1', {
      completed: true,
      priority: 'high',
    });
  });

  it('sorts by priority ascending (low → high) when direction is 1', async () => {
    vi.mocked(tasksRepository.findAll).mockResolvedValue([
      makeTask({ id: 'h', priority: 'high' }),
      makeTask({ id: 'l', priority: 'low' }),
      makeTask({ id: 'm', priority: 'medium' }),
    ]);

    const result = await listTasks('owner-1', { sortField: 'priority', direction: 1 });

    // Proves PRIORITY_RANK is used, not alphabetical ('high' < 'low' < 'medium'
    // alphabetically would be WRONG — this test would catch that bug).
    expect(result.map((t) => t.id)).toEqual(['l', 'm', 'h']);
  });

  it('sorts by priority descending (high → low) when direction is -1', async () => {
    vi.mocked(tasksRepository.findAll).mockResolvedValue([
      makeTask({ id: 'l', priority: 'low' }),
      makeTask({ id: 'h', priority: 'high' }),
      makeTask({ id: 'm', priority: 'medium' }),
    ]);

    const result = await listTasks('owner-1', { sortField: 'priority', direction: -1 });

    expect(result.map((t) => t.id)).toEqual(['h', 'm', 'l']);
  });

  it('sorts null dueDates LAST regardless of direction (ascending)', async () => {
    vi.mocked(tasksRepository.findAll).mockResolvedValue([
      makeTask({ id: 'none', dueDate: null }),
      makeTask({ id: 'late', dueDate: '2026-12-01T00:00:00.000Z' }),
      makeTask({ id: 'soon', dueDate: '2026-02-01T00:00:00.000Z' }),
    ]);

    const result = await listTasks('owner-1', { sortField: 'dueDate', direction: 1 });

    expect(result.map((t) => t.id)).toEqual(['soon', 'late', 'none']);
  });

  it('keeps null dueDates last even when direction is -1', async () => {
    vi.mocked(tasksRepository.findAll).mockResolvedValue([
      makeTask({ id: 'none', dueDate: null }),
      makeTask({ id: 'late', dueDate: '2026-12-01T00:00:00.000Z' }),
      makeTask({ id: 'soon', dueDate: '2026-02-01T00:00:00.000Z' }),
    ]);

    const result = await listTasks('owner-1', { sortField: 'dueDate', direction: -1 });

    // Descending by date puts 'late' first — but 'none' STILL sinks to the
    // bottom. This is the rule that a naive `direction * compare` would break.
    expect(result.map((t) => t.id)).toEqual(['late', 'soon', 'none']);
  });

  it('defaults to createdAt descending (newest first)', async () => {
    vi.mocked(tasksRepository.findAll).mockResolvedValue([
      makeTask({ id: 'old', createdAt: '2026-01-01T00:00:00.000Z' }),
      makeTask({ id: 'new', createdAt: '2026-06-01T00:00:00.000Z' }),
    ]);

    const result = await listTasks('owner-1'); // no options → defaults

    expect(result.map((t) => t.id)).toEqual(['new', 'old']);
  });
});

describe('createTask — invariants and defaults', () => {
  it('stamps the owner, forces completed=false, and applies defaults', async () => {
    vi.mocked(tasksRepository.insert).mockResolvedValue(undefined);

    const task = await createTask({ title: 'Only a title' }, 'owner-42');

    expect(task.ownerId).toBe('owner-42');
    expect(task.completed).toBe(false); // the born-not-completed invariant
    expect(task.description).toBe(''); // default
    expect(task.priority).toBe('medium'); // default
    expect(task.dueDate).toBeNull(); // default
    expect(task.createdAt).toBe(task.updatedAt); // one `now` for both
    expect(task.id).toEqual(expect.any(String));
  });

  it('persists exactly the returned task via the repository', async () => {
    vi.mocked(tasksRepository.insert).mockResolvedValue(undefined);

    const task = await createTask({ title: 'x', priority: 'high' }, 'owner-1');

    expect(tasksRepository.insert).toHaveBeenCalledWith(task);
    expect(task.priority).toBe('high'); // explicit value beats the default
  });
});

describe('updateTask — merge semantics', () => {
  it('returns undefined and does NOT write when the task is not found', async () => {
    vi.mocked(tasksRepository.findById).mockResolvedValue(undefined);

    const result = await updateTask('missing', { title: 'new' }, 'owner-1');

    expect(result).toBeUndefined();
    expect(tasksRepository.update).not.toHaveBeenCalled();
  });

  it('merges only provided fields and refreshes updatedAt', async () => {
    const existing = makeTask({
      id: 't1',
      title: 'old title',
      description: 'keep me',
      priority: 'low',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
    vi.mocked(tasksRepository.findById).mockResolvedValue(existing);
    vi.mocked(tasksRepository.update).mockResolvedValue(true);

    const result = await updateTask('t1', { title: 'new title' }, 'owner-1');

    expect(result?.title).toBe('new title'); // changed
    expect(result?.description).toBe('keep me'); // untouched
    expect(result?.priority).toBe('low'); // untouched
    expect(result?.updatedAt).not.toBe(existing.updatedAt); // refreshed
  });

  it('clears dueDate when null is explicitly passed (null is not "absent")', async () => {
    const existing = makeTask({ dueDate: '2026-05-01T00:00:00.000Z' });
    vi.mocked(tasksRepository.findById).mockResolvedValue(existing);
    vi.mocked(tasksRepository.update).mockResolvedValue(true);

    const result = await updateTask('t1', { dueDate: null }, 'owner-1');

    // This is why the code uses `!== undefined`, not `??`: `??` would treat
    // an explicit null as "no value" and refuse to clear the date.
    expect(result?.dueDate).toBeNull();
  });

  it('sets completed=false without swallowing it as falsy', async () => {
    const existing = makeTask({ completed: true });
    vi.mocked(tasksRepository.findById).mockResolvedValue(existing);
    vi.mocked(tasksRepository.update).mockResolvedValue(true);

    const result = await updateTask('t1', { completed: false }, 'owner-1');

    expect(result?.completed).toBe(false);
  });
});

describe('getTaskById / deleteTask — owner is forwarded', () => {
  it('forwards id and owner to the repository on read', async () => {
    vi.mocked(tasksRepository.findById).mockResolvedValue(undefined);

    await getTaskById('t9', 'owner-7');

    expect(tasksRepository.findById).toHaveBeenCalledWith('t9', 'owner-7');
  });

  it('forwards id and owner to the repository on delete', async () => {
    vi.mocked(tasksRepository.remove).mockResolvedValue(true);

    const ok = await deleteTask('t9', 'owner-7');

    expect(tasksRepository.remove).toHaveBeenCalledWith('t9', 'owner-7');
    expect(ok).toBe(true);
  });
});
