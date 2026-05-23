-- ─── UNINDEXED FOREIGN KEYS ──────────────────────────────────────────────────
-- Add covering indexes for FK columns that lack them.
-- Required for efficient cascade operations and reverse-joins.

CREATE INDEX IF NOT EXISTS idx_class_library_files_uploaded_by
  ON public.class_library_files(uploaded_by);

CREATE INDEX IF NOT EXISTS idx_exercise_answers_question_id
  ON public.exercise_answers(question_id);

CREATE INDEX IF NOT EXISTS idx_exercise_answers_selected_option_id
  ON public.exercise_answers(selected_option_id);

-- The compound (student_id, exercise_id) index does not cover exercise_id-only
-- lookups (e.g. ON DELETE CASCADE from exercises table).
CREATE INDEX IF NOT EXISTS idx_exercise_attempts_exercise_id
  ON public.exercise_attempts(exercise_id);

-- exercise_questions already has an index on exercise_id; question_id FK needs one too.
CREATE INDEX IF NOT EXISTS idx_exercise_questions_question_id
  ON public.exercise_questions(question_id);

CREATE INDEX IF NOT EXISTS idx_notifications_sent_by
  ON public.notifications(sent_by);

CREATE INDEX IF NOT EXISTS idx_public_exam_answers_selected_option_id
  ON public.public_exam_answers(selected_option_id);

CREATE INDEX IF NOT EXISTS idx_student_imports_class_id
  ON public.student_imports(class_id);

CREATE INDEX IF NOT EXISTS idx_submission_answers_selected_option_id
  ON public.submission_answers(selected_option_id);

CREATE INDEX IF NOT EXISTS idx_submissions_current_question_id
  ON public.submissions(current_question_id);


-- ─── DROP UNUSED INDEXES (LOW-CARDINALITY / INTERNAL TABLES) ─────────────────
-- Dropping only indexes that have never been used AND where sequential scans
-- are expected to be equally fast due to very low cardinality or tiny table size.
-- High-value structural indexes (submissions, answers, assignments, etc.) are
-- intentionally kept even if currently unused, as traffic patterns will use them.

-- role has ≤4 distinct values; planner prefers seq scan over bitmapscan
DROP INDEX IF EXISTS public.idx_profiles_role;

-- boolean column; planner uses seq scan for ~50/50 distribution
DROP INDEX IF EXISTS public.idx_submission_answers_is_correct;

-- low-cardinality enum (in_progress / submitted / graded)
DROP INDEX IF EXISTS public.idx_submissions_status;

-- low-cardinality enums on questions
DROP INDEX IF EXISTS public.idx_questions_type;
DROP INDEX IF EXISTS public.idx_questions_difficulty;

-- low-cardinality status enums on import tables
DROP INDEX IF EXISTS public.idx_student_imports_status;
DROP INDEX IF EXISTS public.idx_file_imports_status;
DROP INDEX IF EXISTS public.idx_public_exam_attempts_status;

-- error_log is a small internal audit table; sequential scans are acceptable
DROP INDEX IF EXISTS public.idx_error_log_student_id;
DROP INDEX IF EXISTS public.idx_error_log_submission_id;

-- tags.subject has very few distinct values (SAT sections)
DROP INDEX IF EXISTS public.idx_tags_subject;
