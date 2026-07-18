// server.ts — TEMPORARY: a raw Node http server, no Express (now in TypeScript).
// Replaced by the Express version (app.ts + server.ts) in Step 1.6.

import http from 'node:http';

interface Task {
  id: number;
  title: string;
  completed: boolean;
}

const PORT = 3000;

const server = http.createServer((req, res) => {
  const { method, url } = req;

  if (method === 'GET' && url === '/') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Task Manager API - raw Node, no Express yet');
    return;
  }

  if (method === 'GET' && url === '/tasks') {
    const tasks: Task[] = [
      { id: 1, title: 'Learn backend engineering', completed: false },
    ];
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(tasks));
    return;
  }

  if (method === 'POST' && url === '/tasks') {
    // The body arrives as a stream of raw bytes, chunk by chunk.
    let raw = '';
    req.on('data', (chunk: Buffer) => {
      raw += chunk;
    });
    req.on('end', () => {
      // JSON.parse returns `any`; typing it `unknown` forces us to check
      // the shape before trusting it (real validation arrives in Phase 6).
      let body: unknown;
      try {
        body = JSON.parse(raw);
      } catch {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Request body must be valid JSON' }));
        return;
      }
      res.writeHead(201, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ received: body }));
    });
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: `Cannot ${method} ${url}` }));
});

server.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
