# ทะเบียนและติดตาม ว804

Separate application in the existing Codex workspace and existing repository branch `codex/w804-migration`. Source is only in `w804/`. No edits to the announcement application or the original AppDeploy deployment.

Reference app: https://w804-test-7lro75.v2.appdeploy.ai/ (read-only backup).

## Run

`npm ci --include=dev`, configure dedicated `.env` following `.env.example`, `node --env-file=.env migrate.js`, `npm run build`, `node --env-file=.env server.js`.

Render build: `cd w804 && npm ci --include=dev && npm run build`.
Render start: `cd w804 && npm start`.

Schema changes are versioned in `migrations/` and executed through Drizzle using the unpooled URL. Run migrations explicitly; server startup never seeds or imports data. Neither pooled nor direct W804 URL may point at any database other than `w804_register`. The announcement app's `DATABASE_URL` variable is never used as a fallback.

## Durable data and number allocation

Neon PostgreSQL database `w804_register`, separate role `w804_app`, separate editor password and session secret. Records, number counter, PDFs (bytea), audit and import batch history persist outside the Render filesystem. No SQLite, disk or browser storage fallback.

001–036 are reserved as metadata without fabricating registry rows. First new issue is 037. Counter row locks, unique number constraints and request-key idempotency prevent duplicate numbers. Counter increment, new record, audit and optional Form 1 attachment commit together. Cancellation retains the row and number, and database triggers disallow changing numbers, deletion or restoring cancelled records.

## Scope

Preserves the original blue/green cards, Form 2 statistics, monthly chart, register columns, edit/receipt/cancel dialogs and mobile record cards. Adds search/status/unit filters, reviewed Master import and read-only exact Inventory lookup. Does not copy embedded original sample/Master-like rows.

Original AI document extraction is not connected in this migration. Uploading/reading saved PDFs and manual review/entry work; no automatic PDF-to-Master import or guessed extraction.

## Tests

`npm test`: domain, import format, Inventory mapping and HTTP permissions.

`node --env-file=.env --test tests/*.test.js`: additionally exercises real PostgreSQL transactions, numbering, row locks, cancellation, PDF storage and Master safeguards. All fixture rows/audit/documents/import batches are rolled back; production retains zero fabricated records and next number 037. Do not run fixture tests against an existing real 035 Master row.

See [imports/README.md](imports/README.md) for the Master import contract.
