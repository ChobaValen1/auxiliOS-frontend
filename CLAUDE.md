
# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

A fleet management and digital remittance (remito) system for truck drivers. Features include shift logging, trip records, truck maintenance tracking, digital delivery slips with canvas signatures, and role-based access for admins, supervisors, and drivers.

## Running the Application

**Backend server:**
```bash
node server.js
# Starts Express on port 3000, serves /uploads and handles DB writes
```

**Frontend:**
- Open `Index.html` directly in a browser — no build step needed
- The frontend uses vanilla JS with no bundler or framework

**Database setup:**
```bash
psql -U postgres -d sigma_remolques -f sigma_db.sql
```

There is no `package.json`. Dependencies (Express, Multer, pg, dotenv, cors) must be installed manually:
```bash
npm install express multer pg dotenv cors
```

## Architecture

### File Overview

| File | Role |
|------|------|
| `Index.html` | Single-page app shell — all screens are defined here as hidden sections |
| `sigma.js` | All frontend logic: screen navigation, form handling, Canvas signatures, modal management |
| `supabase.js` | Supabase client — used for auth and some data queries |
| `server.js` | Express backend — file uploads (Multer) and PostgreSQL writes via `pg` |
| `sigma.css` | Dark theme UI with CSS custom properties |
| `sigma_db.sql` | Full PostgreSQL schema |

### Frontend Architecture

Screen navigation uses a "show/hide section" pattern — there is no router. All screens (`dashboard`, `registro`, `camion`, `documentos`, `remitos`) exist in the DOM and are swapped via JS.

State is held in global variables (e.g., canvas signature data, selected truck). Modals are used for creation flows and confirmations.

Canvas API is used for digital signature capture before upload.

### Backend Architecture

`server.js` handles:
- File uploads via Multer (`./uploads/remitos/`, `./uploads/firmas/`)
- PostgreSQL writes using `BEGIN`/`COMMIT`/`ROLLBACK` transactions
- Serving files at `/uploads`

`supabase.js` handles auth and some data reads in parallel with the PostgreSQL backend.

### Database Schema (6 modules)

1. **Auth:** `users`, `roles`, `permissions`, `role_permissions`, `sessions` — bcrypt passwords, RBAC
2. **Periods:** `periodos_operativos` — accounting periods; a trigger blocks writes to closed periods
3. **Operations:** `daily_logs` (shifts + KM), `trips` (individual services), `incidents` — EXCLUSION constraint prevents overlapping trips per driver
4. **Trucks:** `trucks`, `service_plans`, `maintenance_logs`, `fuel_records`, `truck_docs`, `tire_checks`
5. **Remitos:** `remitos` — delivery slips with photo/signature URLs, payment methods, conformity flags
6. **Sync:** `sync_queue` — offline-first sync queue (partially implemented)

Key DB features: generated columns for calculated fields, a trigger that auto-updates truck KM on shift close, indexes on driver/date/status.

### User Roles

- `administracion` — full access including closing periods
- `supervision` — read-only across all data
- `chofer` — own entries only, can create remitos
