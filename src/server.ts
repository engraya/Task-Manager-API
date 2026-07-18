// server.ts — the process ENTRY POINT: take the finished app and start
// listening. This is the only file that touches the network directly.

import app from './app';
import { config } from './config';

app.listen(config.port, () => {
  console.log(
    `Server listening on http://localhost:${config.port} (${config.nodeEnv})`,
  );
});
