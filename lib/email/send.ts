// `sendEmail` — the only function other modules should call to send mail.
//
// Contract:
//   - Never throws. Always returns `{ success, error? }`.
//   - Logs every failure (missing API key, Resend SDK error, unknown
//     exception) via the shared logger with `module: 'email/send'`.
//   - When the Resend API key is not configured, no-ops with
//     `{ success: false, error: 'email_not_configured' }`. This lets
//     local/dev environments run the full app without bouncing on email.

import { logger } from '@/lib/logger';

import { FROM_EMAIL, getResend, isEmailConfigured } from './client';
import type { EmailTemplate } from './templates/_shared';

const log = logger.child({ module: 'email/send' });

export interface SendEmailResult {
  success: boolean;
  /** Stable error tag when `success === false`. */
  error?: string;
  /** Resend message id when `success === true`. */
  messageId?: string;
}

/**
 * Render `template(data)` and dispatch via Resend.
 *
 * Generic over the template's data shape so the call site retains type
 * safety: passing the wrong data shape for a template is a compile
 * error.
 */
export async function sendEmail<TData extends Record<string, unknown>>(
  to: string,
  template: EmailTemplate<TData>,
  data: TData,
): Promise<SendEmailResult> {
  if (!isEmailConfigured()) {
    log.warn({ to: redactEmail(to) }, 'RESEND_API_KEY missing; skipping email');
    return { success: false, error: 'email_not_configured' };
  }

  let content;
  try {
    content = template(data);
  } catch (err) {
    log.error({ err, to: redactEmail(to) }, 'template rendering failed');
    return { success: false, error: 'template_render_failed' };
  }

  const client = getResend();
  if (!client) {
    log.warn({ to: redactEmail(to) }, 'resend client not available');
    return { success: false, error: 'email_not_configured' };
  }
  try {
    const result = await client.emails.send({
      from: FROM_EMAIL,
      to,
      subject: content.subject,
      html: content.html,
      text: content.text,
    });

    if (result.error) {
      log.error(
        { err: result.error, to: redactEmail(to), subject: content.subject },
        'resend returned an error',
      );
      return { success: false, error: result.error.message ?? 'resend_error' };
    }

    const messageId = result.data?.id;
    log.info({ to: redactEmail(to), subject: content.subject, messageId }, 'email sent');
    return { success: true, ...(messageId ? { messageId } : {}) };
  } catch (err) {
    log.error({ err, to: redactEmail(to), subject: content.subject }, 'resend send threw');
    const message = err instanceof Error ? err.message : 'unknown_error';
    return { success: false, error: message };
  }
}

/** Show only the domain so logs stay debuggable without leaking PII. */
function redactEmail(address: string): string {
  const at = address.indexOf('@');
  if (at < 0) return '[redacted]';
  return `[redacted]${address.slice(at)}`;
}
