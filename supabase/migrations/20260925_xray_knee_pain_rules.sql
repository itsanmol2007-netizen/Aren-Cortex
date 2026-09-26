-- X-Ray Knee was the only joint X-ray with no pain or trauma rule (every
-- other one has <joint>_PAIN 0.45 + TRAUMA_HISTORY 0.25), so a painful
-- injured knee ranked the ankle X-ray above the knee one.
with rules(signal_id, weight) as (values ('KNEE_PAIN', 0.45), ('TRAUMA_HISTORY', 0.25), ('JOINT_SWELLING', 0.20))
insert into public.signal_intent_rules (signal_id, intent_id, weight, rationale)
select r.signal_id, i.id, r.weight, 'X-Ray Knee parity with other joint X-rays, 2026-09'
from rules r join public.intents i on i.type = 'test' and i.label = 'X-Ray Knee'
where not exists (select 1 from public.signal_intent_rules x where x.signal_id = r.signal_id and x.intent_id = i.id);
