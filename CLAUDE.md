# CLAUDE.md

## What this is

A self-hosted Clockify replacement: a running timer, manual time entries, projects/clients/tags,
CSV export, a one-shot import from Clockify's API, and a read-only MCP server so AI agents can
read the data. Multi-user with email verification (same auth flow as Mynt). UI is Swedish only.

## Commands

```bash
dotnet run                                  # API on http://localhost:5070 (needs appsettings.Development.json)
dotnet ef migrations add <Name>             # new migration; applied automatically on startup
cd clientapp && npm install && npm run dev  # Vite on http://localhost:5174, proxies /api and /mcp to :5070
cd clientapp && npm run build               # typecheck + build
```

Copy `appsettings.Development.example.json` to `appsettings.Development.json` (gitignored) and fill in
the connection string and a JWT key (`openssl rand -base64 32`). Without SMTP settings, verification
and reset links are written to the log instead of mailed.

## Architecture

- **Backend:** ASP.NET Core 9 minimal APIs, one static `Map*Endpoints()` per file in `Endpoints/`.
  EF Core + Npgsql, single `ApplicationDbContext`. Request/response records live at the bottom of
  each endpoint file. Everything is scoped by `UserId` — there is no sharing between users.
- **Time:** stored as `timestamptz` (UTC). The browser shows local time; `User.TimeZone` decides
  which day an entry belongs to in the CSV export and in MCP tools.
- **Running timer:** a `TimeEntry` with `End == null`. A partial unique index allows at most one per
  user; `POST /api/timer/start` stops the old one first (two saves in one transaction).
- **Clockify import** (`Services/ClockifyImportService.cs`): pulls clients, projects, tags and the
  user's time entries over Clockify's REST API with the user's API key (not stored). Rows are
  matched on `ClockifyId`, so re-running updates instead of duplicating. Tasks and hourly rates are
  not imported; a timer still running in Clockify is skipped.
- **Auth:** JWT (30 days) for the SPA. Personal access tokens (`ts_…`, SHA-256 hashed) for `/mcp`
  via `ApiTokenAuthenticationHandler`. The schemes don't cross: a token can't call `/api/*`.
- **MCP** (`Mcp/TimesheetMcpTools.cs`): read-only tools `list_time_entries`, `get_time_summary`,
  `list_projects`, `get_running_timer`. Dates are `YYYY-MM-DD` in the user's time zone.
- **Frontend** (`clientapp/`): React 19 + Vite + TypeScript, TanStack Query, React Router, lucide
  icons, one plain stylesheet (`src/styles.css`, CSS variables, dark mode via prefers-color-scheme).

## Deployment

antec (10.0.20.10) via self-hosted GitHub Actions runner → `deploy.sh` → Docker Compose. Container
`timesheet` on `127.0.0.1:5103`, network `db-network`, env in `/home/deploy/.env.timesheet`.
Public at `time.forstberg.net` (Cloudflare Tunnel → Caddy). See `../infra` for the general setup.

Env file keys: `ConnectionStrings__DefaultConnection`, `Jwt__Key`, `AppUrl=https://time.forstberg.net`,
`Email__Smtp__Host`, `Email__Smtp__Port`, `Email__Smtp__Username`, `Email__Smtp__Password`, `Email__From`.
