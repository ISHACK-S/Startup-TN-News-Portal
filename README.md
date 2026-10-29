# StartupTN News

StartupTN News is an English-language editorial publication and admin CMS for startup and innovation updates across Tamil Nadu. The application uses React/Vite, Express, Aiven MySQL (`mysql2/promise`), and Cloudinary. Instagram is an editorial reference only; content is entered by editors, not scraped. This independent project does not claim to be operated by or officially endorsed by StartupTN.

## Requirements and local setup

- Node.js 20 or newer and npm
- A provisioned Aiven for MySQL database
- The Aiven CA certificate
- A Cloudinary account for image uploads

Install dependencies from the repository root:

```powershell
npm ci
```

Copy `.env.example` to `.env` at the repository root, or configure `server/.env` for local server development. The server loads root `.env` when it exists; it falls back to `server/.env` only when root `.env` is absent. Never commit either file.

| Variable | Required | Description |
|---|---:|---|
| `NODE_ENV` | Yes in production | Use `production` on the backend host. |
| `PORT` | Hosting platform | Express listens on the validated `PORT`; local default is 3000. |
| `CLIENT_ORIGIN` | Yes | Exact browser origin, including scheme, e.g. `https://news.example.com`; no path. |
| `SESSION_SECRET` | Yes | At least 32 characters; use a random secret stored only in backend secrets. |
| `MYSQL_HOST` | Yes | Aiven host. |
| `MYSQL_PORT` | Yes | Aiven port. |
| `MYSQL_DATABASE` | Yes | Aiven database name. |
| `MYSQL_USER` | Yes | Aiven username. |
| `MYSQL_PASSWORD` | Yes | Aiven password. |
| `MYSQL_SSL` | Yes | Keep `true`; production validation rejects `false`. |
| `MYSQL_SSL_CA` | Yes | Path to the Aiven CA PEM file on the backend host. |
| `CLOUDINARY_CLOUD_NAME` | For image upload | Cloudinary cloud name. |
| `CLOUDINARY_API_KEY` | For image upload | Cloudinary API key. |
| `CLOUDINARY_API_SECRET` | For image upload | Cloudinary API secret; server only. |
| `UPLOAD_MAX_FILE_SIZE_MB` | No | Integer from 1 to 5; defaults to 5 MB. |
| `VITE_API_URL` | Frontend build | Public API base ending in `/api`, e.g. `https://api.example.com/api`. |

`.env.example` contains placeholders only. `VITE_API_URL` is public and is embedded in the frontend build; never put credentials or secrets in any `VITE_*` setting.

## Local development and checks

Configure Aiven and Cloudinary locally, then start both processes:

```powershell
npm run dev
```

- Vite serves the client at `http://localhost:5173`.
- Express serves the API at `http://localhost:3000`; Vite proxies `/api` there.
- `npm start` starts the production Express server.
- `npm run build` builds the Vite client into `client/dist`.
- `npm run check` checks backend JavaScript syntax and builds the client.
- `npm test` runs backend and frontend automated tests. Tests use database/provider doubles and do not replace live integration checks.

## Aiven MySQL and TLS

Copy the CA certificate downloaded from the Aiven service to a protected local path, for example `certs/ca.pem`, and set `MYSQL_SSL_CA=./certs/ca.pem`. Relative CA paths resolve from the repository root, not from `server/`. The backend reads the PEM and configures MySQL TLS with `rejectUnauthorized: true`. Missing or invalid certificates fail startup; do not disable TLS or certificate verification.

On the production host, provide the CA as a protected secret file/mount and set `MYSQL_SSL_CA` to that file's absolute path. Do not rely on an untracked local certificate or assume it is included in the repository. Confirm Aiven permits network access from the backend host (use the host's supported static egress/IP allowlist where required).

The schema is managed manually. `database/schema.sql` creates the `admins`, `admin_sessions`, `categories`, and `articles` tables and inserts the six categories using a non-destructive upsert. Do not run destructive migrations against production. The schema must be initialized and verified before the API can serve database-backed endpoints or sessions.

## Admin provisioning and sessions

There is no public registration. To provision the first admin, run this once from an interactive terminal after Aiven and the schema are ready:

```powershell
npm run provision-admin
```

Enter the admin name and email at the prompts; enter and confirm the password using hidden terminal input. The provisioning script uses a database advisory lock, refuses to proceed if an admin already exists, hashes the password with bcrypt, stores only the hash, and closes its database connection. Passwords must be at most 72 UTF-8 bytes. Do not put credentials in command-line arguments, commit them, or leave temporary environment credentials in a shared environment.

