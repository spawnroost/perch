import { isSteamPlaceholderEmail } from '@perch/core';
import type { ApiEnv } from './env.js';

export interface Mail {
  to: string;
  subject: string;
  /** Plain text; links must be on their own so they stay clickable. */
  text: string;
}

export interface Mailer {
  send(mail: Mail): Promise<void>;
}

/** Dev fallback: prints the mail (and so any verification / reset link) to the console. */
export const consoleMailer: Mailer = {
  async send({ to, subject, text }) {
    console.log(`[mail] to=${to} subject="${subject}"\n${text}`);
  },
};

export function resendMailer(apiKey: string, from: string, fetchFn: typeof fetch = fetch): Mailer {
  return {
    async send({ to, subject, text }) {
      const res = await fetchFn('https://api.resend.com/emails', {
        method: 'POST',
        headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
        body: JSON.stringify({ from, to, subject, text }),
      });
      if (!res.ok) throw new Error(`resend: ${res.status} ${(await res.text()).slice(0, 200)}`);
    },
  };
}

export function createMailer(env: Pick<ApiEnv, 'RESEND_API_KEY' | 'MAIL_FROM'>): Mailer {
  return env.RESEND_API_KEY ? resendMailer(env.RESEND_API_KEY, env.MAIL_FROM) : consoleMailer;
}

/** Drops mail to unmailable placeholder addresses (Steam-only accounts have no real email). */
export function skipPlaceholderRecipients(mailer: Mailer): Mailer {
  return {
    async send(mail) {
      if (isSteamPlaceholderEmail(mail.to)) return;
      await mailer.send(mail);
    },
  };
}
