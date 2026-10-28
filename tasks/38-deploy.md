# 38 · Deploy to Cloudflare Pages

**Milestone** Deploy · **Depends on** 37 · **Branch** `task/38-deploy`

## Goal
Publish the app at `runcompare.pages.dev`, with a preview deploy for every PR and production on merges to `main`.

## Read first
`tasks/README.md` and `PLAN.md` §1.1 and §9.

## You own
`public/_headers`, `public/_redirects` if needed, the README "Deploy" section, and `docs/deploy.md`.

## Requirements
- **Owner steps** (the agent can't do these; write them in `docs/deploy.md` as a numbered checklist):
  1. In the Cloudflare dashboard, go to Workers & Pages, then Create, then Pages, then Connect to Git.
  2. Choose the `vdassios/runcompare` repo.
  3. Name the project `runcompare`. Set the production branch to `main`, the build command to `npm run build`, the output directory to `dist`, and the environment variable `NODE_VERSION=22`.
  4. Enable preview deployments for all non-production branches. Cloudflare comments preview URLs on PRs through its GitHub app.
  5. **Don't** set `VITE_TEST_HARNESS` in Cloudflare.
- **`public/_headers`:**
  - a strict CSP: `default-src 'self'`, `img-src 'self' data: https://tile.openstreetmap.org`, `worker-src 'self' blob:`, `style-src 'self' 'unsafe-inline'` (needed by ECharts and Leaflet), `connect-src 'self'`
  - `Referrer-Policy: strict-origin-when-cross-origin`
  - `Permissions-Policy` that disables the camera, microphone and geolocation
  - long cache headers for `/assets/*`
- **Verify the build output:** the production `dist/` must not contain the test harness (task 02's check), the fixtures, or source maps that reveal local paths.
- **README:** add the live URL badge and the "Files never leave your browser" statement, with a short explanation of how that's achieved: parsing in a worker, and no network calls apart from map tiles.

## Acceptance
- With `npm run build && npx wrangler pages dev dist` (wrangler as a dev dependency, or run with `npx`), the app works locally under the `_headers` CSP. Uploading both FIT files works and the console shows no CSP violations.
- After the owner connects Cloudflare: the preview URL on this PR loads, and both FIT files analyse there. Screenshot it in the PR.
- The production URL serves `main` after merging.

## Out of scope
A custom domain and analytics. If analytics is wanted later, it's a new task that needs the owner's decision first; the privacy line in the README would have to change.
