# SAT Exam-Taking UI — Fix & Completion Plan

> **STATUS (2026-05-29): Phase 1 + Phase 2 DONE & browser-verified.** Phase 3/4 (extra Bluebook screens, deferred module) remain optional/later. See "Implementation log" at the bottom.

**Date:** 2026-05-29
**Scope route:** `/[locale]/student/test/[instanceId]` (e.g. `/en/student/test/dae61bb0-8207-44cc-a54b-a0a6879f6aae`)
**Reference:** `Recording 2026-05-20 235409.mp4` (official Bluebook digital SAT interface)

**Primary files**
- [page.tsx](app/[locale]/(student)/student/test/[instanceId]/page.tsx) — server loader / data fetch
- [test-interface.tsx](app/[locale]/(student)/student/test/[instanceId]/test-interface.tsx) — top bar, tools, navigation, submit
- [question-display.tsx](components/test/question-display.tsx) — passage/question render, highlights, notes, strikethrough
- [nav-panel.tsx](components/test/nav-panel.tsx), [timer.tsx](components/test/timer.tsx), [test-layout.tsx](components/test/test-layout.tsx)

---

## 0. Root Cause (the single biggest bug)

The three user-reported issues (no Highlights button in English, no Calculator/Reference in Math) **all stem from one root cause**, confirmed against the live DB:

| Signal | Reality in DB |
|---|---|
| `assignment_questions.module` | **Empty string (`''`) for every row in the entire database.** Column is `TEXT NOT NULL DEFAULT ''` ([00008_assignments.sql](supabase/migrations/00008_assignments.sql)) and is never populated. |
| `questions.subject` | A correct enum (`reading_writing` \| `math`) — already set right (this instance = all `reading_writing`). |

The UI decides which tools to show **from the empty `module` string**:

