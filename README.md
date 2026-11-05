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

## Admin authorization migration

The versioned migration `database/migrations/001_admin_authorization.sql` adds the `role`, `is_active`, and `auth_version` fields to existing admin accounts. Existing accounts receive the `Admin` role; the migration does not change account IDs, password hashes, article rows, or session data. The runner creates and checks the `schema_migrations` ledger, uses a MySQL advisory lock, verifies the resulting column definitions, and safely recognizes a completed migration on repeat runs. An incomplete or conflicting schema fails closed for manual review.

Back up the target database and verify the backend's configured Aiven connection before running this command from the repository root. It is not run automatically during application startup:

```powershell
npm run migrate-admin-authorization
```

Apply and verify the migration before deploying the authorization code. New databases should use the updated `database/schema.sql`; existing databases should use the versioned migration rather than reapplying the base schema.

After confirming the intended account is an active `Admin`, assign the initial Super Admin from a trusted interactive terminal:

```powershell
npm run promote-initial-super-admin
```

The command verifies the account, requires an exact typed confirmation, refuses if a Super Admin already exists, and invalidates only the selected account's sessions while updating its authorization version. It does not create an account or accept a password. Do not assign roles by editing session data or exposing role assignment publicly. Admin and Super Admin can use the existing editorial and image-upload APIs; `requireSuperAdmin` is reserved for future account and configuration management routes.

## Admin provisioning and sessions

There is no public registration. To provision the first admin, run this once from an interactive terminal after Aiven and the schema are ready:

```powershell
npm run provision-admin
```

Enter the admin name and email at the prompts; enter and confirm the password using hidden terminal input. The provisioning script uses a database advisory lock, refuses to proceed if an admin already exists, hashes the password with bcrypt, stores only the hash, and closes its database connection. New passwords must be at least 12 characters, include lowercase and uppercase letters, a number, and a symbol, and use no more than 72 UTF-8 bytes. The same policy applies when updating credentials. Existing passwords are not changed by the role migration. Do not put credentials in command-line arguments, commit them, or leave temporary environment credentials in a shared environment.

To update the email and password of an existing administrator, run this from the repository root in an interactive terminal:

```powershell
npm run update-admin-credentials
```

Enter the current admin email, the new email, then the new password twice using hidden terminal input. New passwords follow the shared policy above. The command refuses to create an account, preserves the administrator ID and related records, and invalidates only sessions belonging to that administrator. After it confirms success, verify the new credentials at `/admin/login`. Do not run this command as part of automated tests or against production unless you intend to change the account.

