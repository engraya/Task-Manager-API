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

// REQUIRED, no default: it contains credentials, and a default (e.g. a
// localhost fallback) would mask a missing secret until the worst moment
// (docs/16 — defaults are for harmless knobs; secrets fail fast).
function parseMongoUri(value: string | undefined): string {
  if (value === undefined) {
    throw new Error(
      'MONGODB_URI is required — set it in .env (see .env.example)',
    );
  }
  if (!value.startsWith('mongodb://') && !value.startsWith('mongodb+srv://')) {
    throw new Error(
      'MONGODB_URI must start with mongodb:// or mongodb+srv://',
    );
  }
  return value;
}

// REQUIRED, no default (a default signing secret = every deployment
// forgeable), and long enough that brute-forcing the secret is hopeless.
function parseJwtSecret(value: string | undefined): string {
  if (value === undefined) {
    throw new Error(
      'JWT_SECRET is required — generate one: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"',
    );
  }
  if (value.length < 32) {
    throw new Error('JWT_SECRET must be at least 32 characters');
  }
  return value;
}

export const config = {
  nodeEnv: parseNodeEnv(process.env.NODE_ENV),
  port: parsePort(process.env.PORT),
  mongoUri: parseMongoUri(process.env.MONGODB_URI),
  jwtSecret: parseJwtSecret(process.env.JWT_SECRET),
} as const;
