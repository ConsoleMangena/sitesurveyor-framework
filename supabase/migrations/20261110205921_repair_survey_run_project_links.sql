-- Older launch paths stored a job UUID in project_id. Recover a missing job link
-- only when that legacy value identifies a job in the run's own workspace.
-- Do not infer links from names or overwrite an existing job_id.
update public.survey_runs as run
set job_id = job.id
from public.jobs as job
where run.job_id is null
  and run.project_id = job.id
  and run.workspace_id = job.workspace_id;

-- The linked job is authoritative, including intentionally unassigned jobs.
-- Scope both joins to the workspace; leave inconsistent cross-workspace links
-- untouched for manual review rather than copying foreign project IDs.
update public.survey_runs as run
set project_id = job.project_id
from public.jobs as job
where run.job_id = job.id
  and run.workspace_id = job.workspace_id
  and (
    job.project_id is null
    or exists (
      select 1
      from public.projects as project
      where project.id = job.project_id
        and project.workspace_id = run.workspace_id
    )
  )
  and run.project_id is distinct from job.project_id;
