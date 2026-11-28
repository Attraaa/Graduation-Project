export interface ServerConfig {
  port: number;
  trustLoopbackProxy?: boolean;
  database: {
    host: string;
    port: number;
    user: string;
    password: string;
    database: string;
  };
  jwt: { secret: string; expiresIn: number };
  /** Fixed private mini-PC endpoint used only for AI reviews. */
  reviewGatewayUrl: string | null;
  /** Kakao REST API key for the nearby hospital search. Optional: without it only /api/hospitals answers 503. */
  kakaoRestApiKey: string | null;
  /** SMTP account that sends ID and password-reset mail. Optional: without it only those two routes answer 503. */
  mail: { host: string; port: number; user: string; password: string; from: string } | null;
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
  const reviewGatewayUrl = env.MOTI_AI_REVIEW_ENABLED === 'false' ? null : env.MOTI_REVIEW_GATEWAY_URL?.trim() || null;
  if (reviewGatewayUrl) {
    const url = new URL(reviewGatewayUrl);
    const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    if ((url.protocol !== 'https:' && !(loopback && url.protocol === 'http:')) || url.username || url.password || url.search || url.hash) {
      throw new Error('MOTI_REVIEW_GATEWAY_URL requires HTTPS or loopback HTTP.');
    }
  }
  const smtp = { host: env.SMTP_HOST?.trim(), user: env.SMTP_USER?.trim(), password: env.SMTP_PASS?.trim() };
  return {
    port: port('PORT', 4000),
    trustLoopbackProxy: env.MOTI_TRUST_LOOPBACK_PROXY === 'true',
    database: {
      host: env.DB_HOST ?? 'localhost',
      port: port('DB_PORT', 3306),
      user: env.DB_USER ?? 'root',
      password: env.DB_PASSWORD ?? '',
      database: env.DB_NAME ?? 'moti',
    },
    jwt: { secret, expiresIn },
    reviewGatewayUrl,
    kakaoRestApiKey: env.KAKAO_REST_API_KEY?.trim() || null,
    mail: smtp.host && smtp.user && smtp.password
      ? { host: smtp.host, port: port('SMTP_PORT', 465), user: smtp.user, password: smtp.password, from: env.MAIL_FROM?.trim() || smtp.user }
      : null,
  };
}
