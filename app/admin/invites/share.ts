// Share-message templates for an invite code.
//
// Single source of truth used by BOTH the mint form (fresh codes) and the
// invite table's expandable rows (re-copy an existing code's messages).
//
// The opening line carries Konnly's core idea — the founder's motivation:
// as AI absorbs more of our busywork, the time it gives back is best spent
// on the thing that actually makes us human, real connection. Keep it
// crisp; it's a hook, not an essay.

// Production base URL — intentional literal. Share links must be absolute
// and point at prod, never a preview/localhost host.
export const BASE_URL = 'https://www.konnly.com';

/** The Konnly tagline — reused on the marketing surfaces too. */
export const KONNLY_TAGLINE = 'The more AI does, the more human you get to be.';

export function signupUrl(code: string): string {
  return `${BASE_URL}/sign-up?invite=${code}`;
}

export interface ShareVariant {
  key: string;
  label: string;
  build: (url: string) => string;
}

export const SHARE_VARIANTS: ShareVariant[] = [
  {
    key: 'short',
    label: 'Short (X / Twitter)',
    build: (url) =>
      `${KONNLY_TAGLINE} I'm beta-testing Konnly — it matches you with friendly, ` +
      `verified people for coffee, lunch, happy hour, or dinner. Real plans with real ` +
      `people. Come join me: ${url}`,
  },
  {
    key: 'instagram',
    label: 'Instagram bio / DM',
    build: (url) =>
      `${KONNLY_TAGLINE} ☕🍽️\n\n` +
      `Konnly is a small Pacific-Northwest beta that matches you with friendly, ` +
      `verified people for real plans — coffee, lunch, happy hour, dinner. ` +
      `Good company, real places, easy and warm.\n\n` +
      `Come be human with me 👇\n${url}`,
  },
  {
    key: 'facebook',
    label: 'Facebook / longer post',
    build: (url) =>
      `${KONNLY_TAGLINE}\n\n` +
      `That's the whole idea behind Konnly: as our tools take over more of the busywork, ` +
      `the time we get back is best spent on what actually makes us human — real ` +
      `connection. I've been testing it (a small Pacific-Northwest beta) — it matches ` +
      `you with friendly, verified people for coffee, lunch, happy hour, or dinner, ` +
      `always in public spots, everyone verified. It's warm, easygoing, and a genuinely ` +
      `lovely way to share an hour with someone.\n\n` +
      `It's invite-only during beta. Come join me:\n${url}`,
  },
];
