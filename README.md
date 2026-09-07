# Nexora.AI — Vercel + Supabase + Agentic + ChatGPT Codex v5.0

Production-oriented Nexora.AI website-builder/chat package for Vercel. It combines the Nexora UI, the bounded Agentic Website Builder controller, the supplied Supabase project, and three model-provider paths:

- **OpenRouter** — user API key stored in that browser's localStorage.
- **NVIDIA NIM** — user API key stored in that browser's localStorage.
- **OpenAI Codex** — ChatGPT-account authentication through the official `openai-codex` Python SDK device-code flow. Codex credentials are encrypted server-side and are never stored in browser localStorage.

## Supabase project already configured in this build

The public browser configuration points at the supplied Supabase project. The Supabase anon key is a public client credential; no service-role key is required by Nexora.

Before using ChatGPT Codex, run this once in the Supabase SQL Editor:

```text
config/nexora_production_migration.sql
```

The migration preserves the existing Nexora tables/RLS/RPCs and adds the missing per-user encrypted Codex vault. It also keeps `messages.model` and `messages.token_count` compatible for chat metadata persistence.

## Only required Vercel secret for Codex

Create a Fernet key locally:

```bash
python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
```

Add the result in **Vercel → Project → Settings → Environment Variables** as:

```text
NEXORA_CODEX_VAULT_KEY=...
```

`SUPABASE_URL` and `SUPABASE_ANON_KEY` are already present as safe public defaults in the application and may be overridden with Vercel environment variables if desired. They are sufficient for the Codex vault and the bundled template catalog.

Private template packages are optional. To enable them, configure `SUPABASE_SECRET_KEY` only in Vercel and provision the private `template-packages` bucket plus its catalog. Never expose that key to browser code or generated subprocesses. Do not add a legacy service-role key solely for Codex vault access.

## Vercel deployment

1. Run `config/nexora_production_migration.sql` in Supabase.
2. Push this folder to GitHub or import it into Vercel.
3. Use this folder as the Vercel project root.
4. Add `NEXORA_CODEX_VAULT_KEY` if Codex support is required.
5. Deploy. `vercel.json` selects FastAPI, Fluid Compute, the `server.py` entrypoint, and a 300-second function duration.
6. Verify `/api/health` returns JSON.
7. Verify `/api/codex/route-check` returns JSON.
8. Open `/chat`, sign in, and configure the desired model provider in **Settings → Agentic AI Runtime**.

## Codex connection

1. Select **OpenAI Codex · ChatGPT account**.
2. Click **Connect ChatGPT**.
3. Nexora preflights the Vercel backend and starts the SDK device-code flow.
4. Authorization is restricted to the canonical OpenAI page `https://auth.openai.com/codex/device`.
5. Enter the one-time code on OpenAI's page.
6. Nexora encrypts the resulting file-backed Codex auth cache with `NEXORA_CODEX_VAULT_KEY` and writes it to the signed-in user's RLS-protected Supabase vault row.
7. Load models, select one, and test it.

The browser's Supabase JWT is sent to the backend for Codex operations. The backend uses the public Supabase anon key plus that user JWT, so Row Level Security—not a service-role key—authorizes the vault operation.

## Chat intelligence and persistence

- Every user turn—including greetings and vague creation requests—is interpreted by the selected AI model. The active chat path has no greeting response table or keyword-based website trigger.
- An AI turn planner chooses among normal conversation, clarification, a new website build, or revision of the current generated project. Underspecified creation requests remain conversational until enough context exists to build responsibly.
- The complete loaded transcript is sent with each turn. Nexora uses a 100,000-token conversation budget, preserves recent turns verbatim, and semantically compacts older turns only when the window is approached.
- Conversation loading is paginated rather than silently truncating a chat to the latest 100 messages.
- OpenRouter, NVIDIA NIM, and Codex chat output is streamed from provider deltas; completed text is not replayed as simulated chunks. Website generation also streams live source progress and per-file line estimates before the final files are returned.
- Conversation/message persistence uses the existing Supabase `conversations` and `messages` tables. Assistant messages persist the selected model and an approximate token count in the existing `messages.model` and `messages.token_count` columns.
- Existing optimized `get_nexora_chat_bootstrap_v2` / dashboard fallback loading remains supported.
- Projects, generated payloads, deployments, preferences, billing state, profile state, and chat history continue to use the supplied Nexora database model and RLS policies.

