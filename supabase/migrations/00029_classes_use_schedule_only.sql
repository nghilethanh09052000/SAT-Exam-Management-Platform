-- Classes now inherit the course date range and only store their weekly schedule.

UPDATE public.classes
SET schedule_text = 'Chưa thiết lập lịch học'
WHERE schedule_text IS NULL OR btrim(schedule_text) = '';

ALTER TABLE public.classes
  ALTER COLUMN schedule_text SET NOT NULL;

ALTER TABLE public.classes
  ADD CONSTRAINT classes_schedule_text_not_blank
  CHECK (btrim(schedule_text) <> '');

ALTER TABLE public.classes
  DROP COLUMN start_date,
  DROP COLUMN end_date;
