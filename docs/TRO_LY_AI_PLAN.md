# Trợ lý AI — Plan (Teacher & Admin AI Assistant via MCP)

> In-app conversational AI assistant ("Trợ lý AI") for **teachers** and **admins** of the SAT
> Exam Management Platform. It answers questions and performs actions over platform data by
> calling **MCP tools** that already wrap the platform's domain (questions, exams, students,
> classes, analytics).

Status: **Plan / Proposal** · Owner: TBD · Last updated: 2026-05-31

---

## 1. Goal & scope

Give teachers and admins a chat panel where they can ask, in Vietnamese or English:

- _"Lớp SAT-A2 tuần này điểm trung bình bao nhiêu? Ai đang tụt lại?"_ (analytics)
- _"Tạo bài tập 10 câu Algebra mức trung bình cho lớp SAT-A2."_ (authoring + assignment)
- _"Học sinh Nguyễn Văn A đang yếu phần nào?"_ (per-student diagnosis)
- _"Soạn email nhắc các bạn chưa nộp bài Reading tuần 5."_ (drafting)
- Admin: _"Tuần này có bao nhiêu tài khoản mới? Lớp nào chưa có giáo viên?"_ (ops)

The assistant **reads and acts through MCP tools**, never via free-form SQL, so every action is
scoped, validated (zod), and audited.

### In scope (Phase 1–3)
- Chat UI for teacher and admin (separate entry points, shared component).
- Claude (via `@anthropic-ai/sdk`) orchestrating the **existing `mcp/` server** tools.
- Role-based tool gating (teacher sees only their classes; admin sees org-wide).
- Streaming responses, tool-call transparency, KaTeX rendering for math.

### Out of scope (for now)
- Student-facing assistant (different trust model — separate later phase).
- Voice input.
- Autonomous/background agents (one-shot conversational only).

---

## 2. Which MCP — decision

**Reuse and extend the existing first-party server `mcp/` (`sat-platform-mcp`).** Do **not** add a
third-party MCP. Rationale:

| Option | Verdict |
|---|---|
| **Existing `mcp/` server** (questions/exams/students/classes/analytics) | ✅ **Chosen.** Already wraps our Supabase domain with zod schemas; we own auth & scoping. |
| Generic Supabase/Postgres MCP | ❌ Exposes raw tables/SQL — bypasses RLS intent, no role scoping, dangerous for write ops. |
| Anthropic-hosted connectors | ❌ Our data is private + per-tenant; no off-platform egress. |

### How the app talks to the MCP

Two viable wiring patterns — **recommend Pattern A** for v1:

- **Pattern A — In-process tool bridge (recommended for v1).**
  The Next.js route `/api/assistant/chat` runs the Claude loop with `@anthropic-ai/sdk` and maps
  Claude `tool_use` blocks directly onto the **same tool functions** that `mcp/src/tools/*`
  expose (import them, or factor the handlers into a shared `lib/assistant/tools/`). No separate
  process/transport; lowest latency; runs fine on Vercel Fluid Compute.
  - The standalone `mcp/` server (stdio) stays the **canonical definition** + lets devs/Claude
    Desktop use the same tools. The web route consumes the same handler modules.

- **Pattern B — Remote MCP transport.** Run `sat-platform-mcp` as a streamable-HTTP MCP endpoint
  and have the route connect as an MCP client. More moving parts; defer unless we need to share
  the server with external agents.

> Net: keep **one source of truth for tool logic** in `mcp/src/tools/`, surface it both as the
> stdio MCP server (already built) and via the web `/api/assistant` route (Pattern A).

---

## 3. Architecture

