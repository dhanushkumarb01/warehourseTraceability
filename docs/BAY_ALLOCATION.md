# Material Bay Allocation

Records how an incoming lot arrived (rail or road), suggests where to store it, and lets a
supervisor allot a bay that an operator then confirms as physically placed. The workflow lives on
the **Inbound & Storage** page (`/inbound`, see [INBOUND.md](INBOUND.md)); `/allocation` and
`/mappings` redirect there. Mapping, move, remove, scan and movement history are unchanged.

Rail lots imported from FOIS / SAP arrive with `arrivalMode = RAIL` already recorded, so they start
at *pending allocation*.

## Workflow

| Stage | Meaning | Who acts |
|---|---|---|
| Awaiting arrival mode | `MaterialLot.arrivalMode` is null | OPERATIONS records Rail / Road |
| Pending allocation | arrival recorded, no open allocation, not placed | ALLOCATION_MANAGE (Admin, Supervisor) allots a bay |
| Allotted | open `BayAllocation` (status `ALLOCATED`) | OPERATIONS confirms placement; ALLOCATION_MANAGE may cancel |
| Placed | active `MaterialBayMapping` | existing move / remove / history |

- Arrival mode can also be set when a lot is created. It is locked once a bay is allotted, and
  once placed it can only be filled in if it was never recorded (historic lots).
- Confirming placement goes through `mappingService.createMappingInTx`, the same code as manual
  mapping and QR scan, so lot status, bay occupancy and the audit trail behave identically.
- While a lot is allotted, mapping it to any **other** bay (manual or scan) is rejected with 409.
  Scanning it into the allotted bay counts as confirming placement.
- Audit actions (module `PLACEMENT`): `ARRIVAL_MODE_RECORDED`, `BAY_ALLOCATED`,
  `ALLOCATION_PLACED`, `ALLOCATION_CANCELLED`. Placement also writes the usual
  `MATERIAL_MAPPED_TO_BAY` (module `MAPPING`) with the `allocationId`.

### Concurrency and integrity

- Every allocate / confirm / cancel / map transaction first takes `SELECT … FOR UPDATE` on the lot
  row, so decisions for one lot are serialised.
- A partial unique index `BayAllocation_lot_open_unique` (one `ALLOCATED` row per lot) backs this
  at the database level; a violation is returned as 409.
- Bays still hold any number of lots (existing behaviour); there is no capacity model.
- Docks referenced by allocations, zones with bays or docks, and lots with allocation history
  cannot be deleted.

## Warehouse layout and distances

| Entity | Coordinates | Other configuration |
|---|---|---|
| Bay | existing `latitude` / `longitude` (required) | `zoneId` links to `Zone`; `zone` label kept |
| Zone | optional reference point | `railConnected`, `roadConnected`: `true` / `false` / `null` (not configured) |
| Loading dock | optional until surveyed | zone (or shared), `arrivalModes` (empty = not configured), Active/Inactive |

The migration created one `Zone` per existing `Bay.zone` label and linked every bay. Creating a bay
with a new zone name registers the zone (name only). Renaming a zone renames its bays' label in the
same transaction.

Distance is the **Haversine great-circle distance** between the bay and the relevant dock, in
metres. It is a straight-line proxy for proximity, **not** the road, rail or indoor travel distance.
Missing coordinates never become 0: the bay is listed as "without a distance", with the reason.

## Recommendation method (static placeholder)

`backend/src/placement/` holds three swappable parts:

| File | Role |
|---|---|
| `geo.js` | coordinate validation, Haversine distance |
| `demandProvider.js` | demand level per lot. **Placeholder**: reads `PLACEMENT_MOCK_DEMAND` (material code → material type → default). A supervisor can also pick a what-if level in the dialog (`MANUAL_OVERRIDE`). |
| `recommendationEngine.js` | pure, deterministic ranking (`STATIC_DISTANCE_DEMAND_V1`) |

Ranking:

1. **Exclude** inactive bays, and bays whose zone is explicitly not reachable by the lot's arrival
   mode (`railConnected=false` for rail, `roadConnected=false` for road). Unconfigured = no rule.
2. **Relevant dock**: active docks that receive the arrival mode (unconfigured modes accepted),
   preferring docks of the bay's own zone, else shared docks; never another zone's dock. The nearest
   one with coordinates is used.
3. **Rank** bays that have a distance: position in the distance order (0 = nearest) is compared with
   a demand target (High → nearest, Medium → middle, Low → farthest). Empty bays come first
   (`PLACEMENT_PREFER_EMPTY_BAYS`), then demand fit, distance and bay code. The top
   `PLACEMENT_RECOMMENDATION_COUNT` are the suggestions.

Each allocation stores the rank, straight-line distance, dock, demand level, demand source and
method id, so the placeholder's suggestions can later be compared with the real model.

**Replacing it with the demand model:** implement the `getDemand({ lot, material, override })`
contract in a new provider (set it with `placementService.setDemandProvider`, or swap the default in
`placementService.js`). If the model ranks bays itself, replace `recommendBays` while keeping its
output shape; the API and UI need no change.

## Decisions still open

These are configurable today and deliberately left unset. Nothing is assumed:

- Which zones each rail line actually reaches (`Zone.railConnected`), and whether lots must record
  *which* rail line or siding they arrived on. Only Rail / Road is captured now.
- Number and location of loading docks per zone, and their surveyed coordinates.
- Whether straight-line distance is an acceptable proxy, or real route distances (aisle graph,
  measured travel times) are needed.
- Bay capacity. Bays currently accept any number of lots; empty bays are only *preferred*.
- Whether recommendations should also cover relocation of stored lots (currently incoming only).
- The real demand definition (dispatch frequency window, per material vs. material type) that will
  replace `PLACEMENT_MOCK_DEMAND`.

## Tests

```bash
cd backend
npm test                                                        # unit: geo, demand provider, engine
TEST_DATABASE_URL=postgresql://... npm run test:integration     # HTTP + DB: workflow, roles, concurrency
```

The integration suite needs a disposable database with all migrations applied. It never runs
against `DATABASE_URL`.
