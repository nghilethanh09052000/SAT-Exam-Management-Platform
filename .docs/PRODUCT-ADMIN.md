# PRODUCT-ADMIN.md — SAT Platform: Admin & Teacher Features

> **Status:** Living document. Update as requirements evolve.
> **Last updated:** 2026-05-10
> **Roles covered:** Admin (Nghi) · Teacher

---

## 1. Who Uses This Side

| Role | Description |
|---|---|
| **Admin** | Platform owner (Nghi). Full system access — manages teacher accounts, monitors all data, configures system settings. |
| **Teacher** | The client. Manages their own classes, students, assignments, and views student results. Non-technical — UI must be simple and jargon-free. |

> For now, Admin and Teacher are effectively the same person (Nghi + his teacher-client). The role separation exists so Admin can assist the Teacher and for future scalability.

---

## 2. Student Enrollment

### Enrollment Model
- A student is enrolled in **1 active Course at a time**, and belongs to **1 Class within that course**.
- A Class defines the schedule (days, times, session details) within a Course.
- When a Course ends, it remains accessible to the student in **read-only review mode** until the course expiration date.
- **Course expiration:** Set by Admin or Teacher — can be 1 year after end date, or never (forever access). After expiration, the course is hidden from the student.
- When a new quarter starts, teacher enrolls the student in the new Course. The student then has 1 new active course + past courses available for review.

### Method 1 — Manual Entry
- Teacher fills in: name, email, phone number, and initial password for each student.
- Platform sends an email invite to the student.

### Method 2 — Excel Upload
- Teacher exports a Google Form response sheet to Excel.
- Uploads the Excel file to a specific Class inside a Course.
- Platform reads the file and auto-enrolls all students into that Class.
- Required columns: `name`, `email`, `phone`
- If the Excel format is wrong, teacher uses Claude (outside the platform) to reformat it first.



## 3. Course & Class Management

### Course Creation Flow
Teacher navigates to: **"Tạo khóa học mới"**

Form fields:
- **Tên khóa học** (Course name) — e.g. "SAT Intensive Q3 2025"
- **Ngày bắt đầu** (Start date)
- **Ngày kết thúc** (End date)
- **Hạn lưu trữ** (Expiration) — options: 6 tháng · 1 năm · Không giới hạn

After creating the Course, teacher adds Classes inside it:
- **Tên lớp** (Class name) — e.g. "Lớp Sáng Thứ 2-4"
- **Lịch học** (Schedule) — days and times, free text
- **Ngày bắt đầu / kết thúc lớp** (Class start/end dates)

When a Class end date passes → assignments inside are automatically hidden from students.

### 4-Tier Hierarchy
```
Khóa học (Course)
└── Lớp (Class) — multiple classes per course, each with own schedule
    └── Tuần (Week)
        └── Bài tập (Assignment Instance — assigned to this class)
                ↑
        Ngân hàng câu hỏi (Question Bank — reusable source)
```

**Khóa học (Course):** Top-level container. One course per quarter. Example: "SAT Intensive Q3 2025" → Lớp Sáng (Mon/Wed), Lớp Chiều (Tue/Thu).

**Lớp (Class):** Lives inside one Course. Defines the schedule. Student belongs to exactly one Class within the Course.

**Tuần (Week):** Groups assignments by week. Label only — no settings.

**Bài tập (Assignment source):** Lives in the Question Bank independently. Reusable across classes.

**Assignment Instance:** Created when teacher assigns a Bài tập to a specific Lớp + Tuần with its own settings (deadline, timed/untimed, retakes, etc.).

### Why this matters
- Same test can be assigned to Lớp Sáng (Week 3, deadline Friday) and Lớp Chiều (Week 5, deadline Sunday) without duplicating questions.
- Teacher creates the assignment once, assigns it many times.
- Past student results are never affected when the teacher edits the original in the bank.

### Assignment Flow (Teacher UI)

Teacher navigates to: **Class → Week → "Add Assignment"**

The form auto-fills context from where the teacher clicked:
- **Course** → auto-filled *(read-only)*
- **Class** → auto-filled *(read-only)*
- **Week** → auto-filled *(read-only)*
- **Title** → teacher types manually

Teacher then sees two options side by side:

