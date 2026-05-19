import { redirect } from 'next/navigation';

// /bookings is now /plans (UI merge of requests + bookings into one
// inbox). Permanent redirect for any bookmarked URLs.
export default function BookingsRedirect() {
  redirect('/plans');
}
