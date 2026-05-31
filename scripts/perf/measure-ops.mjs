import { createClient } from '@supabase/supabase-js';
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL, ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const c = createClient(URL, ANON, { auth: { persistSession: false } });
const { data: a, error: ae } = await c.auth.signInWithPassword({ email: process.env.PERF_EMAIL, password: process.env.PERF_PASS });
if (ae) { console.error('login fail', ae.message); process.exit(1); }
const uid = a.user.id;
const med = (xs) => { const s=[...xs].sort((x,y)=>x-y); return s[Math.floor(s.length/2)]; };
async function time(fn, n=7) { const t=[]; for(let i=0;i<n;i++){ const s=performance.now(); await fn(); t.push(performance.now()-s);} return Math.round(med(t)); }
// 1) getUser() network cost — the per-call auth tax, duplicated 2-3x/page today
const tGetUser = await time(() => c.auth.getUser());
// 2) discover seed (SSR pre-fetch: verified companions)
const tSeed = await time(() => c.from('companion_profiles').select('user_id,bio,service_area,photo_urls,activities,rates,rating_avg,verified_at, users!inner(name)').not('verified_at','is',null).limit(60));
// 3) discover geo RPC
const tRpc = await time(() => c.rpc('search_companions', { search_lat:47.61, search_lng:-122.2, radius_km:40, result_limit:60 }));
// 4) profile detail queries (profile, then user+availability in parallel) — the page currently does this via a self-HTTP fetch
const someProfile = (await c.from('companion_profiles').select('user_id,id').not('verified_at','is',null).limit(1)).data?.[0];
const tProfile = someProfile ? await time(async () => {
  const p = await c.from('companion_profiles').select('*').eq('user_id', someProfile.user_id).maybeSingle();
  await Promise.all([ c.from('users').select('id,name').eq('id', someProfile.user_id).maybeSingle(), c.from('availability').select('*').eq('companion_profile_id', someProfile.id) ]);
}) : 0;
// 5) chat list bookings query
const tChat = await time(() => c.from('bookings').select('id,activity_type,venue_name,scheduled_time,status, meal_requests!bookings_request_id_fkey(seeker_id,companion_id,seeker:users!meal_requests_seeker_id_fkey(name),companion:users!meal_requests_companion_id_fkey(name))').order('scheduled_time',{ascending:false}).limit(50));
// 6) AppShell photo query
const tPhoto = await time(() => c.from('companion_profiles').select('photo_urls').eq('user_id', uid).maybeSingle());
console.log(JSON.stringify({ tGetUser, tSeed, tRpc, tProfile, tChat, tPhoto }, null, 2));
await c.auth.signOut();
