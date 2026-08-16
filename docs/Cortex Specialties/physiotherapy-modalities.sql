-- ---------------------------------------------------------------------------
-- PHYSIOTHERAPY MODALITIES — the in-clinic therapy catalogue.
--
-- APPLIED 2026-08-16, with Anmol's authorisation, as four migrations:
--   modality_intent_type_and_therapy_notes
--   physiotherapy_modality_catalogue
--   physiotherapy_modality_rules
--   physiotherapy_modality_guards
--
-- Kept as the readable record of WHAT was applied and WHY, because this repo
-- has no supabase/migrations directory — the atlas prose and this file are the
-- only human-readable account of the schema's history.
--
-- ⚠ Two corrections were made between drafting and applying, both found by the
-- database rejecting the statement rather than by review:
--   · the guards table is `intent_guards`, not `guards`;
--   · `intent_guards_one_target` allows exactly ONE of target_type /
--     target_class_id / target_intent_id, so these per-intent guards must NOT
--     also set target_type. The constraint's own type list was widened to know
--     about `modality` anyway, so the first type-level guard someone writes
--     does not fail years from now.
-- The version below is corrected to match what actually ran.
--
-- ── What this is
--
-- `modality` is the seventh intent type (see IntentType in lib/synapse/engine.ts).
-- It is what the CLINIC DELIVERS during the session, as opposed to `exercise`,
-- which is what the patient does at home. Cortex had 33 exercise intents and
-- ZERO modalities, so a physiotherapist could prescribe homework and had no way
-- to record what they actually did to the patient for the forty minutes they
-- were in the building — which is most of what a physiotherapy visit consists
-- of.
--
-- ── How the signals below were chosen
--
-- Every signal referenced here already exists and is already in use. They were
-- read off the live database, not invented: the 18 that the existing exercise
-- intents are already keyed on, plus the musculoskeletal vocabulary that was
-- already authored and had nothing physiotherapy-shaped hanging off it
-- (MUSCLE_SPASM, JOINT_SWELLING, ROM_RESTRICTED, STIFFNESS_MORNING,
-- RADICULOPATHY_CERVICAL / _LUMBAR, JOINT_INSTABILITY, MUSCLE_ATROPHY, ...).
--
-- This matters because of the lesson in atlas §14.21: an intent with no rule
-- behind it displays and ranks NOTHING. Every row below is attached to a signal
-- a real chip or measurement can actually raise.
--
-- ── Weights
--
-- 0.9 = this is the textbook first-line modality for that presentation
-- 0.7–0.8 = commonly used and defensible
-- 0.5–0.6 = reasonable, offered lower down
--
-- Nothing here is safety-critical, so `is_safety_critical` is false throughout.
-- Safety in this catalogue is expressed as GUARDS, at the bottom.
--
-- ── The honest gaps, stated rather than hidden
--
-- 1. CONTRAINDICATIONS ARE THINLY COVERED. The one guard below is the one this
--    build can express: PREGNANCY exists as a signal, so short-wave diathermy
--    and lumbar traction can be warned about. The contraindications that
--    matter just as much — a cardiac pacemaker with any electrotherapy, metal
--    implants with SWD, malignancy over the treatment field, DVT, acute
--    fracture with traction, impaired sensation with heat — have NO SIGNAL in
--    the catalogue today, so they cannot be guarded. They need observables
--    first. Do not read the short guard list as "these are the risks".
-- 2. Dosage is in the label rather than structured. "Ultrasound 1 MHz, 7 min"
--    is one string, so a physio who wants 5 minutes edits prose. That is the
--    same shape `exercise` already uses ("3 sets x 12") and it is fine for a
--    first pass; a real dosage model is its own piece of work.
-- 3. Laterality is not captured. "Ultrasound to the right knee" is not
--    expressible; the modality is recorded and the site lives in the chart.
-- ---------------------------------------------------------------------------

begin;

-- ── 1. Let the type exist ──────────────────────────────────────────────────
alter table public.intents drop constraint intents_type_check;
alter table public.intents add constraint intents_type_check
  check (type = any (array[
    'medicine'::text, 'test'::text, 'exercise'::text, 'modality'::text,
    'referral'::text, 'finding'::text, 'advice'::text
  ]));

