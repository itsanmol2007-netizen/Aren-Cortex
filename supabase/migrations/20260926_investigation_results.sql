-- Investigation -> result continuity. An X-ray ordered at one visit is
-- looked at in the next ("X-ray right wrist: displaced distal radius
-- fracture, dorsal angulation, ulnar styloid fracture"); the result belongs
-- on the ORDER, so the order itself carries its outcome and the visit that
-- read it. Additive and nullable: the deployed app ignores all three.
alter table public.diagnostic_orders add column if not exists result_text text;
alter table public.diagnostic_orders add column if not exists result_at timestamptz;
alter table public.diagnostic_orders add column if not exists result_visit_id uuid references public.visits(id) on delete set null;
