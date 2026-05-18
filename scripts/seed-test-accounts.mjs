#!/usr/bin/env node

// Seed realistic test accounts + companion profiles for end-to-end QA.
//
// What this does:
//   1. Downloads N AI-generated face photos from thispersondoesnotexist.com.
//   2. Uploads them to Supabase Storage (`avatars` bucket).
//   3. Creates auth users (Supabase Admin API) with confirmed emails.
//   4. Mirrors them into public.users with name + mode flags.
//   5. For companions: inserts companion_profiles with bio, service area,
//      lat/lng (Kirkland/Bellevue/Redmond/Seattle), activities, rates,
//      photo_urls, rating, and verified_at = now().
//
// Usage:
//   set -a; source .env.local; set +a
//   node scripts/seed-test-accounts.mjs
//
// Idempotent: re-running skips accounts whose email already exists.

import { createClient } from '@supabase/supabase-js';
import { mkdir, writeFile } from 'node:fs/promises';
import { setTimeout as sleep } from 'node:timers/promises';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE) {
  console.error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.');
  process.exit(2);
}

const PASSWORD = 'TestPass!23';
const EMAIL_DOMAIN = 'jmt.test';
const PHOTO_DIR = '/tmp/jmt-faces';

const FIRST_NAMES = [
  'Aiden', 'Olivia', 'Noah', 'Emma', 'Liam', 'Ava', 'Mason', 'Sophia', 'James', 'Mia',
  'Oliver', 'Isabella', 'Ethan', 'Charlotte', 'Lucas', 'Amelia', 'Henry', 'Harper', 'Daniel', 'Evelyn',
  'Alexander', 'Abigail', 'Michael', 'Emily', 'Owen', 'Elizabeth', 'Sebastian', 'Mila', 'Mateo', 'Ella',
  'Jack', 'Avery', 'William', 'Sofia', 'Jackson', 'Camila', 'Levi', 'Aria', 'Benjamin', 'Scarlett',
  'Logan', 'Victoria', 'Ezra', 'Madison', 'Wyatt', 'Luna', 'Carter', 'Grace', 'Julian', 'Chloe',
  'Lincoln', 'Penelope', 'David', 'Riley', 'Theodore', 'Zoey', 'Caleb', 'Nora', 'Andrew', 'Lily',
  'Joseph', 'Eleanor', 'Asher', 'Hannah', 'Joshua', 'Lillian', 'Anthony', 'Addison', 'Dylan', 'Aubrey',
  'Leo', 'Ellie', 'Christopher', 'Stella', 'Ryan', 'Natalie', 'Aarav', 'Priya', 'Diego', 'Mei',
  'Yuki', 'Kofi', 'Layla', 'Ravi',
];

const LAST_NAMES = [
  'Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis', 'Rodriguez', 'Martinez',
  'Hernandez', 'Lopez', 'Gonzalez', 'Wilson', 'Anderson', 'Thomas', 'Taylor', 'Moore', 'Jackson', 'Martin',
  'Lee', 'Perez', 'Thompson', 'White', 'Harris', 'Sanchez', 'Clark', 'Ramirez', 'Lewis', 'Robinson',
  'Walker', 'Young', 'Allen', 'King', 'Wright', 'Scott', 'Torres', 'Nguyen', 'Hill', 'Flores',
  'Green', 'Adams', 'Nelson', 'Baker', 'Hall', 'Rivera', 'Campbell', 'Mitchell', 'Carter', 'Roberts',
  'Gomez', 'Phillips', 'Evans', 'Turner', 'Diaz', 'Parker', 'Patel', 'Khan', 'Chen', 'Kim',
  'Yamamoto', 'Okafor', 'Singh', 'Reyes', 'Stewart', 'Morris', 'Murphy', 'Cook', 'Rogers', 'Ortiz',
  'Morgan', 'Cooper', 'Peterson', 'Bailey', 'Reed', 'Kelly', 'Howard', 'Ramos', 'Cox', 'Ward',
];

const CITIES = [
  {
    city: 'Kirkland, WA',
    centerLat: 47.6815, centerLng: -122.2087,
    areas: ['Downtown Kirkland', 'Houghton', 'Juanita', 'Totem Lake', 'Moss Bay', 'Rose Hill'],
  },
  {
    city: 'Bellevue, WA',
    centerLat: 47.6101, centerLng: -122.2015,
    areas: ['Downtown Bellevue', 'Crossroads', 'Factoria', 'Bridle Trails', 'Eastgate', 'Wilburton'],
  },
  {
    city: 'Redmond, WA',
    centerLat: 47.6740, centerLng: -122.1215,
    areas: ['Downtown Redmond', 'Education Hill', 'Overlake', 'Microsoft Campus area', 'Grass Lawn'],
  },
  {
    city: 'Seattle, WA',
    centerLat: 47.6062, centerLng: -122.3321,
    areas: [
      'Capitol Hill', 'South Lake Union', 'Ballard', 'Fremont', 'Queen Anne',
      'Wallingford', 'Belltown', 'University District', 'Pioneer Square',
    ],
  },
];