-- ── 2. Somewhere to record what was delivered ──────────────────────────────
-- Its own column rather than more lines in `advice_notes`, so "what did we do
-- in session 4" is answerable without a human reading prose.
alter table public.prescriptions add column if not exists therapy_notes text;

-- ── 3. The catalogue ───────────────────────────────────────────────────────
-- ref_table / ref_id stay NULL: there is no `modalities` reference table and
-- these are not products. `intents_ref_complete` requires both or neither.

insert into public.intents (type, label, is_active) values
  -- Electrotherapy
  ('modality', 'Therapeutic ultrasound — 1 MHz, 7 min',              true),
  ('modality', 'Interferential therapy (IFT) — 15 min',              true),
  ('modality', 'TENS — 20 min',                                      true),
  ('modality', 'Short-wave diathermy — 15 min',                      true),
  ('modality', 'Electrical muscle stimulation — 15 min',             true),
  ('modality', 'Low-level laser therapy — 8 min',                    true),
  -- Thermal
  ('modality', 'Moist heat pack — 15 min',                           true),
  ('modality', 'Paraffin wax bath — 15 min',                         true),
  ('modality', 'Cryotherapy / ice pack — 10 min',                    true),
  ('modality', 'Contrast bath — 15 min',                             true),
  -- Manual
  ('modality', 'Soft tissue mobilisation — 15 min',                  true),
  ('modality', 'Joint mobilisation (Maitland) — 10 min',             true),
  ('modality', 'Myofascial release — 15 min',                        true),
  ('modality', 'Muscle energy technique — 10 min',                   true),
  ('modality', 'Dry needling / trigger point release',               true),
  ('modality', 'Cupping therapy — 10 min',                           true),
  -- Traction
  ('modality', 'Intermittent cervical traction — 15 min',            true),
  ('modality', 'Intermittent lumbar traction — 15 min',              true),
  -- Supervised, in-clinic
  ('modality', 'Supervised therapeutic exercise — in clinic',        true),
  ('modality', 'Gait training with assistive device',                true),
  ('modality', 'Balance and proprioceptive training — in clinic',    true),
  ('modality', 'Postural re-education — in clinic',                  true),
  ('modality', 'Kinesio taping',                                     true);

-- ── 4. What makes each one rank ────────────────────────────────────────────
-- Written against the label so this block is readable and re-runnable without
-- hard-coding generated ids.

