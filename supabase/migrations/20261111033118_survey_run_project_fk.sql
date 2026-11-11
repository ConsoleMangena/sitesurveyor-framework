-- After the link repair in 20261110205921, survey_runs.project_id holds a real
-- project id or NULL (for runs on intentionally unassigned jobs), so the
-- column can finally carry the foreign key it never had.
-- NOT VALID first: enforce the rule for new writes without scanning the whole
-- table under lock; VALIDATE then proves every existing row already obeys it.
alter table public.survey_runs
  add constraint survey_runs_project_id_fkey
  foreign key (project_id) references public.projects (id)
  not valid;

alter table public.survey_runs
  validate constraint survey_runs_project_id_fkey;
