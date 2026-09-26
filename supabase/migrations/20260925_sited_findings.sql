-- Sited findings: "Joint swelling / effusion - Right knee".
--
-- A local finding (swelling, tenderness, bruise, a cut, restricted range…)
-- used to be a bare chip with no place, anywhere in the chain: not in
-- visit_observations, not in the chart, not in the engine. So "swelling"
-- after a fall on the knee could not reach the knee X-ray, and the printed
-- case sheet read "Swelling" with no idea where. Additive and nullable only:
-- the deployed app ignores the new column and table.

-- 1. Which findings happen at a place on the body.
alter table public.observables add column if not exists localizable boolean not null default false;

update public.observables set localizable = true
where label in (
    'Localised swelling',
    'Redness / warmth / tenderness',
    'Joint gives way',
    'Restricted range of motion',
    'Joint swelling / effusion',
    'Joint crepitus',
    'Trigger point tenderness',
    'Soft tissue tenderness',
    'Positive instability test',
    'Joint stiffness',
    'Deformity of joint or limb',
    'Non-healing wound / ulcer',
    'Sudden severe pain and swelling in one joint',
    'Bruise / contusion',
    'Cut / laceration (fresh wound)',
    'Bony point tenderness'
);

-- 2. Where each finding was found, per visit. One row per finding per site
-- (swelling of both knees marked separately is two rows; "both" is one).
create table if not exists public.visit_observation_sites (
    id bigint generated always as identity primary key,
    visit_id uuid not null references public.visits(id) on delete cascade,
    observable_id bigint not null references public.observables(id),
    region text not null,
    side text check (side in ('left', 'right', 'both')),
    aspect text not null default 'front' check (aspect in ('front', 'back')),
    created_at timestamptz not null default now()
);
create index if not exists visit_observation_sites_visit_idx on public.visit_observation_sites (visit_id);

alter table public.visit_observation_sites enable row level security;
drop policy if exists visit_observation_sites_hospital on public.visit_observation_sites;
create policy visit_observation_sites_hospital on public.visit_observation_sites
    for all
    using (visit_id in (select v.id from public.visits v where v.hospital_id = public.current_user_hospital_id()))
    with check (visit_id in (select v.id from public.visits v where v.hospital_id = public.current_user_hospital_id()));