const BIO_TEMPLATES = [
  "Software engineer at a Seattle startup. Will happily debate the best espresso in {city}.",
  "Born and raised on the Eastside. Knows every quiet corner of {area}.",
  "Empty nester rediscovering the city. Excellent listener, terrible at picking restaurants.",
  "UW alum, weekend hiker, weekday yapper about everything from sourdough to Sondheim.",
  "Microsoft refugee, now freelancing. {area} is my home base.",
  "Newly relocated to {city}. Always up for finding hidden gem spots.",
  "Twenty years in Seattle. I've eaten my way through {area} and have opinions.",
  "Photographer + dog parent. Coffee is basically a personality trait at this point.",
  "Quiet introvert who loves a good long lunch and a longer conversation.",
  "Retired teacher. Curious about everyone's stories. Promise I'll listen more than I talk.",
  "Working remote, missing the office vibe. Let's make Tuesday lunch a thing.",
  "Mom of two preteens. I need adult conversation more than you'll ever know.",
  "Coffee snob, sourdough nerd, fluent in three languages and bad puns.",
  "Recently divorced and rebuilding my friend group. {area} regular.",
  "PhD student at UW. Could talk for hours about my research — but I won't, promise.",
];

const ACTIVITY_RATE_RANGES = {
  coffee: [10, 15],
  lunch: [20, 26],
  happy_hour: [20, 28],
  dinner: [24, 30],
};

const COMPANION_COUNT = 50;
const SEEKER_COUNT = 25;

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ----- deterministic-ish randomness ---------------------------------------

