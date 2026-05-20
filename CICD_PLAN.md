# CI/CD Plan — SAT Exam Management Platform

_Based on patterns from `UPWORK-raisemore/.github`, adapted for this project's stack._

---

## Stack Summary

| Layer | Technology |
|---|---|
| Frontend/App | Next.js 14, TypeScript, Tailwind |
| Backend | Supabase (PostgreSQL + Auth + RLS) |
| Package manager | pnpm |
| Unit tests | Jest |
| E2E tests | Playwright |
| Pipeline | Python (Temporal + ClickHouse + dbt) |
| App deployment | Vercel (current, laggy) → VM self-hosted (planned) |
| DB deployment | Supabase CLI |
| Notifications | Telegram Bot |

---

## Branching Model

```
feature/* → main (production)
```

| Branch | Environment |
|---|---|
| any PR | CI checks only (no preview deploy) |
| `main` | Production (Supabase production DB + Vercel/VM) |

> No staging environment. All merges to `main` go straight to production.

---

## Telegram Notification Setup

All CI/CD notifications go to a Telegram group/channel via a bot. No Slack or Datadog required.

**One-time setup:**
1. Message `@BotFather` on Telegram → `/newbot` → copy the `BOT_TOKEN`
2. Add the bot to your team group or channel
3. Get the `CHAT_ID` — forward any message from the group to `@userinfobot`, or call `https://api.telegram.org/bot<TOKEN>/getUpdates`
4. Add both as GitHub repository secrets

**Required Secrets:**
```
TELEGRAM_BOT_TOKEN     # e.g. 123456:ABCdef...
TELEGRAM_CHAT_ID       # e.g. -1001234567890 (negative = group/channel)
```

**Reusable notification snippet** (used across all workflows):
```yaml
- name: Notify Telegram
  if: failure()
  run: |
    curl -s -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
      -d chat_id="${TELEGRAM_CHAT_ID}" \
      -d parse_mode="Markdown" \
      -d text="${MESSAGE}"
  env:
    TELEGRAM_BOT_TOKEN: ${{ secrets.TELEGRAM_BOT_TOKEN }}
    TELEGRAM_CHAT_ID: ${{ secrets.TELEGRAM_CHAT_ID }}
    MESSAGE: "..."
```

> Plain `curl` — no third-party GitHub Action needed.

---

## Proposed Workflows

### 1. `ci.yml` — Main CI

**Triggers:** `push` to `main`, `pull_request`, `workflow_dispatch`

**Concurrency:** Cancel-in-progress for feature branches, never for `main`.

#### Job Graph

```
detect-changes
       │
       ├── secret-scan
       ├── yaml-lint
       ├── validate-config-files
       │
       ├── cache-node-deps ──┬── lint-format-check
       │                     ├── typecheck
       │                     ├── unit-tests          (→ upload coverage artifact)
       │                     ├── next-build-check
       │                     ├── e2e-tests           (→ upload Playwright report)
       │                     └── db-migrations-compile ── deploy-production (main push only)
       │                                                        └── notify-deploy (Telegram ✅/❌)
       └── pipeline-python-ci
       │
       └── notify-ci-failure  (main push only → Telegram ❌ if any job failed)
```

**Jobs:**

| Job | Runs on | Telegram notification |
|---|---|---|
| `detect-changes` | all events | — |
| `cache-node-deps` | all events | — |
| `secret-scan` | all events | — |
| `yaml-lint` | all events | — |
| `validate-config-files` | all events | — |
| `lint-format-check` | all events | — |
| `typecheck` | all events | — |
| `unit-tests` | all events | — |
| `next-build-check` | all events | — |
| `e2e-tests` | all events | — |
| `pipeline-python-ci` | all events | — |
| `db-migrations-compile` | all events | — |
| `deploy-production` | `main` push only | ✅ success / ❌ failure |
| `notify-ci-failure` | `main` push only | ❌ lists all failed jobs |

**Telegram messages:**

