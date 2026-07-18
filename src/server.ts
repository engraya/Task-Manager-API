// server.ts — the process ENTRY POINT: take the finished app and start
// listening. This is the only file that touches the network directly.

import app from './app';

const PORT = 3000;

app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
