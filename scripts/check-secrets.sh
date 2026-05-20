#!/usr/bin/env bash
# Scans git diff for hardcoded secrets. Exits 1 if any pattern is found.
# Usage: check-secrets.sh [--ci <base-ref>]
# Without --ci: scans unstaged changes. With --ci: scans diff against base-ref.

set -euo pipefail

CI_MODE=false
BASE_REF=""

while [[ $# -gt 0 ]]; do
    case "$1" in
        --ci)
            CI_MODE=true
            BASE_REF="${2:-}"
            shift 2
            ;;
        *)
            shift
            ;;
    esac
done

PATTERNS=(
    # Generic secrets
    'password\s*=\s*["'"'"'][^"'"'"']{8,}'
    'secret\s*=\s*["'"'"'][^"'"'"']{8,}'
    'api[_-]?key\s*=\s*["'"'"'][^"'"'"']{8,}'
    'access[_-]?token\s*=\s*["'"'"'][^"'"'"']{8,}'
    # AWS
    'AKIA[0-9A-Z]{16}'
    'aws_secret_access_key\s*=\s*[A-Za-z0-9/+=]{40}'
    # Supabase
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9\.[A-Za-z0-9_-]{20,}'
    # Private keys
    '-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----'
    # Telegram
    '[0-9]{8,10}:[A-Za-z0-9_-]{35}'
)

if $CI_MODE; then
    DIFF=$(git diff "$BASE_REF" -- . \
        ':!*.lock' ':!pnpm-lock.yaml' ':!*.snap' ':!*.png' ':!*.jpg')
else
    DIFF=$(git diff HEAD -- . \
        ':!*.lock' ':!pnpm-lock.yaml' ':!*.snap' ':!*.png' ':!*.jpg')
fi

FOUND=false

for pattern in "${PATTERNS[@]}"; do
    MATCHES=$(echo "$DIFF" | grep -E "^\+" | grep -iE "$pattern" || true)
    if [[ -n "$MATCHES" ]]; then
        echo "SECRET DETECTED — pattern: $pattern"
        echo "$MATCHES"
        FOUND=true
    fi
done

if $FOUND; then
    echo ""
    echo "Secrets found in diff. Remove them and use environment variables or GitHub Secrets instead."
    exit 1
fi

echo "No secrets detected."
