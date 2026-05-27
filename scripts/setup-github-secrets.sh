#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# setup-github-secrets.sh
#
# Updates the three GitHub Secrets that the CI uses to deploy Supabase
# migrations to production.  Run this once after switching to a new
# Supabase project (e.g. after migrating from EU → Singapore).
#
# Prerequisites:
#   • GitHub CLI installed and authenticated  →  brew install gh && gh auth login
#   • Supabase CLI installed                  →  brew install supabase/tap/supabase
#
# Usage:
#   bash scripts/setup-github-secrets.sh
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

REPO="nghilethanh09052000/SAT-Exam-Management-Platform"
NEW_PROJECT_REF="bgipfkfzgeoenwoqcphy"

echo ""
echo "=== Supabase → GitHub Secrets setup ==="
echo "Repo  : $REPO"
echo "Project: $NEW_PROJECT_REF (Singapore ap-southeast-1)"
echo ""

# ── 1. Check gh CLI ────────────────────────────────────────────────────────
if ! command -v gh &>/dev/null; then
  echo "ERROR: GitHub CLI not found."
  echo "Install it:  brew install gh"
  echo "Then login:  gh auth login"
  exit 1
fi

if ! gh auth status &>/dev/null; then
  echo "ERROR: Not authenticated with GitHub CLI."
  echo "Run:  gh auth login"
  exit 1
fi

# ── 2. Supabase access token ───────────────────────────────────────────────
# This is your personal Supabase token — find it at:
#   https://supabase.com/dashboard/account/tokens
echo "Step 1/3 — SUPABASE_ACCESS_TOKEN"
echo "  Find at: https://supabase.com/dashboard/account/tokens"
read -rsp "  Paste your Supabase access token (input hidden): " SUPABASE_ACCESS_TOKEN
echo ""

# ── 3. DB password for the new project ────────────────────────────────────
# Find at: Supabase dashboard → project bgipfkfzgeoenwoqcphy
#          → Project Settings → Database → Database password
echo "Step 2/3 — SUPABASE_DB_PASSWORD"
echo "  Find at: https://supabase.com/dashboard/project/$NEW_PROJECT_REF/settings/database"
echo "  (It's the 'Database password' — NOT the anon/service role key)"
read -rsp "  Paste the database password (input hidden): " SUPABASE_DB_PASSWORD
echo ""

# ── 4. Push secrets ────────────────────────────────────────────────────────
echo "Step 3/3 — Pushing secrets to GitHub..."
echo ""

echo "  → Setting SUPABASE_PROJECT_REF = $NEW_PROJECT_REF"
gh secret set SUPABASE_PROJECT_REF \
  --repo "$REPO" \
  --body "$NEW_PROJECT_REF"

echo "  → Setting SUPABASE_ACCESS_TOKEN"
gh secret set SUPABASE_ACCESS_TOKEN \
  --repo "$REPO" \
  --body "$SUPABASE_ACCESS_TOKEN"

echo "  → Setting SUPABASE_DB_PASSWORD"
gh secret set SUPABASE_DB_PASSWORD \
  --repo "$REPO" \
  --body "$SUPABASE_DB_PASSWORD"

# ── 5. Verify ─────────────────────────────────────────────────────────────
echo ""
echo "=== Verification — current secrets ==="
gh secret list --repo "$REPO" | grep -E "SUPABASE|POSTGRES" || true

echo ""
echo "✅ Done! All three secrets updated."
echo ""
echo "Next steps:"
echo "  1. git add .github/workflows/ci.yml .github/workflows/supabase-deploy.yml"
echo "  2. git commit -m 'ci: point Supabase CI to Singapore project (ap-southeast-1)'"
echo "  3. git push"
echo "  → The next push to main will run migrations against the Singapore project."