```
┌─────────────────────────┐  ┌─────────────────────────┐
│     Upload .docx        │  │   Pick from Question     │
│                         │  │         Bank             │
│  Drag & drop or browse  │  │  Search / browse saved   │
│  → AI parses questions  │  │  assignments             │
│  → Teacher reviews tags │  │  → Select and confirm    │
│  → Saved to bank        │  │                          │
└─────────────────────────┘  └─────────────────────────┘
```

After picking source, teacher sets instance settings:
- Deadline · Timed/Untimed · Show results · Shuffle · Retakes · Alerts

Then clicks **Publish** → students in that class see it immediately.

---

## 4. Question Bank

All questions uploaded to the platform are stored in a shared question bank that can be reused across classes and assignments.

### Tagging (Required for every question)
Each question must be tagged with:
- **Subject:** Reading & Writing · Math
- **Skill category:**
  - R&W: Words in Context · Punctuation · Subject-Verb Agreement · Logical Transition · *(more TBD)*
  - Math: Linear Equations · Quadratic Functions · Geometry: Circles · Data Analysis · *(more TBD)*
- **Difficulty:** Easy · Medium · Hard *(optional)*

**Tagging workflow:**
- **Manual question creation:** Teacher picks tags from a fixed dropdown list (predefined tag database).
- **Batch upload (.docx):** AI suggests tags for each parsed question → Teacher reviews and confirms or changes before saving to bank.
- Tag list is always fixed and predefined — no free-text tags — to keep analytics consistent.

### Question Types
- Multiple choice (4 options, one correct)
- Short answer / open-ended (teacher defines multiple accepted answer variants for auto-grading)

### Math Rendering
- All formulas render using **KaTeX** — applies in questions, answer choices, and explanations.

### Batch Upload (.docx only at launch)
- Teacher uploads a Word file containing questions.
- Platform parses the file (via Mammoth.js) and extracts question text, answer choices, and embedded images.
- Extracted images are saved to Supabase Storage and referenced inline in the question by URL.
- Teacher must follow a strict .docx template format when preparing questions — incorrect format will fail the entire upload and return an error message showing exactly which part of the document is malformed.
- Teacher reviews the parsed output, assigns tags (AI-suggested), then saves to the question bank.

> ⚠️ Images must be properly inserted into Word (not pasted from screenshots) to ensure clean extraction. Recommend teacher uses PNG or JPG files inserted via Word's Insert Image function.

### Duplicate Detection
Two layers of deduplication:

**1. Automatic (on upload)**
When a question is uploaded, the system automatically checks if an identical question already exists in the bank using a content hash. If a match is found, the teacher is shown the existing question side by side and can choose to: skip it, replace the existing one, or keep both.

**2. Manual (ongoing)**
Teacher can browse the Question Bank at any time, search for questions, and manually delete duplicates they find.

### Reuse
- Any question in the bank can be added to new assignments without re-uploading.
- Editing a question in the bank does not retroactively change past assignment results.

---

## 5. Assignment Settings (Per Instance)

When a teacher assigns an Assignment to a Class + Week, they configure an **assignment instance** — the same question set can be assigned to multiple classes with different settings each time.

### Instance Settings
| Setting | Options |
|---|---|
| Deadline | Date + time |
| Mode | Timed · Untimed |
| Show results | Immediately after submit · After deadline (score always shown immediately either way) |
| Shuffle | Questions · Answer choices · Both · None |
| Max retakes | Number (0 = no retakes allowed) |
| Score weighting | Per-question point value |
| Alert | Browser popup + email notification (2× per day until deadline) |

### Assignment Reuse
- Any assignment in the Question Bank can be assigned to any class at any time.
- Teacher can also duplicate an existing instance (copy settings to a new class/week) for speed.

### Editing a Published Assignment Instance
- Teacher can edit the deadline of a published assignment at any time directly in the UI.
- This is how deadline extensions work in practice: student contacts teacher outside the platform, teacher updates the deadline in the assignment instance.
- Other settings (timed/untimed, shuffle, retakes) can also be edited before the deadline passes.

---

## 6. Class Library

Per class, teacher can:
- Create folders.
- Upload files: PDF, Word, video links.
- Send broadcast notifications to all students in a class.

---

## 7. Teacher Dashboard

> Full dashboard specification is in **`DASHBOARD.md`**.

