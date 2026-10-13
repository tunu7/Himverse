-- SAMPLE CONTENT for a hosted environment (not a migration, not seed.sql).
--
-- Gives the public catalogue and the AI itinerary planner real-looking content
-- before real providers are onboarded. Everything belongs to ONE provider whose
-- name says it is a sample and not bookable, and NO availability dates are
-- created, so nobody can send a booking request to a provider that doesn't exist.
--
-- Idempotent (safe to re-run). Remove with supabase/sample-content/remove.sql.
-- Apply:  npx supabase db query --linked -f supabase/sample-content/apply.sql

begin;

insert into public.providers (slug, display_name, description, district, status, verified_at)
values (
  'himverse-sample-listings',
  'Sample listings (not bookable)',
  'Example experiences that show how Himverse works while local providers are onboarded. They are not operated by a real provider and cannot be booked.',
  'Tawang',
  'verified',
  now()
)
on conflict (slug) do nothing;

insert into public.destinations (slug, name, district, summary, description, is_published)
values
  ('tawang', 'Tawang', 'Tawang',
   'High-altitude monastery town near the Sela Pass.',
   'Tawang sits at around 3,000 m in the far west of Arunachal Pradesh. It is known for its large Buddhist monastery, mountain lakes and the drive over the Sela Pass. Nights are cold for most of the year.',
   true),
  ('ziro', 'Ziro Valley', 'Lower Subansiri',
   'Pine-ringed valley of Apatani villages and rice fields.',
   'A broad valley at about 1,500 m, home to the Apatani people, whose terraced rice-and-fish farming is admired across the region. Easy walking between villages, bamboo groves and pine hills.',
   true),
  ('dirang', 'Dirang', 'West Kameng',
   'River valley with hot springs, orchards and birdlife.',
   'A gentle stop on the road to Tawang, with an old stone dzong, apple and kiwi orchards, hot springs and the Sangti valley, a winter home for migratory birds.',
   true),
  ('bomdila', 'Bomdila', 'West Kameng',
   'Hill town with monasteries and Himalayan views.',
   'A hill town at about 2,400 m with monasteries, a lively market and ridge walks with views of the eastern Himalaya on clear days.',
   true),
  ('pasighat', 'Pasighat', 'East Siang',
   'Riverside town where the Siang leaves the hills.',
   'One of the oldest towns in the state, on the banks of the Siang. A base for river trips, Adi villages and the plains-edge forests of East Siang.',
   true),
  ('namdapha', 'Namdapha', 'Changlang',
   'Vast rainforest national park in the far east.',
   'Namdapha National Park spans lowland rainforest to high mountains. Known for hornbills, gibbons and rich plant life. Access is by road to Miao, then on foot or by jeep track.',
   true),
  ('mechuka', 'Mechuka', 'Shi Yomi',
   'Remote high valley close to the border.',
   'A wide, quiet valley at around 1,900 m along the Siyom river, surrounded by snow peaks, with an old monastery above the town. Journeys here take time; plan rest days.',
   true),
  ('roing', 'Roing', 'Lower Dibang Valley',
   'Gateway to the Dibang valley and Mayodia Pass.',
   'A green foothill town of the Idu Mishmi people, with lakes, river views and the road up to Mayodia Pass, which often sees snow in winter.',
   true)
on conflict (slug) do nothing;

insert into public.experiences
  (provider_id, destination_id, slug, title, summary, description, category, duration_minutes, price_from_minor, status)
