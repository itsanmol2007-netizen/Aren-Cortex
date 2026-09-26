-- Structured assessments: one row per assessment-at-a-site on a prescription.
-- The composed line ("Fracture — Left forearm, open, displaced") is still
-- written to the prescription's plain diagnosis text, so every existing
-- reader (print, review, older app builds) is unaffected.
create table if not exists public.prescription_assessments (
    id uuid primary key default gen_random_uuid(),
    prescription_id uuid not null references public.prescriptions(id) on delete cascade,
    intent_id bigint references public.intents(id),
    label text not null,
    family text not null,
    region text,
    side text check (side in ('left','right')),
    aspect text check (aspect in ('front','back')),
    site_label text,
    details jsonb not null default '{}'::jsonb,
    text text not null,
    sort_order integer default 0,
    created_at timestamptz not null default now()
);
create index if not exists prescription_assessments_rx_idx on public.prescription_assessments(prescription_id);
alter table public.prescription_assessments enable row level security;
create policy hospital_isolation on public.prescription_assessments for all
    using (prescription_id in (select id from public.prescriptions where hospital_id = current_user_hospital_id()))
    with check (prescription_id in (select id from public.prescriptions where hospital_id = current_user_hospital_id()));

-- Missing orthopaedic assessments, ranked through the same rule table as
-- every other catalogue entry. Additive only.
with new_intents(label) as (values
    ('Fracture'), ('Dislocation'), ('Subluxation'), ('Ligament sprain'),
    ('Tendon injury'), ('Muscle strain'), ('Cartilage / osteochondral injury'),
    ('Osteoarthritis'), ('Spine disorder'), ('Soft-tissue injury / contusion'),
    ('Wound'), ('Local infection'), ('Delayed union / non-union / malunion'),
    ('Osteonecrosis (AVN)')
)
insert into public.intents (type, label, is_active)
select 'finding', n.label, true from new_intents n
where not exists (select 1 from public.intents i where i.type = 'finding' and lower(i.label) = lower(n.label));

with rules(label, signal_id, weight) as (values
    ('Fracture', 'TRAUMA_HISTORY', 0.50), ('Fracture', 'JOINT_DEFORMITY', 0.45), ('Fracture', 'BONE_PAIN', 0.30),
    ('Fracture', 'SWELLING_LOCALISED', 0.20), ('Fracture', 'PAIN_SEVERE', 0.15),
    ('Dislocation', 'JOINT_DEFORMITY', 0.50), ('Dislocation', 'TRAUMA_HISTORY', 0.40), ('Dislocation', 'JOINT_INSTABILITY', 0.30),
    ('Subluxation', 'JOINT_INSTABILITY', 0.40), ('Subluxation', 'TRAUMA_HISTORY', 0.20),
    ('Ligament sprain', 'TRAUMA_HISTORY', 0.35), ('Ligament sprain', 'JOINT_INSTABILITY', 0.35), ('Ligament sprain', 'JOINT_SWELLING', 0.25),
    ('Tendon injury', 'SOFT_TISSUE_TENDERNESS', 0.30), ('Tendon injury', 'WEAKNESS_FOCAL', 0.20), ('Tendon injury', 'TRAUMA_HISTORY', 0.20),
    ('Muscle strain', 'SOFT_TISSUE_TENDERNESS', 0.35), ('Muscle strain', 'TRAUMA_HISTORY', 0.25), ('Muscle strain', 'PAIN_ACUTE', 0.20),
    ('Cartilage / osteochondral injury', 'JOINT_SWELLING', 0.25), ('Cartilage / osteochondral injury', 'JOINT_CREPITUS', 0.20),
    ('Cartilage / osteochondral injury', 'TRAUMA_HISTORY', 0.20),
    ('Osteoarthritis', 'JOINT_CREPITUS', 0.40), ('Osteoarthritis', 'STIFFNESS_POST_REST', 0.30), ('Osteoarthritis', 'JOINT_PAIN', 0.25),
    ('Osteoarthritis', 'PAIN_CHRONIC', 0.20),
    ('Spine disorder', 'LOW_BACK_PAIN', 0.20), ('Spine disorder', 'NECK_PAIN', 0.20), ('Spine disorder', 'BACK_PAIN_UPPER', 0.25),
    ('Soft-tissue injury / contusion', 'TRAUMA_HISTORY', 0.40), ('Soft-tissue injury / contusion', 'SOFT_TISSUE_TENDERNESS', 0.30),
    ('Soft-tissue injury / contusion', 'SWELLING_LOCALISED', 0.25),
    ('Wound', 'TRAUMA_HISTORY', 0.30), ('Wound', 'BLEEDING', 0.25), ('Wound', 'SKIN_ULCER', 0.30),
    ('Local infection', 'SWELLING_LOCALISED', 0.30), ('Local infection', 'ACUTE_MONOARTHRITIS', 0.30), ('Local infection', 'FEVER', 0.25),
    ('Delayed union / non-union / malunion', 'BONE_PAIN', 0.20), ('Delayed union / non-union / malunion', 'JOINT_DEFORMITY', 0.20),
    ('Delayed union / non-union / malunion', 'PAIN_CHRONIC', 0.15),
    ('Osteonecrosis (AVN)', 'HIP_PAIN', 0.20), ('Osteonecrosis (AVN)', 'NIGHT_PAIN', 0.15), ('Osteonecrosis (AVN)', 'PAIN_AT_REST', 0.15)
)
insert into public.signal_intent_rules (signal_id, intent_id, weight, rationale)
select r.signal_id, i.id, r.weight, 'Ortho assessment families, 2026-09'
from rules r
join public.intents i on i.type = 'finding' and i.label = r.label
join public.signals s on s.id = r.signal_id
where not exists (select 1 from public.signal_intent_rules x where x.signal_id = r.signal_id and x.intent_id = i.id);
