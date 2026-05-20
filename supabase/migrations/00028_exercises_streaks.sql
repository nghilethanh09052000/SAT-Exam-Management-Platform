-- Migration: 00028_exercises_streaks.sql
-- Free practice exercises (not tied to a class), streak tracking, and daily activity heatmap.

-- ─── EXERCISES ────────────────────────────────────────────────────────────────

CREATE TABLE public.exercises (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  title         TEXT        NOT NULL,
  description   TEXT,
  difficulty    TEXT        NOT NULL DEFAULT 'medium'
                            CHECK (difficulty IN ('easy', 'medium', 'hard')),
  category      TEXT        NOT NULL DEFAULT 'general',
  estimated_minutes INT     NOT NULL DEFAULT 15,
  is_published  BOOLEAN     NOT NULL DEFAULT false,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.exercise_questions (
  id            UUID  PRIMARY KEY DEFAULT gen_random_uuid(),
  exercise_id   UUID  NOT NULL REFERENCES public.exercises(id) ON DELETE CASCADE,
  question_id   UUID  NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
  order_index   INT   NOT NULL DEFAULT 0,
  UNIQUE (exercise_id, question_id)
);

-- ─── EXERCISE ATTEMPTS ────────────────────────────────────────────────────────

CREATE TABLE public.exercise_attempts (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id      UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  exercise_id     UUID        NOT NULL REFERENCES public.exercises(id) ON DELETE CASCADE,
  correct_count   INT         NOT NULL DEFAULT 0,
  total_questions INT         NOT NULL DEFAULT 0,
  status          TEXT        NOT NULL DEFAULT 'in_progress'
                              CHECK (status IN ('in_progress', 'completed')),
  started_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at    TIMESTAMPTZ
);

CREATE TABLE public.exercise_answers (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id        UUID        NOT NULL REFERENCES public.exercise_attempts(id) ON DELETE CASCADE,
  question_id       UUID        NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
  selected_option_id UUID       REFERENCES public.question_options(id) ON DELETE SET NULL,
  answer_text       TEXT,
  is_correct        BOOLEAN,
  answered_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── STREAK & DAILY ACTIVITY ──────────────────────────────────────────────────

CREATE TABLE public.student_streaks (
  student_id         UUID  PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  current_streak     INT   NOT NULL DEFAULT 0,
  longest_streak     INT   NOT NULL DEFAULT 0,
  last_activity_date DATE,
  total_days_active  INT   NOT NULL DEFAULT 0,
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.daily_activity (
  id                  UUID  PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id          UUID  NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  activity_date       DATE  NOT NULL,
  exercises_completed INT   NOT NULL DEFAULT 0,
  UNIQUE (student_id, activity_date)
);

-- ─── INDEXES ──────────────────────────────────────────────────────────────────

CREATE INDEX ON public.exercise_questions (exercise_id);
CREATE INDEX ON public.exercise_attempts (student_id, exercise_id);
CREATE INDEX ON public.exercise_answers (attempt_id);
CREATE INDEX ON public.daily_activity (student_id, activity_date DESC);

-- ─── ROW LEVEL SECURITY ───────────────────────────────────────────────────────

ALTER TABLE public.exercises           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exercise_questions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exercise_attempts   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exercise_answers    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_streaks     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_activity      ENABLE ROW LEVEL SECURITY;

-- exercises: anyone authenticated can read published ones; teachers/admins can manage
CREATE POLICY "exercises_read_published"
  ON public.exercises FOR SELECT
  TO authenticated
  USING (is_published = true);

CREATE POLICY "exercises_manage_teacher"
  ON public.exercises FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role IN ('teacher', 'admin')
    )
  );

-- exercise_questions: readable if the exercise is published or user is teacher/admin
CREATE POLICY "exercise_questions_read"
  ON public.exercise_questions FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.exercises e
      WHERE e.id = exercise_id
        AND (
          e.is_published = true
          OR EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.id = auth.uid() AND p.role IN ('teacher', 'admin')
          )
        )
    )
  );

CREATE POLICY "exercise_questions_manage_teacher"
  ON public.exercise_questions FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role IN ('teacher', 'admin')
    )
  );

-- exercise_attempts: students own their attempts
CREATE POLICY "exercise_attempts_own"
  ON public.exercise_attempts FOR ALL
  TO authenticated
  USING (student_id = auth.uid())
  WITH CHECK (student_id = auth.uid());

-- exercise_answers: students own their answers
CREATE POLICY "exercise_answers_own"
  ON public.exercise_answers FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.exercise_attempts a
      WHERE a.id = attempt_id AND a.student_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.exercise_attempts a
      WHERE a.id = attempt_id AND a.student_id = auth.uid()
    )
  );

-- student_streaks: students own their record
CREATE POLICY "streaks_own"
  ON public.student_streaks FOR ALL
  TO authenticated
  USING (student_id = auth.uid())
  WITH CHECK (student_id = auth.uid());

-- daily_activity: students own their records
CREATE POLICY "daily_activity_own"
  ON public.daily_activity FOR ALL
  TO authenticated
  USING (student_id = auth.uid())
  WITH CHECK (student_id = auth.uid());

-- ─── COMPLETE EXERCISE FUNCTION ───────────────────────────────────────────────
-- Atomically marks an attempt completed, upserts daily_activity, and updates streak.

CREATE OR REPLACE FUNCTION public.complete_exercise_attempt(
  p_attempt_id    UUID,
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
  v_student_id   UUID := auth.uid();
  v_today        DATE := CURRENT_DATE;
  v_streak       RECORD;
  v_new_streak   INT;
  v_new_longest  INT;
  v_new_total    INT;
  v_is_new_day   BOOLEAN := false;
  v_is_milestone BOOLEAN := false;
BEGIN
  IF v_student_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '28000';
  END IF;

  -- Verify ownership
  IF NOT EXISTS (
    SELECT 1 FROM public.exercise_attempts
    WHERE id = p_attempt_id AND student_id = v_student_id AND status = 'in_progress'
  ) THEN
    RAISE EXCEPTION 'Attempt not found' USING ERRCODE = 'P0002';
  END IF;

  -- Mark attempt complete
  UPDATE public.exercise_attempts
  SET status        = 'completed',
      correct_count = p_correct_count,
      total_questions = p_total,
      completed_at  = now()
  WHERE id = p_attempt_id;

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
    -- First ever activity
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
      -- Already active today — streak unchanged
      v_new_streak  := v_streak.current_streak;
      v_new_longest := v_streak.longest_streak;
      v_new_total   := v_streak.total_days_active;
      v_is_new_day  := false;
    ELSIF v_streak.last_activity_date = v_today - INTERVAL '1 day' THEN
      -- Consecutive day — extend streak
      v_new_streak := v_streak.current_streak + 1;
      v_new_longest := GREATEST(v_streak.longest_streak, v_new_streak);
      v_new_total   := v_streak.total_days_active + 1;
      v_is_new_day  := true;
    ELSE
      -- Streak broken — restart
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

  -- Milestone: 7, 14, 30, 60, 100, … days
  v_is_milestone := v_is_new_day AND (v_new_streak IN (3, 7, 14, 21, 30, 60, 100));

  RETURN QUERY SELECT v_new_streak, v_new_longest, v_new_total, v_is_new_day, v_is_milestone;
END;
$$;

REVOKE ALL ON FUNCTION public.complete_exercise_attempt(UUID, INT, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.complete_exercise_attempt(UUID, INT, INT) TO authenticated;
