-- Limb imaging the catalogue was missing. Additive only; each gets a tests
-- row, an intent pointing at it, and ranking rules like the existing X-rays.
with new_tests(name) as (values
    ('X-Ray Elbow'), ('X-Ray Forearm'), ('X-Ray Humerus'), ('X-Ray Hip'),
    ('X-Ray Femur'), ('X-Ray Leg (Tibia / Fibula)'), ('X-Ray (Other Site)'),
    ('MRI Hip'), ('MRI Ankle'), ('MRI Wrist')
)
insert into public.tests (name, category, common, priority_tier)
select n.name, 'Imaging', false, 2 from new_tests n
where not exists (select 1 from public.tests t where lower(t.name) = lower(n.name));

insert into public.intents (type, label, ref_table, ref_id, is_active)
select 'test', t.name, 'tests', t.id, true from public.tests t
where t.name in ('X-Ray Elbow','X-Ray Forearm','X-Ray Humerus','X-Ray Hip','X-Ray Femur',
                 'X-Ray Leg (Tibia / Fibula)','X-Ray (Other Site)','MRI Hip','MRI Ankle','MRI Wrist')
  and not exists (select 1 from public.intents i where i.type = 'test' and lower(i.label) = lower(t.name));

with rules(label, signal_id, weight) as (values
    ('X-Ray Elbow', 'ELBOW_PAIN', 0.45), ('X-Ray Elbow', 'TRAUMA_HISTORY', 0.25),
    ('X-Ray Forearm', 'TRAUMA_HISTORY', 0.25), ('X-Ray Forearm', 'JOINT_DEFORMITY', 0.20),
    ('X-Ray Humerus', 'TRAUMA_HISTORY', 0.20), ('X-Ray Humerus', 'SHOULDER_PAIN', 0.15),
    ('X-Ray Hip', 'HIP_PAIN', 0.45), ('X-Ray Hip', 'TRAUMA_HISTORY', 0.20),
    ('X-Ray Femur', 'TRAUMA_HISTORY', 0.20), ('X-Ray Femur', 'BONE_PAIN', 0.20),
    ('X-Ray Leg (Tibia / Fibula)', 'TRAUMA_HISTORY', 0.20), ('X-Ray Leg (Tibia / Fibula)', 'BONE_PAIN', 0.20),
    ('X-Ray (Other Site)', 'TRAUMA_HISTORY', 0.15), ('X-Ray (Other Site)', 'BONE_PAIN', 0.15),
    ('MRI Hip', 'HIP_PAIN', 0.20), ('MRI Hip', 'NIGHT_PAIN', 0.10),
    ('MRI Ankle', 'ANKLE_FOOT_PAIN', 0.20), ('MRI Ankle', 'JOINT_INSTABILITY', 0.20),
    ('MRI Wrist', 'WRIST_HAND_PAIN', 0.20), ('MRI Wrist', 'JOINT_INSTABILITY', 0.10)
)
insert into public.signal_intent_rules (signal_id, intent_id, weight, rationale)
select r.signal_id, i.id, r.weight, 'Ortho limb imaging, 2026-09'
from rules r
join public.intents i on i.type = 'test' and i.label = r.label
join public.signals s on s.id = r.signal_id
where not exists (select 1 from public.signal_intent_rules x where x.signal_id = r.signal_id and x.intent_id = i.id);