insert into public.signal_intent_rules (signal_id, intent_id, weight, is_safety_critical, rationale, is_active)
select v.signal_id, i.id, v.weight, false, v.rationale, true
from (values
  -- Therapeutic ultrasound — soft tissue and tendon, localised
  ('Therapeutic ultrasound — 1 MHz, 7 min', 'SHOULDER_PAIN',        0.8, 'Rotator cuff and peritendinous soft tissue'),
  ('Therapeutic ultrasound — 1 MHz, 7 min', 'ELBOW_PAIN',           0.8, 'Lateral / medial epicondylalgia'),
  ('Therapeutic ultrasound — 1 MHz, 7 min', 'KNEE_PAIN',            0.7, 'Peripatellar soft tissue'),
  ('Therapeutic ultrasound — 1 MHz, 7 min', 'WRIST_HAND_PAIN',      0.7, 'Tenosynovitis and localised wrist pain'),
  ('Therapeutic ultrasound — 1 MHz, 7 min', 'ANKLE_FOOT_PAIN',      0.7, 'Plantar fascia and Achilles'),
  ('Therapeutic ultrasound — 1 MHz, 7 min', 'SWELLING_LOCALISED',   0.6, 'Localised soft tissue swelling'),

  -- IFT — deep, large joints and spine
  ('Interferential therapy (IFT) — 15 min', 'LOW_BACK_PAIN',        0.9, 'First-line electroanalgesia for mechanical low back pain'),
  ('Interferential therapy (IFT) — 15 min', 'NECK_PAIN',            0.8, 'Cervical mechanical pain'),
  ('Interferential therapy (IFT) — 15 min', 'KNEE_PAIN',            0.8, 'Osteoarthritic and post-injury knee pain'),
  ('Interferential therapy (IFT) — 15 min', 'HIP_PAIN',             0.7, 'Deep tissue penetration suits the hip'),
  ('Interferential therapy (IFT) — 15 min', 'BACK_PAIN_UPPER',      0.7, 'Thoracic mechanical pain'),
  ('Interferential therapy (IFT) — 15 min', 'PAIN_CHRONIC',         0.7, 'Chronic musculoskeletal pain'),

  -- TENS — pain modulation, including radicular
  ('TENS — 20 min', 'PAIN_CHRONIC',                                 0.9, 'Gate-control analgesia for persistent pain'),
  ('TENS — 20 min', 'LOW_BACK_PAIN',                                0.8, 'Mechanical low back pain'),
  ('TENS — 20 min', 'NECK_PAIN',                                    0.7, 'Cervical pain'),
  ('TENS — 20 min', 'PAIN_SEVERE',                                  0.7, 'Adjunct where pain limits participation'),
  ('TENS — 20 min', 'RADICULOPATHY_LUMBAR',                         0.6, 'Radicular pain modulation'),

  -- SWD — deep heating
  ('Short-wave diathermy — 15 min', 'LOW_BACK_PAIN',                0.7, 'Deep heating of paraspinal musculature'),
  ('Short-wave diathermy — 15 min', 'HIP_PAIN',                     0.7, 'Reaches the deep hip joint'),
  ('Short-wave diathermy — 15 min', 'STIFFNESS_POST_REST',          0.6, 'Pre-exercise tissue warming'),
  ('Short-wave diathermy — 15 min', 'PAIN_CHRONIC',                 0.6, 'Chronic deep musculoskeletal pain'),

  -- EMS — re-education of weak or wasted muscle
  ('Electrical muscle stimulation — 15 min', 'MUSCLE_ATROPHY',      0.9, 'Disuse atrophy, notably quadriceps post-immobilisation'),
  ('Electrical muscle stimulation — 15 min', 'MUSCLE_WEAKNESS',     0.8, 'Assists recruitment where voluntary contraction is poor'),
  ('Electrical muscle stimulation — 15 min', 'WEAKNESS_FOCAL',      0.7, 'Focal weakness with intact lower motor neurone'),

  -- LLLT
  ('Low-level laser therapy — 8 min', 'ELBOW_PAIN',                 0.6, 'Epicondylalgia'),
  ('Low-level laser therapy — 8 min', 'WRIST_HAND_PAIN',            0.6, 'Small joint and tendon pain'),
  ('Low-level laser therapy — 8 min', 'ANKLE_FOOT_PAIN',            0.5, 'Plantar fasciitis adjunct'),

  -- Moist heat
  ('Moist heat pack — 15 min', 'MUSCLE_SPASM',                      0.9, 'Superficial heat reduces guarding before manual work'),
  ('Moist heat pack — 15 min', 'STIFFNESS_MORNING',                 0.8, 'Morning stiffness'),
  ('Moist heat pack — 15 min', 'STIFFNESS_POST_REST',               0.7, 'Gelling after inactivity'),
  ('Moist heat pack — 15 min', 'LOW_BACK_PAIN',                     0.7, 'Standard pre-treatment for mechanical back pain'),
  ('Moist heat pack — 15 min', 'NECK_PAIN',                         0.7, 'Cervical muscular pain'),

  -- Wax
  ('Paraffin wax bath — 15 min', 'WRIST_HAND_PAIN',                 0.8, 'Small joints of the hand'),
  ('Paraffin wax bath — 15 min', 'STIFFNESS_MORNING',               0.7, 'Inflammatory morning stiffness of the hands'),
  ('Paraffin wax bath — 15 min', 'GRIP_WEAKNESS',                   0.5, 'Precedes grip work'),

  -- Cryotherapy — the acute counterpart to heat
  ('Cryotherapy / ice pack — 10 min', 'PAIN_ACUTE',                 0.9, 'Acute injury; heat is contraindicated here'),
  ('Cryotherapy / ice pack — 10 min', 'JOINT_SWELLING',             0.9, 'Acute joint effusion'),
  ('Cryotherapy / ice pack — 10 min', 'SWELLING_LOCALISED',         0.8, 'Localised post-traumatic swelling'),

  ('Contrast bath — 15 min', 'ANKLE_FOOT_PAIN',                     0.6, 'Sub-acute distal limb swelling'),
  ('Contrast bath — 15 min', 'SWELLING_LOCALISED',                  0.6, 'Sub-acute oedema'),

  -- Manual therapy
  ('Soft tissue mobilisation — 15 min', 'MUSCLE_SPASM',             0.9, 'Direct treatment of protective muscle guarding'),
  ('Soft tissue mobilisation — 15 min', 'NECK_PAIN',                0.7, 'Cervical and upper trapezius'),
  ('Soft tissue mobilisation — 15 min', 'BACK_PAIN_UPPER',          0.7, 'Thoracic paraspinals'),
  ('Soft tissue mobilisation — 15 min', 'PAIN_CHRONIC',             0.6, 'Chronic myofascial pain'),

  ('Joint mobilisation (Maitland) — 10 min', 'ROM_RESTRICTED',        0.9, 'The primary treatment for a stiff joint'),
  ('Joint mobilisation (Maitland) — 10 min', 'ROM_RESTRICTED_SEVERE', 0.9, 'Marked capsular restriction'),
  ('Joint mobilisation (Maitland) — 10 min', 'ROM_PAINFUL_ARC',       0.8, 'Painful arc responds to graded mobilisation'),
  ('Joint mobilisation (Maitland) — 10 min', 'STIFFNESS_POST_REST',   0.6, 'Capsular gelling'),

  ('Myofascial release — 15 min', 'MUSCLE_SPASM',                   0.8, 'Myofascial restriction and guarding'),
  ('Myofascial release — 15 min', 'PAIN_CHRONIC',                   0.6, 'Chronic myofascial pain'),

  ('Muscle energy technique — 10 min', 'MUSCLE_SPASM',              0.7, 'Post-isometric relaxation'),
  ('Muscle energy technique — 10 min', 'ROM_RESTRICTED',            0.7, 'Muscular rather than capsular restriction'),

  ('Dry needling / trigger point release', 'MUSCLE_SPASM',          0.8, 'Trigger points within a taut band'),
  ('Dry needling / trigger point release', 'BACK_PAIN_UPPER',       0.6, 'Thoracic and scapular trigger points'),
  ('Dry needling / trigger point release', 'PAIN_CHRONIC',          0.6, 'Chronic myofascial pain'),

  ('Cupping therapy — 10 min', 'MUSCLE_SPASM',                      0.6, 'Myofascial decompression'),
  ('Cupping therapy — 10 min', 'LOW_BACK_PAIN',                     0.5, 'Adjunct for mechanical back pain'),

  -- Traction — the radicular presentations
  ('Intermittent cervical traction — 15 min', 'RADICULOPATHY_CERVICAL', 0.9, 'Foraminal decompression'),
  ('Intermittent cervical traction — 15 min', 'NECK_STIFFNESS',         0.7, 'Cervical restriction'),
  ('Intermittent cervical traction — 15 min', 'NECK_PAIN',              0.6, 'Cervical pain with a mechanical pattern'),
  ('Intermittent cervical traction — 15 min', 'TINGLING',               0.5, 'Upper limb paraesthesia of cervical origin'),

  ('Intermittent lumbar traction — 15 min', 'RADICULOPATHY_LUMBAR',   0.9, 'Lumbar nerve root decompression'),
  ('Intermittent lumbar traction — 15 min', 'LOW_BACK_PAIN',          0.6, 'Where a discogenic pattern is suspected'),
  ('Intermittent lumbar traction — 15 min', 'NUMBNESS',               0.5, 'Lower limb numbness of lumbar origin'),

  -- Supervised in-clinic work
  ('Supervised therapeutic exercise — in clinic', 'MUSCLE_WEAKNESS', 0.8, 'Loaded work under supervision before it is given as homework'),
  ('Supervised therapeutic exercise — in clinic', 'ROM_RESTRICTED',  0.6, 'Active-assisted range work'),
  ('Supervised therapeutic exercise — in clinic', 'MOBILITY_LIMITED', 0.6, 'Graded functional retraining'),

  ('Gait training with assistive device', 'GAIT_ABNORMAL',           0.9, 'The definitive treatment for an abnormal gait'),
  ('Gait training with assistive device', 'MOBILITY_LIMITED',        0.8, 'Restoring safe ambulation'),
  ('Gait training with assistive device', 'BALANCE_IMPAIRED',        0.6, 'Gait and balance are trained together'),

  ('Balance and proprioceptive training — in clinic', 'BALANCE_IMPAIRED',  0.9, 'Direct treatment of the impairment'),
  ('Balance and proprioceptive training — in clinic', 'JOINT_INSTABILITY', 0.8, 'Proprioceptive retraining after ligament injury'),
  ('Balance and proprioceptive training — in clinic', 'GAIT_ABNORMAL',     0.6, 'Balance underlies gait'),

  ('Postural re-education — in clinic', 'BACK_PAIN_UPPER',           0.7, 'Postural thoracic pain'),
  ('Postural re-education — in clinic', 'NECK_PAIN',                 0.6, 'Forward head posture'),

  ('Kinesio taping', 'JOINT_INSTABILITY',                            0.7, 'Proprioceptive feedback for an unstable joint'),
  ('Kinesio taping', 'KNEE_PAIN',                                    0.6, 'Patellofemoral offloading'),
  ('Kinesio taping', 'SHOULDER_PAIN',                                0.5, 'Scapular positioning'),
  ('Kinesio taping', 'SWELLING_LOCALISED',                           0.5, 'Lymphatic taping for local oedema')
) as v(label, signal_id, weight, rationale)
join public.intents i on i.label = v.label and i.type = 'modality';

