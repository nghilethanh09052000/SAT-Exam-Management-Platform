# Supabase Region Migration: Mumbai → Europe

**Project:** SAT Exam Management Platform  
**From:** `ap-south-1` (Mumbai)  
**To:** `eu-west-1` (Frankfurt) or `eu-central-1`  
**Date:** 2026-05-21

---

## Overview

Supabase does not support in-place region migration. This plan creates a new EU project, replays the schema, migrates data and auth users, then cuts over traffic. Estimated downtime: **15–60 minutes**.

### What will be migrated
- 28 database migrations (schema + RLS policies)
- All table data (`public` schema)
- Auth users (including Google OAuth users)
- Storage buckets and objects (file imports)
- Auth provider config (Google OAuth)

---

## Phase 1 — Prepare (no downtime)

### 1. Create the new EU project

1. Go to [supabase.com/dashboard](https://supabase.com/dashboard) → **New project**
2. Select region: `eu-west-1` (Frankfurt) or `eu-central-1`
3. Save the following from the new project dashboard:
   - Project URL: `https://<eu-ref>.supabase.co`
   - Anon key
   - Service role key
   - Database password

---

### 2. Apply schema to the EU project

Link the CLI to the new project and replay all 28 migrations:

```bash
supabase link --project-ref <new-eu-project-ref>
supabase db push
```

Verify no drift:

```bash
supabase db diff
# Expected output: (empty — no diff)
```

---

### 3. Reconfigure Google OAuth

**In Supabase EU dashboard:**
- Auth → Providers → Google
- Set the same `Client ID` and `Client Secret` as Mumbai

**In Google Cloud Console:**
- APIs & Services → Credentials → your OAuth client
- Add to **Authorized redirect URIs**:
  ```
  https://<eu-ref>.supabase.co/auth/v1/callback
  ```

> Do this **before** cutover. The Mumbai redirect URI can stay until Mumbai is deleted.

---

### 4. Recreate Storage buckets

Manually recreate each bucket in the EU dashboard (Auth → Storage), matching the same names and public/private settings as Mumbai.

Then copy existing files:

```bash
# Copy bucket contents from Mumbai to local
supabase storage cp --recursive \
  supabase://<mumbai-ref>/your-bucket-name \
  ./tmp-storage-backup/

# Upload to EU project
supabase storage cp --recursive \
  ./tmp-storage-backup/ \
  supabase://<eu-ref>/your-bucket-name
```

Verify object count matches between Mumbai and EU before proceeding.

---

## Phase 2 — Data Migration (maintenance window)

> Schedule a low-traffic window. Announce downtime to all users beforehand.

### 5. Enable maintenance mode

On your VM, set an env var or deploy a static maintenance page:

```bash
# Example: set a flag your app reads to show a maintenance banner
export MAINTENANCE_MODE=true
pm2 restart all  # or however the app is managed
```

---

### 6. Dump data from Mumbai

Get the Mumbai connection string from: **Dashboard → Settings → Database → Connection string (URI)**

```bash
pg_dump \
  --data-only \
  --no-owner \
  --no-acl \
  --exclude-table-data 'storage.*' \
  --exclude-table-data 'auth.*' \
  --exclude-table-data 'realtime.*' \
  --exclude-table-data 'supabase_functions.*' \
  "postgresql://postgres:<password>@db.<mumbai-ref>.supabase.co:5432/postgres" \
  > data_dump.sql
```

> `auth.*` and `storage.*` are excluded — they are managed by Supabase and migrated separately.

---

### 7. Migrate Auth users

Supabase does not expose password hashes, so users must be exported via the Admin API and re-imported with their **existing UUIDs preserved** (critical — foreign keys in `public.profiles` depend on `auth.users.id`).

**Export from Mumbai:**

```bash
curl -X GET \
  "https://<mumbai-ref>.supabase.co/auth/v1/admin/users?page=1&per_page=1000" \
  -H "apikey: <mumbai-service-role-key>" \
  -H "Authorization: Bearer <mumbai-service-role-key>" \
  -o mumbai_users.json
```

**Import script (`scripts/migrate-auth-users.ts`):**

```typescript
import { createClient } from "@supabase/supabase-js";
import fs from "fs";

const EU_URL = process.env.EU_SUPABASE_URL!;
const EU_SERVICE_KEY = process.env.EU_SERVICE_ROLE_KEY!;

const supabase = createClient(EU_URL, EU_SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  const raw = JSON.parse(fs.readFileSync("mumbai_users.json", "utf8"));
  const users = raw.users ?? [];

  for (const user of users) {
    const { error } = await supabase.auth.admin.createUser({
      user_id: user.id, // preserve existing UUID
      email: user.email,
      email_confirm: true,
      user_metadata: user.user_metadata,
      app_metadata: user.app_metadata,
      created_at: user.created_at,
    });

    if (error) {
      console.error(`Failed to import user ${user.email}:`, error.message);
    } else {
      console.log(`Imported: ${user.email}`);
    }
  }
}

main();
```

Run it:

```bash
EU_SUPABASE_URL=https://<eu-ref>.supabase.co \
EU_SERVICE_ROLE_KEY=<eu-service-role-key> \
npx tsx scripts/migrate-auth-users.ts
```

---

### 8. Restore data to EU

```bash
psql \
  "postgresql://postgres:<password>@db.<eu-ref>.supabase.co:5432/postgres" \
  < data_dump.sql
```

Verify row counts on critical tables:

```sql
SELECT schemaname, tablename, n_live_tup
FROM pg_stat_user_tables
WHERE schemaname = 'public'
ORDER BY n_live_tup DESC;
```

---

## Phase 3 — Cut Over

### 9. Update environment variables on the VM

```bash
# Update these in your VM's .env or CI/CD secrets
NEXT_PUBLIC_SUPABASE_URL=https://<eu-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<new-eu-anon-key>
SUPABASE_SERVICE_ROLE_KEY=<new-eu-service-role-key>
```

Restart the application:

```bash
pm2 restart all
# or: systemctl restart your-app
```

---

### 10. Smoke test checklist

- [ ] Login via Google OAuth succeeds
- [ ] Student dashboard loads correct data
- [ ] Teacher can view/create assignments
- [ ] File import (Storage upload) works
- [ ] Test session with Realtime (answer submission updates live)
- [ ] Admin panel loads user/student lists
- [ ] No 5xx errors in EU dashboard → Logs → API

---

## Phase 4 — Cleanup

### 11. Monitor for 48–72 hours

- Watch **EU dashboard → Logs → API** for errors
- Keep Mumbai project **paused** (not deleted) as a rollback fallback

### 12. Delete Mumbai project

Once confident, go to **Mumbai dashboard → Settings → General → Delete project**.

---

## Risk & Mitigation

| Risk | Impact | Mitigation |
|---|---|---|
| Auth user IDs mismatch → broken FK references | High | Pass `user_id` field in import script to preserve UUIDs |
| Google OAuth redirect fails after cutover | High | Add EU callback URL to Google Console **before** DNS/env switch |
| Storage objects missing | Medium | Verify object count matches before maintenance window |
| Realtime subscriptions drop | Low | Auto-reconnect on client side — no code change needed |
| Data written during maintenance window lost | Medium | Enforce strict maintenance mode before dump; re-enable after restore |

---

## Environment Variable Reference

| Variable | Where to update |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | VM `.env` + GitHub Actions secrets |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | VM `.env` + GitHub Actions secrets |
| `SUPABASE_SERVICE_ROLE_KEY` | VM `.env` + GitHub Actions secrets |
| `SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID` | Supabase EU Auth dashboard |
| `SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_SECRET` | Supabase EU Auth dashboard |

---

## Rollback Plan

If issues are found after cutover:

1. Revert VM env vars to Mumbai values
2. Restart the app
3. Inform users of the revert
4. Investigate in EU project logs before re-attempting
