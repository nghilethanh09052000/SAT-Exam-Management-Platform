# RLS (Row Level Security) — Tài liệu kỹ thuật

> Last updated: 2026-05-11  
> Dự án: SAT Management Platform

---

## Mục lục

1. [RLS là gì?](#1-rls-là-gì)
2. [Cách PostgreSQL đánh giá RLS policies](#2-cách-postgresql-đánh-giá-rls-policies)
3. [Bug infinite recursion trong dự án này](#3-bug-infinite-recursion-trong-dự-án-này)
4. [Các Security Definer Functions hiện tại](#4-các-security-definer-functions-hiện-tại)
5. [Toàn bộ RLS policies hiện tại](#5-toàn-bộ-rls-policies-hiện-tại)
6. [Các policies còn tiềm ẩn rủi ro](#6-các-policies-còn-tiềm-ẩn-rủi-ro)
7. [Các migrations đã áp dụng](#7-các-migrations-đã-áp-dụng)
8. [Nguyên tắc viết RLS an toàn](#8-nguyên-tắc-viết-rls-an-toàn)
9. [Cách test RLS policies](#9-cách-test-rls-policies)

---

## 1. RLS là gì?

**Row Level Security (RLS)** là tính năng của PostgreSQL cho phép kiểm soát **từng dòng dữ liệu** mà một user có thể xem hoặc chỉnh sửa, thay vì chỉ kiểm soát ở cấp bảng.

### Ví dụ đơn giản

Không có RLS:
```sql
SELECT * FROM courses;
-- Trả về TẤT CẢ courses của mọi teacher
```

Với RLS (policy: chỉ xem course của mình):
```sql
SELECT * FROM courses;
-- Tự động lọc: chỉ trả về courses WHERE teacher_id = auth.uid()
```

PostgreSQL **tự động thêm điều kiện** vào mọi query mà không cần developer phải nhớ filter thủ công.

### Kích hoạt RLS

```sql
ALTER TABLE courses ENABLE ROW LEVEL SECURITY;
```

Khi RLS được bật mà **không có policy nào**, bảng sẽ **từ chối tất cả** truy cập (kể cả owner, trừ superuser).

### Policy anatomy

```sql
CREATE POLICY "policy_name"
  ON public.table_name
  FOR SELECT | INSERT | UPDATE | DELETE | ALL
  TO role_name          -- optional, mặc định là public (tất cả)
  USING (condition)     -- áp dụng cho SELECT, UPDATE, DELETE (lọc hàng)
  WITH CHECK (condition); -- áp dụng cho INSERT, UPDATE (validate hàng mới)
```

- **`USING`**: Lọc các hàng **đã tồn tại** — nếu điều kiện = false thì hàng đó bị ẩn hoàn toàn
- **`WITH CHECK`**: Validate hàng **sắp được ghi** — nếu false thì PostgreSQL trả lỗi
- **`PERMISSIVE`** (mặc định): Các policies được `OR` với nhau — đủ 1 policy pass là được
- **`RESTRICTIVE`**: Được `AND` với permissive — bắt buộc phải pass thêm điều kiện này

---

## 2. Cách PostgreSQL đánh giá RLS policies

Khi user chạy `SELECT * FROM courses`, PostgreSQL làm các bước sau:

```
1. Tìm tất cả policies PERMISSIVE cho SELECT trên bảng courses
2. Kết hợp các USING conditions bằng OR:
   (policy_1_condition) OR (policy_2_condition) OR (policy_3_condition)
3. Tự động thêm vào query:
   WHERE (policy_1_condition OR policy_2_condition OR policy_3_condition)
4. Chạy query đã được rewrite
```

### Lưu ý quan trọng: Policies được evaluate tất cả cùng lúc

Nếu bảng `courses` có 3 policies:
- `courses_all_admin`: `auth_user_role() = 'admin'`
- `courses_all_teacher_own`: `teacher_id = auth.uid() AND auth_user_role() IN ('teacher','admin')`
- `courses_select_enrolled_student`: `auth_student_enrolled_in_course(id)`

Thì **TẤT CẢ 3 policies đều được đánh giá** khi bất kỳ user nào query `courses` — không phân biệt user đó là admin, teacher hay student. PostgreSQL kiểm tra điều kiện của cả 3, và trả về hàng nếu bất kỳ điều kiện nào là `true`.

**Đây chính là nguồn gốc của bug infinite recursion.**

---

## 3. Bug infinite recursion trong dự án này

### Mô tả lỗi

```
ERROR: infinite recursion detected in policy for relation "enrollments"
```
hoặc
```
ERROR: infinite recursion detected in policy for relation "courses"
```

### Chuỗi đệ quy gây ra lỗi

```
User (teacher) query: SELECT * FROM courses

PostgreSQL evaluate ALL courses policies:
├── courses_all_teacher_own    → OK (checks teacher_id = auth.uid())
├── courses_all_admin          → OK (checks auth_user_role())
└── courses_select_enrolled_student → SELECT FROM enrollments JOIN classes
                                       ↓
                               PostgreSQL evaluate ALL enrollments policies:
                               ├── enrollments_all_admin    → OK
                               ├── enrollments_select_own_student → OK  
                               └── enrollments_all_teacher_own →
                                   SELECT FROM classes JOIN courses
                                            ↓
                                   PostgreSQL evaluate ALL courses policies:
                                   └── courses_select_enrolled_student →
                                       SELECT FROM enrollments ...
                                                ↓
                                       ♾️ INFINITE RECURSION!
```

### Hai policy gây ra vòng lặp

**Policy 1** — `courses_select_enrolled_student` (trên bảng `courses`):
```sql
-- Policy cũ (TRƯỚC KHI FIX):
CREATE POLICY "courses_select_enrolled_student" ON public.courses
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM enrollments e
        JOIN classes cl ON cl.id = e.class_id
      WHERE e.student_id = auth.uid()
        AND cl.course_id = courses.id
    )
  );
```
→ Truy vấn bảng `enrollments`, kích hoạt RLS của `enrollments`

**Policy 2** — `enrollments_all_teacher_own` (trên bảng `enrollments`):
```sql
CREATE POLICY "enrollments_all_teacher_own" ON public.enrollments
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM classes cl
        JOIN courses co ON co.id = cl.course_id
      WHERE cl.id = enrollments.class_id
        AND co.teacher_id = auth.uid()
    )
  );
```
→ Truy vấn bảng `courses`, kích hoạt lại RLS của `courses` → vòng lặp vô tận

### Tại sao teacher lại trigger policy của student?

Vì **tất cả PERMISSIVE policies đều được OR lại**. Khi teacher query courses:
```
(teacher_own condition) OR (admin condition) OR (student_enrolled condition)
```
PostgreSQL buộc phải evaluate `student_enrolled condition` dù user không phải student — để tính `OR`.

### Fix: SECURITY DEFINER functions

Giải pháp: wrap subquery trong function có `SECURITY DEFINER`. Function này **chạy với quyền của owner** (không phải caller), bỏ qua RLS hoàn toàn.

```sql
-- Function bypass RLS khi check enrollment
CREATE OR REPLACE FUNCTION public.auth_student_enrolled_in_course(p_course_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER          -- ← chạy với quyền superuser, không có RLS
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.enrollments e
      JOIN public.classes cl ON cl.id = e.class_id
    WHERE e.student_id = auth.uid()
      AND cl.course_id = p_course_id
  )
$$;

-- Policy mới dùng function thay vì subquery trực tiếp
DROP POLICY IF EXISTS "courses_select_enrolled_student" ON public.courses;
CREATE POLICY "courses_select_enrolled_student"
  ON public.courses FOR SELECT
  USING (public.auth_student_enrolled_in_course(courses.id));
```

Bây giờ khi PostgreSQL evaluate `courses_select_enrolled_student`:
```
courses_select_enrolled_student
└── auth_student_enrolled_in_course()  ← SECURITY DEFINER, không evaluate RLS
    └── SELECT FROM enrollments (RLS bypassed) ← chuỗi đệ quy bị cắt đứt ✓
```

---

## 4. Các Security Definer Functions hiện tại

Tất cả được định nghĩa trong `supabase/migrations/` và hiện đang hoạt động trong DB.

### `auth_user_role()`

```sql
CREATE OR REPLACE FUNCTION public.auth_user_role()
RETURNS user_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid()
$$;
```

**Mục đích**: Đọc role của user hiện tại từ `profiles` mà không trigger RLS của `profiles`.

**Được dùng bởi**: Hầu hết tất cả policies (`auth_user_role() = 'admin'`, `auth_user_role() IN ('teacher','admin')`, v.v.)

**Tại sao cần**: Nếu dùng `(SELECT role FROM profiles WHERE id = auth.uid())` trực tiếp trong policy, nó sẽ trigger `profiles_select_own` policy, tạo ra recursion nếu `profiles` policy lại join bảng khác.

---

### `auth_teacher_has_student(p_student_id UUID)`

```sql
CREATE OR REPLACE FUNCTION public.auth_teacher_has_student(p_student_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.enrollments e
      JOIN public.classes cl ON cl.id = e.class_id
      JOIN public.courses co ON co.id = cl.course_id
    WHERE e.student_id = p_student_id
      AND co.teacher_id = auth.uid()
  )
$$;
```

**Mục đích**: Kiểm tra xem student có thuộc class của teacher đang đăng nhập không.

**Được dùng bởi**: `profiles_select_teacher` — cho phép teacher xem profile của học sinh của mình.

---

### `auth_student_enrolled_in_course(p_course_id UUID)`

```sql
CREATE OR REPLACE FUNCTION public.auth_student_enrolled_in_course(p_course_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.enrollments e
      JOIN public.classes cl ON cl.id = e.class_id
    WHERE e.student_id = auth.uid()
      AND cl.course_id = p_course_id
  )
$$;
```

**Mục đích**: Kiểm tra student có enrolled vào course không (để student thấy course).

**Được dùng bởi**: `courses_select_enrolled_student`

**Fix cho**: Bug infinite recursion courses ↔ enrollments (migration `00015`)

---

### `auth_student_enrolled_in_class(p_class_id UUID)`

```sql
CREATE OR REPLACE FUNCTION public.auth_student_enrolled_in_class(p_class_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.enrollments e
    WHERE e.student_id = auth.uid()
      AND e.class_id = p_class_id
  )
$$;
```

**Mục đích**: Kiểm tra student có enrolled vào class không (để student thấy class).

**Được dùng bởi**: `classes_select_enrolled_student`

**Fix cho**: Bug infinite recursion classes ↔ enrollments (migration `00015`)

---

## 5. Toàn bộ RLS policies hiện tại

### Bảng: `courses`

| Policy | CMD | Điều kiện |
|--------|-----|-----------|
| `courses_all_admin` | ALL | `auth_user_role() = 'admin'` |
| `courses_all_teacher_own` | ALL | `teacher_id = auth.uid() AND auth_user_role() IN ('teacher','admin')` |
| `courses_select_enrolled_student` | SELECT | `auth_student_enrolled_in_course(id)` ← SECURITY DEFINER ✓ |

### Bảng: `classes`

| Policy | CMD | Điều kiện |
|--------|-----|-----------|
| `classes_all_admin` | ALL | `auth_user_role() = 'admin'` |
| `classes_all_teacher_own` | ALL | `EXISTS (courses WHERE courses.teacher_id = auth.uid()) AND auth_user_role() IN (...)` |
| `classes_select_enrolled_student` | SELECT | `auth_student_enrolled_in_class(id)` ← SECURITY DEFINER ✓ |

### Bảng: `enrollments`

| Policy | CMD | Điều kiện |
|--------|-----|-----------|
| `enrollments_all_admin` | ALL | `auth_user_role() = 'admin'` |
| `enrollments_all_teacher_own` | ALL | `EXISTS (classes JOIN courses WHERE courses.teacher_id = auth.uid()) AND auth_user_role() IN (...)` |
| `enrollments_select_own_student` | SELECT | `student_id = auth.uid()` ← safe, không join bảng khác ✓ |

### Bảng: `profiles`

| Policy | CMD | Điều kiện |
|--------|-----|-----------|
| `profiles_select_admin` | SELECT | `auth_user_role() = 'admin'` |
| `profiles_select_own` | SELECT | `auth.uid() = id` |
| `profiles_select_teacher` | SELECT | `auth_user_role() = 'teacher' AND auth_teacher_has_student(id)` ← SECURITY DEFINER ✓ |
| `profiles_update_admin` | UPDATE | `auth_user_role() = 'admin'` |
| `profiles_update_own` | UPDATE | `auth.uid() = id` |

### Bảng: `weeks`

| Policy | CMD | Điều kiện |
|--------|-----|-----------|
| `weeks_all_admin` | ALL | `auth_user_role() = 'admin'` |
| `weeks_all_teacher_own` | ALL | `EXISTS (classes JOIN courses WHERE courses.teacher_id = auth.uid()) AND auth_user_role() IN (...)` |
| `weeks_select_student` | SELECT | `EXISTS (enrollments WHERE student_id = auth.uid() AND class_id = weeks.class_id)` ← ⚠️ xem mục 6 |

### Bảng: `assignment_instances`

| Policy | CMD | Điều kiện |
|--------|-----|-----------|
| `assignment_instances_all_admin` | ALL | `auth_user_role() = 'admin'` |
| `assignment_instances_all_teacher_own` | ALL | `EXISTS (classes JOIN courses WHERE courses.teacher_id = auth.uid()) AND auth_user_role() IN (...)` |
| `assignment_instances_select_student` | SELECT | `published_at IS NOT NULL AND EXISTS (enrollments WHERE student_id = auth.uid() AND class_id = ...)` ← ⚠️ xem mục 6 |

### Bảng: `assignments`

| Policy | CMD | Điều kiện |
|--------|-----|-----------|
| `assignments_all_admin` | ALL | `auth_user_role() = 'admin'` |
| `assignments_all_teacher_own` | ALL | `created_by = auth.uid() AND auth_user_role() IN (...)` |
| `assignments_select_all_teachers` | SELECT | `auth_user_role() IN ('teacher','admin')` |

### Bảng: `questions`

| Policy | CMD | Điều kiện |
|--------|-----|-----------|
| `questions_all_admin` | ALL | `auth_user_role() = 'admin'` |
| `questions_all_teacher_own` | ALL | `created_by = auth.uid() AND auth_user_role() IN (...)` |
| `questions_select_all_teachers` | SELECT | `auth_user_role() IN ('teacher','admin')` |

### Bảng: `submissions`

| Policy | CMD | Điều kiện |
|--------|-----|-----------|
| `submissions_all_admin` | ALL | `auth_user_role() = 'admin'` |
| `submissions_insert_own_student` | INSERT | `student_id = auth.uid()` |
| `submissions_select_own_student` | SELECT | `student_id = auth.uid()` |
| `submissions_select_teacher_own` | SELECT | `EXISTS (assignment_instances JOIN classes JOIN courses WHERE courses.teacher_id = auth.uid()) AND auth_user_role() IN (...)` |
| `submissions_update_own_student` | UPDATE | `student_id = auth.uid() AND status = 'in_progress'` |

### Bảng: `submission_answers`

| Policy | CMD | Điều kiện |
|--------|-----|-----------|
| `submission_answers_all_admin` | ALL | `auth_user_role() = 'admin'` |
| `submission_answers_insert_own_student` | INSERT | `EXISTS (submissions WHERE student_id = auth.uid() AND status = 'in_progress')` |
| `submission_answers_select_own_student` | SELECT | `EXISTS (submissions WHERE student_id = auth.uid())` |
| `submission_answers_select_teacher_own` | SELECT | `EXISTS (submissions JOIN assignment_instances JOIN classes JOIN courses WHERE courses.teacher_id = auth.uid()) AND auth_user_role() IN (...)` |
| `submission_answers_update_own_student` | UPDATE | `EXISTS (submissions WHERE student_id = auth.uid() AND status = 'in_progress')` |

### Bảng: `notifications`

| Policy | CMD | Điều kiện |
|--------|-----|-----------|
| `notifications_all_admin` | ALL | `auth_user_role() = 'admin'` |
| `notifications_all_teacher_own` | ALL | `EXISTS (classes JOIN courses WHERE courses.teacher_id = auth.uid()) AND auth_user_role() IN (...)` |
| `notifications_select_student` | SELECT | `EXISTS (enrollments WHERE student_id = auth.uid() AND class_id = notifications.class_id)` ← ⚠️ xem mục 6 |

### Bảng: `class_library_folders`

| Policy | CMD | Điều kiện |
|--------|-----|-----------|
| `class_library_folders_all_admin` | ALL | `auth_user_role() = 'admin'` |
| `class_library_folders_all_teacher_own` | ALL | `EXISTS (classes JOIN courses WHERE courses.teacher_id = auth.uid()) AND auth_user_role() IN (...)` |
| `class_library_folders_select_student` | SELECT | `EXISTS (enrollments WHERE student_id = auth.uid() AND class_id = class_library_folders.class_id)` ← ⚠️ xem mục 6 |

### Bảng: `class_library_files`

| Policy | CMD | Điều kiện |
|--------|-----|-----------|
| `class_library_files_all_admin` | ALL | `auth_user_role() = 'admin'` |
| `class_library_files_all_teacher_own` | ALL | `EXISTS (class_library_folders JOIN classes JOIN courses WHERE courses.teacher_id = auth.uid()) AND auth_user_role() IN (...)` |
| `class_library_files_select_student` | SELECT | `EXISTS (class_library_folders JOIN enrollments WHERE student_id = auth.uid())` ← ⚠️ xem mục 6 |

### Bảng: `error_log`

| Policy | CMD | Điều kiện |
|--------|-----|-----------|
| `error_log_all_admin` | ALL | `auth_user_role() = 'admin'` |
| `error_log_insert_system` | INSERT | `true` (bất kỳ ai cũng có thể insert) |
| `error_log_select_own_student` | SELECT | `student_id = auth.uid()` |
| `error_log_select_teacher_own` | SELECT | `EXISTS (submissions JOIN assignment_instances JOIN classes JOIN courses WHERE courses.teacher_id = auth.uid()) AND auth_user_role() IN (...)` |
| `error_log_update_note_own_student` | UPDATE | `student_id = auth.uid()` |

### Bảng: `tags`

| Policy | CMD | Điều kiện |
|--------|-----|-----------|
| `tags_all_admin` | ALL | `auth_user_role() = 'admin'` (USING và WITH CHECK) |
| `tags_select_authenticated` | SELECT | `auth.uid() IS NOT NULL` (bất kỳ user đã đăng nhập) |

### Bảng: `tab_switch_events`

| Policy | CMD | Điều kiện |
|--------|-----|-----------|
| `tab_switch_events_all_admin` | ALL | `auth_user_role() = 'admin'` |
| `tab_switch_events_insert_own_student` | INSERT | `student_id = auth.uid() AND EXISTS (submissions WHERE student_id = auth.uid() AND status = 'in_progress')` |
| `tab_switch_events_select_teacher_own` | SELECT | `EXISTS (submissions JOIN assignment_instances JOIN classes JOIN courses WHERE courses.teacher_id = auth.uid()) AND auth_user_role() IN (...)` |

### Bảng: `device_sessions`

| Policy | CMD | Điều kiện |
|--------|-----|-----------|
| `device_sessions_select_admin` | SELECT | `auth_user_role() = 'admin'` |
| `device_sessions_select_teacher` | SELECT | `auth_user_role() = 'teacher'` |
| `device_sessions_select_own` | SELECT | `auth.uid() = user_id` |
| `device_sessions_insert_own` | INSERT | `auth.uid() = user_id` |
| `device_sessions_update_own` | UPDATE | `auth.uid() = user_id` |
| `device_sessions_delete_own` | DELETE | `auth.uid() = user_id` |

---

## 6. Các policies còn tiềm ẩn rủi ro

### Tình trạng hiện tại: Có thể an toàn, nhưng chưa được test kỹ

Các policies sau trực tiếp join bảng `enrollments` trong subquery USING clause — **giống pattern đã gây ra bug**:

| Policy | Bảng | Vấn đề |
|--------|------|--------|
| `weeks_select_student` | `weeks` | JOIN `enrollments` trực tiếp |
| `assignment_instances_select_student` | `assignment_instances` | JOIN `enrollments` trực tiếp |
| `notifications_select_student` | `notifications` | JOIN `enrollments` trực tiếp |
| `class_library_folders_select_student` | `class_library_folders` | JOIN `enrollments` trực tiếp |
| `class_library_files_select_student` | `class_library_files` | JOIN `enrollments JOIN class_library_folders` |

### Tại sao chúng có thể chưa phát sinh lỗi?

Nhìn lại `enrollments_select_own_student`:
```sql
-- Policy này KHÔNG join bảng khác:
(student_id = auth.uid())
```

Khi student query `weeks`:
```
weeks_select_student → SELECT FROM enrollments
  └── enrollments policies evaluated:
      ├── enrollments_all_admin         → auth_user_role() = 'admin' → FALSE (student)
      ├── enrollments_all_teacher_own   → EXISTS (classes JOIN courses...) AND auth_user_role() IN ('teacher','admin') → FALSE (student)
      └── enrollments_select_own_student → student_id = auth.uid() → TRUE ✓
```

`enrollments_select_own_student` **không join bảng nào khác** → không có recursion.

Tuy nhiên khi **teacher** query `weeks`, PostgreSQL evaluate:
```
weeks_all_teacher_own → TRUE (teacher owns the class)
weeks_select_student  → SELECT FROM enrollments (vẫn được evaluate vì PERMISSIVE OR)
  └── enrollments_all_teacher_own → EXISTS (classes JOIN courses) → không vào courses RLS vì...
      courses không join enrollments trực tiếp nữa (đã dùng SECURITY DEFINER) → ✓ safe
```

### Kết luận: Hiện tại an toàn, nhưng cần monitor

Sau khi migration 00015 fix `courses_select_enrolled_student` và `classes_select_enrolled_student`, chuỗi đệ quy đã bị cắt đứt. Các policies còn lại join `enrollments` nhưng `enrollments` không còn dẫn trở lại `courses` hay `classes` qua RLS nữa.

**Tuy nhiên**, nếu trong tương lai thêm policy mới vào `enrollments` mà join ngược lại `weeks`, `assignment_instances`, hoặc bất kỳ bảng nào có policy join `enrollments` — sẽ tái tạo recursion.

### Khuyến nghị: Nên fix proactively

Để phòng ngừa hoàn toàn, nên tạo thêm security definer functions:

```sql
-- Thêm vào migration tiếp theo nếu cần
CREATE OR REPLACE FUNCTION public.auth_student_enrolled_in_class_safe(p_class_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.enrollments e
    WHERE e.student_id = auth.uid() AND e.class_id = p_class_id)
$$;

-- Rồi dùng function này thay vì subquery trực tiếp trong policies:
-- weeks_select_student, notifications_select_student,
-- class_library_folders_select_student, assignment_instances_select_student
```

---

## 7. Các migrations đã áp dụng

### `00013_fix_rls_recursion.sql`

Thay thế các subquery đọc `profiles.role` trong policy conditions bằng `auth_user_role()` function trên các bảng chính: `courses`, `classes`, `enrollments`, `profiles`.

**Vấn đề trước đó**: Policy dùng `(SELECT role FROM profiles WHERE id = auth.uid())` trực tiếp → trigger RLS của profiles → có thể tạo chain khó kiểm soát.

---

### `00014_fix_rls_all_tables.sql`

Tiếp tục áp dụng `auth_user_role()` cho tất cả bảng còn lại: `questions`, `assignments`, `assignment_instances`, `submissions`, `submission_answers`, `weeks`, `notifications`, `class_library_folders`, `class_library_files`, `error_log`, `tab_switch_events`, `device_sessions`, `tags`.

---

### `00015_fix_rls_cross_table_recursion.sql`

**Fix trực tiếp bug infinite recursion** bằng cách tạo 2 security definer functions và thay thế 2 policies:

1. Tạo `auth_student_enrolled_in_course(p_course_id UUID)` → dùng trong `courses_select_enrolled_student`
2. Tạo `auth_student_enrolled_in_class(p_class_id UUID)` → dùng trong `classes_select_enrolled_student`

File: `supabase/migrations/00015_fix_rls_cross_table_recursion.sql`

---

## 8. Nguyên tắc viết RLS an toàn

### ✅ Được làm

**1. Luôn dùng `auth_user_role()` để check role:**
```sql
-- ĐÚNG:
USING (auth_user_role() = 'admin'::user_role)

-- SAI:
USING ((SELECT role FROM profiles WHERE id = auth.uid()) = 'admin')
```

**2. Dùng Security Definer function khi policy cần join bảng có RLS:**
```sql
-- Thay vì:
USING (EXISTS (SELECT 1 FROM enrollments WHERE student_id = auth.uid() AND ...))

-- Dùng:
USING (auth_student_enrolled_in_class(table_name.class_id))
```

**3. Vẽ dependency graph trước khi viết policy mới:**
```
Bảng A có policy → join Bảng B?
  └── Bảng B có policy → join Bảng A?
      └── Nếu có → PHẢI dùng Security Definer function
```

**4. Test với đúng role:**
```sql
-- Test dưới góc nhìn của student:
SET request.jwt.claims TO '{"sub":"student-uuid","role":"authenticated"}';
SELECT * FROM courses;

-- Test dưới góc nhìn của teacher:
SET request.jwt.claims TO '{"sub":"teacher-uuid","role":"authenticated"}';
SELECT * FROM courses;
```

**5. Dùng `EXPLAIN` để xem policy rewrite:**
```sql
EXPLAIN SELECT * FROM courses;
-- Sẽ hiện Filter condition đã được inject bởi RLS
```

---

### ❌ Không được làm

**1. Không bao giờ join ngược vào bảng đang được query:**
```sql
-- Bảng courses có policy:
USING (EXISTS (SELECT 1 FROM enrollments JOIN classes WHERE classes.course_id = courses.id))
-- Bảng enrollments có policy:
USING (EXISTS (SELECT 1 FROM classes JOIN courses WHERE ...))
-- → Recursion!
```

**2. Không SELECT từ profiles trong policy condition:**
```sql
-- SAI - có thể trigger profiles RLS:
USING ((SELECT role FROM profiles WHERE id = auth.uid()) = 'teacher')

-- ĐÚNG:
USING (auth_user_role() = 'teacher'::user_role)
```

**3. Không thêm policy mới vào enrollments mà join bảng có sẵn policy join ngược lại enrollments:**

Các bảng sau hiện đang có policy join `enrollments`:
- `weeks_select_student`
- `assignment_instances_select_student`
- `notifications_select_student`
- `class_library_folders_select_student`
- `class_library_files_select_student`

→ Nếu thêm policy vào `enrollments` mà join bất kỳ bảng nào trong danh sách trên, sẽ xảy ra recursion.

**4. Không dùng service role key trong frontend code:**
```typescript
// SAI - expose service role key cho browser:
const supabase = createClient(url, SUPABASE_SERVICE_ROLE_KEY)

// ĐÚNG - chỉ dùng service role trong API routes (server-side):
// app/api/*/route.ts
const raw = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false }
})
```

---

## 9. Cách test RLS policies

### Kiểm tra từ Supabase Studio

1. Mở `http://localhost:54323`
2. Vào **Table Editor** → chọn bảng
3. Ở góc phải, chọn **"Impersonate user"** → nhập UUID của user cần test
4. Chạy query → xem kết quả được filter theo RLS

### Kiểm tra từ psql

```sql
-- Bước 1: Set JWT claims giả lập (local dev only)
SELECT set_config('request.jwt.claims', 
  json_build_object(
    'sub', 'aaaaaaaa-0000-0000-0000-000000000002',  -- teacher UUID
    'role', 'authenticated'
  )::text, 
  true
);

-- Bước 2: Đặt role thành authenticated
SET ROLE authenticated;

-- Bước 3: Test query
SELECT id, title FROM courses;

-- Bước 4: Reset về superuser
RESET ROLE;
```

### Kiểm tra một policy có gây recursion không

```sql
-- Chạy EXPLAIN với role của user cần test
SET ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"...","role":"authenticated"}', true);

EXPLAIN (VERBOSE, FORMAT TEXT) SELECT * FROM courses LIMIT 1;
-- Nếu có recursion → PostgreSQL báo lỗi ngay
-- Nếu không có → hiện query plan bình thường

RESET ROLE;
```

### Kiểm tra security definer functions

```sql
-- Test function trực tiếp (chạy với auth.uid() tương ứng)
SELECT public.auth_student_enrolled_in_course('course-uuid-here');
SELECT public.auth_student_enrolled_in_class('class-uuid-here');
SELECT public.auth_user_role();
SELECT public.auth_teacher_has_student('student-uuid-here');
```

### Danh sách bảng cần test khi thêm policy mới

Khi thêm policy mới vào **bất kỳ bảng nào**, chạy query test cho tất cả 3 roles:

```bash
# Quick smoke test — thay UUID theo seed data
psql postgresql://postgres:postgres@localhost:54322/postgres << 'EOF'
-- Test as teacher (aaaaaaaa-0000-0000-0000-000000000002)
SET ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"aaaaaaaa-0000-0000-0000-000000000002","role":"authenticated"}',true);
SELECT COUNT(*) FROM courses;   -- expect: teacher's courses
SELECT COUNT(*) FROM classes;   -- expect: teacher's classes
SELECT COUNT(*) FROM enrollments; -- expect: teacher's enrollments
SELECT COUNT(*) FROM weeks;       -- expect: teacher's weeks
SELECT COUNT(*) FROM assignment_instances; -- expect: teacher's instances
RESET ROLE;
EOF
```

---

## Tóm tắt nhanh (TL;DR)

| Vấn đề | Nguyên nhân | Fix |
|--------|-------------|-----|
| Infinite recursion: courses ↔ enrollments | `courses_select_enrolled_student` join `enrollments` trực tiếp; `enrollments_all_teacher_own` join `courses` | Tạo `auth_student_enrolled_in_course()` SECURITY DEFINER |
| Infinite recursion: classes ↔ enrollments | `classes_select_enrolled_student` join `enrollments` trực tiếp; `enrollments_all_teacher_own` join `classes` | Tạo `auth_student_enrolled_in_class()` SECURITY DEFINER |
| Role check trigger profiles RLS | Policy dùng subquery `SELECT role FROM profiles` | Dùng `auth_user_role()` function |
| Teacher xem profile của học sinh mình | Cần join enrollments → classes → courses | Tạo `auth_teacher_has_student()` SECURITY DEFINER |

**Quy tắc vàng**: Mỗi khi policy cần đọc dữ liệu từ bảng khác có RLS → **dùng SECURITY DEFINER function** để ngắt chain.