-- 3. Region signals. The engine is told where the problem is (a sited
-- finding, a body-map mark, an assessment's site) and these tilt the
-- ranking toward that region's imaging and conditions. Weights stay modest:
-- a place alone never outranks what was actually found there.
insert into public.signals (id, label, description, idf_weight) values
    ('SITE_KNEE', 'Problem at the knee', 'A finding, mark or assessment sited at the knee', 1.0),
    ('SITE_ANKLE_FOOT', 'Problem at the ankle / foot', 'A finding, mark or assessment sited at the ankle or foot', 1.0),
    ('SITE_WRIST_HAND', 'Problem at the wrist / hand', 'A finding, mark or assessment sited at the wrist or hand', 1.0),
    ('SITE_FOREARM', 'Problem at the forearm', 'A finding, mark or assessment sited at the forearm', 1.0),
    ('SITE_ELBOW', 'Problem at the elbow', 'A finding, mark or assessment sited at the elbow', 1.0),
    ('SITE_UPPER_ARM', 'Problem at the upper arm', 'A finding, mark or assessment sited at the upper arm', 1.0),
    ('SITE_SHOULDER', 'Problem at the shoulder', 'A finding, mark or assessment sited at the shoulder', 1.0),
    ('SITE_HIP', 'Problem at the hip', 'A finding, mark or assessment sited at the hip', 1.0),
    ('SITE_PELVIS', 'Problem at the pelvis', 'A finding, mark or assessment sited at the pelvis', 1.0),
    ('SITE_THIGH', 'Problem at the thigh', 'A finding, mark or assessment sited at the thigh', 1.0),
    ('SITE_LOWER_LEG', 'Problem at the lower leg', 'A finding, mark or assessment sited at the lower leg', 1.0),
    ('SITE_CERVICAL', 'Problem at the cervical spine', 'A finding, mark or assessment sited at the neck / cervical spine', 1.0),
    ('SITE_THORACIC', 'Problem at the thoracic spine', 'A finding, mark or assessment sited at the thoracic spine', 1.0),
    ('SITE_LUMBAR', 'Problem at the lumbar spine', 'A finding, mark or assessment sited at the lower back', 1.0)
on conflict (id) do nothing;

with rules(signal_id, itype, label, weight) as (values
    ('SITE_KNEE', 'test', 'X-Ray Knee', 0.50),
    ('SITE_KNEE', 'test', 'MRI Knee', 0.30),
    ('SITE_KNEE', 'finding', 'Meniscal injury', 0.35),
    ('SITE_KNEE', 'finding', 'Knee osteoarthritis', 0.30),
    ('SITE_ANKLE_FOOT', 'test', 'X-Ray Foot / Ankle', 0.50),
    ('SITE_ANKLE_FOOT', 'test', 'MRI Ankle', 0.25),
    ('SITE_ANKLE_FOOT', 'finding', 'Ankle sprain', 0.40),
    ('SITE_ANKLE_FOOT', 'finding', 'Plantar fasciitis', 0.20),
    ('SITE_ANKLE_FOOT', 'finding', 'Achilles tendinopathy', 0.25),
    ('SITE_WRIST_HAND', 'test', 'X-Ray Hand / Wrist', 0.50),
    ('SITE_WRIST_HAND', 'test', 'MRI Wrist', 0.25),
    ('SITE_WRIST_HAND', 'finding', 'Carpal tunnel syndrome', 0.25),
    ('SITE_WRIST_HAND', 'finding', 'De Quervain tenosynovitis', 0.25),
    ('SITE_FOREARM', 'test', 'X-Ray Forearm', 0.50),
    ('SITE_ELBOW', 'test', 'X-Ray Elbow', 0.50),
    ('SITE_ELBOW', 'finding', 'Lateral epicondylitis (Tennis Elbow)', 0.30),
    ('SITE_ELBOW', 'finding', 'Medial epicondylitis', 0.30),
    ('SITE_UPPER_ARM', 'test', 'X-Ray Humerus', 0.50),
    ('SITE_SHOULDER', 'test', 'X-Ray Shoulder', 0.50),
    ('SITE_SHOULDER', 'test', 'MRI Shoulder', 0.25),
    ('SITE_SHOULDER', 'finding', 'Rotator cuff tendinopathy', 0.30),
    ('SITE_SHOULDER', 'finding', 'Subacromial impingement', 0.30),
    ('SITE_SHOULDER', 'finding', 'Adhesive capsulitis (frozen shoulder)', 0.30),
    ('SITE_HIP', 'test', 'X-Ray Hip', 0.50),
    ('SITE_HIP', 'test', 'MRI Hip', 0.25),
    ('SITE_HIP', 'finding', 'Hip osteoarthritis', 0.30),
    ('SITE_HIP', 'finding', 'Trochanteric bursitis', 0.30),
    ('SITE_PELVIS', 'test', 'X-Ray Pelvis', 0.50),
    ('SITE_PELVIS', 'test', 'X-Ray Hip', 0.20),
    ('SITE_THIGH', 'test', 'X-Ray Femur', 0.50),
    ('SITE_LOWER_LEG', 'test', 'X-Ray Leg (Tibia / Fibula)', 0.50),
    ('SITE_CERVICAL', 'test', 'X-Ray Spine (Cervical)', 0.35),
    ('SITE_CERVICAL', 'test', 'MRI Spine (Cervical)', 0.20),
    ('SITE_CERVICAL', 'finding', 'Mechanical neck pain', 0.35),
    ('SITE_CERVICAL', 'finding', 'Cervical spondylosis', 0.35),
    ('SITE_THORACIC', 'finding', 'Spine disorder', 0.30),
    ('SITE_THORACIC', 'test', 'X-Ray (Other Site)', 0.30),
    ('SITE_LUMBAR', 'test', 'X-Ray Spine (Lumbar)', 0.35),
    ('SITE_LUMBAR', 'test', 'MRI Spine (Lumbar)', 0.20),
    ('SITE_LUMBAR', 'finding', 'Mechanical low back pain', 0.35),
    ('SITE_LUMBAR', 'finding', 'Spine disorder', 0.35)
)
insert into public.signal_intent_rules (signal_id, intent_id, weight, rationale)
select r.signal_id, i.id, r.weight, 'Region signal from sited findings, 2026-09'
from rules r join public.intents i on i.type = r.itype and i.label = r.label and i.is_active
where not exists (select 1 from public.signal_intent_rules x where x.signal_id = r.signal_id and x.intent_id = i.id);
