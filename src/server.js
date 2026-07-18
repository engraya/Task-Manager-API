// server.js — TEMPORARY: a raw Node http server, no Express.
// This file exists so we experience exactly what Node provides out of the box.
// It will be replaced by the Express version (app.js + server.js) in Step 1.6.

const http = require('node:http');

const PORT = 3000;

const server = http.createServer((req, res) => {
  const { method, url } = req;

  if (method === 'GET' && url === '/') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Task Manager API - raw Node, no Express yet');
    return;
  }

  if (method === 'GET' && url === '/tasks') {
    const tasks = [{ id: 1, title: 'Learn backend engineering', completed: false }];
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(tasks));
    return;
  }

  if (method === 'POST' && url === '/tasks') {
    // The body arrives as a stream of raw bytes, chunk by chunk —
    // Node gives us no parsed JSON, no object, nothing. We assemble it ourselves.
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
    });
    req.on('end', () => {
      let body;
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

  // No route matched — nothing does this for us either.
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: `Cannot ${method} ${url}` }));
});

server.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
