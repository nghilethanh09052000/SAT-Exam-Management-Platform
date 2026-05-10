-- Migration: 00001_enums.sql
-- Create all ENUM types before tables that use them

CREATE TYPE public.user_role AS ENUM ('admin', 'teacher', 'student');

CREATE TYPE public.question_type AS ENUM ('multiple_choice', 'short_answer');

CREATE TYPE public.question_difficulty AS ENUM ('easy', 'medium', 'hard');

CREATE TYPE public.subject_type AS ENUM ('reading_writing', 'math');

CREATE TYPE public.show_results_type AS ENUM ('immediately', 'after_deadline');

CREATE TYPE public.submission_status AS ENUM ('in_progress', 'submitted', 'expired');

CREATE TYPE public.tab_event_type AS ENUM ('tab_switch', 'window_blur', 'window_focus');

CREATE TYPE public.file_type AS ENUM ('pdf', 'word', 'video_link');
