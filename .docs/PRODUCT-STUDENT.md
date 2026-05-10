# PRODUCT-STUDENT.md — SAT Platform: Student Features

> **Status:** Living document. Update as requirements evolve.
> **Last updated:** 2026-05-10
> **Role covered:** Student

---

## 1. Who Is the Student

- Enrolled in **1 active Course at a time**, belonging to **1 Class within that course**. A Class defines the schedule (days, times) inside the Course.
- When a Course ends, it stays visible in **read-only review mode** until the course expiration date set by the teacher/admin (1 year or custom or forever).
- When a new quarter starts, the teacher enrolls the student in a new Course. The student then has 1 active course + past courses available to review.
- Accesses the platform via **email/password or Google OAuth (Login with Google)** — student chooses.
- UI language is **Vietnamese only**.
- Only sees content from their own enrolled courses. Cannot see other students' data.

---

## 2. Student Home

- After login, student sees:
  - **Active Course** — their current enrolled course with all Classes, Weeks, and Assignments.
  - **Past Courses** — previous courses shown in read-only review mode until expiration. Student can browse old assignments and results but cannot submit anything.
- Each assignment card shows:
  - Assignment title
  - Deadline countdown
  - Status: Chưa làm · Đang làm · Đã nộp · Hết hạn
- Expired assignments are locked and cannot be started.
- If a course has no assignments yet, student sees: **"Chưa có bài tập"** with a friendly message to check back later.

---

## 3. Taking a Test (Bluebook-Clone Interface)

The test experience must feel as close as possible to the real College Board **Bluebook** app.

### Layout
- Clean, distraction-free full-screen interface.
- Question navigation panel (jump to any question, see status at a glance).
- Current question number and total displayed.

### Timer
- Countdown timer visible at all times.
- Can be hidden by student (same as Bluebook).
- When time runs out, module auto-submits.

### Per-Question Tools
| Tool | Description |
|---|---|
| **Highlight** | Student can select text and highlight it yellow |
| **Notes** | A small scratchpad area per question for personal notes |
| **Strikethrough** | Cross out answer choices the student thinks are wrong |
| **Mark for Review** | Flag a question to come back to before final submission |

### Question Navigation Panel
Shows all question numbers at a glance with status indicators:

| Status | Meaning |
|---|---|
| ○ Empty | Not yet answered |
| ● Filled | Answered |
| ⚑ Flagged | Marked for review (not answered) |
| ⚑● Filled + Flagged | Answered but marked to revisit |

Student can click any question number in the panel to jump directly to it within the current module.

### Module Flow
- Test is split into modules (e.g., Reading & Writing Module 1 → Module 2).
- When student finishes a module and clicks Next, they move to the next module automatically.
- Cannot go back to a previous module once submitted.

### Desmos Calculator
- Available during Math modules.
- Opens as an embedded Desmos window alongside the question.
- Same behavior as Bluebook.

### Untimed Mode
- If the teacher sets the assignment as untimed, the timer is hidden and there is no auto-submit.

### Deadline & Attempt Rules
- If a student tries to start an assignment past its deadline, it is **locked**. They see a Vietnamese message explaining the deadline has passed and to contact their teacher to extend it.
- Only the teacher can extend a deadline — students cannot unlock it themselves.
- **Retake attempts** are controlled by the teacher's assignment setting:
  - Default = 0 retakes. After submitting once, the assignment becomes view-only.
  - If teacher sets retakes = N, student can attempt up to N+1 times total.
  - Each attempt is recorded separately and visible in the student's history.
- If a student has not submitted and the deadline passes, the assignment is locked with no submission recorded.

### Checkpoint & Resume
- Student progress is saved automatically throughout the test (current question, all answers so far, time remaining).
- If the student loses internet connection, closes the browser, or navigates away mid-test, they can return and resume exactly where they left off.
- Timer resumes from where it paused — no extra time is granted for disconnection.

---

## 4. Submitting & Seeing Results

### After Submission
- **Score is always shown immediately** after submitting — regardless of teacher setting.
- Full review access depends on teacher's setting:

