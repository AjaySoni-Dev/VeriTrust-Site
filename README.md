# VERITRUST Domain App

This folder is ready to push to GitHub and deploy on Vercel.

## What Is Included

- `index.html`: original public landing page with Deepfake and Phishing entry buttons.
- `deepfake.html`: focused image deepfake detection workspace.
- `phishing.html`: focused phishing detection workspace.
- `docs.html`: Vercel deployment and workflow notes.
- `api/health.js`: Vercel health endpoint.
- `api/deepfake.js`: Vercel server-side Hugging Face image inference proxy.
- `api/phishing.js`: Vercel server-side Hugging Face phishing proxy.
- `lib/veritrust-api.js`: shared API helper code.
- `legacy-php/*.php`: legacy PHP endpoints kept outside Vercel's `api/` folder.

## Vercel Setup

1. Push this folder's contents to a GitHub repository.
2. Import the repository in Vercel.
3. Add this environment variable in Vercel Project Settings:

```text
HF_ACCESS_TOKEN=hf_your_token_here
```

4. Deploy the project.
5. Open `/api/health`. It should return `"token_configured": true`.

The Hugging Face token is never used in browser JavaScript and should not be committed to GitHub.

Only the JavaScript files in `api/` are deployed as Vercel functions. The old PHP files are stored in `legacy-php/` and excluded by `.vercelignore`.

## Hugging Face Space

The face-crop Space is configured in `assets/js/config.js`:

```js
cropApiUrl: 'https://ajaysoni-dev-deepfakefusion.hf.space/api/crop-image'
```

Update that URL only if your Space repository URL changes.