## Agentic website workflow

```text
ANALYZE → PLAN → INSPECT → GENERATE/EDIT FILES → DIAGNOSTICS
        → VERIFY REQUIREMENTS → targeted REPAIR → RE-VERIFY → COMPLETE
```

A Vercel build stays inside one streamed request. Progress events contain compact run state and file metadata; final source files are returned once and reconstructed in the browser for preview/editor/export. The backend does not depend on persistent local disk or a later request reaching the same Vercel instance.

## Provider configuration

For OpenRouter or NVIDIA NIM, users paste their own API key in **Settings → Agentic AI Runtime**, load models or enter a model ID/path manually, test it, and save the browser-local preference. Provider base-URL overrides are allowlisted so a tampered browser value cannot redirect a private provider key to an arbitrary host.

## Important operational boundary

The application is hardened against the known routing, state, credential-vault, generation-repair, and Vercel serverless issues addressed in this project. No hosted AI application can guarantee that external providers, user accounts, Supabase, the network, or Vercel will never fail. Nexora returns controlled errors and does not mark an unverified agent build successful when an external dependency fails.

## Canonical website JSON + deterministic compiler

The website builder now uses `nexora.web-project` as the persistent editable source of truth. AI generation produces the structured project document; Nexora then performs deterministic normalization, reference reconciliation, validation, quality checks, and compilation to `index.html`, `style.css`, and `script.js`.

The canonical document supports:

- recursive semantic nodes that normalize into a stable indexed graph;
- arbitrary standards-based CSS declarations, design tokens, responsive/media/support/container/layer conditions, pseudo-state rules, gradients, filters, masks, shadows, blend modes, Grid/Flexbox, and 3D transforms;
- declarative entrance/hover effects plus reusable Web Animations API effects and timelines using load, in-view, hover, focus, click, pointer-enter, pointer-leave, scroll, view, or custom-event triggers;
- reduced-motion policies so animation is never required to access content;
- state, interactions, actions, data bindings, assets, routes, components, and controlled custom-code escape hatches;
- focused revision context that preserves request-matched nodes together with their structural hierarchy and relevant project modules.

The runtime contract is exposed by `pages/shared/nexora-web-project.js`; the machine-readable Draft 2020-12 schema is `schemas/nexora.web-project.schema.json`. Generated HTML/CSS/JavaScript are derived artifacts and must not become the normal editing source.

## Chat → editor transport

Large generated projects no longer depend primarily on Web Storage. Chat stores a compact versioned handoff record in same-origin IndexedDB and navigates to the canonical `/editor?handoff=<token>` Vercel route. The editor verifies the record checksum, loads the canonical project, consumes the handoff, and retains compatibility fallbacks for older browser-storage payloads or restricted IndexedDB environments.

This also avoids the old deployed `/editor/index.html` routing mismatch: production navigation uses the `/editor` rewrite defined in `vercel.json`.

## Production validation performed for this package

Before packaging, the source/public mirrors, JavaScript syntax, inline HTML scripts, Python modules, JSON documents, Vercel rewrite destinations, JSON Schema, authoring contract, canonical compiler output, advanced motion runtime, large-project revision context, IndexedDB handoff integrity behavior, and FastAPI health routes were validated. Browser execution still depends on the user's browser, network, configured provider credentials, Supabase state, and third-party availability, so external-service success cannot be guaranteed by a static ZIP alone.
