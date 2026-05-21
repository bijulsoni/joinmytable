import 'server-only';

// Where should a signed-in user land?
//
// Now that the seeker/companion mode split is gone, the answer is
// always /discover. Kept as a helper so all the redirect sites (login,
// landing page, etc.) go through one place — easy to revisit if we
// later want, say, a "complete your profile" interstitial.

export function homePathForUser(
  user?: { is_seeker?: boolean; is_companion?: boolean; onboarded_at?: string | null } | null,
): string {
  // First-run onboarding: if the user hasn't finished /welcome yet,
  // route them there. They get bounced into /discover automatically
  // once they hit Continue (which stamps onboarded_at).
  if (user && !user.onboarded_at) return '/welcome';
  return '/discover';
}
