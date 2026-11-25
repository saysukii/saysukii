-- the server reaches the production tables with the service role, like every other table: the
-- productions migration granted signed-in users but not the service role, so the server couldn't
-- open a booked job's production
grant all on
  public.productions,
  public.production_days,
  public.production_items,
  public.production_stems,
  public.production_tasks,
  public.production_task_people,
  public.production_people,
  public.production_shifts,
  public.member_rates,
  public.member_notices
to service_role;
