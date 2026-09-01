<h1 align="center">Z Sphere</h1>

<p align="center">
  <strong>Student-Led Technology & Learning Community Platform</strong><br>
  Hands-on technical workshops, peer learning, domain exploration, event management, and student project showcases.
</p>

<p align="center">
  <img alt="Status" src="https://img.shields.io/badge/status-active%20development-blue">
  <img alt="Frontend" src="https://img.shields.io/badge/frontend-HTML5%20%2F%20Vanilla%20CSS-orange">
  <img alt="Backend" src="https://img.shields.io/badge/backend-Supabase-3ECF8E">
  <img alt="Database" src="https://img.shields.io/badge/database-PostgreSQL-336791">
  <img alt="Deployment" src="https://img.shields.io/badge/deployment-Vercel-lightgrey">
  <img alt="License" src="https://img.shields.io/badge/license-MIT-green">
</p>

<p align="center">
  <a href="#overview">Overview</a> ·
  <a href="#architecture">Architecture</a> ·
  <a href="#features">Features</a> ·
  <a href="#quick-start">Quick Start</a> ·
  <a href="#tech-stack">Tech Stack</a> ·
  <a href="#database-schema">Database Schema</a> ·
  <a href="#roadmap">Roadmap</a>
</p>

---

## Overview

**Z Sphere** is a student-led technology learning community platform designed for hosting technical sessions, managing workshop registrations, organizing specialized domains, and displaying community announcements and gallery highlights.

The platform bridges classroom theoretical knowledge and real-world technical execution.

### New Registration Flow

Z Sphere uses an external registration architecture. The platform itself does not store individual user registrations.

```text
Browse event
→ Register through Google Form
→ Join WhatsApp group
→ Organizer manually updates registration count in Z Sphere admin
→ Completed events publish sanitized evidence/gallery
```

> [!IMPORTANT]
> Z Sphere is an active engineering platform built with vanilla web standards and powered by Supabase PostgreSQL with Row Level Security (RLS).

---

## Architecture

The system follows a modular client-side architecture with Supabase backend services:

```text
User Browser / Mobile Device
        ↓
Vanilla HTML5 + Modular CSS + JS Modules
        ↓
ZSphereDataService API Layer
        ↓
Supabase Client JS SDK
        ↓
PostgreSQL Database (RLS Policies) & Storage Buckets
```

### External Registration Architecture
Z Sphere acts as a directory and catalogue for events. Individual registrations are managed strictly outside of the platform (e.g., via Google Forms). Administrators manually aggregate the counts and update `events.registered_count` via the Admin Dashboard. This ensures maximum flexibility for event organizers and zero PII risk on the platform.

### Privacy Note
Z Sphere never publishes raw attendance sheets containing student PII (Personally Identifiable Information) such as names, phone numbers, or email addresses by default. Post-event evidence relies exclusively on aggregate counts and sanitized verification documents.

---

## Core Features

| Area | Current State | Description |
|---|---:|---|
| Public Sessions Catalogue | ✅ Active | Search, filter, and view upcoming and past technical sessions |
| External Event Registration | ✅ Active | Direct routing to official Google Forms and WhatsApp groups |
| Domain Learning Tracks | ✅ Active | Curated exploration paths across AI, Data Science, Web Dev, etc. |
| Supabase Integration | ✅ Active | Database, Row Level Security, Auth, and Storage bucket management |
| Announcement System | ✅ Active | Public broadcast messages |
| Workshop Gallery Albums | ✅ Active | High-resolution event photo albums with lightbox viewing |
| Executive Team Showcase | ✅ Active | Leadership and core team member profiles and social links |
| Administrative Panel | ✅ Active | Event creation, manual metrics tracking, team & gallery management |
| Responsive Mobile UX | ✅ Active | Fully responsive drawer navigation and optimized touch layouts |

---

## Setup & Quick Start

### 1. Clone the repository

```bash
git clone https://github.com/your-username/Z-Sphere.git
cd Z-Sphere
```

### 2. Configure Supabase Environment

Edit `js/config.js` to add your Supabase project credentials:

```javascript
window.ZSphereConfig = {
    SUPABASE_URL: 'https://your-project.supabase.co',
    SUPABASE_ANON_KEY: 'your-anon-key',
    BUCKET_NAME: 'zsphere-media'
};
```
*Note: Do not expose `service_role`, database passwords, or private API secrets in this file. Supabase public/publishable browser keys are safe to commit.*

### 3. Run Database Migrations (Migration Order)

Execute the following scripts in your Supabase SQL Editor in order:
1. First, setup your basic schema.
2. Next, run the external registration refactor: `supabase/migrations/20260815_external_event_registration.sql`
3. Finally, verify your tables match the authoritative schema provided in `supabase/final_schema.sql`.

### 4. Run Locally

Because Z Sphere uses standard web files, you can launch it with any local static server:

```bash
# Using python http server
python -m http.server 8000
```

Open `http://localhost:8000` in your browser.

---

## Technical Details

### Auth
Authentication (via Supabase Auth) is used exclusively for:
- Student user profiles
- Accessing authenticated community features
- Administrator dashboard access

**Auth is no longer required for event registration**, removing conversion friction.

### Admin
The Admin Dashboard allows organizers to:
- Draft and publish events.
- Embed external registration URLs and WhatsApp group links.
- Manually sync registration aggregate counts from external tools.
- Attach post-event proof/metrics (attendance count, feedback response count, verification URLs).
- Post platform announcements.

### Gallery
The gallery integrates directly with events. When an event transitions to `completed`, any associated and published `gallery_albums` are prominently displayed on the event's public detail page.

### Deployment
Z Sphere is built to be deployed on Vercel. 
The `vercel.json` file handles `cleanUrls` and important permanent 301 redirects for legacy routes (e.g. `my-sessions` → `account`, `admin-registrations` → `admin`).

---

## Database Schema

```text
public.profiles            → Student user details (full_name, course, semester)
public.user_roles          → Role-based access mapping (admin)
public.events              → Workshop details, registration URLs, aggregate metrics, dates, venue, capacity, status
public.announcements       → Public broadcast announcements
public.announcement_reads  → Announcement read receipt logs
public.gallery_albums      → Workshop photo gallery albums
public.gallery_images      → Gallery photo paths & captions
public.team_members        → Core team & leadership directory
```

---

## Roadmap

Immediate development priorities:
- automated registration email reminders via external webhook integration
- downloadable workshop completion certificates

Long-term exploration:
- real-time collaborative code pad during sessions
- integrated student project repository directory
- peer feedback and workshop review system

---

## License

This project is licensed under the MIT License.
