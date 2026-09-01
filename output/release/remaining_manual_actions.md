# Remaining Manual Actions & Post-Deployment Operations

**Document**: Pre-Flight Manual Configuration Guide  
**Project**: ZSphere Platform  
**Target Environment**: Vercel & Supabase Cloud  
**Date**: 2026-08-15  

---

## 1. Executive Summary

While all code-level remediations, route configurations, and security policies are 100% complete and verified within the repository, certain external cloud services and administrative setups require manual operations during the production rollout.

This document details the exact **5 manual operational procedures** required to transition ZSphere from repository staging to live production.

---

## 2. Inventory of Required Manual Actions

```
+----------------------------------------------------------------------------------------------------+
|                                    MANUAL ACTIONS OVERVIEW                                         |
+----------------------------------------------------------------------------------------------------+
| Action Item                      Platform / System     Estimated Time   Priority                   |
| -------------------------------------------------------------------------------------------------- |
| 1. Supabase Production Config    Supabase Dashboard    5 mins           CRITICAL / BLOCKING        |
| 2. Vercel Project Linking        Vercel Dashboard      5 mins           CRITICAL / BLOCKING        |
| 3. Admin Account Provisioning    Supabase Auth & SQL   3 mins           HIGH / OPERATIONAL         |
| 4. Storage Bucket Setup          Supabase Storage      5 mins           HIGH / MEDIA ASSETS        |
| 5. Email Templates & Auth URLs   Supabase Auth Config  5 mins           MEDIUM / USER ONBOARDING   |
+----------------------------------------------------------------------------------------------------+
```

---

## 3. Step-by-Step Manual Action Procedures

### Action 1: Verify Supabase Production Credentials & Config
- **Target File**: `js/config.js`
- **Context**: The client initializes using `SUPABASE_URL` and `SUPABASE_ANON_KEY`.
- **Procedure**:
  1. Navigate to the [Supabase Project Dashboard](https://supabase.com/dashboard) &rarr; **Project Settings** &rarr; **API**.
  2. Copy the **Project URL** and the **Project API Key (`anon` / `public`)**.
  3. Ensure `js/config.js` contains the production values:
     ```javascript
     const SUPABASE_URL = 'https://your-production-project.supabase.co';
     const SUPABASE_ANON_KEY = 'sb_publishable_...';
     ```
  4. Confirm that the **Service Role Key (`service_role`)** is NEVER committed or pasted into client files.

---

### Action 2: Vercel Project Linking & Production Domain Assignment
- **Target Platform**: [Vercel Management Console](https://vercel.com)
- **Procedure**:
  1. Import the Git repository into Vercel.
  2. **Framework Preset**: Select `Other` (or static).
  3. **Root Directory**: Leave as `./` (repository root).
  4. **Build Command**: Leave empty (static hosting).
  5. **Output Directory**: Leave empty (root serves static assets).
  6. Under **Settings** &rarr; **Domains**, assign the canonical domain (e.g. `zsphere.edu` and `www.zsphere.edu`).
  7. Verify that SSL/TLS certificates automatically provision via Let's Encrypt.

---

### Action 3: Initial Admin Account Provisioning
- **Target Platform**: Supabase Auth & SQL Editor
- **Context**: To access the `/pages/admin.html` dashboard, a user must possess `role = 'admin'` in `public.profiles`.
- **Procedure**:
  1. Register the lead administrator's email on the live site at `/pages/signup.html` (e.g., `admin@zsphere.edu`).
  2. Open the **Supabase Dashboard** &rarr; **SQL Editor**.
  3. Execute the role elevation query:
     ```sql
     UPDATE public.profiles
     SET role = 'admin'
     WHERE email = 'admin@zsphere.edu';
     ```
  4. Verify admin status by running:
     ```sql
     SELECT id, email, full_name, role FROM public.profiles WHERE role = 'admin';
     ```
  5. Log in at `/pages/login.html` and verify that the `Admin Panel` navigation button appears.

---

### Action 4: Supabase Storage Buckets Configuration
- **Target Platform**: Supabase Dashboard &rarr; **Storage**
- **Context**: Media uploads (event covers, gallery photos, team headshots) require public read access.
- **Procedure**:
  1. In Supabase Storage, verify or create the following 3 buckets:
     - `events` (Public Bucket: **Enabled**)
     - `gallery` (Public Bucket: **Enabled**)
     - `team` (Public Bucket: **Enabled**)
  2. Set Storage RLS Policies:
     - **Public Read**: Allow `SELECT` for all users (`true`).
     - **Admin Upload**: Allow `INSERT`, `UPDATE`, `DELETE` for users where `EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')`.

---

### Action 5: Supabase Auth Email Templates & Redirect URLs
- **Target Platform**: Supabase Dashboard &rarr; **Authentication** &rarr; **URL Configuration**
- **Procedure**:
  1. Under **Site URL**, set the primary production URL: `https://zsphere.edu`.
  2. Under **Redirect URLs**, add the following allowed callback endpoints:
     - `https://zsphere.edu/`
     - `https://zsphere.edu/pages/reset-password.html`
     - `https://zsphere.edu/pages/account.html`
  3. Under **Email Templates**, customize the **Password Reset** and **Confirm Signup** templates to match ZSphere branding.

---

## 4. Verification of Manual Actions

Once the 5 manual procedures are completed:
1. Visit `https://zsphere.edu` in an incognito window.
2. Sign in with the newly elevated admin credentials.
3. Access `https://zsphere.edu/pages/admin.html` and confirm full dashboard telemetry loads.
4. Create a test draft session to verify database write permissions.
