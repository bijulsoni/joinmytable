import { createClient } from '@supabase/supabase-js';
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL, ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const c = createClient(URL, ANON, { auth: { persistSession: false } });
const { data: a } = await c.auth.signInWithPassword({ email: process.env.PERF_EMAIL, password: process.env.PERF_PASS });
const uid = a.user.id;
const target = (await c.from('companion_profiles').select('user_id,id').not('verified_at','is',null).limit(1)).data[0];
const med = xs => { const s=[...xs].sort((x,y)=>x-y); return Math.round(s[Math.floor(s.length/2)]); };

// one "session resolve" = getUser() network + users select (what getSessionUser/requireAuth each do)
const sessionResolve = async () => { await c.auth.getUser(); await c.from('users').select('*').eq('id', uid).maybeSingle(); };
const profileQueries = async () => {
  const p = (await c.from('companion_profiles').select('*').eq('user_id', target.user_id).maybeSingle()).data;
  await Promise.all([ c.from('users').select('id,name').eq('id', target.user_id).maybeSingle(),
                      c.from('availability').select('*').eq('companion_profile_id', target.id) ]);
};
const photo = async () => { await c.from('companion_profiles').select('photo_urls').eq('user_id', uid).maybeSingle(); };

// BEFORE: page session + self-fetch(requireAuth session + profile queries) + AppShell session + photo
const before = async () => { await sessionResolve(); await sessionResolve(); await profileQueries(); await sessionResolve(); await photo(); };
// AFTER: session once (cache dedups AppShell) + direct profile queries + photo
const after  = async () => { await sessionResolve(); await profileQueries(); await photo(); };

const run = async (fn, n=9) => { const t=[]; for(let i=0;i<n;i++){ const s=performance.now(); await fn(); t.push(performance.now()-s);} return med(t); };
await before(); // warm
const b = await run(before), af = await run(after);
console.log('Profile page server-work (median ms):');
console.log('  BEFORE (3 session-resolves + self-fetch + photo):', b);
console.log('  AFTER  (1 session-resolve + direct queries + photo):', af);
console.log('  improvement:', Math.round((1-af/b)*100)+'% faster, -'+(b-af)+'ms');
await c.auth.signOut();