| Teacher setting | What student sees |
|---|---|
| Show results immediately | Score + full results table + review mode unlocked |
| Show results after deadline | Score only — full review available after deadline passes |

### Results Page
Mirrors the College Board results layout:

- **Score summary** at the top (total score, section scores).
- **Results table** *(unlocked based on teacher setting)*: one row per question showing:
  - Question number
  - Student's answer
  - Correct answer
  - Time spent on that question
- **Skill breakdown:** performance percentage per tag category (e.g., "Words in Context: 4/6 đúng").

### Review Mode
- Student clicks "Review" on any question from the results page.
- Full question is shown with all answer choices.
- Student's wrong answer is highlighted **red**.
- Correct answer is highlighted **green**.
- Teacher explanation is shown below (if added).
- AI explanation is shown alongside teacher explanation.
- Video explanation link is shown (if added).
- Student can re-open review mode **at any time** after results are released — no limit on how many times they revisit.

### Error Notes (per question in review)
- Student can type a personal note explaining their mistake.
- Example: "Misread the question", "Forgot this formula".
- Notes are saved and visible later in the Error Log.

---

## 5. Student Dashboard

Personal performance overview for the student's enrolled course.

- Score trend over time (per assignment, shown as a chart).
- Skill breakdown: performance percentage per tag category — shows which areas need the most work.
- Recent assignments and their statuses: Not started · In progress · Submitted · Expired.

> Exact chart types and detailed statistics to be designed in the UI phase. Dashboard is **Phase 2**.

---

## 6. Error Log (Sổ Tay Lỗi Sai)

Automatically collects every question the student answered incorrectly — from all attempts across all assignments in their enrolled courses.

**Behavior:**
- Wrong answers are kept permanently as a historical record — even if the student answers correctly on a later retake.
- Each entry shows which attempt it came from, so students can track improvement over time.

**Features:**
- Filter by: skill tag · assignment
- Student can redo any question from the Error Log.
- Each entry shows the personal error note written during review (if any).
- Correct answer and student's wrong answer shown side by side for reference.

---

## 7. Vocabulary Notebook (Từ Điển Của Tôi)

> **Phase 2 — not in initial build.**

Planned feature: students save words from review mode into a personal vocabulary list for self-study.

---

## 8. AI Chat Support

> **Phase 2 — not in initial build.**

Planned feature: AI assistant for students to ask questions about specific questions or concepts directly within the platform.

---

## 9. Notifications

- Student receives email alerts for upcoming assignment deadlines (2× per day until deadline).
- In-platform popup when a new assignment is assigned to their class.

---

## 10. Account & Security

- Student can update their own display name.
- Cannot change their enrolled class — managed by teacher.
- **Đăng nhập bằng Google (Google OAuth only):** Students log in exclusively with their Google account — one click, no password needed, no password reset flow.
- **Device limit: 1 phiên đăng nhập.** If a student tries to log in on a new device while already logged in elsewhere, they see a Vietnamese message telling them to log out of the existing device first.
- All device limit violations are recorded and visible to Admin and Teacher for monitoring.

### Course Expiration
- When a course passes its expiration date, it disappears from the student's home screen entirely.
- All their results, scores, and error notes from that course are archived in the database — not deleted — but no longer accessible to the student.
- Students are not notified when a course expires.

---

## 11. Open Questions (Student side)

- [x] Login method: Google OAuth only
- [x] Password reset: not needed (OAuth only)
- [x] Deadline alerts: 1× per day via Resend.com to student's Gmail
- [x] Leaderboard: not visible to students
- [x] UI language: Vietnamese only
- [x] Device limit: 1 session per account
- [x] Enrollment: 1 active course at a time, 1 class within that course
- [x] Past courses: read-only until expiration, then archived and hidden
- [x] Error Log: keeps all historical wrong answers permanently
- [x] Score always shown after submit; full review gated by teacher setting
- [x] Retakes: default 0, teacher configurable

---

*Related documents: `PRODUCT-ADMIN.md` · `PLAN.md` · `SCHEMA.md`*
