# VeriTrust Supabase Integration Contract

This contract defines the production integration shape for connecting the current VeriTrust static/Vercel platform to Supabase. It does not add a dummy connection or fake state.

## 1. Runtime Constants

### Browser-safe constants

Only these values are allowed in browser JavaScript:

```env
SUPABASE_URL=
SUPABASE_ANON_KEY=
```

Frontend runtime object:

```js
window.VeriTrust_CONFIG = {
  supabase: {
    url: '',
    anonKey: ''
  },
  api: {
    health: '/api/health',
    deepfake: '/api/deepfake',
    phishing: '/api/phishing',
    session: '/api/session',
    scans: '/api/scans'
  },
  storage: {
    scanUploadsBucket: 'scan-uploads',
    scanCropsBucket: 'scan-crops',
    avatarsBucket: 'avatars',
    exportsBucket: 'exports'
  }
};
```

### Server-only constants

These values must never be exposed in HTML, CSS, or browser JavaScript:

```env
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
HF_ACCESS_TOKEN=
HF_TOKEN=
```

Recommended server helper file:

```text
lib/supabase-server.js
```

Purpose:

- create Supabase service-role client
- verify user JWTs received from the browser
- read organization membership
- create and complete scan records
- create signed Storage URLs when needed

## 2. Storage Path Contract

Storage policies expect the first folder segment to be the organization id.

```text
scan-uploads/{org_id}/{scan_id}/original.{ext}
scan-crops/{org_id}/{scan_id}/face-{index}.jpg
exports/{org_id}/{export_id}/scan-report.csv
avatars/{user_id}/avatar.{ext}
```

Do not upload files to flat bucket paths. The RLS policies use this path structure to connect Storage objects back to organization access.

## 3. Table-to-Platform Mapping

| Platform Area | Supabase Tables |
|---|---|
| Auth profile | `auth.users`, `profiles` |
| Workspace/team | `organizations`, `organization_members` |
| Plans and quotas | `plans`, `user_usage_daily` |
| Detection history | `scans`, `scan_inputs`, `scan_results`, `scan_model_runs` |
| Uploaded files | `stored_files`, Storage buckets |
| Dashboard stats | `scans`, `scan_results`, `user_usage_daily` |
| API access | `api_keys` |
| Admin/security | `audit_logs`, `system_events` |
| User feedback | `feedback` |
| Future integrations | `webhook_endpoints`, `webhook_events` |

## 4. Required API Sequence

### Signup

```text
auth.html
  -> Supabase Auth signUp(email, password, metadata)
  -> database trigger handle_new_user()
  -> profiles row created
  -> organizations row created
  -> organization_members owner row created
  -> redirect dashboard.html
```

Metadata to send on signup:

```json
{
  "full_name": "User Name",
  "workspace_name": "Workspace Name"
}
```

### Login

```text
auth.html
  -> Supabase Auth signInWithPassword()
  -> load profiles row
  -> load default organization
  -> redirect dashboard.html
```

### Deepfake scan

```text
deepfake.html
  -> read Supabase session
  -> POST /api/deepfake with Authorization: Bearer {access_token}
  -> Vercel API verifies JWT with Supabase
  -> create scan record
  -> optionally upload image to scan-uploads
  -> call Hugging Face model
  -> complete scan record
  -> return normalized result to browser
```

### Phishing scan

```text
phishing.html
  -> read Supabase session
  -> POST /api/phishing with Authorization: Bearer {access_token}
  -> Vercel API verifies JWT with Supabase
  -> create scan record with text hash and preview
  -> call Hugging Face model
  -> complete scan record
  -> return normalized result to browser
```

Important privacy rule:

```text
Do not store full phishing text by default.
Store text_hash + short text_preview + normalized result.
```

### Dashboard

```text
dashboard.html
  -> read Supabase session
  -> load profile
  -> load default organization
  -> load daily usage
  -> load recent scans
  -> render empty states when no records exist
```

## 5. API Endpoint Contract

### `GET /api/session`

Purpose:

- verify current Supabase access token
- return profile and default organization

Response:

```json
{
  "ok": true,
  "user": {
    "id": "uuid",
    "email": "user@example.com"
  },
  "profile": {},
  "organization": {},
  "role": "owner"
}
```

### `GET /api/scans`

Purpose:

- return recent scan history for the current organization

Query:

```text
?org_id={uuid}&limit=20
```

### `POST /api/deepfake`

Required headers after Supabase connection:

```http
Authorization: Bearer {supabase_access_token}
```

Multipart fields:

```text
image=file
model=prism
org_id=uuid
project_id=uuid optional
retain_file=false
```

### `POST /api/phishing`

Required headers after Supabase connection:

```http
Authorization: Bearer {supabase_access_token}
```

JSON body:

```json
{
  "text": "message to analyze",
  "model": "cortex",
  "org_id": "uuid",
  "project_id": null,
  "retain_text": false
}
```

## 6. Frontend File Changes for Implementation Phase

When implementation begins, update these files in this order:

1. `assets/js/config.js`
   - add browser-safe Supabase constants
   - keep API route constants

2. `assets/js/auth.js`
   - new file
   - handles signup, login, logout, password recovery, OAuth button enablement

3. `auth.html`
   - load Supabase JS SDK
   - load `assets/js/auth.js`
   - remove static pending-only submit behavior

4. `assets/js/site.js`
   - show signed-in/signed-out navigation state
   - update Dashboard/Login controls

5. `assets/js/detection.js`
   - attach Supabase access token to scan requests
   - include selected organization id
   - keep existing live-result rendering

6. `dashboard.html`
   - load `assets/js/dashboard.js`
   - replace static cards with real profile, usage, scans, and org state

7. `api/deepfake.js`
   - verify Supabase JWT
   - create scan record
   - complete or fail scan record

8. `api/phishing.js`
   - verify Supabase JWT
   - store hash/preview only
   - complete or fail scan record

9. `api/health.js`
   - include Supabase connection readiness

## 7. Production Rules

- Never expose `SUPABASE_SERVICE_ROLE_KEY` in the browser.
- Never expose `HF_ACCESS_TOKEN` in the browser.
- Never store raw API keys; store only hashes and prefixes.
- Keep Storage buckets private by default.
- Use signed URLs for private file previews/downloads.
- Store full phishing text only with explicit retention consent.
- Treat Vercel API endpoints as the trusted boundary for Hugging Face calls.
- Use RLS for all authenticated client reads.
- Use service role only inside server functions.
- Keep scan result writes server-only.

## 8. Verification Checklist

After running `docs/supabase-production-schema.sql`, verify:

- `plans` contains `free`, `pro`, and `enterprise`.
- Storage buckets exist: `scan-uploads`, `scan-crops`, `avatars`, `exports`.
- RLS is enabled on all public app tables.
- A new Supabase signup creates:
  - one `profiles` row
  - one `organizations` row
  - one `organization_members` owner row
- Authenticated users can read their own organization.
- Authenticated users cannot read another organization.
- Scan results are visible only to organization members.
- Storage object paths must start with `{org_id}/` for organization-scoped buckets.
