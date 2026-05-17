# PolicyHub

Local-first desktop application for managing life, health, and general insurance
policies. Built with Electron + React + SQLite. All data stays on the user's
machine; reminders are dispatched via Nodemailer through the user's own SMTP
account.

## What the end user gets

A single installer (`.dmg` on macOS or `.exe` on Windows) that bundles:

- Node + Chromium runtime
- The full application
- SQLite + every npm dependency

The end user just double-clicks the installer once. No Node, no terminal, no
`npm install`. On first launch the app runs a **setup wizard** to collect agent
info, SMTP credentials, and reminder preferences, then opens the dashboard.

The app lives in the system tray / macOS menu bar; closing the window keeps the
scheduler running so premium reminders go out on time.

## For the developer (you) — building installers

Building requires Node 18+ and a clean clone of this project.

```bash
npm install
```

### Run in dev (Windows or macOS)

```bash
npm run dev
```

This launches Vite on `localhost:5173` and an Electron window pointing at it,
with DevTools open.

### Build a Windows installer (.exe)

Run on a Windows machine:

```bash
npm run package:win
```

Output: `release/PolicyHub Setup <version>.exe`

### Build a macOS installer (.dmg)

Run on a macOS machine:

```bash
npm run package:mac
```

Output: `release/PolicyHub-<version>.dmg` (universal — x64 + arm64).

The app is **unsigned** — see "Unsigned app first-launch" below.

### Build everything (both at once)

Only works when run from macOS (cross-compiling Windows from Mac requires Wine):

```bash
npm run package
```

## Architecture

```
src/
├── main/                  Electron main process (Node)
│   ├── main.ts            App entry: window, tray, single-instance
│   ├── tray.ts            Menu bar / system tray icon + menu
│   ├── ipc.ts             IPC handlers (renderer ↔ main)
│   ├── scheduler.ts       node-cron hourly tick
│   ├── email.ts           Nodemailer + reminder logic
│   ├── crypto.ts          safeStorage password encryption
│   ├── db.ts              SQLite open + schema bootstrap
│   └── repo/              Drizzle queries (policies, payments, ...)
├── preload/
│   └── preload.ts         contextBridge: window.policyhub.* API
├── shared/                Code used by both processes
│   ├── db/schema.ts       Drizzle schema (single source of truth)
│   ├── types.ts           Inferred types + helpers
│   ├── installments.ts    Premium-schedule generator
│   ├── ipc.ts             IPC channel names
│   └── validation.ts      Zod schemas
└── renderer/              React UI (no Node access)
    ├── App.tsx
    ├── components/
    │   ├── ui/            shadcn-style primitives
    │   └── ...
    ├── pages/             One file per page
    └── lib/               UI helpers
```

### Data flow

The renderer never touches `better-sqlite3` directly. All DB calls go through
`window.policyhub.*` (defined in `src/preload/preload.ts`), which sends an IPC
message to handlers in `src/main/ipc.ts`, which call the repositories in
`src/main/repo/*`.

### Where data lives

| OS      | Path                                                          |
| ------- | ------------------------------------------------------------- |
| macOS   | `~/Library/Application Support/PolicyHub/policies.db`         |
| Windows | `%APPDATA%\PolicyHub\policies.db`                             |
| Linux   | `~/.config/PolicyHub/policies.db`                             |

This is `app.getPath('userData')` — Electron picks the right place per OS.

### Currency & dates

- Currency is stored as **integer paise** in SQLite. Conversion happens at the
  UI boundary (`paiseToRupees` / `rupeesToPaise`). This avoids float drift.
- Dates are stored as ISO `yyyy-MM-dd` strings. Display uses `dd MMM yyyy`.

### SMTP password security

The SMTP password is encrypted at rest using Electron's `safeStorage` API
(macOS Keychain / Windows DPAPI / `libsecret` on Linux). In environments where
`safeStorage.isEncryptionAvailable()` returns false (some Linux setups), the
code falls back to base64 with a `PLAIN:` prefix so it's at least obvious — but
that mode should be avoided in production.

## First-run setup wizard

On first launch (when `settings.setup_complete = 0`), the app shows a 5-step
wizard that collects:

1. Agent name + email
2. SMTP host / port / user / password (optional — can be skipped)
3. Reminder offsets (default `30, 14, 7, 1` days)
4. Start-at-login toggle
5. Confirmation

The wizard writes settings to the local DB and flips `setup_complete = 1`, then
takes the user to the dashboard. All settings can be edited later from the
Settings page.

## Reminder scheduler

`node-cron` runs at minute 0 of every hour while the app process is alive
(including when the window is hidden in the tray).

Each tick:

1. Flip any `pending` rows whose `due_date < today` to `overdue`.
2. For each pending/overdue installment, calculate `days_until_due`.
3. **Due-soon:** if `days_until_due` is in `reminder_offsets_days` AND no
   `reminder_log` row exists for `(payment_id, days_before_due)`, send the
   due-soon template and log it.
4. **Overdue:** group by `overdue_reminder_interval_days` buckets so the user
   doesn't get spammed every hour for the same policy.
5. Recipients are determined by `reminder_recipient` (agent / client / both).

The "Send pending reminders now" button on the Reminders page (and the tray
menu) runs the same code path immediately.

## Unsigned app first-launch

This build is unsigned (no Apple Developer / no Windows code-signing cert).
First launch on each OS shows a warning that can be bypassed:

- **macOS:** right-click the `.app` and choose **Open**, then confirm. If
  blocked by Gatekeeper, open System Settings → Privacy & Security and click
  "Open anyway".
- **Windows:** SmartScreen will show "Windows protected your PC". Click
  "More info" → "Run anyway".

For shipping to clients or to the App Store / Microsoft Store, configure
signing in `package.json > build`.

## Scripts

| Command              | What it does                                        |
| -------------------- | --------------------------------------------------- |
| `npm run dev`        | Vite + Electron in dev mode with hot reload         |
| `npm run build`      | Type-check & bundle main and renderer for packaging |
| `npm run package`    | Produce installers for all 3 OSes (from a Mac)      |
| `npm run package:mac`| Produce a `.dmg` (macOS only)                       |
| `npm run package:win`| Produce a `.exe` installer (Windows only)           |
| `npm run db:seed`    | Seed `./dev-data/policies.db` with sample data      |
| `npm run typecheck`  | Run TypeScript across renderer and main             |

## Backup & restore

From **Settings → Data**:

- **Backup database** — copies the `policies.db` SQLite file to a location of
  your choice.
- **Export all data as JSON** — writes a single JSON file with every table
  (useful for human-readable archives / migrating between machines).

To restore, replace the `policies.db` file at the userData path while the app
is closed.

## Tech stack

- **Electron 32** — desktop wrapper (single-instance, tray)
- **Vite 5 + React 18 + TypeScript** — renderer
- **Tailwind CSS + shadcn/ui-style primitives** — UI
- **better-sqlite3** — embedded local database
- **Drizzle ORM** — typed queries
- **React Hook Form + Zod** — forms + validation
- **TanStack Table** — listed in deps; not yet wired into pages (the current
  pages use plain `<Table>` markup — swap in when sorting/pagination grows)
- **date-fns** — date math
- **node-cron** — hourly scheduler
- **Nodemailer** — SMTP delivery
- **sonner** — toasts
- **electron-builder** — `.dmg` / `.exe` / AppImage packaging