| Event | Message |
|---|---|
| Production DB deploy success | `✅ *SAT Platform deployed*\nMigrations applied to production\nCommit: <sha>\nBy: <actor>` |
| Production DB deploy failure | `❌ *Production deploy FAILED*\nMigrations failed on production\nCommit: <sha>\nRun: <link>` |
| CI failure on main | `❌ *CI failed on main*\nFailed jobs: <list>\nCommit: <sha>\nRun: <link>` |

**All required secrets:**
```
SUPABASE_ACCESS_TOKEN          # Supabase CLI auth
SUPABASE_PROJECT_REF           # Production project ref
SUPABASE_DB_PASSWORD           # Production DB password
TELEGRAM_BOT_TOKEN             # Telegram bot token
TELEGRAM_CHAT_ID               # Telegram group/channel ID
```

---

### 2. `vm-deploy.yml` — VM Deployment (Prepared, Not Active)

> **Status: DISABLED** — created for when Vercel is replaced with a self-hosted VM.
> Enable by removing the `if: false` guard on the job.

**What it will do when enabled:**
1. Trigger on push to `main`
2. SSH into the VM
3. `git pull` latest `main`
4. `pnpm install --frozen-lockfile`
5. `pnpm run build`
6. Restart the Next.js process (PM2 or systemd)
7. Health-check `VM_APP_URL` returns HTTP 200
8. Notify Telegram: ✅ deployed or ❌ failed with run link

**Telegram messages:**

| Event | Message |
|---|---|
| Deploy success | `✅ *SAT Platform — VM deployed*\nApp is live at <url>\nCommit: <sha>` |
| Deploy failure | `❌ *VM deploy FAILED*\nCheck run: <link>` |
| Health-check failure | `❌ *VM deploy — health check failed*\n<url> did not return 200\nRun: <link>` |

**Required Secrets (when enabled):**
```
VM_HOST                # IP or hostname of the VM
VM_USER                # SSH user
VM_SSH_KEY             # Private key for SSH access
VM_APP_DIR             # e.g. /var/www/sat-platform
VM_APP_URL             # e.g. https://sat.example.com
TELEGRAM_BOT_TOKEN
TELEGRAM_CHAT_ID
```

---

### 3. `pipeline-deploy.yml` — Temporal Pipeline Deployment (Prepared, Not Active)

> **Status: DISABLED** — created for when the Python pipeline is deployed to production.
> Enable by removing the `if: false` guard.

**What it will do when enabled:**
1. Trigger on push to `main` when `pipeline/**` files change
2. SSH into the pipeline server
3. Pull latest code
4. `docker compose up -d --build`
5. Health-check Temporal server is responding on port 7233
6. Notify Telegram: ✅ deployed or ❌ failed

**Telegram messages:**

| Event | Message |
|---|---|
| Deploy success | `✅ *SAT Pipeline deployed*\nTemporal + ClickHouse updated\nCommit: <sha>` |
| Deploy failure | `❌ *Pipeline deploy FAILED*\nRun: <link>` |

**Required Secrets (when enabled):**
```
PIPELINE_HOST          # IP or hostname of the pipeline server
PIPELINE_USER          # SSH user
PIPELINE_SSH_KEY       # Private key
PIPELINE_APP_DIR       # Path to pipeline on server
TELEGRAM_BOT_TOKEN
TELEGRAM_CHAT_ID
```

---

### 4. `close-stale-prs.yml` — Stale PR Cleanup

**Triggers:** `schedule: 0 0 * * *` (daily midnight UTC), `workflow_dispatch`

- Mark PRs stale after **14 days** of inactivity
- Close immediately when marked stale
- Add `stale` label + auto-close message on the PR thread
- Notify Telegram with list of closed PRs

**Telegram message:**
```
🧹 *Stale PRs closed*
The following PRs were closed after 14 days of inactivity:
• #42: Fix submission bug
• #38: Add new question type
```

**Required Secrets:**
```
TELEGRAM_BOT_TOKEN
TELEGRAM_CHAT_ID
```

---

### 5. `weekly-commit-summary.yml` — Weekly Digest

