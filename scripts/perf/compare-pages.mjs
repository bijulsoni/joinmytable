import { createClient } from '@supabase/supabase-js';
const c = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth:{persistSession:true} });
const { data:a } = await c.auth.signInWithPassword({ email:process.env.PERF_EMAIL, password:process.env.PERF_PASS });
const uid=a.user.id;
const tgt=(await c.from('companion_profiles').select('user_id,id').not('verified_at','is',null).limit(1)).data[0];
const med=xs=>{const s=[...xs].sort((x,y)=>x-y);return Math.round(s[Math.floor(s.length/2)]);};
const run=async(fn,n=9)=>{const t=[];for(let i=0;i<n;i++){const s=performance.now();await fn();t.push(performance.now()-s);}return med(t);};
const usersSel=()=>c.from('users').select('*').eq('id',uid).maybeSingle();
const photo=()=>c.from('companion_profiles').select('photo_urls').eq('user_id',uid).maybeSingle();
const sBefore=async()=>{await c.auth.getUser();await usersSel();};   // old session-resolve (network)
const sAfter =async()=>{await c.auth.getSession();await usersSel();}; // new session-resolve (local)
const q={
  discover:()=>c.from('companion_profiles').select('user_id,bio,service_area,photo_urls,activities,rates,rating_avg,verified_at,users!inner(name)').not('verified_at','is',null).limit(60),
  chat:()=>c.from('bookings').select('id,activity_type,venue_name,scheduled_time,status,meal_requests!bookings_request_id_fkey(seeker_id,companion_id,seeker:users!meal_requests_seeker_id_fkey(name),companion:users!meal_requests_companion_id_fkey(name))').order('scheduled_time',{ascending:false}).limit(50),
  requests:()=>c.from('meal_requests').select('*').or(`seeker_id.eq.${uid},companion_id.eq.${uid}`).order('created_at',{ascending:false}).limit(50),
};
const profileQ=async()=>{await c.from('companion_profiles').select('*').eq('user_id',tgt.user_id).maybeSingle();await Promise.all([c.from('users').select('id,name').eq('id',tgt.user_id).maybeSingle(),c.from('availability').select('*').eq('companion_profile_id',tgt.id)]);};
const before={}, after={};
for (const [k,fn] of Object.entries(q)){
  before[k]=await run(async()=>{await sBefore();await sBefore();await fn();await photo();}); // page+appshell dup
  after[k]= await run(async()=>{await sAfter();await fn();await photo();});                   // deduped+local
}
before.profile=await run(async()=>{await sBefore();await sBefore();await sBefore();await profileQ();await photo();}); // +self-fetch resolve
after.profile= await run(async()=>{await sAfter();await profileQ();await photo();});
console.log('page        BEFORE  AFTER  saved   %faster');
for (const k of Object.keys(after)) console.log(k.padEnd(11), String(before[k]).padStart(5), String(after[k]).padStart(6), String(before[k]-after[k]).padStart(6), '   '+Math.round((1-after[k]/before[k])*100)+'%');
await c.auth.signOut();
