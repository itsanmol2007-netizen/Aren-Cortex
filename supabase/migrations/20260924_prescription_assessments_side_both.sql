-- Bilateral conditions ("Knee osteoarthritis — Bilateral") record side 'both'.
alter table public.prescription_assessments drop constraint if exists prescription_assessments_side_check;
alter table public.prescription_assessments add constraint prescription_assessments_side_check check (side in ('left','right','both'));
