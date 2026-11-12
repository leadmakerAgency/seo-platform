-- 0017_reset_task_counter: the rolled-back onboarding tests used a task number.
-- Restart at T-1001 while there are still no real tasks.
do $$
begin
  if not exists (select 1 from public.tasks) then
    execute 'alter table public.tasks alter column number restart with 1001';
  end if;
end $$;