select p.id, d.id, e.slug, e.title, e.summary, e.description, e.category::public.experience_category, e.minutes, e.price, 'published'
from (values
  ('tawang', 'sample-tawang-monastery-morning', 'Tawang Monastery morning visit',
   'Early visit to the monastery during morning prayers, with time in the courtyard and museum.',
   'Arrive as the monastery wakes up, listen to morning prayers and explore the library and museum with a local guide. Dress warmly and modestly.',
   'culture', 180, 80000),
  ('tawang', 'sample-sela-pass-day-trip', 'Sela Pass and lake day trip',
   'Full-day drive to the high pass and its lake, with stops for views and tea.',
   'A long scenic drive to one of the highest motorable passes in the region, with time at the lake. Weather can close the road; carry warm layers.',
   'adventure', 540, 450000),
  ('tawang', 'sample-tawang-village-walk', 'Monpa village walk',
   'Gentle walk through Monpa villages, prayer wheels and fields around Tawang.',
   'A half-day walk on village paths with a local host, stopping at homes, prayer wheels and a small gompa.',
   'culture', 210, 120000),
  ('ziro', 'sample-ziro-apatani-villages', 'Apatani villages and rice fields',
   'Walk between Apatani villages and learn how rice and fish are farmed together.',
   'A guided walk through traditional villages and terraced fields. Learn about Apatani farming, crafts and daily life from local hosts.',
   'culture', 240, 150000),
  ('ziro', 'sample-ziro-pine-hills-trek', 'Ziro pine hills trek',
   'Half-day trek through pine and bamboo forest above the valley.',
   'A moderate trek on forest trails with views over the valley floor. Suitable for most walkers with reasonable fitness.',
   'trekking', 300, 180000),
  ('ziro', 'sample-ziro-food-trail', 'Apatani home kitchen lunch',
   'Cook and share a traditional lunch with an Apatani family.',
   'Help prepare a home-style meal of local greens, rice and smoked dishes, then eat together. Vegetarian options on request.',
   'food_and_drink', 150, 90000),
  ('ziro', 'sample-ziro-music-weekend', 'Valley music festival weekend',
   'Two days of outdoor music in the valley (seasonal).',
   'A weekend pass-style experience around the valley''s outdoor music festival season. Dates vary each year.',
   'festivals', 2880, 1200000),
  ('dirang', 'sample-dirang-hot-springs', 'Hot springs and dzong half day',
   'Soak in natural hot springs and visit the old stone dzong.',
   'Relax at the hot springs by the river, then walk to the historic dzong and village nearby.',
   'wellness', 240, 70000),
  ('dirang', 'sample-sangti-valley-birding', 'Sangti valley birding morning',
   'Early birding walk in a quiet valley known for winter migrants.',
   'A slow morning walk with binoculars along the river and fields. Best from November to March.',
   'wildlife', 300, 200000),
  ('dirang', 'sample-dirang-orchard-walk', 'Orchards and farm walk',
   'Walk through apple and kiwi orchards with a farming family.',
   'Visit family farms, taste seasonal fruit and learn how orchards are run at altitude.',
   'nature', 180, 60000),
  ('bomdila', 'sample-bomdila-monastery-market', 'Monastery and market stroll',
   'Visit the monastery and wander the town market with a local guide.',
   'An easy half day combining the monastery with the bazaar, local snacks and handicraft shops.',
   'culture', 210, 60000),
  ('bomdila', 'sample-bomdila-dirang-trek', 'Bomdila to Dirang ridge trek',
   'Two-day trek along ridges and through villages, overnight in a homestay.',
   'A two-day trek with a night in a village homestay. Moderate to demanding; porters and meals included in the indicative price.',
   'trekking', 2880, 900000),
  ('pasighat', 'sample-siang-river-rafting', 'Siang river rafting',
   'A day on the Siang with a professional rafting crew.',
   'Rafting on a stretch of the Siang suited to first-timers and experienced paddlers, depending on the season and water level.',
   'adventure', 360, 350000),
  ('pasighat', 'sample-adi-village-homestay', 'Adi village homestay night',
   'Spend a night with an Adi family, with dinner and stories by the fire.',
   'Stay overnight in a bamboo house, share meals and learn about Adi traditions and crafts.',
   'culture', 1440, 280000),
  ('pasighat', 'sample-pasighat-riverside-picnic', 'Riverside picnic and swim',
   'Relaxed afternoon on a sandy riverbank (price on request).',
   'A gentle half day by the river with a packed lunch. Swimming only where the guide says it is safe.',
   'nature', 240, null),
  ('namdapha', 'sample-namdapha-jungle-walk', 'Namdapha rainforest walk',
   'Guided day walk in the rainforest, looking for hornbills and gibbons.',
   'A long day on forest trails with an experienced guide. Leeches are common in wet months; good shoes essential.',
   'wildlife', 480, 400000),
  ('namdapha', 'sample-namdapha-camp', 'Namdapha three-day forest camp',
   'Three days trekking and camping deep in the national park.',
   'A supported camping trip into the park with guides and cooks. Permits are arranged; fitness and flexibility required.',
   'trekking', 4320, 1500000),
  ('mechuka', 'sample-mechuka-valley-walk', 'Mechuka valley and monastery walk',
   'Walk the valley floor and climb to the old monastery above town.',
   'An easy-to-moderate day walk with wide views of the valley and surrounding peaks.',
   'nature', 300, 150000),
  ('mechuka', 'sample-mechuka-riverside-camp', 'Siyom riverside camping night',
   'Overnight camp by the river with a bonfire and simple local meals.',
   'Tents, sleeping bags and meals provided. Nights are cold; bring warm layers.',
   'adventure', 1440, 350000),
  ('roing', 'sample-mayodia-pass-drive', 'Mayodia Pass day trip',
   'Drive up to the pass for views and, in winter, snow.',
   'A winding mountain drive with stops at viewpoints. Road conditions change quickly in winter.',
   'nature', 480, 300000),
  ('roing', 'sample-roing-lakes-walk', 'Lakes and Idu Mishmi village walk',
   'Easy walk to quiet lakes and a nearby village.',
   'A relaxed half day with a local host, visiting lakes and meeting people in a nearby village.',
   'culture', 240, 100000),
  ('tawang', 'sample-tawang-yoga-day', 'Mountain yoga and meditation day',
   'A calm day of yoga, breathing and meditation with mountain views.',
   'Gentle sessions suitable for beginners, with a simple vegetarian lunch.',
   'wellness', 360, 200000)
) as e(dest, slug, title, summary, description, category, minutes, price)
join public.destinations d on d.slug = e.dest
cross join (select id from public.providers where slug = 'himverse-sample-listings') p
on conflict (slug) do nothing;

commit;
