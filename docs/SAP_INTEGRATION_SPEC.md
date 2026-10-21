# SAP Integration Specification

**Audience:** Client SAP / ERP integration team
**System:** Warehouse Traceability Platform (SAIL)
**Status:** Integration layer implemented against a simulated SAP; ready to
connect to a real SAP landscape via configuration only.

---

## 1. Integration Architecture

The warehouse is **decoupled** from SAP. No warehouse module calls SAP directly;
all communication flows through a dedicated integration layer:

```
Warehouse modules (Dispatch, Gate, Material)
        │
        ▼
Integration Layer  (validation • sync • retry • logging • mapping)
        │
        ▼
SAP Connector  (interface: mock | http)
        │
        ▼
SAP gateway / ERP  (mock today → real SAP at go-live)
```

Key components (backend `src/sap/`):

| Component | Responsibility |
|---|---|
| `connectors/` (`mockConnector`, `httpConnector`, factory) | One interface, two implementations. `SAP_MODE` selects which. |
| `sapValidationService` | Dispatch-approval & gate-exit validation against SAP. |
| `sapSyncService` | Material / inventory / dispatch / status sync with retry + logging. |
| `sapRetryHandler` | Bounded exponential-backoff retries for transient failures. |
| `sapLogService` | Persists `SAPSyncLog` / `SAPValidationLog`; dashboard aggregation. |
| `sapMappingUtils` | Field mapping warehouse ↔ SAP. |
| `mock/` | Simulated ERP (dataset, service, and public `/sap` REST endpoints). |

**Migration is a configuration change**, not a code change: set `SAP_MODE=http`,
`SAP_BASE_URL`, and credentials. The `httpConnector` already speaks the same
contract as the mock.

---

## 2. SAP APIs Expected From the Client

The client must expose (or allow us to call) the following REST endpoints. These
mirror the mock at `/sap` exactly. Base path is configurable (`SAP_BASE_URL`).

### Material APIs
- `GET /materials` — list materials
- `GET /materials/{materialNumber}` — single material master

### Inventory APIs
- `GET /inventory` — list stock
- `GET /inventory/{materialNumber}` — stock for a material

### Lot / Batch APIs
- `GET /lots` — list batches
- `GET /lots/{batchNumber}?materialNumber=...` — single batch

### Dispatch (Outbound Delivery) APIs
- `GET /dispatches` — list deliveries
- `GET /dispatches/{deliveryNumber}` — single delivery
- `POST /dispatches` — create an outbound delivery

### Validation APIs
- `POST /validate/material` — `{ materialNumber }`
- `POST /validate/inventory` — `{ materialNumber, quantity }`
- `POST /validate/dispatch` — `{ deliveryNumber?, materialNumber, batchNumber, quantity }`

### Authentication API
- Token endpoint (OAuth 2.0 client-credentials) **or** a static API key.
  The connector attaches `Authorization: Bearer <token>` and `x-api-key`.
  A health probe (`GET /health`) is used for the connection indicator.

---

## 3. Required Fields

**Material** — `materialNumber` (key), `description`, `materialType`,
`status` (`RELEASED | BLOCKED | QUALITY_HOLD`), `baseUnit`, `plant`.

**Lot / Batch** — `batchNumber` (key), `materialNumber`, `quantity`, `unit`,
`status` (`UNRESTRICTED | BLOCKED | QUALITY_INSPECTION`).

**Inventory** — `materialNumber`, `plant`, `unrestrictedQty`, `blockedQty`, `unit`.

**Dispatch (Outbound Delivery)** — `deliveryNumber` (key), `materialNumber`,
`batchNumber`, `quantity`, `unit`, `status`
(`CREATED | APPROVED | COMPLETED | REJECTED`).

**Status** — material/batch lifecycle status as above; used to gate dispatch and
exit.

---

## 4. Sample Request Payloads

```http
POST /validate/dispatch
Authorization: Bearer <token>
Content-Type: application/json

{
  "deliveryNumber": null,
  "materialNumber": "MAT-1001",
  "batchNumber": "LOT-1001-A",
  "quantity": 1000
}
```

```http
POST /dispatches
{
  "warehouseDispatchNumber": "DSP-20260611-120355-318",
  "materialNumber": "MAT-1001",
  "batchNumber": "LOT-1001-A",
  "quantity": 1000,
  "unit": "KG"
}
```

---

## 5. Sample Response Payloads

```json
// GET /materials/MAT-2002
{ "materialNumber": "MAT-2002", "description": "Recalled Polymer Resin",
  "materialType": "RAW", "status": "BLOCKED", "baseUnit": "KG", "plant": "1000" }
```

```json
// POST /validate/dispatch  (failure)
{ "valid": false, "materialStatus": "BLOCKED", "deliveryStatus": null,
  "reasons": ["Material MAT-2002 is BLOCKED in SAP."] }
```

