import { createTransport } from 'nodemailer';
import type { ServerConfig } from '../config.js';

export interface MailMessage { to: string; subject: string; text: string }
export type Mailer = (message: MailMessage) => Promise<void>;

/** TLS on 465, STARTTLS on other ports. Short timeouts make a stuck SMTP server fail the request instead of hanging it. */
export function createSmtpMailer(config: NonNullable<ServerConfig['mail']>): Mailer {
  const transport = createTransport({
    host: config.host, port: config.port, secure: config.port === 465, requireTLS: true,
    auth: { user: config.user, pass: config.password },
    connectionTimeout: 10_000, greetingTimeout: 10_000, socketTimeout: 20_000,
  });
  return async message => { await transport.sendMail({ from: config.from, ...message }); };
}
