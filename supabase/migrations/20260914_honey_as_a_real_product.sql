-- Honey is a real, common recommendation Synapse already ranks (composition
-- 370) for a cough — and until now the catalogue had no product behind it,
-- so the row was a permanent dead end: ranked, explained, hoverable, never
-- prescribable. Anmol, 2026-09-14, seeing it live: "I love this one... this
-- should be there, just like other medicine."
--
-- The fix is content, not code. Every surface that turns a ranked molecule
-- into a prescription line — MedicineAddSheet's dose confirm, the Plan,
-- PrescriptionDocument's print layout, the WhatsApp share, the offline
-- catalogue mirror — already works for any composition that has ONE row
-- here. Honey had zero. Giving it one is the whole fix; nothing downstream
-- needed to change or learn a new "brand-less" line shape.
--
-- `route = 'syrup'` rather than 'tablet': `doseFieldValue` (brands.ts) reads
-- a syrup/suspension route with no `strength_mg` as "states a concentration,
-- there is no dose to derive" and leaves the dose field blank for the doctor
-- to fill in ("1 tsp", "2 tsp") rather than guessing a tablet count that
-- makes no sense for a spoonful. `manufacturer`/`hospital_id`/`strength_mg`
-- all null matches the catalogue's own convention for a generic entry (see
-- e.g. Crocin/Omez/Pantop 40, which also carry no manufacturer here).
--
-- Idempotent: safe to re-run, and it is a no-op the moment a real product
-- ever gets added for this composition by the normal catalogue pipeline.

insert into medicines (name, manufacturer, hospital_id, strength_mg)
select 'Honey', null, null, null
where not exists (
    select 1 from medicine_composition_map mcm
    where mcm.composition_id = 370
);

-- `id` is a real serial PK here (`medicine_composition_map_id_seq`) — never
-- the synthetic "medicineId:compositionId" string the offline Dexie mirror
-- uses for its own, unrelated, IndexedDB-only primary key.
insert into medicine_composition_map (medicine_id, composition_id, is_primary, route)
select
    m.id,
    370,
    true,
    'syrup'
from medicines m
where m.name = 'Honey' and m.manufacturer is null and m.hospital_id is null
  and not exists (
      select 1 from medicine_composition_map mcm2 where mcm2.composition_id = 370
  )
order by m.id desc
limit 1;
