-- RLS Smoke Test
-- Verifies core Row-Level Security invariants on the local Supabase instance.
-- Run after: supabase db reset
-- Usage: psql "$LOCAL_DB_URL" -f scripts/rls-smoke-test.sql

\set ON_ERROR_STOP on

DO $$
DECLARE
    v_count int;
BEGIN
    RAISE NOTICE 'Starting RLS smoke tests...';

    -- ----------------------------------------------------------------
    -- 1. Profiles: users cannot read other users profiles via anon role
    -- ----------------------------------------------------------------
    SET LOCAL ROLE anon;
    SELECT COUNT(*) INTO v_count FROM public.profiles;
    IF v_count > 0 THEN
        RAISE EXCEPTION 'RLS FAIL: anon role can read profiles (count=%). Expected 0.', v_count;
    END IF;
    RAISE NOTICE 'PASS: anon cannot read profiles';
    RESET ROLE;

    -- ----------------------------------------------------------------
    -- 2. Submissions: authenticated user can only see their own
    -- ----------------------------------------------------------------
    -- (Verified structurally — policies must exist on submissions table)
    SELECT COUNT(*) INTO v_count
    FROM pg_policies
    WHERE tablename = 'submissions' AND schemaname = 'public';
    IF v_count = 0 THEN
        RAISE EXCEPTION 'RLS FAIL: No RLS policies found on submissions table.';
    END IF;
    RAISE NOTICE 'PASS: RLS policies exist on submissions (count=%)', v_count;

    -- ----------------------------------------------------------------
    -- 3. Questions: RLS policies must exist
    -- ----------------------------------------------------------------
    SELECT COUNT(*) INTO v_count
    FROM pg_policies
    WHERE tablename = 'questions' AND schemaname = 'public';
    IF v_count = 0 THEN
        RAISE EXCEPTION 'RLS FAIL: No RLS policies found on questions table.';
    END IF;
    RAISE NOTICE 'PASS: RLS policies exist on questions (count=%)', v_count;

    -- ----------------------------------------------------------------
    -- 4. Enrollments: RLS policies must exist
    -- ----------------------------------------------------------------
    SELECT COUNT(*) INTO v_count
    FROM pg_policies
    WHERE tablename = 'enrollments' AND schemaname = 'public';
    IF v_count = 0 THEN
        RAISE EXCEPTION 'RLS FAIL: No RLS policies found on enrollments table.';
    END IF;
    RAISE NOTICE 'PASS: RLS policies exist on enrollments (count=%)', v_count;

    -- ----------------------------------------------------------------
    -- 5. All critical tables have RLS enabled
    -- ----------------------------------------------------------------
    DECLARE
        tbl text;
        rls_enabled bool;
    BEGIN
        FOR tbl IN SELECT unnest(ARRAY[
            'profiles', 'submissions', 'questions', 'enrollments',
            'assignments', 'courses', 'classes'
        ]) LOOP
            SELECT relrowsecurity INTO rls_enabled
            FROM pg_class
            WHERE relname = tbl AND relnamespace = 'public'::regnamespace;

            IF rls_enabled IS NULL THEN
                RAISE WARNING 'Table % does not exist — skipping RLS check', tbl;
            ELSIF NOT rls_enabled THEN
                RAISE EXCEPTION 'RLS FAIL: RLS is not enabled on table %.', tbl;
            ELSE
                RAISE NOTICE 'PASS: RLS enabled on %', tbl;
            END IF;
        END LOOP;
    END;

    RAISE NOTICE '';
    RAISE NOTICE 'All RLS smoke tests passed.';
END;
$$;
