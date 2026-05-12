-- Migration: 00017_add_student_profile_fields.sql
--
-- Adds extended profile fields for student statistics and ML features.
-- All columns are nullable so existing rows are unaffected.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS birth_year    SMALLINT,           -- năm sinh (e.g. 2008)
  ADD COLUMN IF NOT EXISTS gender        TEXT,               -- 'Nam' | 'Nữ' | 'Khác'
  ADD COLUMN IF NOT EXISTS school        TEXT,               -- trường học đang theo học
  ADD COLUMN IF NOT EXISTS city          TEXT,               -- tỉnh / thành phố
  ADD COLUMN IF NOT EXISTS facebook_url  TEXT,               -- link Facebook cá nhân
  ADD COLUMN IF NOT EXISTS threads_url   TEXT,               -- link Threads cá nhân
  ADD COLUMN IF NOT EXISTS hobbies       TEXT,               -- sở thích (free text)
  ADD COLUMN IF NOT EXISTS target_score  SMALLINT,           -- mục tiêu điểm SAT (400–1600)
  ADD COLUMN IF NOT EXISTS source        TEXT;               -- nguồn biết đến (bạn bè, mạng XH…)

COMMENT ON COLUMN public.profiles.birth_year   IS 'Năm sinh học sinh';
COMMENT ON COLUMN public.profiles.gender       IS 'Giới tính: Nam | Nữ | Khác';
COMMENT ON COLUMN public.profiles.school       IS 'Trường học hiện tại';
COMMENT ON COLUMN public.profiles.city         IS 'Tỉnh / thành phố cư trú';
COMMENT ON COLUMN public.profiles.facebook_url IS 'URL trang Facebook cá nhân';
COMMENT ON COLUMN public.profiles.threads_url  IS 'URL trang Threads cá nhân';
COMMENT ON COLUMN public.profiles.hobbies      IS 'Sở thích (free text, có thể phân tách bằng dấu phẩy)';
COMMENT ON COLUMN public.profiles.target_score IS 'Mục tiêu điểm SAT (400–1600)';
COMMENT ON COLUMN public.profiles.source       IS 'Nguồn biết đến nền tảng';
