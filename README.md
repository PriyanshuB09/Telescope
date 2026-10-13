# REBUILT Scout

Mobile-first FRC scouting workspace for the 2026 REBUILT game. The current checkpoint is the authenticated framework foundation; scouting and event workflows are organized as the next phases below.

## Start it in Codex on Windows

From the repository root, run:

```powershell
.\run.ps1
```

The script installs Bun for the current Windows user if needed, runs `bun install`, links a Convex development deployment, configures Convex Auth signing keys once, then starts Vite and Convex together. On first run, sign in to Convex and select your **personal team** when prompted. Convex CLI writes the local URL and generates backend types before starting Vite. The one-time auth setup marker is local and ignored by Git.

Other scripts:

```sh
bun run dev          # Vite only
bun run dev:convex   # Convex development deployment only
bun run dev:all      # Run both processes together
bun run build        # TypeScript project build and production Vite build
bun run typecheck    # Strict TypeScript check
bun run lint         # Oxlint
```

The Vite development server uses `http://localhost:5173`. Set `VITE_CONVEX_URL` in `.env.local` to the URL printed by Convex CLI. Never put server secrets in a `VITE_` variable.

## Convex Auth and first administrator

Authentication uses first-party Convex Auth with username/password. Sign-in asks for username and password; sign-up asks for username, display name, password, and password confirmation. Usernames are normalized to lowercase and must be 3–32 characters using letters, numbers, dots, underscores, or hyphens. New signups receive scout access; the browser cannot submit or choose a role. Convex Auth's password provider requires an email-shaped account key, so the server derives a non-deliverable `@users.invalid` identifier from the username. The application does not collect or send email.

To authorize the first administrator, set the deployment-side `ADMIN_BOOTSTRAP_USERNAME` to the scout lead's username:

```sh
bunx convex env set ADMIN_BOOTSTRAP_USERNAME scoutlead
```

Create/sign in to that account. While there are no admins, the authenticated account matching that deployment variable can use **Enable admin** once. The Convex mutation checks identity, configured username, and the no-existing-admin condition on the server. Later role changes should be an auditable admin-only workflow.

Convex Auth signing keys are deployment secrets. The launcher configures them on first setup. If you delete the local setup marker or create a new deployment, run:

```sh
bunx @convex-dev/auth --web-server-url http://localhost:5173
```

Never commit `.env.local`, Convex deployment files, API keys, or signing keys. Store the TBA API key as a Convex environment variable when event import is implemented.

## Architecture plan

- **Frontend:** React + strict TypeScript, Vite, React Router 7 in SPA mode, Tailwind CSS v4, shadcn/ui `base-nova` using Base UI, CSS-variable themes, Lucide, next-themes, and shadcn Sonner.
- **Backend:** Convex is the source of truth for accounts, events, scouting submissions, assignments, and pick lists. Queries are live Convex queries and writes are Convex mutations/actions. No parallel API server.
- **Authentication and authorization:** Convex Auth at the root. Every protected Convex operation derives the user from `ctx.auth` and enforces role/ownership on the server. Route gates only control navigation and do not replace backend checks.
- **Client state:** Zustand holds temporary UI interaction state only (selected team, active route, and sidebar state). It does not cache Convex results.
- **Raw observations:** Store Fuel counts, Hub state, Tower attempts/outcomes, ratings, tags, and notes as submitted. Derive analytics separately with explicit denominators and sample sizes.

## Proposed Convex schema

The foundation currently adds Convex Auth tables and a `role` field to `users`. Add domain tables incrementally, each with timestamps and event-scoped indexes:

- `events`: TBA event key, display metadata, import status and summary.
- `eventTeams`: event ID, TBA team key, number, nickname, location.
- `matches`: event ID, TBA match key, match number/time, red/blue team references.
- `pitScoutingReports`: event/team/author IDs and raw capability answers/notes.
- `matchAssignments`: event/match/team/scout IDs and assignment state; a composite index enforces one current owner.
- `matchScoutingReports`: event/team/match/author IDs and raw autonomous, teleop, Hub, Tower, rating, tag, and note fields.
- `personalPickLists` / `personalPickListEntries`: owner-scoped lists, tiers, and order.
- `primaryPickLists` / `primaryPickListEntries`: admin-controlled ordering kept separate from personal lists.
- `pickListMerges` / `pickListMergeSources`: saved consensus configuration, preview inputs, result, and applying admin.

Indexes support event, team, match, author, owner, assignment, and list lookups. Reimport uses idempotent TBA keys and does not delete reports. Authorization is checked inside each public function. Raw observations are not duplicated into derived statistics or pick-list entries.

## Routes and shared contracts

- `/sign-in`
- `/` dashboard, including the no-event empty state
- `/teams` and a team-detail modal/URL state
- `/pit` and `/pit/:teamId`
- `/matches` and `/matches/:matchId/scout`
- `/pick-lists` and `/pick-lists/:listId`
- `/admin/event`, `/admin/primary-pick-list`, `/admin/merge`, `/admin/users`

Convex-generated API references and schema-derived types are canonical. Planned contracts include `users.currentUser`, role-checked event import action + idempotent batch mutation, paginated event/team/match queries, owner-derived pit report upsert, atomic match assignment claim, assignment-owned report submission, and separate personal/admin pick-list mutations. Analytics return `{ value, sampleSize }` and do not treat missing reports as zero.

## Implementation phases and ownership

1. **Foundation/auth (current):** project setup, Convex Auth, scout/admin role boundary, theme/toasts, route shell, UI-only store, and launch scripts.
2. **Event import:** admin event page, server-side TBA action, validation, idempotent upserts, and import status.
3. **Scouting:** teams/detail, pit form, atomic match assignment, match form, and raw reports.
4. **Analytics:** reusable Convex calculations, denominators, sample sizes, and missing-data states.
5. **Pick lists:** personal lists, drag-and-drop board, primary list, deterministic consensus preview/apply.
6. **Hardening/deployment:** permission/data-integrity checks, responsive QA, deployment docs, and TBA secrets.

For parallel implementation, first agree on the schema and generated types. Assign one owner each to Convex/auth, TBA import, scouting UI, pick lists/consensus, and integration. The initial schema/auth boundary must land before those workstreams; merge interfaces are reviewed by the integration lead before parallel edits touch shared modules.

## Next setup inputs

- Convex account sign-in and selection of the personal team happen in the local CLI.
- Choose the first admin username and set `ADMIN_BOOTSTRAP_USERNAME` on the development deployment.
- Add the TBA API key to Convex environment variables when the import phase begins.
