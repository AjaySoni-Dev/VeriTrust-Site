# Vercel Deployment

## 1. Prepare the repository

Run:

```bash
npm ci
npm run ci
```

The check validates JavaScript syntax, local links, SEO metadata, Vercel function count, security headers, sensitive learning fields, crawler files, and common committed-secret patterns.

## 2. Create or import the Vercel project

- Import the GitHub repository.
- Use a lowercase Vercel project name such as `veritrust-site`.
- Set the root directory to the repository root.
- Choose the `Other` framework preset.
- Leave the build command and output directory empty.
- Keep Node.js at version 24 to match `package.json` and CI.

Vercel serves the static HTML directly and bundles the files in `api/` as serverless functions.

## 3. Configure environment variables

Use `.env.example` as the inventory. Add values through Vercel Project Settings; do not upload a populated environment file.

At minimum, an authenticated production deployment normally needs:

- Supabase URL, anonymous key, and service-role key;
- a Hugging Face token and the model identifiers for enabled detectors;
- canonical site URL and allowed origins;
- learning access key when preview routes remain enabled;
- gateway integrity, dispatch, and encryption keys when the gateway is enabled.

Add Stripe variables only when billing endpoints are enabled. Use different restricted values for Preview and Production where appropriate.

## 4. Verify external services

- Confirm the deployed Supabase schema matches `database-schema.json`.
- Confirm storage buckets and row-level security match the production database policy.
- Confirm model tokens can access every configured provider repository.
- Confirm approved webhook hosts are explicit and controlled.
- Configure the Stripe webhook destination as `/api/billing/webhook` when billing is enabled.

## 5. Domain and SEO

The repository currently uses `https://www.veritrustlab.in` as its canonical origin. If the production domain changes, update all of the following together:

- canonical and social URL metadata in public HTML pages;
- JSON-LD in `index.html`;
- `robots.txt`;
- `sitemap.xml`;
- `VERITRUST_SITE_URL` and `VERITRUST_ALLOWED_ORIGINS`;
- the public-page verification map in `scripts/verify.js`.

Choose one canonical host in Vercel and redirect the other host to it.

## 6. Release checks

After deployment, confirm:

1. `/api/health` returns a public health response without private diagnostics.
2. `/`, `/detection`, `/docs`, and the legal pages return `200`.
3. `/scans` permanently redirects to `/cases`.
4. Authentication completes on the production host and uses secure cookies.
5. One configured detection request completes and does not expose provider paths.
6. Workspace data is isolated to the signed-in tenant.
7. `robots.txt` and `sitemap.xml` return the committed content.
8. Response headers include CSP, HSTS, anti-framing, MIME-sniffing protection, and the configured permissions policy.

## 7. Rollback

Use Vercel's previous deployment promotion for application rollback. Database changes are owned by the production database workflow and must have their own reviewed rollback plan; do not reconstruct or apply ad hoc SQL from application source.