```
Teacher/Admin browser
  └─ <AssistantPanel/>  (chat UI, streaming)
        │  POST /api/assistant/chat  (SSE stream)
        ▼
  Next.js route handler  (app/api/assistant/chat/route.ts)
   1. authenticate (Supabase session) → resolve role + scope (teacherId / org)
   2. build system prompt (role, locale=vi, current class context)
   3. Anthropic Messages API (claude-opus-4-8 / sonnet for cost) with tools[]
   4. loop: on tool_use → run handler from lib/assistant/tools (shared w/ mcp/)
            inject scope (teacherId) so teacher tools never read other classes
   5. stream text deltas + tool-call events back to client
        ▼
  Tool handlers (shared)  ──►  Supabase  (service client, scoped by args)
        ▲
  mcp/src/index.ts (stdio MCP server) exposes the SAME handlers to Claude Desktop / dev
```

### Tool catalog (from existing `mcp/src/tools/`, gated by role)

| Module | Example tools | Teacher | Admin |
|---|---|---|---|
| `analytics` | class averages, weak-topic breakdown, completion rates, at-risk students | own classes | all |
| `students` | list/lookup, performance summary, progress over time | own students | all |
| `classes` | list classes, roster, weeks | own classes | all |
| `questions` | search, create draft, classify, AI explanation | ✅ | ✅ |
| `exams` | list exam papers, assemble exercise/assignment | ✅ | ✅ |
| _(new)_ `assignments` | create assignment from spec, list pending submissions | ✅ | ✅ |
| _(new, admin)_ `ops` | new-user counts, classes without teacher, import status | ❌ | ✅ |
| _(new)_ `comms` | draft email/notification (returns draft; send stays manual) | ✅ | ✅ |

**Scoping rule (critical):** teacher tool calls are always injected with the authenticated
`teacherId`; the model cannot pass an arbitrary teacher/class id to escape scope. Admin role lifts
the scope. Mirror the existing service-client + scoping approach used by student read pages
(see memory: auth-cookie-and-rls-perf).

### Write-action safety
- Mutating tools (create assignment, send comms) return a **proposed action** that the UI renders
  as a confirm card; the actual write only fires on user click → `POST /api/assistant/confirm`.
- Every tool invocation is logged (actor, role, tool, args, result id) for audit.

---

## 4. UI design — "Trợ lý AI"

### Entry points
- Teacher: floating action button (sparkle/`Bot` lucide icon) bottom-right on all `(teacher)`
  pages, label **"Trợ lý AI"**. Also a full-page route `teacher/assistant` for long sessions.
- Admin: same component under `(admin)`, FAB + `admin/assistant` route. Context-aware: if opened
  on a class page, the current class is pre-loaded as context chips.

### Layout (slide-over panel, ~420px, full-height)
```
┌─────────────────────────────────────────┐
│  ✦ Trợ lý AI            [class: SAT-A2 ▾] │  header: title + context selector
├─────────────────────────────────────────┤
│                                           │
│  [assistant] Chào thầy/cô! Em có thể …    │  message stream
│                                           │
│  [you] Lớp SAT-A2 tuần này thế nào?       │
│                                           │
│  [assistant]  ⚙ analytics.classSummary    │  collapsible tool-call chip
│     Điểm TB: 1180 (+30)…                   │  (KaTeX for formulas)
│     ┌─ mini bar chart ─┐                   │
│     • 3 bạn cần chú ý ▸                     │  expandable detail
│                                           │
│  [assistant]  ✦ Đề xuất: tạo bài tập…     │  action card
│     [ Xem trước ]   [ Tạo bài t
tập ]      │  confirm before write
├─────────────────────────────────────────┤
│  💬 Hỏi bất cứ điều gì…        [➤ Gửi]    │  composer + suggested prompts
│  [Tóm tắt lớp] [Học sinh yếu] [Soạn email]│  quick-action chips
└─────────────────────────────────────────┘
```

### Components (new, under `components/assistant/`)
- `AssistantLauncher.tsx` — FAB + open/close state.
- `AssistantPanel.tsx` — slide-over shell, header, context selector.
- `MessageList.tsx` / `MessageBubble.tsx` — user vs assistant, markdown + KaTeX (reuse existing
  katex/react-katex setup), code/table rendering.
- `ToolCallChip.tsx` — collapsible "what the AI looked at" (tool name, args summary, result),
  builds trust + transparency.