```json
// POST /validate/inventory  (success)
{ "valid": true, "available": 5000,
  "inventory": { "materialNumber": "MAT-1001", "unrestrictedQty": 5000, "unit": "KG" },
  "reasons": [] }
```

---

## 6. Error Handling Strategy

- **Validation failure** (material blocked, inventory short, delivery rejected)
  → the warehouse operation is **BLOCKED** with the SAP reasons surfaced to the
  operator. SAP remains the system of record.
- **Transient transport failure** (timeout, 5xx, connection refused) → retried
  by the retry handler (below). If still failing, the operation **fails safe**:
  a **WARNING** is recorded and the operation is allowed, so an ERP outage never
  halts the warehouse. This can be made strict (`SAP_BLOCK_ON_UNAVAILABLE=true`)
  to fail closed.
- **Every** validation and sync attempt is persisted (`SAPValidationLog` /
  `SAPSyncLog`) and audit-logged (module `SAP`), so failures are fully visible
  in the SAP dashboard and never silently lost.

HTTP status mapping consumed from SAP: `2xx` success; `4xx` deterministic
business error (not retried); `5xx` / timeout transient (retried); `503` is the
explicit "SAP unavailable" signal.

## 7. Retry Strategy

Bounded **exponential backoff**, configured via environment:

- `SAP_MAX_RETRIES` (default 3)
- `SAP_RETRY_BASE_DELAY_MS` (default 200 ms) → delays 200ms, 400ms, 800ms…
- Only transient errors are retried; deterministic 4xx are not.
- The attempt count is persisted on `SAPSyncLog.attemptCount`, and the request
  payload is retained so a `FAILED` sync can be retried later from the dashboard
  (or by a future background job) without data loss.

## 8. Security Requirements

- **No hardcoded credentials** — `SAP_API_KEY` / `SAP_CLIENT_ID` /
  `SAP_CLIENT_SECRET` / `SAP_BASE_URL` come from the environment per landscape.
- **No direct ERP coupling** — only the connector layer knows SAP exists.
- **Least exposure** — warehouse-facing SAP APIs (`/api/sap`) require auth and
  are restricted to ADMIN/MANAGER (reads) and ADMIN (sync/retry).
- **Secure logging** — payloads are stored for traceability; do not log secrets.
  Use TLS for the real SAP gateway. Rotate keys/tokens per policy.
- **Transport** — OAuth client-credentials recommended; tokens cached and
  refreshed inside the connector's auth hook.

## 9. Deployment Considerations

- Node 18+ (the http connector uses built-in `fetch`; no extra dependency).
- Set `SAP_MODE=http` and point `SAP_BASE_URL` at the SAP gateway / middleware
  (e.g. SAP BTP, PI/PO, or an API-management layer).
- Remove/disable the mock `/sap` router in production (it is only mounted to
  simulate the external system).
- Network: allow-list the warehouse egress to the SAP gateway; inbound is not
  required.
- Observability: the SAP dashboard (`/sap-integration`) plus the audit trail
  provide operational visibility; forward `SAPSyncLog`/`SAPValidationLog` to your
  monitoring stack if desired.

## 10. Migration Path: Mock SAP → Real SAP

1. **Confirm the contract** — the client implements (or maps middleware to) the
   endpoints in §2 with the fields in §3. The mock `/sap` endpoints are the
   reference implementation to test against.
2. **Provision credentials** — set `SAP_BASE_URL`, `SAP_API_KEY` (or OAuth
   client id/secret) in the target environment.
3. **Switch the connector** — set `SAP_MODE=http`. No application code changes.
4. **Field mapping** — if SAP field names differ, adjust only
   `src/sap/sapMappingUtils.js`.
5. **Auth** — if OAuth is used, implement the token fetch in the connector's
   request hook (single, isolated location).
6. **Validate** — run dispatch-approval and gate-exit flows in a staging
   landscape; confirm `SAPValidationLog` and `SAPSyncLog` entries.
7. **Cut over** — enable strict mode (`SAP_BLOCK_ON_UNAVAILABLE`) if the business
   requires SAP to be authoritative even during outages.

---

## Appendix A — Enforcement modes

| Scenario | Default (fail-open) | Strict (`SAP_BLOCK_ON_UNAVAILABLE=true`) |
|---|---|---|
| SAP validation fails (blocked/short) | **BLOCK** | **BLOCK** |
| SAP unreachable after retries | **WARN → allow** | **BLOCK** |
| SAP healthy & checks pass | **ALLOW** | **ALLOW** |

## Appendix B — Audit actions (module `SAP`)

`SAP_VALIDATION_REQUESTED`, `SAP_VALIDATION_PASSED`, `SAP_VALIDATION_WARNING`,
`SAP_VALIDATION_FAILED`, `DISPATCH_BLOCKED_BY_SAP`, `GATE_EXIT_BLOCKED_BY_SAP`,
`SAP_SYNC_STARTED`, `SAP_SYNC_COMPLETED`, `SAP_SYNC_FAILED`, `SAP_RETRY_EXECUTED`.
