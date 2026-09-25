-- Therapeutic ultrasound (a physiotherapy electrotherapy modality) was being
-- offered on an acute wrist injury in Orthopedics. Continuous therapeutic
-- ultrasound over a suspected or fresh fracture is generally avoided; the
-- ultrasound used FOR fracture healing is a different modality (low-intensity
-- pulsed ultrasound, LIPUS). A caution, not a block: the doctor decides.
insert into public.intent_guards (signal_id, action, target_type, target_intent_id, reason, is_active)
select 'BONY_TENDERNESS', 'warn', null, i.id,  -- one target only (intent_guards_one_target)
       'Bony point tenderness suggests a fracture. Continuous therapeutic ultrasound over a suspected or fresh fracture is generally avoided (fracture-healing ultrasound is a different, low-intensity pulsed modality).',
       true
from public.intents i
where i.type = 'modality' and i.label like 'Therapeutic ultrasound%'
  and not exists (
      select 1 from public.intent_guards g
      where g.signal_id = 'BONY_TENDERNESS' and g.target_intent_id = i.id
  );