-- ── 5. Guards ──────────────────────────────────────────────────────────────
-- ⚠ READ THE "HONEST GAPS" NOTE AT THE TOP. This is what CAN be expressed
-- today, not the list of things that can go wrong. Pacemaker, metal implant,
-- malignancy, DVT, acute fracture and impaired sensation all need observables
-- that do not exist yet, and until they do those risks are the physio's alone.
--
-- `warn`, not `warn_hard`: these are relative contraindications a
-- physiotherapist weighs, and doctrine §5 is explicit that guards warn and
-- never hide.

alter table public.intent_guards drop constraint intent_guards_target_type_check;
alter table public.intent_guards add constraint intent_guards_target_type_check
  check (target_type = any (array[
    'medicine'::text, 'test'::text, 'exercise'::text, 'modality'::text,
    'referral'::text, 'finding'::text, 'advice'::text
  ]));

insert into public.intent_guards (signal_id, action, target_intent_id, reason, is_active)
select 'PREGNANCY', 'warn', i.id,
       'Avoid in pregnancy — deep heating and traction are contraindicated over the abdomen and lumbar spine.',
       true
from public.intents i
where i.type = 'modality'
  and i.label in (
    'Short-wave diathermy — 15 min',
    'Intermittent lumbar traction — 15 min'
  );

