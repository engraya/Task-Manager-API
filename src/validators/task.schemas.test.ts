// validators/task.schemas.test.ts — the project's FIRST tests.
//
// We start here on purpose: schemas are PURE (input → result, no database, no
// network, no clock), so they need no setup, no mocks, nothing to tear down.
// A pure function is the easiest thing in any codebase to test, and validation
// is high-value — it's the boundary that protects everything behind it.

import { describe, it, expect } from 'vitest';
import { createTaskSchema, updateTaskSchema } from './task.schemas';

// A test is Arrange → Act → Assert:
//   Arrange — build the input
//   Act     — run the thing under test (schema.safeParse)
//   Assert  — expect(...) the outcome
// safeParse returns { success, data } | { success, error } — never throws, so
// we can assert on both the pass and the fail paths uniformly.

describe('createTaskSchema', () => {
  it('accepts a minimal valid task (title only)', () => {
    const result = createTaskSchema.safeParse({ title: 'Buy milk' });

    expect(result.success).toBe(true);
    // The narrowing: inside this branch TS knows result.data exists.
    if (result.success) {
      expect(result.data.title).toBe('Buy milk');
    }
  });

  it('trims surrounding whitespace on the title', () => {
    const result = createTaskSchema.safeParse({ title: '  padded  ' });

    expect(result.success).toBe(true);
    if (result.success) {
      // Proves the .trim() TRANSFORM ran — the stored value is normalized,
      // not the raw input. Testing behavior, not just acceptance.
      expect(result.data.title).toBe('padded');
    }
  });

  it('rejects a missing title', () => {
    const result = createTaskSchema.safeParse({ description: 'no title here' });

    expect(result.success).toBe(false);
  });

  it('rejects a title that is only whitespace (empty after trim)', () => {
    const result = createTaskSchema.safeParse({ title: '   ' });

    expect(result.success).toBe(false);
  });

  it('rejects a title longer than 200 characters', () => {
    const result = createTaskSchema.safeParse({ title: 'x'.repeat(201) });

    expect(result.success).toBe(false);
  });

  it('rejects an unknown field (strictObject)', () => {
    // The security-relevant case: a client cannot smuggle extra fields.
    const result = createTaskSchema.safeParse({
      title: 'ok',
      ownerId: 'attacker-supplied',
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      // The issue names the offending key — the same 422 we saw on the wire.
      expect(result.error.issues[0]?.code).toBe('unrecognized_keys');
    }
  });

  it('rejects completed at creation (a new task is never born done)', () => {
    const result = createTaskSchema.safeParse({ title: 'ok', completed: true });

    // Not special-cased — falls out of strictObject rejecting unknown keys.
    expect(result.success).toBe(false);
  });

  it('rejects a priority outside the closed set', () => {
    const result = createTaskSchema.safeParse({ title: 'ok', priority: 'urgent' });

    expect(result.success).toBe(false);
  });

  it('normalizes dueDate with an offset to canonical UTC', () => {
    // 12:00 at +02:00 is 10:00 UTC — the transform must convert, not just pass.
    const result = createTaskSchema.safeParse({
      title: 'ok',
      dueDate: '2026-08-01T12:00:00+02:00',
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.dueDate).toBe('2026-08-01T10:00:00.000Z');
    }
  });

  it('accepts an explicit null dueDate', () => {
    const result = createTaskSchema.safeParse({ title: 'ok', dueDate: null });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.dueDate).toBeNull();
    }
  });
});

describe('updateTaskSchema', () => {
  it('accepts a partial update with a single field', () => {
    const result = updateTaskSchema.safeParse({ completed: true });

    expect(result.success).toBe(true);
  });

  it('rejects an empty object (must change at least one field)', () => {
    // The .refine() guard: a PATCH that touches nothing is a client mistake,
    // not a no-op success.
    const result = updateTaskSchema.safeParse({});

    expect(result.success).toBe(false);
  });

  it('rejects an unknown field just like create', () => {
    const result = updateTaskSchema.safeParse({ id: 'cannot-set-this' });

    expect(result.success).toBe(false);
  });
});
