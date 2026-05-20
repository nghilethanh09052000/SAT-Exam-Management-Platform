#!/usr/bin/env bash
# Validates that required config files exist and are non-empty.

set -euo pipefail

REQUIRED_FILES=(
    ".env.example"
    "supabase/config.toml"
    "next.config.mjs"
    "tsconfig.json"
    "pnpm-workspace.yaml"
)

FAILED=false

for file in "${REQUIRED_FILES[@]}"; do
    if [[ ! -f "$file" ]]; then
        echo "MISSING: $file"
        FAILED=true
    elif [[ ! -s "$file" ]]; then
        echo "EMPTY: $file"
        FAILED=true
    else
        echo "OK: $file"
    fi
done

if $FAILED; then
    echo ""
    echo "One or more required config files are missing or empty."
    exit 1
fi

echo ""
echo "All required config files are present."
