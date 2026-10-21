# Phase 5 — Material → Bay Mapping

Production-ready Material-to-Bay Mapping module. Built on the existing
service/controller/route/validator architecture — no existing functionality was
changed in a breaking way.

## What was added

### Database (`backend/prisma`)
- `MaterialBayMapping` extended: `unmappedAt`, `updatedAt`, new `UNMAPPED`
  status, plus indexes and a **partial unique index** guaranteeing a lot can
  have at most one `ACTIVE` mapping (a lot can never be in two bays at once).
- `MappingStatus` enum: `ACTIVE | MOVED | UNMAPPED`.
- New migration: `prisma/migrations/20260610120000_phase5_material_bay_mapping`.
- `binaryTargets` added to the Prisma generator (`native` + Linux) so the same
  client runs in containerised deployments. **`native` keeps Windows working.**

### Backend
- `services/mappingService.js` — all logic, every write wrapped in a Prisma
  transaction (mapping + lot status + bay occupancy + audit log are atomic).
- `controllers/mappingController.js`, `routes/mappingRoutes.js`,
  `validators/mappingValidators.js`, `utils/qrPayload.js`.
- Registered at `app.use('/api/mappings', …)`.

#### API
| Method | Path | Purpose |
|---|---|---|
| POST | `/api/mappings` | Create (place) a mapping |
| POST | `/api/mappings/move` | Move a lot to another bay (history-preserving) |
| POST | `/api/mappings/remove` | Remove a lot from its bay |
| POST | `/api/mappings/scan/resolve` | Dual-QR: identify entities (no commit) |
| POST | `/api/mappings/scan` | Dual-QR: place/relocate via scan |
| GET | `/api/mappings/inventory` | All active inventory |
| GET | `/api/mappings/inventory/summary` | Per-bay active counts (yard map) |
| GET | `/api/mappings/bay/:bayId/inventory` | Inventory for one bay |
| GET | `/api/mappings/lot/:lotId/location` | Current location of a lot |
| GET | `/api/mappings/lot/:lotId/history` | Full movement history |
| GET | `/api/mappings/lot/:lotId/active` | Current active mapping |

Audit actions logged (module `MAPPING`): `MATERIAL_MAPPED_TO_BAY`,
`MATERIAL_MOVED_BETWEEN_BAYS`, `MATERIAL_REMOVED_FROM_BAY` — each with full JSON
metadata for reconstruction.

### Frontend
- `services/mappingService.js`.
- New page `pages/MaterialMapping` (active inventory, map/move/remove, history),
  reachable from the sidebar (“Material Mapping”) and `/mappings`.
- `components/MappingModal` (manual map/move), `components/ScanMappingModal`
  (dual-QR, scan-ready), `components/MovementTimeline` (reusable trail).
- Inventory-aware enhancements: `BayInfoPanel`, `BayDetailModal` (Materials
  Stored), `LotDetailModal` (Current Location + Movement History),
  `YardLayoutView` (real lot counts), `DigitalYardMap` (Lots Stored stat +
  summary). `ConfirmDialog` got backward-compatible label props.

## How to run it (on your machine)

```bash
# 1. Backend — apply schema changes
cd backend
npx prisma generate          # picks up new binaryTargets + model
npx prisma migrate deploy    # applies the phase5 migration
npm run dev

# 2. Frontend
cd ../frontend
npm run dev
```

> The migration is additive and safe to run on the existing database. The new
> `updatedAt` column backfills existing rows via a default.

## Verification done
- Backend state machine verified with 30 passing assertions against an
  in-memory Prisma fake: create → move → remove, history preservation,
  single-active invariant, inactive-bay rejection, bay-occupancy sync, dual-QR
  resolve/commit (MAP vs MOVE), wrong-QR rejection, and all read endpoints.
- All new frontend modules parse cleanly. (A live `vite build`/`prisma migrate`
  could not run in the build sandbox because the native Linux binaries differ
  from your Windows install — run the commands above locally to build.)

## Dual-QR workflow (scan-ready)
Camera scanning is not wired yet, but the infrastructure is ready: each scan
station accepts the exact JSON payload a scanner decodes (or a "simulate scan"
picker). When a real scanner is added it simply feeds the decoded string to the
same `resolve`/`commit` endpoints — no other change needed.
