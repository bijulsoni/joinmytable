import 'server-only';

// Where should a signed-in user land?
//
// Now that the seeker/companion mode split is gone, the answer is
// always /discover. Kept as a helper so all the redirect sites (login,
// landing page, etc.) go through one place — easy to revisit if we
// later want, say, a "complete your profile" interstitial.

export function homePathForUser(
  _user?: { is_seeker?: boolean; is_companion?: boolean } | null,
): string {
  return '/discover';
}
