# Deploy FreeReps to Cloudflare Pages (your own domain)

The site is pure static files. There's no build step, and the output directory is the folder root.

## Option A: Direct upload (drag & drop, ~2 min)
1. Unzip `chess-trainer-v2.zip`.
2. Go to dash.cloudflare.com → **Workers & Pages** → **Create** → **Pages** tab → **Upload assets** ("Use direct upload").
3. Give it a project name such as `freereps`, then **Create project**.
4. Drag the **`chess-trainer-v2` folder** (the one containing `index.html`) onto the upload box → **Deploy site**.
5. It goes live at `https://freereps.pages.dev`.
6. To update later, open the project → **Create new deployment** → drag the folder again.

## Option B: Git-connected (auto-deploys on every push)
1. Create a **public** GitHub repo, e.g. `freereps`. It must be public because of the GPL (see below). Push the folder contents to it:
   `git init && git add . && git commit -m "FreeReps v2" && git branch -M main && git remote add origin https://github.com/<you>/freereps.git && git push -u origin main`
2. In Cloudflare go to **Workers & Pages** → **Create** → **Pages** → **Connect to Git**, then authorise GitHub and choose the repo.
3. Use these build settings:
   - Framework preset: **None**
   - Build command: *(leave empty)*
   - Build output directory: **`/`**
   Then **Save and Deploy**.
4. Every `git push` to `main` redeploys.

## Attach your custom domain (domain already on Cloudflare)
1. Open the Pages project → **Custom domains** → **Set up a custom domain**.
2. Enter `yourdomain.com`, or a subdomain like `chess.yourdomain.com`, then **Continue** → **Activate domain**.
3. Because the zone is on Cloudflare, the CNAME record is created for you. SSL becomes active in a few minutes.
4. Optionally add `www.yourdomain.com` the same way. You can also redirect www → apex with a Redirect Rule (Rules → Redirect Rules).
5. Don't point an A record manually. Let Pages create the record.

## `_headers`
- Sets the JS MIME type and caching:
  - `index.html` is not cached.
  - JS and CSS are cached for 1 h.
  - `vendor/` is cached for 7 days.
  - Sounds are cached for 1 day.
- Adds basic security headers.
- After you swap sounds, redeploy. Visitors get the new files within 24 h, or purge the cache under Caching → Configuration → Purge Everything.

## GPL-3.0 requirement (important)
The board library (chessground) is GPL-3.0, so a public site must offer its full source code under GPL-3.0.
- Push this folder to a public GitHub repo, then edit the footer link in `index.html` (`id="srcLink"`, currently `https://github.com/YOUR-USERNAME/freereps`) to point at it.
- chess.js is BSD-2. Keep both licence files in `vendor/`.

## Local test
The site must be served over http. Opening `file://` won't work because of ES modules and fetch.
- `python3 -m http.server 8000` → http://localhost:8000