- `ActionCard.tsx` — proposed write actions with preview + confirm/cancel.
- `Composer.tsx` — textarea, send, suggested-prompt chips, streaming stop button.

### Visual language
- Match current redesigned look (recent `Redesign page` commit), Tailwind, lucide icons.
- Assistant accent = a single brand color + subtle sparkle; tool chips muted/secondary.
- Streaming: token-by-token text; tool calls show a spinner → result.
- All copy localized via **next-intl** (`messages/vi.json`, `messages/en.json`), default **vi**.
- Dates pinned to `Asia/Ho_Chi_Minh` (see memory: date-hydration-timezone) to avoid hydration
  mismatch on Vercel.
- Empty state: greeting + 3–4 suggested prompts tailored to role.
- Accessibility: focus trap in panel, Esc to close, ARIA live region for streamed text.

---

## 5. Backend changes

### New files
- `app/api/assistant/chat/route.ts` — streaming chat loop (Anthropic + tool dispatch).
- `app/api/assistant/confirm/route.ts` — execute a previously proposed write action.
- `lib/assistant/system-prompt.ts` — role/locale/context-aware system prompt.
- `lib/assistant/tools/index.ts` — shared tool registry (imported by both the web route and
  `mcp/src/index.ts`), or refactor `mcp/src/tools/*` to be import-safe from the app.
- `lib/assistant/scope.ts` — resolve role → allowed tools + injected scope args.
- `lib/assistant/audit.ts` — log every tool call.

### `mcp/` extensions
- Add `assignments`, `ops` (admin), `comms` tool modules in `mcp/src/tools/`.
- Keep zod schemas as the single validation layer for both surfaces.
- Update `mcp/README.md` with the new tools.

### Model & cost
- Default **`claude-sonnet-4-6`** for routine Q&A; escalate to **`claude-opus-4-8`** for complex
  planning/authoring. Enable **prompt caching** on the system prompt + tool defs.
- Optionally route via **Vercel AI Gateway** for observability/fallback (deploy is on Vercel).

### Security & limits
- Auth required; deny if no teacher/admin role (reuse middleware role checks).
- Rate-limit per user. Cap tool-call loop iterations (e.g. 8) per turn.
- Never expose service-role key or raw SQL to the model — only typed tools.
- PII: tools return only fields the role is allowed to see.

---

## 6. Phasing

**Phase 1 — Read-only assistant (teacher).**
Chat UI + streaming + `analytics`/`students`/`classes` read tools, scoped to the teacher.
Tool-call transparency chips. Ship behind a feature flag. _(highest value, lowest risk)_

**Phase 2 — Authoring & actions.**
`questions`/`exams`/`assignments` tools, `ActionCard` confirm-before-write, `comms` drafts.

**Phase 3 — Admin assistant + ops.**
Admin entry point, org-wide scope, `ops` tools, audit dashboard.

**Phase 4 — Polish.**
Prompt caching tuning, suggested-prompt personalization, conversation history persistence,
optional Pattern B remote MCP for external agents.

---

## 7. Open questions
1. Persist conversation history (Supabase table) or keep ephemeral per-session? (Recommend persist
   from Phase 1 for context + audit.)
2. Comms: draft-only, or wire real send via existing Resend integration after confirm?
3. Cost ceiling per teacher/month → informs model default + rate limits.
4. Do we want the standalone stdio MCP enabled for staff in Claude Desktop, or web-only?

---

## 8. File map (summary)

```
app/api/assistant/chat/route.ts          # new — streaming chat loop
app/api/assistant/confirm/route.ts       # new — execute confirmed writes
components/assistant/                     # new — UI (Launcher, Panel, MessageList, ToolCallChip, ActionCard, Composer)
lib/assistant/                           # new — system-prompt, tools registry, scope, audit
mcp/src/tools/{assignments,ops,comms}.ts # new — additional MCP tools
mcp/src/tools/{analytics,students,classes,questions,exams}.ts  # existing — reuse
messages/{vi,en}.json                    # i18n strings for "Trợ lý AI"
```
