-- Prevent assigning the same assignment to the same class more than once.
-- This trigger protects future writes without failing on existing duplicate rows.

CREATE INDEX IF NOT EXISTS idx_assignment_instances_assignment_class
  ON public.assignment_instances(assignment_id, class_id);

CREATE OR REPLACE FUNCTION public.prevent_duplicate_assignment_instance()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.assignment_instances existing
    WHERE existing.assignment_id = NEW.assignment_id
      AND existing.class_id = NEW.class_id
      AND existing.id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
  ) THEN
    RAISE EXCEPTION 'This assignment is already assigned to the selected class.'
      USING ERRCODE = '23505';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prevent_duplicate_assignment_instance
  ON public.assignment_instances;

CREATE TRIGGER prevent_duplicate_assignment_instance
  BEFORE INSERT OR UPDATE OF assignment_id, class_id
  ON public.assignment_instances
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_duplicate_assignment_instance();
