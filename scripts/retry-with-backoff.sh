#!/usr/bin/env bash
# Retries a command with exponential backoff.
# Usage: retry-with-backoff.sh <max-attempts> "<command>"
# Example: retry-with-backoff.sh 3 "supabase start"

set -euo pipefail

MAX_ATTEMPTS="${1:?Usage: $0 <max-attempts> \"<command>\"}"
CMD="${2:?Usage: $0 <max-attempts> \"<command>\"}"

attempt=1
wait=5

while true; do
    echo "Attempt $attempt/$MAX_ATTEMPTS: $CMD"
    if eval "$CMD"; then
        echo "Command succeeded on attempt $attempt."
        exit 0
    fi

    if [[ $attempt -ge $MAX_ATTEMPTS ]]; then
        echo "Command failed after $MAX_ATTEMPTS attempts."
        exit 1
    fi

    echo "Command failed. Retrying in ${wait}s..."
    sleep "$wait"
    wait=$((wait * 2))
    attempt=$((attempt + 1))
done