Sessions are persisted in the MySQL `admin_sessions` table (not Express's in-memory store), expire after eight hours, and are shared across backend instances. Production cookies are `HttpOnly`, `Secure`, and `SameSite=Strict`; the server trusts one HTTPS reverse-proxy hop. Deploy the browser client and API on the same **site** (same registrable domain, for example `news.example.com` and `api.example.com`) so the strict cookie works. The API's credentialed CORS origin must be exactly the frontend origin. Do not rely on unrelated provider domains such as `*.vercel.app` and `*.onrender.com` for cookie-based admin access.

## Super Admin Access Control API

The backend exposes account creation, listing, and role/active-status updates for the User Management interface. All endpoints require an authenticated **Super Admin**; regular Admins receive `403`, and unauthenticated requests receive `401`.

Super Admins can create accounts with `POST /api/admin/access-control/users`. The request accepts `name`, `email`, `password`, `role` (`Admin` or `Super Admin`), and optional `isActive` (defaults to `true`). Email addresses are trimmed and lowercased; password policy is the same as the interactive provisioning tools. The password is bcrypt-hashed, and the response contains only safe account fields. New accounts inherit the selected role's permissions without per-account overrides. Creating a Super Admin additionally requires `"confirmSuperAdmin": true`; an inactive account cannot sign in until reactivated.

```http
POST /api/admin/access-control/users
Content-Type: application/json

{
  "name": "Editorial Admin",
  "email": "editor@example.com",
  "password": "Strong-password-123!",
  "role": "Admin",
  "isActive": true
}
```

```http
GET /api/admin/access-control/users?page=1&limit=10&q=editor
```

The optional `page` (default `1`), `limit` (default `10`, maximum `50`), and `q` (name/email search) parameters provide pagination and search. The response includes only account ID, name, email, role, active status, creation date, and pagination metadata:

```json
{
  "data": [
    {
      "id": "12",
      "name": "Editorial Admin",
      "email": "editor@example.com",
      "role": "Admin",
      "isActive": true,
      "createdAt": "2026-01-02T03:04:05.000Z"
    }
  ],
  "pagination": { "page": 1, "limit": 10, "total": 1, "totalPages": 1 }
}
```

```http
PATCH /api/admin/access-control/users/12
Content-Type: application/json

{ "role": "Super Admin", "isActive": true }
```

The update body must contain at least one of `role` (`Admin` or `Super Admin`) and `isActive` (boolean); unknown fields are rejected. The response returns the safe account representation in `data` and reports whether it changed and how many sessions were invalidated in `meta`:

```json
{
  "data": {
    "id": "12",
    "name": "Editorial Admin",
    "email": "editor@example.com",
    "role": "Super Admin",
    "isActive": true,
    "createdAt": "2026-01-02T03:04:05.000Z"
  },
  "meta": { "changed": true, "sessionsInvalidated": 2 }
}
```

Any actual role or active-status change increments the account's authorization version and invalidates **only that account's existing sessions**. The update transaction locks the admin rows while checking the result, preventing concurrent changes from leaving the system without an active Super Admin. The last active Super Admin cannot be demoted or deactivated, and operators cannot demote or deactivate their own account.

## Permission foundation

Migration `002_admin_permissions.sql` adds the permission registry and permission data while preserving the existing `admins` accounts, articles, categories, and sessions. Migration `003_enable_role_builder.sql` marks the now-implemented Role Builder module available and active; its Admin role limit remains denied, and Super Admin retains its built-in access. Migration `004_content_management.sql` adds media, Web Stories, hero slides, and video records. Migrations `005` and `006` add website configuration and draft storage. Migration `007_startuptn_module_catalog.sql` removes obsolete module permission rows and module records, preserving roles, accounts, and permissions for retained modules. The runner applies and verifies migrations `001` through `007` in order. **Do not run it against a live database until an operator has verified the target, taken a backup, and scheduled the rollout.** It is never run automatically on application startup.

For a safe rollout, first back up the target MySQL database and confirm the server's configured database and TLS connection without exposing credentials. Apply the migration from a trusted environment only after checking that the target is correct:

```powershell
npm run migrate-admin-authorization
```

The runner uses a MySQL advisory lock, records completed versions only after schema and module checks succeed, and verifies schema and seeded registry/permission rows on repeat runs. Migration 004 uses `CREATE TABLE IF NOT EXISTS` so a retry can continue after MySQL implicitly commits earlier DDL; it leaves existing rows and tables intact, removes only the obsolete `chk_hero_slide_destination` check if present, and fails for manual review if an existing table is structurally incomplete. After a failed migration, inspect the target schema and migration ledger, take a backup, then rerun the documented command against the verified target. This task does not run migrations automatically or against Aiven. Keep the existing Super Admin active during rollout; the permission APIs cannot edit built-in Super Admin grants or overrides, and Access Control itself cannot be deactivated.

The registry uses these stable identifiers (not display labels) and marks implementation separately from activation:

| Group | Module identifiers |
|---|---|
| Dashboard | `overview` |
| Content Management | `news-articles`, `web-stories`, `hero-slider` |
| Media Management | `video-media`, `media-library` |
| Administration | `user-management`, `role-builder`, `access-control` |
| Website Management | `branding-theme-editor`, `menu-management`, `footer-management`, `seo-management` |

SEO Management remains registered as a planned website feature. `overview`, `news-articles`, `access-control`, `user-management`, `role-builder`, `media-library`, `web-stories`, `hero-slider`, and `video-media` are marked implemented after their corresponding migrations are applied; other planned modules remain unavailable and inactive. The supported actions are `view`, `create`, `edit`, `publish`, `delete`, `manage`, and `configure`.

Effective authorization requires a grant within the role's maximum, an available and active module, and the requested action. Module visibility is derived from effective `view` permission; visibility does not grant other actions. The built-in Admin defaults preserve Overview and the existing article workflow, with other modules denied unless explicitly granted within Admin's limits. Built-in Super Admin grants remain fixed and unrestricted across available modules. Account overrides replace the corresponding role grant but cannot exceed the role limit; Super Admin overrides are prohibited. Missing or inconsistent permission records fail closed. Protected requests re-read current permissions from MySQL, so role and module changes take effect on the next request; account override changes also increment that account's authorization version and invalidate its sessions.

Permission endpoints are under `/api/admin/access-control/permissions`. The authenticated-permissions endpoint `/me` requires any active admin session; all role, module, and account-management endpoints require an authenticated **Super Admin**. Unauthenticated requests receive `401`; an authenticated regular Admin receives `403` for privileged operations.

| Method and path | Purpose |
|---|---|
| `GET /me` | Return the authenticated account's effective permissions and module visibility. Requires any active authenticated admin session. |
| `GET /modules` | List registered modules, including `isAvailable`, `isActive`, and `implementationStatus`. |
| `PATCH /modules/:moduleId` | Change activation using `{ "isActive": true }`; unavailable modules and Access Control cannot be activated/deactivated, respectively. |
| `GET /roles` | List registered built-in roles and indicate which role is editable. |
| `GET /roles/:roleKey/permissions` | Read a role's effective permission matrix (`roleKey` is `admin` or `super-admin`). |
| `PATCH /roles/:roleKey/permissions` | Update explicit role grants; only `admin` is editable. |
| `GET /accounts/:adminId/permissions` | Read an account's effective permissions and account status. |
| `PUT /accounts/:adminId/overrides` | Set or remove account-specific action overrides within that account's role limits. |
| `DELETE /accounts/:adminId/overrides/:moduleId/:actionId` | Remove one account-specific override. |

`GET /me` is the authenticated, permission-aware source used by the admin shell to determine module visibility and route access. Its response is safe to use for navigation but does not replace server-side authorization. Permission reads include each module's role defaults, account overrides, role limits, effective actions, availability/activation state, and visibility. For account override updates, `isAllowed: true` grants an eligible action, `false` explicitly denies it, and `null` removes the override and restores the role default.

For example, a role update changes only the specified actions; unknown fields, identifiers, roles, and actions are rejected:

```http
PATCH /api/admin/access-control/permissions/roles/admin/permissions
Content-Type: application/json

{
  "permissions": [
    { "moduleId": "news-articles", "actions": { "publish": true, "delete": false } }
  ]
}
```

```http
PUT /api/admin/access-control/permissions/accounts/12/overrides
Content-Type: application/json

{
  "overrides": [
    { "moduleId": "news-articles", "actionId": "publish", "isAllowed": false },
    { "moduleId": "news-articles", "actionId": "delete", "isAllowed": null }
  ]
}
```

Successful responses wrap the result in `data`. Module entries include `moduleId`, `label`, `description`, `navigationGroup`, `isAvailable`, `isActive`, and `implementationStatus`. Effective permission entries additionally include `roleActions`, `limits`, nullable `overrides`, `actions`, and `isVisible`. Role Builder and Account Permissions use these APIs; the built-in Super Admin grants remain fixed, Admin cannot grant beyond server-defined limits, and account overrides cannot change the built-in Super Admin. The APIs do not create modules, accounts, custom roles, or future module APIs. Remaining registered modules and their UIs are future work; they are not made functional by appearing in the registry.

The admin shell obtains permissions from `/me`; navigation and direct-route guards use the returned effective actions. Server middleware remains authoritative for API calls. The Role Builder is at `/admin/role-builder`, account-specific permissions are at `/admin/access-control/permissions`, and the account role/status interface is at `/admin/access-control/users`. Profile Settings is available at `/admin/profile` to both Admin and Super Admin. Website configuration editors are restricted to Super Admin. The navigation displays only currently authorized modules with implemented routes; planned modules are not linked to placeholder screens. Dashboard article counts and recent articles are shown only when the account has article-view access; no user counts or synthetic system activity are presented.

## Cloudinary uploads

Set `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, and `CLOUDINARY_API_SECRET` as backend-only secrets. The service requires all three together. Uploads require an admin session, accept JPEG/PNG/WebP validated from file content, stay in memory, and are capped at 5 MB by default. Hosted assets go to `startuptn-news/articles`; article rows store the hosted HTTPS URL, not image bytes. Replacing or deleting an article does not automatically delete the image asset.

After migration `004_content_management.sql` is applied, successful uploads through the existing article editor and the Media Library uploader are idempotently registered in `media_assets` with Cloudinary public ID, HTTPS URL, image format/dimensions/size when returned, filename, uploader reference, and upload time. `GET /api/admin/media` supports paginated search and format filtering; `GET /api/admin/media/:id` reads a single asset; `POST /api/admin/media/uploads` accepts the same single JPEG/PNG/WebP `image` upload. These routes require `media-library` view/create permissions. Article uploads continue to require `news-articles:create`, preserving the existing workflow.

The registry only indexes successful uploads made after this migration and deployment. Existing Cloudinary files are not automatically discovered or backfilled. Media records are not deletable through this API; removing a database row must never be treated as permission to delete the remote Cloudinary object. Editors with media-library view access can select indexed images in the article, story, hero, and video editors.

## Content and media modules

The Web Stories admin routes under `/api/admin/web-stories` support paginated listing, detail, create, update (including ordered slide replacement), and delete. Creating/editing requires the matching `web-stories` action; publication additionally requires `publish`. A story cannot be published without at least one slide. Public `GET /api/web-stories` and `GET /api/web-stories/:slug` return published stories only, with slides ordered by their saved position. The public routes are presented at `/stories` and `/stories/:slug`.

The Hero Slider admin routes under `/api/admin/hero-slides` support listing, create, update/reordering through `display_order`, publication, and delete with `hero-slider` action permissions. A destination must be either a validated HTTPS URL or a published article reference. Public `GET /api/hero-slides` returns only active published slides, ordered by display order; slides extend the existing homepage featured area and do not create a second hero section. If no public slides exist, the homepage retains its current featured-article presentation. Navigation is manual, keyboard-operable, and does not auto-play.

Video admin routes under `/api/admin/videos` support list, create, update/reordering, publication, and delete with `video-media` action permissions. Source URLs are validated server-side against HTTPS YouTube and Vimeo URL forms; arbitrary iframe HTML and embed URLs are not accepted. The API derives canonical YouTube privacy-enhanced or Vimeo embed URLs. Public `GET /api/videos` returns published records only; the public listing is at `/videos`. Embeds are lazy and require an explicit user action when a poster image is available.

For all four modules, unauthenticated admin requests return `401`; missing module/action permission returns `403`. Super Admin receives the built-in maximum permissions. Admin accounts start denied for these modules and may only be granted actions within their configured role limits. Publishing, deleting, and other writes are checked by the server, not by navigation visibility.

## Public website configuration

The Super Admin-only editors at `/admin/menu-management`, `/admin/footer-management`, and `/admin/branding` manage draft and published public-site settings. Public pages load only published configuration from `GET /api/site-config`; menu/footer updates therefore affect the actual public header and footer only after publishing. Branding colours, typography, and identity are scoped to the public-site wrapper, not the admin dashboard. Before enabling these editors on an existing database, back it up and manually run `npm run migrate-admin-authorization`; migrations `005_website_configuration.sql` and `006_website_configuration_drafts.sql` create the live and draft configuration tables without dropping data and activate only the three configuration modules. The migration runner uses the ledger and advisory lock, verifies the tables and module records, and is safe to rerun after partial MySQL DDL. It is not run automatically during startup. Until a section is published, the service returns defaults matching the existing public content.

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

- Public: `GET /api/categories`, `GET /api/news` (also `/api/news/`) with pagination/search/category filters, and `GET /api/news/:slug`. Public queries return published records only. Content additions include `GET /api/hero-slides`, `GET /api/web-stories`, `GET /api/web-stories/:slug`, and `GET /api/videos`; each returns published records only.
- Authentication: `POST /api/auth/login`, `POST /api/auth/logout`, and `GET /api/auth/me`.
- Admin: authenticated article list/read/create/update/delete under `/api/admin/articles` and image upload at `/api/admin/uploads`. Media Library, Web Stories, Hero Slider, and Video & Media admin APIs are protected by their corresponding module/action permissions.
- Article status is restricted to `draft`/`published`; publication timestamps are server-managed. Slugs and admin/category names have unique constraints. All SQL values use prepared statements.
- Success uses `{ "data": ... }`; errors use `{ "error": { "message": "...", "details": [...] } }`.
