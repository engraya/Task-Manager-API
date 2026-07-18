// app.ts — the Express APPLICATION: middleware and routes live here.
// Deliberately no .listen() in this file: building the app and running a
// server are separate concerns. Tests (Phase 12) will import this app and
// drive it without ever opening a network port.

import express, { type Request, type Response } from 'express';

interface Task {
  id: number;
  title: string;
  completed: boolean;
}

const app = express();

// Body-parsing middleware — replaces the manual chunk-collecting, string
// concatenation, and try/catch JSON.parse from our raw-Node server.
// For requests with Content-Type: application/json it parses the body
// stream and puts the result on req.body before any route runs.
app.use(express.json());

app.get('/', (_req: Request, res: Response) => {
  res.send('Task Manager API');
});

app.get('/tasks', (_req: Request, res: Response) => {
  const tasks: Task[] = [
    { id: 1, title: 'Learn backend engineering', completed: false },
  ];
  res.json(tasks);
});

app.post('/tasks', (req: Request, res: Response) => {
  // Boundary rule: parsed input is untrusted until validated (Phase 6).
  const body: unknown = req.body;
  res.status(201).json({ received: body });
});

// Fallback — Express only reaches this if no route above matched.
app.use((req: Request, res: Response) => {
  res.status(404).json({ error: `Cannot ${req.method} ${req.originalUrl}` });
});

export default app;