**Triggers:** `schedule: 0 3 * * 1` (Monday 10 AM WIB), `workflow_dispatch`

- `git log --since="1 week ago" main` → grouped by author + commit count
- Post summary to Telegram

**Telegram message:**
```
📊 *Weekly Commit Summary*
Commits to `main` in the past week:

  5  Nghi Le
  2  Other Contributor
```

**Required Secrets:**
```
TELEGRAM_BOT_TOKEN
TELEGRAM_CHAT_ID
```

---

### 6. `pull_request_template.md` — PR Template

Structured checklist covering: summary, motivation, testing steps, migration flag, manual test evidence.

---

## SAT-Specific CI Additions

### A. Next.js Build Check
`pnpm run build` as a required CI gate — catches broken imports or missing env vars that pass lint but fail at build time and would silently break production.

### B. Supabase Schema Drift Detection
After migrations compile, run `supabase db diff` and assert output is empty. Catches hand-edited DB changes not captured as a migration file.

```yaml
- name: Assert no schema drift
  run: |
    supabase db diff --local --schema public | tee /tmp/diff.sql
    if [ -s /tmp/diff.sql ]; then
      echo "ERROR: Schema drift detected. Run 'supabase db diff' locally and create a migration."
      exit 1
    fi
```

### C. RLS Policy Smoke Test
The SAT project has 7+ migration files dedicated to Row-Level Security. Add a job that starts local Supabase, applies seed data, and runs SQL assertions on key RLS invariants (student can't see other students' submissions, teacher can only see their own class data, etc.).

```yaml
- name: RLS smoke test
  run: |
    supabase start
    supabase db reset
    psql "$LOCAL_DB_URL" -f scripts/rls-smoke-test.sql
```

### D. Path-Based Job Skipping

| Changed paths | Skipped jobs |
|---|---|
| `pipeline/**` only | All Next.js/Supabase jobs |
| `app/**`, `components/**`, `lib/**` only | `pipeline-python-ci` |
| `supabase/migrations/**` only | `lint`, `typecheck`, `unit-tests`, `e2e-tests` |
| `e2e/**` only | `unit-tests`, `pipeline-python-ci` |

---

## Implementation Order

| Priority | Item | Effort | Value |
|---|---|---|---|
| 1 | `ci.yml` — lint, typecheck, unit tests, build check | Medium | High |
| 2 | `ci.yml` — DB migrations compile + production deploy | Medium | High |
| 3 | Telegram notifications in `ci.yml` | Low | High |
| 4 | `pull_request_template.md` | Low | Medium |
| 5 | `close-stale-prs.yml` + Telegram | Low | Medium |
| 6 | Supabase schema drift detection | Low | High |
| 7 | RLS smoke test job | High | High |
| 8 | `weekly-commit-summary.yml` + Telegram | Low | Low |
| 9 | `vm-deploy.yml` (disabled, ready to activate) | Medium | High (future) |
| 10 | `pipeline-deploy.yml` (disabled, ready to activate) | Medium | Medium (future) |

---

## Required Scripts to Create

| Script | Purpose |
|---|---|
| `scripts/check-secrets.sh` | Scan diff for hardcoded secrets/API keys |
| `scripts/validate-config-files.sh` | Assert required config files are non-empty |
| `scripts/retry-with-backoff.sh` | Retry flaky commands (E2E, supabase start) |
| `scripts/rls-smoke-test.sql` | RLS invariant assertions run against local DB |

---

## Final Directory Structure

```
.github/
  workflows/
    ci.yml                        # Main CI (lint → test → build → deploy to prod DB → Telegram)
    vm-deploy.yml                 # VM app deploy (DISABLED — activate when ready)
    pipeline-deploy.yml           # Temporal pipeline deploy (DISABLED — activate when ready)
    close-stale-prs.yml           # Auto-close stale PRs + Telegram
    weekly-commit-summary.yml     # Weekly digest → Telegram
  pull_request_template.md
scripts/
  check-secrets.sh
  validate-config-files.sh
  retry-with-backoff.sh
  rls-smoke-test.sql
```
