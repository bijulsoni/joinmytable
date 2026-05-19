import { redirect } from 'next/navigation';

// /mode used to expose a "switch seeker / companion mode" toggle.
// The mode split was removed when we unified the role-less UI; the
// only remaining "am I available as a companion?" affordance lives
// on /profile. Permanent redirect for any bookmarked /mode URLs.
export default function ModeRedirect() {
  redirect('/profile');
}
