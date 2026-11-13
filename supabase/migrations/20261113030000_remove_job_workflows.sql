-- General job management is no longer a user-facing or AI workflow.
-- Keep jobs and their relations for existing Earth Observation survey records.
update public.ai_skills
set active = false, updated_at = now()
where key = 'schedule-job';
