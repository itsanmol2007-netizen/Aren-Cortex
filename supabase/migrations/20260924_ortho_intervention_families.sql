-- Interventions become configurable families. Every new column is nullable
-- or defaulted, so older app builds inserting (label, site, side, notes)
-- keep working unchanged.
alter table public.prescription_interventions
    add column if not exists family text,
    add column if not exists region text,
    add column if not exists aspect text check (aspect in ('front','back')),
    add column if not exists details jsonb not null default '{}'::jsonb,
    add column if not exists text text,
    add column if not exists status text not null default 'performed' check (status in ('performed','planned')),
    add column if not exists due_date date,
    add column if not exists assessment_text text,
    add column if not exists removes_id uuid references public.prescription_interventions(id) on delete set null;

-- Families the catalogue was missing. Additive only.
with new_intents(label) as (values
    ('Injection (joint / soft tissue)'), ('Wound cleaning / irrigation'),
    ('Dressing'), ('Dressing change')
)
insert into public.intents (type, label, is_active)
select 'modality', n.label, true from new_intents n
where not exists (select 1 from public.intents i where i.type = 'modality' and lower(i.label) = lower(n.label));

with rules(label, signal_id, weight) as (values
    ('Injection (joint / soft tissue)', 'KNEE_PAIN', 0.40), ('Injection (joint / soft tissue)', 'SHOULDER_PAIN', 0.40),
    ('Injection (joint / soft tissue)', 'TRIGGER_POINT', 0.40), ('Injection (joint / soft tissue)', 'SOFT_TISSUE_TENDERNESS', 0.30),
    ('Wound cleaning / irrigation', 'TRAUMA_HISTORY', 0.50), ('Wound cleaning / irrigation', 'BLEEDING', 0.30),
    ('Dressing', 'TRAUMA_HISTORY', 0.40), ('Dressing', 'SKIN_ULCER', 0.50),
    ('Dressing change', 'SKIN_ULCER', 0.40)
)
insert into public.signal_intent_rules (signal_id, intent_id, weight, rationale)
select r.signal_id, i.id, r.weight, 'Ortho intervention families, 2026-09'
from rules r
join public.intents i on i.type = 'modality' and i.label = r.label
join public.signals s on s.id = r.signal_id
where not exists (select 1 from public.signal_intent_rules x where x.signal_id = r.signal_id and x.intent_id = i.id);
