# Production Deployment & Launch Verification Checklist

**Project**: ZSphere Platform  
**Target Release**: v1.0.0 Production Release  
**Release Date**: 2026-08-15  
**Sign-off Status**: **READY FOR LAUNCH (Subject to Pre-Flight Manual Config)**

---

## 1. Pre-Flight Verification Checklist (T - 60 Minutes)

Before triggering the production deployment on Vercel, complete and verify every item below:

```
[✓] Codebase & Repository Integrity
    [✓] All 60 files syntax-checked and clean of console errors.
    [✓] All 1,261 automated tests passing across 6 independent suites.
    [✓] Zero hardcoded passwords, private keys, or service_role credentials in repository.
    [✓] Zero references to deprecated my-sessions.html or participant RPCs.

[✓] Database & Schema Readiness
    [✓] Supabase external-registration migration already deployed on live database.
    [✓] Columns verified: registration_form_url, whatsapp_group_url, registered_count, attendance_count, feedback_summary.
    [✓] Check constraints verified: capacity nullability, audience enums, event_type enums.
    [✓] Row Level Security (RLS) active on all 7 production tables.

[✓] Hosting & Routing Readiness
    [✓] vercel.json contains cleanUrls, 301 redirects, and HTTP security headers (CSP, HSTS, X-Frame-Options).
    [✓] 404.html present and tested with route recovery buttons.
    [✓] robots.txt disallows admin routes and declares sitemap.xml.
    [✓] sitemap.xml declares all canonical public routes.
```

---

## 2. Production Launch Sequence (T - 0 Minutes)

Execute the following sequential deployment operations:

1. **Step 1: Commit & Push Final Release Code**
   - Ensure working tree is clean and push master release commit to GitHub/Git repository.
2. **Step 2: Trigger Vercel Production Build**
   - Vercel automatically deploys static assets to edge CDN points of presence.
   - Inspect Vercel deployment logs to confirm 0 build errors.
3. **Step 3: Verify DNS & SSL Propagation**
   - Confirm custom domain `https://zsphere.edu` resolves with valid Let's Encrypt SSL/TLS certificate.
4. **Step 4: Provision Administrator User**
   - Register lead admin user and execute `UPDATE profiles SET role = 'admin' WHERE email = '...';` in Supabase SQL Editor.
5. **Step 5: Verify Supabase Storage Buckets**
   - Confirm public read access on `events`, `gallery`, and `team` buckets.

---

## 3. Post-Deployment Smoke Test Matrix (T + 15 Minutes)

Perform live verification on the deployed production domain (`https://zsphere.edu`):

| Test ID | Test Category | Target URL | Expected User Journey & Outcome | Status |
| :--- | :--- | :--- | :--- | :--- |
| **ST-01** | Landing Page | `https://zsphere.edu/` | Hero banner loads, navigation displays "Explore Sessions" and "Sign In", stats counters animate. | [ ] PASS |
| **ST-02** | Sessions Catalogue | `/pages/sessions.html` | Published sessions render. Search query and filters (type, mode, status) filter cards correctly. | [ ] PASS |
| **ST-03** | Event Detail View | `/pages/event.html?slug=...` | Event details, agenda, speaker, and "Register via Google Form" & "Join WhatsApp Group" CTAs render. | [ ] PASS |
| **ST-04** | User Authentication | `/pages/login.html` | Student signs in; header updates dynamically to show "Account" button. | [ ] PASS |
| **ST-05** | Student Profile | `/pages/profile.html` | Student edits name/course/semester; data saves and reloads successfully. | [ ] PASS |
| **ST-06** | Admin Route Protection| `/pages/admin.html` | Non-admin user redirected to `/pages/account.html`. Admin user granted access to dashboard. | [ ] PASS |
| **ST-07** | Admin Event CRUD | `/pages/admin-event-form.html`| Admin creates draft session with Google Form & WhatsApp URLs; session saves to database. | [ ] PASS |
| **ST-08** | Legacy Route Redirect| `/pages/my-sessions.html` | Browser receives HTTP 308 redirect to `/pages/account.html`. | [ ] PASS |
| **ST-09** | 404 Route Fallback | `/pages/invalid-page-xyz` | Custom 404 error page renders with "Explore Sessions" recovery button. | [ ] PASS |
| **ST-10** | Security Headers | `https://zsphere.edu/` | `curl -I https://zsphere.edu` confirms CSP, HSTS, X-Frame-Options: DENY, nosniff present. | [ ] PASS |

---

## 4. Rollback & Emergency Contingency Procedures

In the event of an unexpected critical production outage or data integrity failure:

### A. Instant CDN Rollback (Vercel)
1. Open the [Vercel Dashboard](https://vercel.com) &rarr; **Deployments**.
2. Locate the previous stable production deployment.
3. Click **Instant Rollback** &rarr; **Promote to Production**. (Effective globally in < 5 seconds).

### B. Database Schema Rollback
- Since no destructive migrations or table drops were applied, the database remains fully backward-compatible.
- The `public.registrations` table remains intact with all historical data.

### C. Incident Escalation Contacts
- Lead Engineer / Release Manager: `release-team@zsphere.edu`
- Supabase Cloud Status: `https://status.supabase.com`
- Vercel Edge Status: `https://www.vercel-status.com`
