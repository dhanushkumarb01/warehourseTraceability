# Phase 6 — Dispatch Validation + Exit Gate Validation

The final operational control layer. Built entirely on the existing
service / controller / route / validator architecture and design system —
no parallel implementations, no existing module changed in a breaking way.

## Control flow delivered

```
Material → Lot → QR → Mapped Bay        (already existed)
        → Dispatch Request → Approval   (Part 1)
        → Gate Scan → Validation → EXIT (Part 2)
        → Inventory + Mapping + Dispatch all updated, fully traceable
```

## Database (`backend/prisma`)

- `DispatchStatus`: `PENDING | APPROVED | REJECTED | COMPLETED | CANCELLED`.
- New `GateValidationStatus`: `PENDING | VALIDATED | DENIED | EXITED`.
- New `MappingStatus` value `DISPATCHED` — the reason a mapping closes when a
  lot leaves the warehouse (history preserved, never overwritten).
- **Dispatch** rebuilt: `dispatchNumber` (unique), `bayId`, `requestedQuantity`,
  `approvedQuantity`, `requestedBy`, `approvedBy`, timestamps
  (`createdAt/updatedAt/approvedAt/completedAt`), indexes, and a **partial
  unique index** allowing only one *open* (PENDING/APPROVED) dispatch per lot.
- New **GateValidation** model with a **partial unique index** allowing only one
  `EXITED` record per dispatch (blocks duplicate exits).
- Migration: `prisma/migrations/20260611120000_phase6_dispatch_gate`.
  The old phase-1 Dispatch placeholder (no service/UI, no data) is cleanly
  rebuilt.

## Backend

New, following existing patterns exactly (transactions, `AppError`,
`responseHelper`, audit logging, `qrPayload`, shared `actingUser` helper, and
the reused `mappingService.syncBayOccupancy`):

`utils/actingUser.js`, `services/dispatchService.js`,
`services/gateValidationService.js`, controllers, routes, validators.
Registered at `/api/dispatches` and `/api/gate-validations`.

### Dispatch API
`POST /api/dispatches` · `/:id/approve` · `/:id/reject` · `/:id/cancel` ·
`GET /api/dispatches` (`?status=`) · `/pending` · `/approved` · `/summary` ·
`/lot/:lotId/history` · `/:id`

### Gate Validation API
`POST /api/gate-validations/scan/resolve` · `/exit` ·
`GET /api/gate-validations` (`?status=`) · `/pending` · `/summary` · `/:id`

### Guarantees
Cannot dispatch non-existing / unmapped / already-dispatched lots, or quantity
> inventory. Cannot create a duplicate open dispatch. Gate exit is **denied**
(and recorded) when there is no approved dispatch, the dispatch is
rejected/cancelled/already-exited, or the lot does not match. A successful exit
atomically sets GateValidation→EXITED, Dispatch→COMPLETED, mapping→DISPATCHED,
lot→DISPATCHED and recalculates bay occupancy. Duplicate exits are blocked both
by status transition and a unique index. Audit actions: `DISPATCH_REQUESTED`,
`DISPATCH_APPROVED`, `DISPATCH_REJECTED`, `DISPATCH_CANCELLED`,
`DISPATCH_COMPLETED`, `MATERIAL_EXITED`, `GATE_EXIT_DENIED` — each with full
metadata.

## Frontend

New `Dispatch` page (stats, status tabs, create-request modal, detail/approval
modal with approve/reject/cancel) and `GateValidation` page (inventory-impact
stats, "awaiting exit" queue, gate activity log, scan-to-exit modal). New
services, `StatusBadge` extended with the dispatch/gate statuses, Sidebar +
routes added (`/dispatch`, `/gate`). Camera scanning is scan-ready: a real
scanner just feeds the decoded Material QR string to the same resolve/exit
endpoints.

## Verification done
- **28 assertions** passed against an in-memory Prisma fake covering: dispatch
  create/approve/reject/cancel, duplicate prevention, quantity validation, gate
  deny rules (not approved / rejected / duplicate exit / wrong QR type), a
  successful exit updating gate + dispatch + lot + mapping + bay occupancy,
  dashboards, history preservation, and a complete audit trail.
- Require-graph smoke test of the whole backend passes.
- All new frontend modules parse cleanly and imports resolve.
- A live `prisma migrate` / `vite build` can't run in this Linux sandbox (the
  installed Prisma/Vite native binaries are Windows-built) — run locally.

## How to run (on your machine)
```bash
cd backend
npx prisma generate
npx prisma migrate deploy     # applies the phase6 migration
npm run dev

cd ../frontend
npm run dev
```
