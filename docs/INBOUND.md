# Inbound & Storage

One page (`/inbound`) for receiving material and putting it in a bay. It replaces three pages:
Bays & Layout (`/bays`), Materials (`/materials`, `/materials/:id`) and Bay Allocation
(`/allocation`, and the older `/mappings`). Those URLs redirect, so bookmarks keep working.

| Old URL | Goes to |
|---|---|
| `/allocation`, `/mappings` | `/inbound` (Inbound queue) |
| `/materials` | `/inbound?tab=catalogue` |
| `/materials/:id` | `/inbound?tab=catalogue&material=:id` (lots drawer open) |
| `/bays` | `/inbound?tab=layout` |

## The page

| Tab | Contents | Who can change things |
|---|---|---|
| Inbound queue | Lots on their way into a bay: awaiting arrival → pending allocation → allotted. Filters Rail / Road / Not recorded, search, Scan to place, Direct placement. | OPERATIONS records arrival and confirms placement; ALLOCATION_MANAGE allots and cancels |
| In storage | Placed lots: bay, move, remove, movement history, lot QR, bay QR | OPERATIONS |
| Catalogue | Materials (item types) with lot counts; a drawer lists each material's lots (QR, edit, delete) | MATERIAL_WRITE |
| Layout | Bays as a table with a quick **Add bay** form (code, name, zone, centre point). **Advanced…** opens the full bay form (boundary polygon, status). Zones and loading docks are under **Layout settings**. | BAY_WRITE (everyone can view) |

**Receive material** is the only way to add new stock, and it is a guided dialog:

1. **How it arrived:** Road or Rail.
2. **Road:** pick a catalogue material, or create a new one in the same form. Then enter the lot
   (code, quantity, unit, received date). Material and lot are created in one transaction, with
   `arrivalMode = ROAD`.
   **Rail:** pick the matching FOIS / SAP consignment from the pending list. No lot fields are
   typed. The supervisor reviews the record and confirms the import.
3. **Allot a bay:** opens the existing allocation dialog with the ranked suggestions
   ([BAY_ALLOCATION.md](BAY_ALLOCATION.md)). Users without ALLOCATION_MANAGE stop at
   "ready for allocation" and can view the suggestions read-only.

## Rail inbound (FOIS / SAP)

FOIS (Indian Railways Freight Operations Information System) and SAP are the authoritative records
of material arriving by rail. The warehouse imports those records and never asks anyone to re-key
them.

### Status: placeholder source

The real FOIS / SAP record shape and access method (API, database or file) are **not known yet**.
What exists today:

- `SAP_MODE=mock` (default): the mock connector serves `backend/src/sap/mock/inboundDataset.js`,
  a fixed demo dataset. The UI shows a **Demo data** tag, and demo identifiers are prefixed
  `DEMO-`.
- `SAP_MODE=http`: the http connector answers "not configured", and the UI shows "FOIS / SAP
  source unreachable" with that reason. It never shows an empty list that could be read as
  "nothing to receive".

Nothing in the code claims to integrate with real FOIS.

### `InboundConsignment` contract

Connectors return records in this shape. `src/inbound/consignment.js` normalises and validates them
in one place.

| Field | Type | Notes |
|---|---|---|
| `source` | `'FOIS' \| 'SAP'` | |
| `externalRef` | string | stable unique id in the source system |
| `materialCode`, `materialName` | string | |
| `materialType` | string \| null | null = the source did not say |
| `quantity` | number | must be > 0 |
| `unit` | string | upper-cased |
| `expectedOrArrivedAt` | ISO string \| null | |
| `meta` | object \| null | rake no., RR no., wagons…, kept verbatim |

An unusable value becomes a listed **problem**, never a default. A record with problems is shown
but can't be selected, and importing it returns 422.

### Import

`POST /api/inbound/import { source, externalRef }` (ALLOCATION_MANAGE):

1. Re-reads the record from the connector. The lot reflects the source, not what the browser sent.
2. Rejects problem records (422) and unknown records (404). If the source is unreachable it
   returns 503.
3. In one transaction:
   - Finds the material by `materialCode`. If it's missing, creates it from the record; when the
     record has no type it's stored as `UNCLASSIFIED` and shown as **Needs review** in the
     Catalogue.
   - Creates the lot: `lotCode = SOURCE-externalRef` (e.g. `FOIS-RR-2610-0451`),
     `arrivalMode = RAIL`, `receivedDate = arrivalRecordedAt = now`, `source`, `externalRef`, and
     `externalMeta = { expectedOrArrivedAt, …meta }`.
   - Writes audit `INBOUND` / `LOT_IMPORTED`.
4. Importing does **not** allot a bay. The lot enters the queue as *pending allocation* and
   follows the normal allocate → confirm workflow.

**Never twice:** `MaterialLot` has a unique index on `(source, externalRef)`. Two concurrent
imports both reach the INSERT; the loser's unique violation is returned as 409 naming the winning
lot. Manual lots keep `externalRef = NULL`, and Postgres allows any number of those.

`GET /api/inbound/pending?source=&search=` (INBOUND_VIEW = ADMIN, SUPERVISOR, OPERATOR) returns
`{ available, reason, isDemo, mode, consignments, importedCount }`. Already-imported consignments
are left out. Each pending record also includes `problems`, `importable`, `catalogueMaterial` and
the `lotCode` it would get.

## Road inbound

`POST /api/lots` accepts **either** `materialId` (unchanged) **or** a new
`material: { materialCode, materialName, materialType, … }`, but not both.

- With `material`, the material and lot are created in one transaction and `arrivalMode` is
  required.
- An existing material code returns 409 ("choose it from the list"), and nothing is created.
- Requests with only `materialId` behave exactly as before. `arrivalMode` stays optional for them.

## Schema

Migration `20261027120000_inbound_lot_source` (additive only):

- `enum LotSource { MANUAL, FOIS, SAP }`
- `MaterialLot.source` (default `MANUAL`, which backfills every existing lot),
  `MaterialLot.externalRef` (nullable), `MaterialLot.externalMeta` (Json, nullable)
- unique index `MaterialLot_source_externalRef_key`

Apply it with `npm run migrate` (`prisma migrate deploy`) against the target database. In
production this happens in Render's build command, with `PRISMA_SCHEMA_DISABLE_ADVISORY_LOCK=1`.
The backend must not be restarted on the new code until the migration is applied: the Prisma
client selects the new columns.

## Tests

```bash
cd backend
npm test                                                         # unit: normalisation, mock dataset
TEST_DATABASE_URL=postgresql://... npm run test:integration      # inbound.test.js + placement.test.js
```

`inbound.test.js` injects a fake connector (`inboundService.setConnector`) with tagged references,
so it can be re-run against the same disposable database.

## Open questions for the lead

1. **FOIS / SAP record shape and access method.** Which system, which fields, API, database or
   file, and how often? `meta` stays free-form until this is answered.
2. **Rake / wagon → lot.** Is one consignment (RR) one lot, or should each wagon be a lot?
3. **Lot split across bays.** One lot still maps to one bay. A rake that fills several bays has no
   model yet.
4. **SAP stock reconciliation on import.** Should importing check or post SAP stock?
5. **Who may import.** Today it's ALLOCATION_MANAGE (Admin, Supervisor). Should operators be
   allowed too?
6. **Correcting an imported lot.** The UI hides edit and "change arrival" for imported lots, but
   the API still allows them. Should the backend lock them?
