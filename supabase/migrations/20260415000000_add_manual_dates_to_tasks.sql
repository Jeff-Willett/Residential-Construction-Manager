/*
  Add manual_start and manual_finish columns to tasks table
  This allows users to manually override calculated start/finish dates
*/

ALTER TABLE tasks 
ADD COLUMN manual_start DATE,
ADD COLUMN manual_finish DATE;
