# Phase 7 — Authentication, Authorization & RBAC

The foundational security layer. Every warehouse action is now attributable to
an authenticated user, and access is controlled by role. Built on the existing
architecture — no parallel systems, nothing existing broken.

## Database
- `User.lastLogin` added (nullable). Migration:
  `prisma/migrations/20260611140000_phase7_auth_lastlogin`.
- Existing `UserRole` enum (`ADMIN | SUPERVISOR | OPERATOR | MANAGER`) reused.

## Backend
New, reusing the project's patterns:
`config/roles.js` (role groups), `utils/jwt.js`, `utils/password.js` (bcrypt),
`utils/actingUser.js` (already added in Phase 6), `services/authService.js`,
`services/userService.js`, controllers, routes, and
`middleware/authenticate.js` + `middleware/authorize.js`. A read-only audit API
(`/api/audit-logs`) was added for ADMIN/MANAGER.

### Security
- Passwords **bcrypt-hashed** (cost from `BCRYPT_SALT_ROUNDS`); plaintext never
  stored, returned, or logged. Login returns a single generic error (no user
  enumeration).
- **JWT** signed with `JWT_SECRET` from the environment (required — no
  hardcoded fallback), with expiry. `authenticate` re-loads the user every
  request so deactivated accounts lose access immediately.
- `authorize(...)` is the single, centralised role check — no ad-hoc role logic
  in controllers. Attribution (`mappedBy`, `requestedBy`, `approvedBy`,
  `validatedBy`, material/lot audit) now comes from `req.user.id`, never the
  request body, preventing privilege/identity spoofing.
- Lock-out guards: cannot deactivate/demote the last active admin or yourself.

### Auth API
`POST /api/auth/login` (public) · `/logout` · `/register` (ADMIN) ·
`GET /api/auth/me` · `PUT /api/auth/profile` · `PUT /api/auth/password`
`GET/PUT /api/users…` + activate/deactivate (ADMIN) · `GET /api/audit-logs`
(ADMIN/MANAGER).

### Access matrix (enforced on existing routes)
| Area | Roles (write/action) |
|---|---|
| Bay management | ADMIN, SUPERVISOR |
| Material / Lot / QR generate | ADMIN, SUPERVISOR, OPERATOR |
| Mapping (map/move/remove/scan) | ADMIN, SUPERVISOR, OPERATOR |
| Dispatch create / cancel | ADMIN, SUPERVISOR, OPERATOR |
| Dispatch approve / reject | ADMIN, SUPERVISOR |
| Gate validation / exit | ADMIN, SUPERVISOR, OPERATOR |
| Audit logs | ADMIN, MANAGER |
| User management | ADMIN |

All **reads** require authentication but are open to any role (so MANAGER can
monitor). QR image/download stay public because the browser loads them via
`<img>`/`<a download>` and cannot send a Bearer header — they expose only a
non-sensitive PNG.

## Frontend
`AuthContext` (session + `can(roles)`), token store with axios interceptors
wired into `apiClient` **and** the standalone lot/material instances (token +
401→login, contracts preserved), a Login page, `ProtectedRoute` (auth + role
gating), a **role-filtered Sidebar** with user info + logout, and new
**User Management** and **Audit Logs** pages. Action buttons that a role can't
use are hidden (dispatch approve/reject, create; gate scan; mapping
map/move/remove) — MANAGER sees read-only dashboards.

## First-admin bootstrap
```bash
cd backend
# set BOOTSTRAP_ADMIN_* and a strong JWT_SECRET in .env first
npm run seed:admin     # idempotent: creates the first ADMIN if none exists
```
Default dev values are in `.env` (username `admin`, password `Admin@12345`) —
**change these for any real deployment** and rotate after first login.

## How to run
```bash
cd backend
npx prisma generate
npx prisma migrate deploy
npm run seed:admin
npm run dev

cd ../frontend
npm run dev          # you'll land on /login
```

## Verification done
- **24 assertions** passed (real bcrypt + real JWT, mock Prisma): hashing &
  verification, JWT sign/verify/tamper, the authorize role matrix
  (supervisor/operator/manager/no-user), createUser hashing + sanitization,
  duplicate rejection, login success + `lastLogin` + token, generic login
  failures, inactive-account block, change-password guard, and the authenticate
  middleware (valid / invalid / inactive).
- All new frontend modules + the restructured App/Sidebar parse cleanly with
  resolved imports.
- A live `prisma migrate` / `vite build` can't run in this Linux sandbox
  (Windows-built native binaries) — run locally.
