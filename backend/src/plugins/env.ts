import 'dotenv/config';

export type Env = {
  PORT: number;
  CORS_ORIGIN: string;
  DATABASE_URL: string;
  JWT_SECRET: string;
  JWT_ACCESS_TTL_SECONDS: number;
  JWT_REFRESH_TTL_SECONDS: number;
  GITHUB_CLIENT_ID?: string;
  GITHUB_CLIENT_SECRET?: string;
  GITHUB_REDIRECT_URI?: string;
  FRONTEND_URL?: string;
  GITHUB_WEBHOOK_SECRET?: string;
  GEMINI_API_KEY?: string;
};

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env ${name}`);
  return v;
}

function int(name: string, fallback?: number): number {
  const v = process.env[name];
  if (!v) {
    if (fallback !== undefined) return fallback;
    throw new Error(`Missing env ${name}`);
  }
  const n = Number(v);
  if (!Number.isFinite(n)) throw new Error(`Invalid number env ${name}=${v}`);
  return n;
}

export function loadEnv(): Env {
  return {
    PORT: int('PORT', 8081),
    CORS_ORIGIN: required('CORS_ORIGIN'),
    DATABASE_URL: required('DATABASE_URL'),
    JWT_SECRET: required('JWT_SECRET'),
    JWT_ACCESS_TTL_SECONDS: int('JWT_ACCESS_TTL_SECONDS', 3600),
    JWT_REFRESH_TTL_SECONDS: int('JWT_REFRESH_TTL_SECONDS', 60 * 60 * 24 * 30),
    GITHUB_CLIENT_ID: process.env.GITHUB_CLIENT_ID,
    GITHUB_CLIENT_SECRET: process.env.GITHUB_CLIENT_SECRET,
    GITHUB_REDIRECT_URI: process.env.GITHUB_REDIRECT_URI,
    FRONTEND_URL: process.env.FRONTEND_URL,
    GITHUB_WEBHOOK_SECRET: process.env.GITHUB_WEBHOOK_SECRET,
    GEMINI_API_KEY: process.env.GEMINI_API_KEY,
  };
}


