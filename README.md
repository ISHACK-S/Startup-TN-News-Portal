# StartupTN News

StartupTN News is an English-language editorial publication and admin CMS for startup and innovation updates across Tamil Nadu. It uses a React/Vite client, a Node.js/Express API, and Aiven MySQL through `mysql2/promise`. Instagram is an editorial reference only; content is added by editors, not scraped. This independent project does not claim to be operated by or officially endorsed by StartupTN.

## Requirements

- Node.js 20 or newer and npm
- A provisioned Aiven for MySQL service
- The Aiven CA certificate downloaded from the service's **Overview** page

## Install and configure

1. Install workspace dependencies from the repository root:

   ```sh
   npm install
   ```

2. Copy `.env.example` to `.env` in the repository root and replace the MySQL host, port, database, username, and password with the values from the Aiven service's **Overview > Connection information** page. For an existing `server/.env`, the API uses that file only when the root `.env` does not exist.
3. Download the service CA certificate from Aiven and save it at `certs/ca.pem`, or set `MYSQL_SSL_CA` to its path. Keep the certificate and `.env` local; both are excluded from Git.
4. Keep `MYSQL_SSL=true`. The server loads the configured CA and verifies the server certificate (`rejectUnauthorized: true`). TLS is not silently downgraded if the CA file is missing or invalid.
5. Generate a unique session secret of at least 32 characters and set `SESSION_SECRET`. Set `CLIENT_ORIGIN` to the exact origin of the trusted browser application.
6. Create the database in Aiven if it does not already exist. Connect using Aiven's provided MySQL connection details and execute `database/schema.sql` manually against that database. This creates the tables, including the persistent `admin_sessions` table, and seeds the six categories. The schema is not applied automatically at server startup.

If you already applied the earlier schema before this API update, rerun `database/schema.sql` to add `admin_sessions` and seed any missing categories; existing tables are left intact. Then, if `articles` does not already have `chk_articles_publication_state`, apply this additive statement manually once:

```sql
ALTER TABLE articles
  ADD CONSTRAINT chk_articles_publication_state
  CHECK (
    (status = 'draft' AND published_at IS NULL)
    OR (status = 'published' AND published_at IS NOT NULL)
  );
```

Example manual import from **PowerShell** with the MySQL client installed (the import itself runs through Command Prompt so SQL file redirection works):

```sh
cmd.exe /c "mysql --host=YOUR_AIVEN_HOST --port=YOUR_AIVEN_PORT --user=YOUR_AIVEN_USER --password --ssl-mode=VERIFY_CA --ssl-ca=certs\ca.pem YOUR_DATABASE < database\schema.sql"
```

The client prompts for the database password. Alternatively, use an Aiven-compatible MySQL GUI, configure its TLS CA certificate, select the target database, and run `database/schema.sql`. Never put the password on a command line or commit credentials/certificates.

## Run and verify

- The public React/Vite site runs at `http://localhost:5173` with `npm run dev`; Vite proxies `/api` requests to the Express API at `http://localhost:3000`.
- `npm run dev` starts the API with Node's file watcher.
- Set `VITE_API_URL` to `/api` for same-origin proxying or to the deployed API base URL (ending in `/api`) when hosting separately. Only this public base URL is read by React; it must never contain a database or Cloudinary secret.
- `npm start` starts the API for production.
- `npm run build` creates the production client bundle in `client/dist`.
- `npm run check` checks server JavaScript syntax and builds the client.
- `npm test` runs backend API, public site, and admin CMS behavior tests; no Aiven service is required for the test suites.
- `GET http://localhost:3000/api/health` returns `{"status":"ok","database":"connected"}` when the API can connect to MySQL. A database connection issue returns HTTP 503; an unknown route returns HTTP 404.

Set `CLIENT_ORIGIN` to the exact browser origin that is permitted to call the API. In production, provide the environment variables through the hosting provider's secret/configuration mechanism rather than a committed `.env` file.

