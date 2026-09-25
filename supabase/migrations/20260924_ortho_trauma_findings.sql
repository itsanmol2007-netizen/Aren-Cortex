-- Trauma findings the catalogue was missing. "Bruising easily" is a
-- bleeding-disorder symptom and "Non-healing wound / ulcer" a chronic
-- ulcer; neither is a bruise or a fresh cut from a fall. Additive only.
insert into public.signals (id, label, description, idf_weight) values
    ('BRUISE_LOCAL', 'Local bruise / contusion', 'A bruise at the site of an injury', 1.8),
    ('BONY_TENDERNESS', 'Bony point tenderness', 'Tenderness on palpation directly over bone (Ottawa-style)', 2.2),
    ('UNABLE_TO_BEAR_WEIGHT', 'Unable to bear weight', 'Cannot bear weight or take four steps (Ottawa ankle/knee rules)', 2.2),
    ('OPEN_WOUND', 'Fresh open wound', 'A fresh cut, laceration or open injury', 2.0)
on conflict (id) do nothing;

with new_obs(slug, label, kind, search_text) as (values
    ('bruise-contusion', 'Bruise / contusion', 'finding', 'bruise bruising contusion neel nishan chot blue black mark'),
    ('fresh-wound-laceration', 'Cut / laceration (fresh wound)', 'finding', 'cut laceration wound gash kata khoon bleeding injury'),
    ('bony-tenderness', 'Bony point tenderness', 'finding', 'bone tenderness point tender haddi dabane par dard ottawa'),
    ('unable-to-bear-weight', 'Unable to bear weight', 'finding', 'cannot walk unable to bear weight stand chal nahi pa raha limp ottawa')
)
insert into public.observables (slug, label, kind, search_text, domains, system)
select n.slug, n.label, n.kind, n.search_text, array['opd','physio'], 'musculoskeletal'
from new_obs n
where not exists (select 1 from public.observables o where o.slug = n.slug);

with m(slug, signal_id, weight) as (values
    ('bruise-contusion', 'BRUISE_LOCAL', 1.0), ('bruise-contusion', 'SOFT_TISSUE_TENDERNESS', 0.5),
    ('fresh-wound-laceration', 'OPEN_WOUND', 1.0), ('fresh-wound-laceration', 'TRAUMA_HISTORY', 0.6),
    ('bony-tenderness', 'BONY_TENDERNESS', 1.0), ('bony-tenderness', 'BONE_PAIN', 0.4),
    ('unable-to-bear-weight', 'UNABLE_TO_BEAR_WEIGHT', 1.0)
)
insert into public.observable_signals (observable_id, signal_id, weight)
select o.id, m.signal_id, m.weight from m join public.observables o on o.slug = m.slug
where not exists (select 1 from public.observable_signals x where x.observable_id = o.id and x.signal_id = m.signal_id);

with rules(label, itype, signal_id, weight) as (values
    ('Fracture', 'finding', 'BONY_TENDERNESS', 0.55), ('Fracture', 'finding', 'UNABLE_TO_BEAR_WEIGHT', 0.45), ('Fracture', 'finding', 'BRUISE_LOCAL', 0.15),
    ('Dislocation', 'finding', 'UNABLE_TO_BEAR_WEIGHT', 0.20),
    ('Ligament sprain', 'finding', 'BRUISE_LOCAL', 0.25), ('Ligament sprain', 'finding', 'UNABLE_TO_BEAR_WEIGHT', 0.20),
    ('Soft-tissue injury / contusion', 'finding', 'BRUISE_LOCAL', 0.55),
    ('Muscle strain', 'finding', 'BRUISE_LOCAL', 0.20),
    ('Wound', 'finding', 'OPEN_WOUND', 0.70),
    ('Wound cleaning / irrigation', 'modality', 'OPEN_WOUND', 0.70),
    ('Suturing of laceration', 'modality', 'OPEN_WOUND', 0.60),
    ('Dressing', 'modality', 'OPEN_WOUND', 0.50),
    ('X-Ray Foot / Ankle', 'test', 'BONY_TENDERNESS', 0.45), ('X-Ray Foot / Ankle', 'test', 'UNABLE_TO_BEAR_WEIGHT', 0.45),
    ('X-Ray Knee', 'test', 'BONY_TENDERNESS', 0.35), ('X-Ray Knee', 'test', 'UNABLE_TO_BEAR_WEIGHT', 0.40),
    ('X-Ray Hand / Wrist', 'test', 'BONY_TENDERNESS', 0.40),
    ('X-Ray Leg (Tibia / Fibula)', 'test', 'BONY_TENDERNESS', 0.40), ('X-Ray Leg (Tibia / Fibula)', 'test', 'UNABLE_TO_BEAR_WEIGHT', 0.30),
    ('X-Ray Hip', 'test', 'UNABLE_TO_BEAR_WEIGHT', 0.35),
    ('X-Ray (Other Site)', 'test', 'BONY_TENDERNESS', 0.40)
)
insert into public.signal_intent_rules (signal_id, intent_id, weight, rationale)
select r.signal_id, i.id, r.weight, 'Ortho trauma findings, 2026-09'
from rules r join public.intents i on i.type = r.itype and i.label = r.label and i.is_active
where not exists (select 1 from public.signal_intent_rules x where x.signal_id = r.signal_id and x.intent_id = i.id);

-- After "Recent injury / trauma" (or knee / ankle pain), the case sheet's
-- Related strip offers the trauma findings to check next, so the doctor
-- does not have to know to type them. Additive only.
with s(signal_id, slug, weight) as (values
    ('TRAUMA_HISTORY', 'bony-tenderness', 0.45),
    ('TRAUMA_HISTORY', 'unable-to-bear-weight', 0.40),
    ('TRAUMA_HISTORY', 'bruise-contusion', 0.35),
    ('TRAUMA_HISTORY', 'fresh-wound-laceration', 0.30),
    ('JOINT_DEFORMITY', 'bony-tenderness', 0.40),
    ('KNEE_PAIN', 'bony-tenderness', 0.30), ('KNEE_PAIN', 'unable-to-bear-weight', 0.30),
    ('ANKLE_FOOT_PAIN', 'bony-tenderness', 0.35), ('ANKLE_FOOT_PAIN', 'unable-to-bear-weight', 0.35)
)
insert into public.signal_finding_suggestions (signal_id, observable_id, weight)
select s.signal_id, o.id, s.weight from s join public.observables o on o.slug = s.slug
where not exists (select 1 from public.signal_finding_suggestions x where x.signal_id = s.signal_id and x.observable_id = o.id);