Sessions are persisted in the MySQL `admin_sessions` table (not Express's in-memory store), expire after eight hours, and are shared across backend instances. Production cookies are `HttpOnly`, `Secure`, and `SameSite=Strict`; the server trusts one HTTPS reverse-proxy hop. Deploy the browser client and API on the same **site** (same registrable domain, for example `news.example.com` and `api.example.com`) so the strict cookie works. The API's credentialed CORS origin must be exactly the frontend origin. Do not rely on unrelated provider domains such as `*.vercel.app` and `*.onrender.com` for cookie-based admin access.

## Cloudinary uploads

Set `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, and `CLOUDINARY_API_SECRET` as backend-only secrets. The service requires all three together. Uploads require an admin session, accept JPEG/PNG/WebP validated from file content, stay in memory, and are capped at 5 MB by default. Hosted assets go to `startuptn-news/articles`; article rows store the hosted HTTPS URL, not image bytes. Replacing or deleting an article does not automatically delete the image asset.

## Backend deployment (manual)

Use a Node.js host that supports a persistent web process, environment variables, HTTPS/reverse proxy, and secret files (for example, a Render web service or equivalent).

1. Connect the Git repository and deploy from the repository root (the monorepo root).
2. Select Node.js 20 or newer. Install with `npm ci`; start with `npm start`. The root `start` script launches the Express workspace, and Express listens on the hosting platform's `PORT`.
3. Configure the backend environment variables from the table above: `NODE_ENV=production`, the host-provided `PORT`, exact `CLIENT_ORIGIN`, a generated `SESSION_SECRET`, all Aiven connection settings with `MYSQL_SSL=true` and a mounted CA path, and the three Cloudinary credentials.
4. Configure the hosting platform's secret-file facility to place the Aiven CA PEM and set `MYSQL_SSL_CA` to its absolute path. Do not commit the certificate.
5. Add the backend host's outbound IP to the Aiven allowlist if the provider uses restricted network access.
6. Assign a custom API domain under the frontend's registrable domain, such as `api.example.com`, and enable HTTPS. The `Secure` cookie requires HTTPS in production.
7. Set the platform health check to `GET /api/health`. It performs a database query and returns 503 when MySQL is unavailable.
8. Provision the first admin securely using the interactive command from a trusted local environment configured with production Aiven credentials, or use a secure one-time operations environment. Do not expose a public provisioning endpoint.

The backend validates environment configuration at startup. It reports invalid variable names/categories, not credential values. Aiven TLS verification remains enabled; Cloudinary and MySQL secrets stay on the backend.

## Vercel frontend deployment (manual)

1. Import the repository into Vercel. Set the project **Root Directory** to the repository root, not `client`, so npm workspaces and the root lockfile are available.
2. Choose the Vite framework preset if detected. Set **Install Command** to `npm ci`, **Build Command** to `npm run build --workspace=@startuptn-news/client`, and **Output Directory** to `client/dist`.
3. Set `VITE_API_URL` to the public HTTPS API base ending in `/api`, for example `https://api.example.com/api`. This value is not secret. Do not use a Vercel deployment URL for the backend unless the backend is actually hosted there.
4. Assign the frontend a custom domain under the same registrable domain as the API (for example `news.example.com` with `api.example.com`). Enable HTTPS.
5. The root `vercel.json` rewrites `/admin`, `/admin/*`, `/news`, and `/news/*` to the Vite entry page so React Router routes work on direct visits and refreshes. The API is requested from the separately configured `VITE_API_URL`.
6. Set the backend `CLIENT_ORIGIN` to the exact final frontend origin, e.g. `https://news.example.com` (no trailing path). Redeploy/restart the backend after changing it.

Vercel dashboard actions, domain/DNS changes, and deployments must be performed by the project owner. No deployment has been created by this repository.

## Post-deployment verification and troubleshooting

From a browser or terminal, check the deployed HTTPS endpoints:

1. `GET https://api.example.com/api/health` returns HTTP 200 and `{"status":"ok","database":"connected"}`.
2. `GET https://api.example.com/api/categories` returns the six categories.
3. `GET https://api.example.com/api/news?page=1&limit=9` returns HTTP 200; an empty `data` array is valid when no articles are published.
4. Open `/admin/login` on the frontend domain. Sign in with the provisioned account and confirm `/api/auth/me` reports an authenticated session. If the cookie is absent, verify HTTPS, same-site custom domains, `Secure`/`SameSite=Strict`, credentialed fetches, exact `CLIENT_ORIGIN`, and CORS.
5. Upload a test JPEG/PNG/WebP from the admin editor; confirm the returned Cloudinary HTTPS URL is attached to a saved draft.
6. Confirm the draft is absent from public news and its known slug returns 404. Publish it, then confirm the homepage/feed and detail endpoint return the updated content. Unpublish and confirm it is absent again. Delete only the test article afterward.

Common diagnostics:

- Backend won't start with a configuration error: verify required server environment values exist and are valid; never paste secret values into logs or tickets.
- Health returns 503: verify host, port, database/user/password, Aiven network access, and CA file path. Do not disable TLS verification.
- Categories/news return 500 while health succeeds: health proves connectivity only; check that the canonical schema was manually applied to the configured database.
- Upload returns 503: all Cloudinary variables may be missing; 502 generally indicates a provider failure. Check server-side Cloudinary settings without exposing the API secret.
- Browser reports a CORS error or admin session does not persist: use the exact frontend origin and same-site custom domains over HTTPS; do not widen CORS to `*`.
- Direct route refresh returns 404: ensure the root Vercel project is using the committed `vercel.json` rewrite configuration.

## API and data behavior

- Public: `GET /api/categories`, `GET /api/news` (also `/api/news/`) with pagination/search/category filters, and `GET /api/news/:slug`. Public queries return published records only.
- Authentication: `POST /api/auth/login`, `POST /api/auth/logout`, and `GET /api/auth/me`.
- Admin: authenticated article list/read/create/update/delete under `/api/admin/articles` and image upload at `/api/admin/uploads`.
- Article status is restricted to `draft`/`published`; publication timestamps are server-managed. Slugs and admin/category names have unique constraints. All SQL values use prepared statements.
- Success uses `{ "data": ... }`; errors use `{ "error": { "message": "...", "details": [...] } }`.