alter table public.intent_guards drop constraint intent_guards_target_type_check;
alter table public.intent_guards add constraint intent_guards_target_type_check
  check (target_type = any (array[
    'medicine'::text, 'test'::text, 'exercise'::text, 'modality'::text,
    'referral'::text, 'finding'::text, 'advice'::text
  ]));

insert into public.intent_guards (signal_id, action, target_intent_id, reason, is_active)
select 'PREGNANCY', 'warn', i.id,
       'Avoid placing electrodes over the abdomen or lumbar spine in pregnancy.',
       true
from public.intents i
where i.type = 'modality'
  and i.label in (
    'Interferential therapy (IFT) — 15 min',
    'TENS — 20 min'
  );

-- Heat is wrong in the acute phase — the one guard here that is about timing
-- rather than about the patient, and the mistake a junior physiotherapist
-- actually makes.
insert into public.intent_guards (signal_id, action, target_intent_id, reason, is_active)
select 'PAIN_ACUTE', 'warn', i.id,
       'Acute presentation — heat can worsen acute inflammation. Consider cryotherapy first.',
       true
from public.intents i
where i.type = 'modality'
  and i.label in (
    'Moist heat pack — 15 min',
    'Short-wave diathermy — 15 min',
    'Paraffin wax bath — 15 min'
  );

commit;

-- ── Verified after applying, 2026-08-16 ────────────────────────────────────
--   23 modalities, 79 rules, 7 guards
--   0 modalities with no rule behind them        (the §14.21 failure mode)
--   0 rules naming a signal that does not exist  (the RELEVANT_FIELDS failure mode)
--   prescriptions.therapy_notes exists
--
-- And end to end through the real search function, which is what proves a
-- modality is REACHABLE and not merely rankable:
--   select * from search_intents('knee', 24, array['modality','exercise']);
--   -> IFT, therapeutic ultrasound and kinesio taping, all matched via the
--      "Knee pain" observable, ranked above the home exercises.
