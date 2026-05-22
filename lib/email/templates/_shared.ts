// Shared helpers for transactional email templates.
//
// The goal is consistent, mobile-friendly HTML across every template
// without pulling in a heavyweight email-component library. Templates
// compose a body string and hand it to `layout()` for the chrome.

import { ACTIVITY_TYPE_META, type ActivityType } from '@/lib/types';

/** Brand + link constants. Imported by every template. */
export const BRAND = 'Konnly';
export const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://konnly.co';

/** Shape every template returns to `sendEmail`. */
export interface EmailContent {
  subject: string;
  html: string;
  text: string;
}

/**
 * Templates are pure functions: `data → EmailContent`. Generic over the
 * data shape so callers retain type-safety per template.
 */
export type EmailTemplate<TData = Record<string, unknown>> = (data: TData) => EmailContent;

/** Human label for an activity ("Lunch", "Coffee / tea", ...). */
export function activityLabel(activity: ActivityType): string {
  return ACTIVITY_TYPE_META[activity].label;
}

/** Article-aware lowercase activity name suitable for subject lines ("a lunch", "a happy hour"). */
export function activityWithArticle(activity: ActivityType): string {
  const label = activityLabel(activity).toLowerCase();
  return label;
}

/** Escape any user-supplied string before embedding it in HTML. */
export function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Build an absolute URL into the app, given a path that starts with `/`. */
export function appUrl(path: string): string {
  const base = APP_URL.endsWith('/') ? APP_URL.slice(0, -1) : APP_URL;
  const suffix = path.startsWith('/') ? path : `/${path}`;
  return `${base}${suffix}`;
}

interface LayoutOptions {
  preheader?: string;
  heading: string;
  bodyHtml: string;
  ctaLabel?: string;
  ctaHref?: string;
}

/** Wrap a template's body in the shared mobile-friendly HTML chrome. */
export function layout(opts: LayoutOptions): string {
  const preheader = opts.preheader ?? '';
  const cta =
    opts.ctaLabel && opts.ctaHref
      ? `
        <tr>
          <td align="center" style="padding: 24px 0 8px;">
            <a href="${escapeHtml(opts.ctaHref)}"
               style="display:inline-block;padding:14px 22px;border-radius:10px;
                      background:#0f766e;color:#ffffff;text-decoration:none;
                      font-weight:600;font-size:16px;">
              ${escapeHtml(opts.ctaLabel)}
            </a>
          </td>
        </tr>`
      : '';

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="color-scheme" content="light dark">
    <title>${escapeHtml(opts.heading)}</title>
  </head>
  <body style="margin:0;padding:0;background:#f7f7f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1f2937;">
    <span style="display:none!important;visibility:hidden;opacity:0;color:transparent;height:0;width:0;overflow:hidden;">
      ${escapeHtml(preheader)}
    </span>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f7f7f5;">
      <tr>
        <td align="center" style="padding:24px 12px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
                 style="max-width:560px;background:#ffffff;border-radius:14px;
                        box-shadow:0 1px 2px rgba(15,23,42,0.06);overflow:hidden;">
            <tr>
              <td style="padding:24px 24px 8px;">
                <div style="font-size:18px;font-weight:700;color:#0f766e;">${BRAND}</div>
              </td>
            </tr>
            <tr>
              <td style="padding:8px 24px 0;">
                <h1 style="margin:0 0 12px;font-size:22px;line-height:1.3;color:#111827;">
                  ${escapeHtml(opts.heading)}
                </h1>
              </td>
            </tr>
            <tr>
              <td style="padding:8px 24px 0;font-size:16px;line-height:1.5;color:#1f2937;">
                ${opts.bodyHtml}
              </td>
            </tr>
            ${cta}
            <tr>
              <td style="padding:24px;color:#6b7280;font-size:12px;line-height:1.5;border-top:1px solid #e5e7eb;">
                You're receiving this because you have a ${BRAND} account.
                Questions? Just reply to this email.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

/** Plain-text fallback wrapper, kept tiny on purpose. */
export function plain(lines: readonly string[], cta?: { label: string; href: string }): string {
  const body = lines.join('\n\n');
  const ctaText = cta ? `\n\n${cta.label}: ${cta.href}` : '';
  return `${BRAND}\n\n${body}${ctaText}\n\n— The ${BRAND} team`;
}