## Admin access and API

There is no public registration endpoint. To provision the initial administrator, either provide `ADMIN_NAME`, `ADMIN_EMAIL`, and `ADMIN_PASSWORD` through a secure shell environment or an uncommitted local `.env`, or run the command below in an interactive terminal to enter any missing values. Interactive password entry is hidden and confirmed:

```powershell
npm run provision-admin
```

The script takes a MySQL advisory lock, refuses to proceed if an admin already exists, hashes the password with bcrypt, stores only the hash, and closes its database connection. The password must be at most 72 UTF-8 bytes. Do not pass real credentials as command-line arguments, commit them, or leave temporary environment values in shared environments.

Authentication uses `POST /api/auth/login`, `POST /api/auth/logout`, and `GET /api/auth/me`. Sessions are persisted in the manually created `admin_sessions` table; cookies are HTTP-only, `SameSite=Strict`, and secure in production. Deploy the browser client and API on the same site so the strict session cookie is sent; only the configured `CLIENT_ORIGIN` receives credentialed CORS access. Mutating requests from another `Origin` are rejected, and login attempts are rate limited.

Public endpoints are `GET /api/categories`, `GET /api/news` (also `/api/news/`) with `page`, `limit` (maximum 50), `q`, and category slug filters, and `GET /api/news/:slug`. They return published articles only. Admin endpoints `GET /api/admin/articles`, `POST /api/admin/articles`, `PATCH /api/admin/articles/`, and `DELETE /api/admin/articles/` require a session. PATCH and DELETE accept an `id` in the JSON body; for example, PATCH `{ "id": 12, "status": "published" }` and DELETE `{ "id": 12 }`. A published article receives a server-managed `published_at`; changing it to draft clears that timestamp. Slug collisions return HTTP 409, missing articles return 404, and invalid input returns 400.

The browser admin CMS is available at `/admin/login`, with protected dashboard, article list, create, and edit pages at `/admin`, `/admin/news`, `/admin/news/new`, and `/admin/news/:id/edit`. It verifies the server session before showing protected screens, loads dashboard counts and article data from the API, and saves editorial changes to MySQL through the admin endpoints. The editor supports draft and publish actions, unpublishing, image upload with progress, and a preview of unsaved changes. Editing loads an individual record through authenticated `GET /api/admin/articles/:id`. There is no client-side or local-storage article persistence.

Responses use `{ "data": ... }` for successful resource results and `{ "error": { "message": "...", "details": [...] } }` for errors. Public/admin list results additionally include pagination metadata.

## Image uploads

Set `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, and `CLOUDINARY_API_SECRET` in the server environment using the values from your Cloudinary account. The blank entries in `.env.example` are placeholders. All three are required together; never put the secret in frontend configuration. `UPLOAD_MAX_FILE_SIZE_MB` defaults to 5 MB and can be set from 1 through 5 MB. Restart the API after changing environment configuration.

An authenticated admin uploads one multipart file using field name `image` to `POST /api/admin/uploads`. The API ignores the supplied filename and claimed content type, checks the file signature, accepts JPEG/PNG/WebP only, and uploads from memory to `startuptn-news/articles` in Cloudinary. It returns `{ "data": { "url": "...", "provider_id": "..." } }`. Article create and update requests can store that returned URL in `cover_image_url`; MySQL stores only the URL, not image bytes. Replacing an article's image does not delete the previous Cloudinary asset, since another article may still reference it.

## Database notes

- `admins.email` and `articles.slug` are unique.
- Sessions are stored in MySQL with expiry cleanup; this is suitable for production and shared API instances.
- Article status is restricted to `draft` or `published`; new articles default to `draft`, and a check constraint requires a publication timestamp exactly when status is `published`.
- Article categories are required and cannot be deleted while referenced. Deleting an admin retains their articles and sets `admin_id` to `NULL`.
- Admin records are intentionally not seeded. Create the initial admin using the one-time secure provisioning script described above.
