/*
  Add persisted manual date overrides for task scheduling.
  These columns are optional and let the UI save explicit start/finish dates.
*/

ALTER TABLE tasks
ADD COLUMN IF NOT EXISTS manual_start DATE;

ALTER TABLE tasks
ADD COLUMN IF NOT EXISTS manual_finish DATE;