High-level overview:
- Track assignment submission progress per class.
- Review individual student answers, time per question, and cheating signals (tab-switch log).
- View class statistics: max, min, mean scores per assignment.
- View most-missed questions across the class.
- View retake attempt history per student.
- Leaderboard: ranked by score or correct answer count (Admin and Teacher only).

---

## 8. Explanations & Answer Keys

For each question, teacher can add:
- **Teacher-written explanation** (manual, rich text)
- **Video explanation** (embed link — YouTube, Loom, etc.)

**AI-generated explanation:**
- Generated once per question via Claude API — cached and reused for all students.
- AI is trained on the teacher's own explanation style using collected examples (few-shot prompting). The more teacher-written examples collected, the closer the AI output matches the teacher's voice and format.
- Shown alongside the teacher's explanation after submission.
- Teacher can edit or override the AI explanation at any time.

---

## 9. System & Security (Admin Only)

### User Roles
| Role | Access level |
|---|---|
| Admin | Full: all users, all classes, all data, system config |
| Teacher | Own classes and students only |
| Student | Own assignments and results only |

### Authentication
- **Admin & Teacher:** Email/password login
- **Students:** Google OAuth only (Đăng nhập bằng Google) — no email/password, no password reset needed
- Handled via Supabase Auth — free tier supports up to 50,000 MAU, well within budget
- Google OAuth setup: one-time configuration in Google Cloud Console, then handled entirely by Supabase
- Student's Gmail address from OAuth is used for all platform communications

### Email Notification Service
- Deadline alert emails sent via **Resend.com** (free tier: 3,000 emails/month)
- **Frequency:** 1× per day, 24 hours before deadline — stays within free tier for 200 students
- Triggered by Supabase Edge Functions on a daily scheduled job
- Email sent to student's Gmail (from Google OAuth)
- No other transactional emails needed — password reset not applicable for OAuth-only students

### Language
- Platform UI is in **Vietnamese only**.

### Account Management
- Admin can create, edit, and disable teacher and student accounts.
- **Device limit:** Maximum 1 simultaneous session per student account. A student cannot be logged in on two devices at the same time.
- When a student hits the device limit on login, they are shown a message in Vietnamese explaining they must log out of an existing device first.
- All device limit violations are logged and visible to Admin and Teacher for tracking.

### Test Checkpoint & Resume
- Student progress is saved automatically during a test (current question, answers so far, time remaining).
- If a student loses connection or closes the browser mid-test, they can resume from where they left off.
- Timer continues from where it paused — no extra time granted for disconnection.

### Content Protection (best-effort — web browser limitations apply)
- Right-click disabled on test pages.
- Text selection and copy/paste disabled during active test.
- CSS watermark overlay showing student name and email on all test pages.
- Tab-switch and window-blur events logged during test — visible to teacher in per-student review as a cheating signal.

> ⚠️ Full screenshot and screen-recording prevention is **not possible** in a web browser. These measures are deterrents only. The teacher has been informed of this limitation.

### Course Expiration & Data Archiving
- When a course passes its expiration date, it is **soft-deleted** in the database — hidden from all users but data is retained.
- Archived data includes: all student results, answers, scores, error notes, and time records for that course.
- Storage cleanup strategy to be designed in `SCHEMA.md`.
- Admin can manually archive or restore a course at any time.

### Admin Panel
- Admin has full access to all data across all courses, classes, and students.
- Specific Admin UI flows are flexible and will be designed based on the database schema.
- At minimum, Admin can: view all students, enable/disable accounts, view device violation logs, manage course expiration settings.

### Leaderboard Visibility
- Leaderboard is visible to **Admin and Teacher only**. Students cannot see rankings.

---

## 10. Open Questions (Admin/Teacher side)

- [x] Auth: Email/password for Admin & Teacher, Google OAuth option for Students
- [x] UI language: Vietnamese only
- [x] Leaderboard: Admin and Teacher only, not visible to students
- [x] AI explanations: generated once per question, cached, not per submission
- [x] Device limit: 1 session per student account
- [x] Student enrollment: 1 active course at a time, 1 class within that course. Past courses kept for review until expiration.
- [ ] Max students per class? (affects DB design)

---

*Related documents: `PRODUCT-STUDENT.md` · `PLAN.md` · `SCHEMA.md` · `DOCX-TEMPLATE.md` · `SKILL-AI-EXPLANATION.md`*
