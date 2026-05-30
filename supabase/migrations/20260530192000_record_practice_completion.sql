-- Migration: 20260530192000_record_practice_completion.sql
-- Records a "free practice" completion (topic/tag drills started from the
-- student practice hub) directly into daily_activity + student_streaks WITHOUT
-- requiring an exercise_attempts row. Topic drills are composed on the fly from
-- the question bank by tag, so they have no persistent exercise_id to anchor an
-- attempt to. The streak math mirrors complete_exercise_attempt exactly.

-- NOTE: callers run through the service-role client after authenticating the
-- user in the API layer, so auth.uid() is NULL here. The student id is passed
-- explicitly rather than derived from the JWT.
CREATE OR REPLACE FUNCTION public.record_practice_completion(
  p_student_id    UUID,
  p_correct_count INT,
  p_total         INT
)
RETURNS TABLE (
  current_streak    INT,
  longest_streak    INT,
  total_days_active INT,
  is_new_day        BOOLEAN,
  is_new_milestone  BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_student_id   UUID := p_student_id;
  v_today        DATE := CURRENT_DATE;
  v_streak       RECORD;
  v_new_streak   INT;
  v_new_longest  INT;
  v_new_total    INT;
  v_is_new_day   BOOLEAN := false;
  v_is_milestone BOOLEAN := false;
BEGIN
  IF v_student_id IS NULL THEN
    RAISE EXCEPTION 'student id required' USING ERRCODE = '22004';
  END IF;

  -- correct/total are advisory only; we record the day as active either way.
  PERFORM p_correct_count, p_total;

  -- Upsert daily activity
  INSERT INTO public.daily_activity (student_id, activity_date, exercises_completed)
  VALUES (v_student_id, v_today, 1)
  ON CONFLICT (student_id, activity_date)
  DO UPDATE SET exercises_completed = daily_activity.exercises_completed + 1;

  -- Compute streak
  SELECT * INTO v_streak
  FROM public.student_streaks
  WHERE student_id = v_student_id;

  IF NOT FOUND THEN
    v_new_streak  := 1;
    v_new_longest := 1;
    v_new_total   := 1;
    v_is_new_day  := true;

    INSERT INTO public.student_streaks
      (student_id, current_streak, longest_streak, last_activity_date, total_days_active)
    VALUES
      (v_student_id, 1, 1, v_today, 1);
  ELSE
    IF v_streak.last_activity_date = v_today THEN
      v_new_streak  := v_streak.current_streak;
      v_new_longest := v_streak.longest_streak;
      v_new_total   := v_streak.total_days_active;
      v_is_new_day  := false;
    ELSIF v_streak.last_activity_date = v_today - INTERVAL '1 day' THEN
      v_new_streak  := v_streak.current_streak + 1;
      v_new_longest := GREATEST(v_streak.longest_streak, v_new_streak);
      v_new_total   := v_streak.total_days_active + 1;
      v_is_new_day  := true;
    ELSE
      v_new_streak  := 1;
      v_new_longest := v_streak.longest_streak;
      v_new_total   := v_streak.total_days_active + 1;
      v_is_new_day  := true;
    END IF;

    UPDATE public.student_streaks
    SET current_streak     = v_new_streak,
        longest_streak     = v_new_longest,
        last_activity_date = v_today,
        total_days_active  = v_new_total,
        updated_at         = now()
    WHERE student_id = v_student_id;
  END IF;

  v_is_milestone := v_is_new_day AND (v_new_streak IN (3, 7, 14, 21, 30, 60, 100));

  RETURN QUERY SELECT v_new_streak, v_new_longest, v_new_total, v_is_new_day, v_is_milestone;
END;
$$;

REVOKE ALL ON FUNCTION public.record_practice_completion(UUID, INT, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_practice_completion(UUID, INT, INT) TO authenticated, service_role;
