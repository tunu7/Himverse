-- SAMPLE CONTENT for a hosted environment (not a migration, not seed.sql).
--
-- Gives the public catalogue and the AI itinerary planner real-looking content
-- before real partners are onboarded: 10 sample partners with 16 experiences
-- between them (owner decision 2026-10-29). Every partner name says "(sample)".
--
-- BOOKABLE, for testing instant booking: each experience gets an open date every
-- day for the next 60 days (10 places a day), so travellers can book and pay a
-- deposit (when deposits are on). Nobody operates these partners: remove this
-- content before launch (remove.sql or remove-all.sql). Re-run to top the dates
-- back up to 60 days ahead.
--
-- Replaces the earlier single "Sample listings (not bookable)" provider: its
-- experiences move to the new partners or are removed.
--
-- One statement, so it runs as one transaction (`db query` refuses multi-statement
-- files). Idempotent (safe to re-run). Remove with supabase/sample-content/remove.sql.
-- Apply:  npx supabase db query --linked -f supabase/sample-content/apply.sql

do $$
begin
  insert into public.providers (slug, display_name, description, district, status, verified_at)
  values
    ('sample-tawang-monastery-tours', 'Tawang Monastery Tours (sample)',
     'Sample partner: monastery visits, village walks and a quiet day of yoga around Tawang.', 'Tawang', 'verified', now()),
    ('sample-sela-adventures', 'Sela Adventures (sample)',
     'Sample partner: day trips over the Sela Pass.', 'Tawang', 'verified', now()),
    ('sample-ziro-valley-hosts', 'Ziro Valley Hosts (sample)',
     'Sample partner: Apatani village walks and home-cooked meals.', 'Lower Subansiri', 'verified', now()),
    ('sample-ziro-trails', 'Ziro Trails (sample)',
     'Sample partner: forest treks above the Ziro valley.', 'Lower Subansiri', 'verified', now()),
    ('sample-dirang-valley-walks', 'Dirang Valley Walks (sample)',
     'Sample partner: hot springs, the old dzong and birding in the Sangti valley.', 'West Kameng', 'verified', now()),
    ('sample-bomdila-ridge-guides', 'Bomdila Ridge Guides (sample)',
     'Sample partner: town walks and ridge treks from Bomdila.', 'West Kameng', 'verified', now()),
    ('sample-siang-river-co', 'Siang River Co. (sample)',
     'Sample partner: rafting on the Siang and Adi village homestays.', 'East Siang', 'verified', now()),
    ('sample-namdapha-wild', 'Namdapha Wild (sample)',
     'Sample partner: guided rainforest walks in Namdapha National Park.', 'Changlang', 'verified', now()),
    ('sample-mechuka-valley-treks', 'Mechuka Valley Treks (sample)',
     'Sample partner: valley and monastery walks in Mechuka.', 'Shi Yomi', 'verified', now()),
    ('sample-mayodia-roads', 'Mayodia Roads (sample)',
     'Sample partner: mountain drives to the Mayodia Pass.', 'Lower Dibang Valley', 'verified', now())
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

  -- The 16 experiences. An existing sample experience with the same slug moves to
  -- its new partner and becomes bookable again.
  insert into public.experiences
    (provider_id, destination_id, slug, title, summary, description, category, duration_minutes, price_from_minor, status)
  select p.id, d.id, e.slug, e.title, e.summary, e.description, e.category::public.experience_category, e.minutes, e.price, 'published'
  from (values
    ('sample-tawang-monastery-tours', 'tawang', 'sample-tawang-monastery-morning', 'Tawang Monastery morning visit',
     'Early visit to the monastery during morning prayers, with time in the courtyard and museum.',
     'Arrive as the monastery wakes up, listen to morning prayers and explore the library and museum with a local guide. Dress warmly and modestly.',
     'culture', 180, 80000),
    ('sample-tawang-monastery-tours', 'tawang', 'sample-tawang-village-walk', 'Monpa village walk',
     'Gentle walk through Monpa villages, prayer wheels and fields around Tawang.',
     'A half-day walk on village paths with a local host, stopping at homes, prayer wheels and a small gompa.',
     'culture', 210, 120000),
    ('sample-tawang-monastery-tours', 'tawang', 'sample-tawang-yoga-day', 'Mountain yoga and meditation day',
     'A calm day of yoga, breathing and meditation with mountain views.',
     'Gentle sessions suitable for beginners, with a simple vegetarian lunch.',
     'wellness', 360, 200000),
    ('sample-sela-adventures', 'tawang', 'sample-sela-pass-day-trip', 'Sela Pass and lake day trip',
     'Full-day drive to the high pass and its lake, with stops for views and tea.',
     'A long scenic drive to one of the highest motorable passes in the region, with time at the lake. Weather can close the road; carry warm layers.',
     'adventure', 540, 450000),
    ('sample-ziro-valley-hosts', 'ziro', 'sample-ziro-apatani-villages', 'Apatani villages and rice fields',
     'Walk between Apatani villages and learn how rice and fish are farmed together.',
     'A guided walk through traditional villages and terraced fields. Learn about Apatani farming, crafts and daily life from local hosts.',
     'culture', 240, 150000),
    ('sample-ziro-valley-hosts', 'ziro', 'sample-ziro-food-trail', 'Apatani home kitchen lunch',
     'Cook and share a traditional lunch with an Apatani family.',
     'Help prepare a home-style meal of local greens, rice and smoked dishes, then eat together. Vegetarian options on request.',
     'food_and_drink', 150, 90000),
    ('sample-ziro-trails', 'ziro', 'sample-ziro-pine-hills-trek', 'Ziro pine hills trek',
     'Half-day trek through pine and bamboo forest above the valley.',
     'A moderate trek on forest trails with views over the valley floor. Suitable for most walkers with reasonable fitness.',
     'trekking', 300, 180000),
    ('sample-dirang-valley-walks', 'dirang', 'sample-dirang-hot-springs', 'Hot springs and dzong half day',
     'Soak in natural hot springs and visit the old stone dzong.',
     'Relax at the hot springs by the river, then walk to the historic dzong and village nearby.',
     'wellness', 240, 70000),
    ('sample-dirang-valley-walks', 'dirang', 'sample-sangti-valley-birding', 'Sangti valley birding morning',
     'Early birding walk in a quiet valley known for winter migrants.',
     'A slow morning walk with binoculars along the river and fields. Best from November to March.',
     'wildlife', 300, 200000),
    ('sample-bomdila-ridge-guides', 'bomdila', 'sample-bomdila-monastery-market', 'Monastery and market stroll',
     'Visit the monastery and wander the town market with a local guide.',
     'An easy half day combining the monastery with the bazaar, local snacks and handicraft shops.',
     'culture', 210, 60000),
    ('sample-bomdila-ridge-guides', 'bomdila', 'sample-bomdila-dirang-trek', 'Bomdila to Dirang ridge trek',
     'Two-day trek along ridges and through villages, overnight in a homestay.',
     'A two-day trek with a night in a village homestay. Moderate to demanding; porters and meals included in the indicative price.',
     'trekking', 2880, 900000),
    ('sample-siang-river-co', 'pasighat', 'sample-siang-river-rafting', 'Siang river rafting',
     'A day on the Siang with a professional rafting crew.',
     'Rafting on a stretch of the Siang suited to first-timers and experienced paddlers, depending on the season and water level.',
     'adventure', 360, 350000),
    ('sample-siang-river-co', 'pasighat', 'sample-adi-village-homestay', 'Adi village homestay night',
     'Spend a night with an Adi family, with dinner and stories by the fire.',
     'Stay overnight in a bamboo house, share meals and learn about Adi traditions and crafts.',
     'culture', 1440, 280000),
    ('sample-namdapha-wild', 'namdapha', 'sample-namdapha-jungle-walk', 'Namdapha rainforest walk',
     'Guided day walk in the rainforest, looking for hornbills and gibbons.',
     'A long day on forest trails with an experienced guide. Leeches are common in wet months; good shoes essential.',
     'wildlife', 480, 400000),
    ('sample-mechuka-valley-treks', 'mechuka', 'sample-mechuka-valley-walk', 'Mechuka valley and monastery walk',
     'Walk the valley floor and climb to the old monastery above town.',
     'An easy-to-moderate day walk with wide views of the valley and surrounding peaks.',
     'nature', 300, 150000),
    ('sample-mayodia-roads', 'roing', 'sample-mayodia-pass-drive', 'Mayodia Pass day trip',
     'Drive up to the pass for views and, in winter, snow.',
     'A winding mountain drive with stops at viewpoints. Road conditions change quickly in winter.',
     'nature', 480, 300000)
  ) as e(partner, dest, slug, title, summary, description, category, minutes, price)
  join public.destinations d on d.slug = e.dest
  join public.providers p on p.slug = e.partner
  on conflict (slug) do update
    set provider_id = excluded.provider_id, price_from_minor = excluded.price_from_minor,
        status = 'published', accepts_bookings = true;

  -- Retire the earlier single sample provider and the experiences not kept above
  -- (they never had dates, so they have no bookings).
  delete from public.experiences
  where provider_id = (select id from public.providers where slug = 'himverse-sample-listings');
  delete from public.providers where slug = 'himverse-sample-listings';

  -- An open date every day for the next 60 days, 10 places each.
  insert into public.availability_slots (experience_id, starts_on, capacity)
  select e.id, private.today_ist() + g.day, 10
  from public.experiences e
  join public.providers p on p.id = e.provider_id
    and p.slug in ('sample-tawang-monastery-tours', 'sample-sela-adventures', 'sample-ziro-valley-hosts', 'sample-ziro-trails',
      'sample-dirang-valley-walks', 'sample-bomdila-ridge-guides', 'sample-siang-river-co', 'sample-namdapha-wild',
      'sample-mechuka-valley-treks', 'sample-mayodia-roads')
  cross join generate_series(1, 60) as g(day)
  on conflict on constraint availability_slots_unique do nothing;
end $$;
