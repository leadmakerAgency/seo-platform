-- 0009_reset_counters: the rolled-back test runs consumed some numbers.
-- Start real task numbers at T-1001 and request numbers at R-101.
alter table public.tasks alter column number restart with 1001;
alter table public.client_requests alter column number restart with 101;