function pick(arr, idx) {
  return arr[idx % arr.length];
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomFloat(min, max, decimals = 2) {
  const v = Math.random() * (max - min) + min;
  return Number(v.toFixed(decimals));
}

function jitter(center, kmRange = 4) {
  // ~111km per degree latitude. Add small random offset so points don't stack.
  const deg = kmRange / 111;
  return center + (Math.random() - 0.5) * 2 * deg;
}

function buildName(idx) {
  // First-name index spreads through the full pool; pair with a last name
  // that drifts independently so name diversity stays high.
  const first = pick(FIRST_NAMES, idx);
  const last = pick(LAST_NAMES, Math.floor(idx * 1.7) + 3);
  return `${first} ${last}`;
}

function buildActivitiesAndRates() {
  const choices = ['coffee', 'lunch', 'happy_hour', 'dinner'];
  // 60% offer 2 activities, 30% offer 3, 10% offer all 4.
  const r = Math.random();
  const count = r < 0.6 ? 2 : r < 0.9 ? 3 : 4;
  const shuffled = [...choices].sort(() => Math.random() - 0.5).slice(0, count);
  const activities = { coffee: false, lunch: false, happy_hour: false, dinner: false };
  const rates = {};
  for (const a of shuffled) {
    activities[a] = true;
    const [lo, hi] = ACTIVITY_RATE_RANGES[a];
    rates[a] = randomInt(lo, hi);
  }
  return { activities, rates };
}

function buildBio(area, city) {
  const tmpl = pick(BIO_TEMPLATES, randomInt(0, BIO_TEMPLATES.length - 1));
  return tmpl.replace('{area}', area).replace('{city}', city);
}

// ----- photo source ------------------------------------------------------

async function downloadFace(idx) {
  // thispersondoesnotexist.com serves a fresh AI face per request.
  // Add a random query so any caching proxy returns a unique image.
  const url = `https://thispersondoesnotexist.com/?cb=${Date.now()}-${idx}-${Math.random()}`;
  const res = await fetch(url, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 13_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36',
      Accept: 'image/avif,image/webp,image/jpeg,*/*',
    },
  });
  if (!res.ok) throw new Error(`face fetch ${idx} failed: ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const path = `${PHOTO_DIR}/face-${String(idx).padStart(3, '0')}.jpg`;
  await writeFile(path, buf);
  return buf;
}

async function uploadAvatar(userId, buf, idx) {
  const objectKey = `${userId}/avatar-${idx}.jpg`;
  const { error } = await supabase.storage
    .from('avatars')
    .upload(objectKey, buf, { contentType: 'image/jpeg', upsert: true });
  if (error) throw new Error(`storage upload ${objectKey}: ${error.message}`);
  const { data } = supabase.storage.from('avatars').getPublicUrl(objectKey);
  return data.publicUrl;
}

// ----- account creation --------------------------------------------------

// Pre-loaded once in main() so we don't hit listUsers on every iteration.
let existingEmails = new Set();

async function loadExistingEmails() {
  const all = new Set();
  let page = 1;
  while (page < 30) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error || !data.users.length) break;
    for (const u of data.users) {
      if (u.email) all.add(u.email);
    }
    if (data.users.length < 200) break;
    page += 1;
  }
  return all;
}

function emailExists(email) {
  return existingEmails.has(email);
}

async function createAccount({ idx, kind, name, email, password, isSeeker, isCompanion, photoBuf, companionProfile }) {
  const tag = `[${String(idx).padStart(2, '0')}] ${kind}`;

  if (emailExists(email)) {
    console.log(`${tag}  skip — ${email} already exists`);
    return null;
  }

  const { data: auth, error: authErr } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { name },
  });
  if (authErr) throw new Error(`auth ${email}: ${authErr.message}`);
  const userId = auth.user.id;

  const { error: mirrorErr } = await supabase.from('users').upsert(
    {
      id: userId,
      email,
      name,
      is_seeker: isSeeker,
      is_companion: isCompanion,
      verification_status: isCompanion ? 'verified' : 'unverified',
    },
    { onConflict: 'id' },
  );
  if (mirrorErr) throw new Error(`mirror ${email}: ${mirrorErr.message}`);

  let photoUrl = null;
  if (photoBuf) {
    photoUrl = await uploadAvatar(userId, photoBuf, 1);
  }

  if (isCompanion && companionProfile) {
    const { activities, rates } = buildActivitiesAndRates();
    const { error: profErr } = await supabase.from('companion_profiles').insert({
      user_id: userId,
      bio: companionProfile.bio,
      service_area: companionProfile.service_area,
      // PostGIS geography(Point, 4326). PostgREST passes the value as text to
      // the column's input parser; EWKT is the safest serialization.
      location: `SRID=4326;POINT(${companionProfile.lng} ${companionProfile.lat})`,
      activities,
      rates,
      photo_urls: photoUrl ? [photoUrl] : [],
      rating_avg: companionProfile.rating,
      verified_at: new Date().toISOString(),
    });
    if (profErr) throw new Error(`companion_profile ${email}: ${profErr.message}`);
  }

  console.log(`${tag}  ✓ ${name.padEnd(28)} ${email}`);
  return userId;
}

// ----- main --------------------------------------------------------------

async function main() {
  await mkdir(PHOTO_DIR, { recursive: true });

  console.log(`Seeding ${SEEKER_COUNT} seekers + ${COMPANION_COUNT} companions…`);
  console.log(`Photo cache: ${PHOTO_DIR}`);
  console.log('Loading existing emails…');
  existingEmails = await loadExistingEmails();
  console.log(`  (${existingEmails.size} accounts already exist; will skip dupes)`);

  // Create demo accounts FIRST so they have predictable indexes / output.
  const demoCity = CITIES[0]; // Kirkland
  const demoArea = pick(demoCity.areas, 0);

  const demoSeekerBuf = await downloadFace(0);
  await sleep(400);
  await createAccount({
    idx: 0,
    kind: 'seeker',
    name: 'Demo Seeker',
    email: 'seeker-demo@jmt.test',
    password: PASSWORD,
    isSeeker: true,
    isCompanion: false,
    photoBuf: demoSeekerBuf,
  });

  const demoCompanionBuf = await downloadFace(1);
  await sleep(400);
  await createAccount({
    idx: 0,
    kind: 'companion',
    name: 'Demo Companion',
    email: 'companion-demo@jmt.test',
    password: PASSWORD,
    isSeeker: false,
    isCompanion: true,
    photoBuf: demoCompanionBuf,
    companionProfile: {
      bio: 'Demo account — happy to be your test companion for coffee, lunch, or dinner around the Eastside.',
      service_area: demoArea,
      lat: jitter(demoCity.centerLat),
      lng: jitter(demoCity.centerLng),
      rating: 4.8,
    },
  });

  // Seekers (no companion_profile row, no photo on companion_profiles).
  for (let i = 1; i <= SEEKER_COUNT; i++) {
    const name = buildName(i + 100);
    const email = `seeker-${String(i).padStart(3, '0')}@${EMAIL_DOMAIN}`;
    const photoBuf = await downloadFace(i + 1000); // unique cache index
    await createAccount({
      idx: i,
      kind: 'seeker',
      name,
      email,
      password: PASSWORD,
      isSeeker: true,
      isCompanion: false,
      photoBuf,
    });
    await sleep(350);
  }

  // Companions.
  for (let i = 1; i <= COMPANION_COUNT; i++) {
    const name = buildName(i + 500);
    const email = `companion-${String(i).padStart(3, '0')}@${EMAIL_DOMAIN}`;
    const city = pick(CITIES, i + Math.floor(i / 7));
    const area = pick(city.areas, i);
    const photoBuf = await downloadFace(i + 2000);
    await createAccount({
      idx: i,
      kind: 'companion',
      name,
      email,
      password: PASSWORD,
      isSeeker: false,
      isCompanion: true,
      photoBuf,
      companionProfile: {
        bio: buildBio(area, city.city),
        service_area: `${area} · ${city.city}`,
        lat: jitter(city.centerLat),
        lng: jitter(city.centerLng),
        rating: randomFloat(4.2, 4.95),
      },
    });
    await sleep(350);
  }

  console.log('\n========================================');
  console.log('Test accounts created. Password for all: ' + PASSWORD);
  console.log('Demo logins:');
  console.log('  seeker-demo@jmt.test       (seeker mode)');
  console.log('  companion-demo@jmt.test    (companion mode, verified, profile set up)');
  console.log('========================================');
}

main().catch((err) => {
  console.error('\n❌ seed failed:', err.message);
  process.exit(1);
});
