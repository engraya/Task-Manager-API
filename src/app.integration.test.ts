// app.integration.test.ts — INTEGRATION tests: the whole stack, for real.
//
// Unlike the unit tests, nothing here is mocked. Supertest drives the actual
// Express app through real HTTP; requests flow route → middleware → controller
// → service → repository → a real MongoDB (the _test database, per
// vitest.setup.ts). This is the level that proves the PIECES FIT — the exact
// thing unit tests, by isolating pieces, cannot show.
//
// Why this needs no open port: back in Phase 1 we split app.ts (the app) from
// server.ts (the .listen call). Supertest imports the app and drives it in
// memory — that separation, made for testing before we had tests, pays off now.

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import app from './app';
import {
  connectToDatabase,
  disconnectFromDatabase,
} from './database/connection';
import { TaskModel } from './models/task.model';
import { UserModel } from './models/user.model';

// A real MongoDB, in memory, spun up just for this suite. No network, no
// cluster, no IP allowlist — the tests own their database completely and it
// vanishes when they finish. This is why integration tests shouldn't depend on
// a remote cluster: a remote DB makes your tests hostage to your network.
let mongod: MongoMemoryServer;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  // Pass the in-memory server's URI straight to connect — config's Atlas URI
  // is validated at import but never dialed here.
  await connectToDatabase(mongod.getUri('taskmanager_test'));
}, 120_000); // headroom for the one-time binary spin-up (cached after first run)

afterAll(async () => {
  await disconnectFromDatabase();
  await mongod.stop();
});

// Every test starts from an empty database — the integration equivalent of
// clearAllMocks. Tests must not depend on each other's leftover data.
beforeEach(async () => {
  await Promise.all([TaskModel.deleteMany({}), UserModel.deleteMany({})]);
});

// Register a user and return their bearer token — the setup most tests need.
async function registerAndLogin(email: string, password: string): Promise<string> {
  await request(app).post('/api/v1/auth/register').send({ email, password }).expect(201);
  const res = await request(app).post('/api/v1/auth/login').send({ email, password }).expect(200);
  return res.body.token as string;
}

describe('auth flow', () => {
  it('registers a user and returns a PublicUser without the password hash', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ email: 'ada@test.com', password: 'password123' })
      .expect(201);

    expect(res.body.email).toBe('ada@test.com');
    expect(res.body.id).toEqual(expect.any(String));
    // The hash must NEVER cross the wire — structural guarantee, now tested.
    expect(res.body).not.toHaveProperty('passwordHash');
  });

  it('rejects a duplicate email with 409', async () => {
    await request(app).post('/api/v1/auth/register').send({ email: 'dup@test.com', password: 'password123' }).expect(201);
    await request(app).post('/api/v1/auth/register').send({ email: 'dup@test.com', password: 'password123' }).expect(409);
  });

  it('logs in with correct credentials and issues a token', async () => {
    await request(app).post('/api/v1/auth/register').send({ email: 'log@test.com', password: 'password123' }).expect(201);

    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'log@test.com', password: 'password123' })
      .expect(200);

    expect(res.body.token).toEqual(expect.any(String));
    expect(res.body.token.split('.')).toHaveLength(3); // header.payload.signature
  });

  it('returns a vague 401 for a wrong password', async () => {
    await request(app).post('/api/v1/auth/register').send({ email: 'wrong@test.com', password: 'password123' }).expect(201);

    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'wrong@test.com', password: 'not-the-password' })
      .expect(401);

    expect(res.body.error.message).toBe('Invalid email or password');
  });
});

describe('tasks — the gate', () => {
  it('rejects an unauthenticated request with 401', async () => {
    await request(app).get('/api/v1/tasks').expect(401);
  });

  it('lets an authenticated user create and read their own task', async () => {
    const token = await registerAndLogin('owner@test.com', 'password123');

    const created = await request(app)
      .post('/api/v1/tasks')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Write integration tests', priority: 'high' })
      .expect(201);

    expect(created.body.title).toBe('Write integration tests');
    expect(created.body.completed).toBe(false);
    expect(created.body.ownerId).toEqual(expect.any(String));

    const list = await request(app)
      .get('/api/v1/tasks')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(list.body).toHaveLength(1);
    expect(list.body[0].id).toBe(created.body.id);
  });
});

describe('tasks — authorization (the guarantee that must never regress)', () => {
  it('does not let one user touch another user\'s task', async () => {
    const aliceToken = await registerAndLogin('alice@test.com', 'password123');
    const bobToken = await registerAndLogin('bob@test.com', 'password123');

    // Alice creates a task.
    const created = await request(app)
      .post('/api/v1/tasks')
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ title: "Alice's private task" })
      .expect(201);
    const id = created.body.id;

    // Bob cannot see, edit, or delete it — 404 every time (not 403: existence
    // is a secret). This is the Phase 11 promise, frozen into a test.
    await request(app).get(`/api/v1/tasks/${id}`).set('Authorization', `Bearer ${bobToken}`).expect(404);
    await request(app).patch(`/api/v1/tasks/${id}`).set('Authorization', `Bearer ${bobToken}`).send({ title: 'hijacked' }).expect(404);
    await request(app).delete(`/api/v1/tasks/${id}`).set('Authorization', `Bearer ${bobToken}`).expect(404);

    // Alice's task is untouched — Bob's attempts changed nothing.
    const stillThere = await request(app).get(`/api/v1/tasks/${id}`).set('Authorization', `Bearer ${aliceToken}`).expect(200);
    expect(stillThere.body.title).toBe("Alice's private task");

    // And Bob's own list is empty — he sees none of Alice's data.
    const bobList = await request(app).get('/api/v1/tasks').set('Authorization', `Bearer ${bobToken}`).expect(200);
    expect(bobList.body).toHaveLength(0);
  });
});

describe('tasks — validation and not-found', () => {
  it('rejects an invalid body with 422 (auth passes first)', async () => {
    const token = await registerAndLogin('val@test.com', 'password123');

    const res = await request(app)
      .post('/api/v1/tasks')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: '' }) // empty title
      .expect(422);

    expect(res.body.error.details).toBeInstanceOf(Array);
  });

  it('returns 404 for a well-formed request to a non-existent task', async () => {
    const token = await registerAndLogin('nf@test.com', 'password123');

    await request(app)
      .get('/api/v1/tasks/does-not-exist')
      .set('Authorization', `Bearer ${token}`)
      .expect(404);
  });
});