- `getModuleSubject(module)` ([test-interface.tsx:109](app/[locale]/(student)/student/test/[instanceId]/test-interface.tsx#L109)) lowercases `''`, matches neither "math" nor "reading/writing/english/rw", and returns **`'other'`**.
- Result: `isReadingWritingModule = false` → **Highlights & Notes button hidden** (the English bug).
- Result: `isMathModule = false` (heuristic also fails for English) → **Calculator + Reference hidden** (the Math bug).
- The authoritative `questions.subject` column **is never even fetched** — `page.tsx` `select(...)` omits it ([page.tsx:202](app/[locale]/(student)/student/test/[instanceId]/page.tsx#L202)).

**Fix direction:** make subject detection authoritative on `questions.subject`, fall back to module-name/heuristics only when subject is absent. This one change fixes both the English and Math toolbars.

---

## Phase 1 — Subject detection & toolbars (the 3 reported bugs) — **HIGH PRIORITY**

### 1.1 Fetch `subject` from the DB
- `page.tsx`: add `subject` to the questions select:
  `questions(id, type, subject, content, stimulus, prompt, question_options(...))` ([page.tsx:202](app/[locale]/(student)/student/test/[instanceId]/page.tsx#L202)).
- Add `subject` to `QuestionDataRow` type and to the mapped `questions` objects ([page.tsx:229](app/[locale]/(student)/student/test/[instanceId]/page.tsx#L229)).

### 1.2 Make the interface subject-aware
- `test-interface.tsx`: add `subject: 'reading_writing' | 'math' | null` to the `Question` interface ([test-interface.tsx:20](app/[locale]/(student)/student/test/[instanceId]/test-interface.tsx#L20)).
- Replace the `getModuleSubject(currentModule)` call with a resolver that prefers `currentQuestion.subject`, then module-name, then content heuristic:
  - `reading_writing` → `isReadingWritingModule = true`
  - `math` → `isMathModule = true`
- Keep `looksLikeMathQuestion` / `getModuleSubject` strictly as fallbacks for legacy rows with no subject.

### 1.3 English exam → show **Highlights & Notes**
- With 1.2, the RW branch ([test-interface.tsx:860](app/[locale]/(student)/student/test/[instanceId]/test-interface.tsx#L860)) renders for `reading_writing`. Verify the button toggles `showHighlightsNotes` and that `annotationsEnabled` flows into `QuestionDisplay` so the highlight selection toolbar + note rail work (already wired at [test-interface.tsx:931](app/[locale]/(student)/student/test/[instanceId]/test-interface.tsx#L931)).

### 1.4 Math exam → show **Calculator** + **Reference**
- With 1.2, the Math branch ([test-interface.tsx:837](app/[locale]/(student)/student/test/[instanceId]/test-interface.tsx#L837)) renders both buttons.
- `CalculatorPanel` embeds Desmos via iframe ([test-interface.tsx:245](app/[locale]/(student)/student/test/[instanceId]/test-interface.tsx#L245)) — confirm it loads (CSP / `frame-src` in [next.config.mjs](next.config.mjs) and [middleware.ts](middleware.ts)).
- `ReferencePanel` formula sheet ([test-interface.tsx:290](app/[locale]/(student)/student/test/[instanceId]/test-interface.tsx#L290)) — verify it opens bottom-right and matches the video layout.

### 1.5 Save & Exit inside the "⋮ More" menu — **make it actually work**
- The menu item exists and calls `saveAndExit()` ([test-interface.tsx:964](app/[locale]/(student)/student/test/[instanceId]/test-interface.tsx#L964)) → `saveCurrentWork({ exitAfterSave: true })` ([test-interface.tsx:544](app/[locale]/(student)/student/test/[instanceId]/test-interface.tsx#L544)).
- **Verify end-to-end** (this is what the user reports as "not working"):
  - `progressEndpoint` default `PATCH /api/submissions/{id}` returns ok.
  - `answerEndpoint` default `POST /api/submission-answers` returns ok for each dirty question.
  - On success it navigates to `exitHref ?? /{locale}/student`.
  - Confirm a partial failure (one non-ok response) doesn't silently swallow the error — surface a toast/inline error instead of just `return false`.
- Close the More menu on outside-click / Esc (currently only closes on item click or re-toggle).

**Acceptance for Phase 1**
- English instance (`dae61bb0…`): "Highlights & Notes" visible top-right; selecting passage text shows the color/underline/note toolbar; notes persist after reload.
- A Math instance: "Calculator" + "Reference" visible; both panels open; Desmos renders.
- "⋮ More → Save and Exit" saves and lands on the student dashboard with answers persisted.

---

## Phase 2 — Notes & Highlights behavior — **HIGH PRIORITY**

**Reference: video 0:30 – 1:30.** This is the section the user flagged as buggy.

### Correct behavior (from the video)
1. Selecting passage text opens the inline highlight toolbar: 3 highlight colors (cream/yellow, blue, pink), an underline dropdown, a trash (delete highlight), and an "add note" button.
2. Adding a note creates **a highlight + a note card** in the note rail (the middle column, between passage and question in the split view).
3. **Each note is its own independent card, stacked vertically** (note 1, note 2, note 3 …). Each card shows:
   - a **colored header** with the highlighted text snippet + a trash icon, and
   - an editable body `textarea` with the note text.
4. **The note card header color matches its highlight color** — e.g. a yellow highlight produces a yellow-headed card; a pink highlight produces a pink-headed card (see video: note 1 = yellow, note 2 = pink).
5. **Collapse/close**: the `›` tab on the rail edge **fully collapses the rail** — the note column disappears, the passage expands to full width, and only a small `‹` tab remains to re-open. Re-opening **restores all note cards** intact. Highlights stay visible in the passage whether the rail is open or collapsed.

### Current bugs (to fix)
- **Note color is wrong / always pink.** `addNoteFromSelection` hardcodes `color: '#f09add'` ([question-display.tsx:535](components/test/question-display.tsx#L535) & [:548](components/test/question-display.tsx#L548)) and the note-card header is hardcoded `bg-[#f09add]` ([question-display.tsx:790](components/test/question-display.tsx#L790) & [:874](components/test/question-display.tsx#L874)). It must instead **preserve / reflect the highlight's own color**.
- **Close/collapse is buggy.** Likely contributors:
  - Two competing note models — a **per-highlight `note`** and a separate **global `noteText`** textarea ([question-display.tsx:893](components/test/question-display.tsx#L893)) — are mixed; consolidate to the per-highlight model the video uses.
  - Collapsed state leaves a **34px sliver** instead of fully hiding the rail ([question-display.tsx:763](components/test/question-display.tsx#L763) grid template) — should fully collapse and widen the passage like the video.
  - `isNotePanelOpen` / `isNotePanelCollapsed` are derived once on mount and can get out of sync when notes are added/deleted while collapsed.
- **Verify multiple notes**: adding several notes must keep them as distinct cards; deleting one card must not drop/scramble the others (`visibleNoteEntries` mapping at [question-display.tsx:580](components/test/question-display.tsx#L580)).
- **Persistence**: note text + color survive reload (`highlight_data` round-trip).

**Acceptance for Phase 2**
- Create 2+ notes of different colors → 2+ stacked cards whose headers match their highlight colors.
- Collapse the rail → passage goes full width, only the re-open tab shows; re-open → all notes return.
- Reload → all notes/colors persist.

> **Module field — deferred.** `assignment_questions.module` is empty everywhere and its intended purpose is unclear. **Ignore it for now**; we'll plan the module/section-grouping strategy (and the header label that depends on it) in a separate later pass.

---

## Phase 3 — Match remaining Bluebook behaviors seen in the video

Observed in the recording, currently missing or partial:

> **Timer — leave as is.** The timer only appears when the teacher enables it, and it currently behaves correctly. **No change needed** (excluded from this plan).

| Feature | Video behavior | Current state | Action |
|---|---|---|---|
| **"This Module Is Over"** transition | Full-screen "All your work has been saved… move on automatically" + spinner | Uses a `Modal` (`showModuleModal`) | Replace inter-module modal with the full-screen auto-advance screen |
| **"Practice Test Break"** screen | Between sections: break timer + "Resume Testing" + rules | Missing | Add break screen between RW and Math sections |
| **Directions dropdown** | Opens section directions overlay | Button has **no onClick** ([test-interface.tsx:820](app/[locale]/(student)/student/test/[instanceId]/test-interface.tsx#L820)) | Wire to a directions modal |
| **ABC strikethrough toggle** | Icon in question header enables/disables per-option eliminator | Strikethrough buttons always on | Add header toggle to show/hide the eliminator column |
| **Toolbar parity** | Video RW shows only *Highlights & Notes* + *More*; Math shows *Calculator* + *Reference* + *More* (no standalone Save/Settings) | Code shows Save + Settings always | **Decision:** keep Save/Settings, or move Save into More to match video (Open Questions) |
| **Battery/100% indicator** | Cosmetic top-right chip | Missing | Low priority / optional |

---

## Phase 4 — Polish, verification, regression

- **Verify highlight persistence**: `highlight_data` round-trips through `POST /api/submission-answers` and reloads correctly (text-match highlighting in `renderHighlightedText`, [question-display.tsx:68](components/test/question-display.tsx#L68)).
- **Math single-column vs RW split**: `useReadingWritingSplit` keys off `showCalculator`/stimulus ([question-display.tsx:462](components/test/question-display.tsx#L462)); confirm it now follows `subject` consistently with Phase 1.
- **Submit flow**: confirm the 200/202/409 paths and grading poll still work after changes ([test-interface.tsx:703](app/[locale]/(student)/student/test/[instanceId]/test-interface.tsx#L703)).
- **Browser verification** with the preview tools on the live instance; capture before/after screenshots of English (highlights) and Math (calculator+reference).
- **i18n**: all referenced keys already exist in `en.json`/`vi.json` (`save`, `saveAndExit`, `highlightsNotes`, `calculator`, `reference`, `hide`, `directions`). Add any new keys for the break/module-over screens in both locales.

---

## Suggested order of work
1. **Phase 1.1–1.4** — one focused change (fetch + use `subject`) fixes both reported toolbar bugs. *Highest value, lowest risk.*
2. **Phase 1.5** — verify/repair Save & Exit.
3. **Phase 2** — fix Notes & Highlights (color match + close/collapse bug).
4. **Phase 3** — fill in the missing Bluebook screens/toggles.
5. **Phase 4** — verification + regression pass.

## Open questions (need your decision)
1. **Toolbar:** Keep the standalone **Save** and **Settings** buttons, or match the video and move Save into the **More** menu only?
2. **Break/module-over screens:** In scope now, or a later milestone? They're cosmetic relative to the 3 reported bugs.
3. **Settings button:** What should it open (text size, theme, etc.)? Currently a no-op.

## Deferred (plan later)
- **`assignment_questions.module`**: empty everywhere, purpose unclear. Decide later whether to populate it or drive section grouping/labels purely from `questions.subject`.

---

## Implementation log (2026-05-29)

**Phase 1 — subject-driven toolbars ✅ DONE + verified**
- `page.tsx` + `free-test/.../page.tsx`: now `select` and pass through `questions.subject`.
- `test-interface.tsx`: new `resolveQuestionSubject()` prefers `questions.subject` ('reading_writing' | 'math'), with module-name/heuristic only as legacy fallback. `isMathModule` / `isReadingWritingModule` derive from it.
- **Verified in browser** (instance `dae61bb0…`): English exam now shows **Highlights & Notes**; a Math instance (`2222…0005`) shows **Calculator** (Desmos loads) + **Reference** (formula sheet).

**Phase 1.5 — Save / Save & Exit ✅ DONE + verified**
- Root cause of the "save not working": the `upsert_submission_answer` RPC threw `column reference "question_id" is ambiguous` (OUT param vs column in `ON CONFLICT`). Fixed with migration [20260529000000_fix_upsert_answer_ambiguous.sql](supabase/migrations/20260529000000_fix_upsert_answer_ambiguous.sql) (`#variable_conflict use_column`).
- **Verified**: `POST /api/submission-answers` went 400 → 200; **More → Save and Exit** saves and navigates to `/student`.

**Phase 2 — Notes & Highlights ✅ DONE + verified**
- `question-display.tsx`: note card header now uses the **highlight's own color** (was hardcoded pink); `addNoteFromSelection` preserves color / defaults to cream `#fff7c7`.
- Consolidated note-rail state to a single `isNotePanelOpen` (removed `isNotePanelCollapsed`); the re-open tab now always shows while notes exist — fixes the "can't reopen after close" bug.
- **Verified**: 2 notes (cream + pink) stack as separate cards matching highlight colors; collapse hides cards + leaves a re-open tab; reopen restores all; highlights+notes+answer persist across reload.

**Phase 3 (partial) — Calculator / Reference / More menu ✅ DONE + verified**
- **Calculator** ([test-interface.tsx](app/[locale]/(student)/student/test/[instanceId]/test-interface.tsx) `CalculatorPanel`): added a **Graphing / Scientific** segmented toggle (swaps the Desmos iframe between `desmos.com/calculator` and `desmos.com/scientific`) + a **Maximize** button. Library choice: **hosted Desmos iframes** (no API key, no CSP-script changes, exact Bluebook look) over the Desmos JS API.
- **Reference** (`ReferencePanel` + new `RefShape` SVG diagrams): full **Reference Sheet** — circle/rectangle/triangle/right-triangle, special right triangles, and volumes for rectangular prism, cylinder, **sphere, cone, pyramid**, plus the "360° / 2π radians / triangle 180°" notes; added a **Maximize** button.
- **More (⋮) menu**: added **Help, Shortcuts, Assistive Technology, Line Reader** (open an info modal) and kept **Report a Problem** + **Save and Exit**. New i18n keys added to `en.json` + `vi.json`.
- **Verified in browser**: Graphing↔Scientific swaps the iframe; maximize expands to full screen; Reference shows all formulas; More menu shows all six items and Help opens its modal. No console errors.

**Local dev-DB changes made for verification (NOT migrations):**
- Set local password for `nghilt19411@gmail.com` to `password123` (students are Google-OAuth-only in the UI; needed a way to mint a session locally).
- Reset math submission `cb55820c…` (instance `2222…0005`) to `in_progress` with fresh `started_at`; **Save & Exit** test left it `in_progress`. Re-submit in-app or reset if you want it back to `submitted`.

---

### Quick reference — confirmed facts
- DB `questions.subject` enum: `reading_writing`, `math`.
- Every `assignment_questions.module` row is `''` (empty) — module-name detection is dead code in practice.
- Instance `dae61bb0-8207-44cc-a54b-a0a6879f6aae`: 8 questions, all `subject = reading_writing`, all `module = ''`.
