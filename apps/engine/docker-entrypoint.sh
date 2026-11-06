#!/bin/sh
# The engine no longer listens on a port. It claims survey jobs from the platform's
# `survey_runs` table, runs them, and publishes results and files back, so there is no
# $PORT to resolve, no proxy header to trust, and no health endpoint to answer -- a
# Render worker service is monitored by whether this process stays up and keeps claiming.
#
# One worker is deliberate: the engines read the AOI from process-global src.config and
# every survey writes the same fixed filenames under outputs/, so extra instances would
# each hold their own config and site lock while overwriting each other's deliverables.
# `claim_next_survey_run` hands a row to exactly one caller (FOR UPDATE SKIP LOCKED), so
# starting a second worker here would parallelise nothing but the confusion. Raise
# throughput only once an immutable per-job SiteContext with a namespaced output dir
# replaces those globals -- then scale this command, not the lock.
exec python worker.py
