// config/index.ts — the ONLY place in the codebase that reads process.env.
// Everything else imports typed, validated values from here. If configuration
// is broken, the process fails at startup with a clear message — never at
// 3 AM when the first request happens to need the missing value.

import 'dotenv/config';

const NODE_ENVS = ['development', 'production', 'test'] as const;
type NodeEnv = (typeof NODE_ENVS)[number];

function parseNodeEnv(value: string | undefined): NodeEnv {
  if (value === undefined) {
    return 'development';
  }
  if ((NODE_ENVS as readonly string[]).includes(value)) {
    return value as NodeEnv;
  }
  throw new Error(
    `Invalid NODE_ENV "${value}" — expected one of: ${NODE_ENVS.join(', ')}`,
  );
}

function parsePort(value: string | undefined): number {
  if (value === undefined) {
    return 3000;
  }
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(
      `Invalid PORT "${value}" — expected an integer between 1 and 65535`,
    );
  }
  return port;
}

function parseDataFile(value: string | undefined): string {
  if (value === undefined) {
    return 'data/tasks.json';
  }
  if (value.trim() === '') {
    throw new Error('DATA_FILE must not be empty when set');
  }
  return value;
}

// Optional during the Phase 9 migration; becomes REQUIRED (fail-fast, no
// default — it contains credentials and defaults would mask a missing
// secret) when the mongo repository goes live in Step 9.2.
function parseMongoUri(value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!value.startsWith('mongodb://') && !value.startsWith('mongodb+srv://')) {
    throw new Error(
      'MONGODB_URI must start with mongodb:// or mongodb+srv://',
    );
  }
  return value;
}

export const config = {
  nodeEnv: parseNodeEnv(process.env.NODE_ENV),
  port: parsePort(process.env.PORT),
  dataFile: parseDataFile(process.env.DATA_FILE),
  mongoUri: parseMongoUri(process.env.MONGODB_URI),
} as const;
