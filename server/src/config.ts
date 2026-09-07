export interface ServerConfig {
  port: number;
  database: {
    host: string;
    port: number;
    user: string;
    password: string;
    database: string;
  };
  jwt: { secret: string; expiresIn: number };
}

/** Validate before listening so setup errors cannot silently select an unsafe secret. */
export function readConfig(env: NodeJS.ProcessEnv): ServerConfig {
  const port = (name: string, fallback: number) => {
    const raw = env[name] ?? String(fallback);
    const value = Number(raw);
    if (!/^\d+$/.test(raw) || !Number.isInteger(value) || value < 1 || value > 65535) {
      throw new Error(`${name} must be an integer between 1 and 65535.`);
    }
    return value;
  };
  const secret = env.JWT_SECRET?.trim();
  if (!secret || secret.length < 32 || secret === 'change_this_to_a_long_random_string') {
    throw new Error('Set JWT_SECRET to a random secret of at least 32 characters in server/.env.');
  }
  const duration = /^(\d+)(s|m|h|d)$/.exec(env.JWT_EXPIRES_IN ?? '7d');
  const units: Record<string, number> = { s: 1, m: 60, h: 3600, d: 86400 };
  const expiresIn = duration ? Number(duration[1]) * units[duration[2]] : 0;
  if (!Number.isSafeInteger(expiresIn) || expiresIn <= 0) {
    throw new Error('JWT_EXPIRES_IN must be a positive duration such as 30m, 1h, or 7d.');
  }
  return {
    port: port('PORT', 4000),
    database: {
      host: env.DB_HOST ?? 'localhost',
      port: port('DB_PORT', 3306),
      user: env.DB_USER ?? 'root',
      password: env.DB_PASSWORD ?? '',
      database: env.DB_NAME ?? 'moti',
    },
    jwt: { secret, expiresIn },
  };
}
