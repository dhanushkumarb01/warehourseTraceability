# WareTrace — Technical Reference

This document describes how WareTrace is built, configured and deployed. Everything here was read
from the code in this repository or verified by running it. For a short getting-started guide see
the [README](../README.md).

Contents:
[Architecture](#architecture) ·
[Tech stack](#tech-stack) ·
[Repository layout](#repository-layout) ·
[Backend](#backend) ·
[API routes](#api-routes) ·
[Database](#database) ·
[AI worker](#ai-worker) ·
[Environment variables](#environment-variables) ·
[Deployment](#deployment) ·
[Security](#security) ·
[Known limitations](#known-limitations) ·
[Troubleshooting](#troubleshooting)

---

## Architecture

```mermaid
flowchart LR
  subgraph Client
    browser[Browser]
  end
  subgraph Vercel
    spa[frontend SPA<br/>static build]
  end
  subgraph Render
    api[backend API<br/>Express 5 + Prisma]
    disk[(storage/<br/>ephemeral disk)]
  end
  neon[(Neon PostgreSQL)]
  subgraph "Worker host (laptop / server)"
    worker[ai-service worker<br/>pipelines + Flask :8600]
    agent[ngrok agent]
  end
  cams[IP cameras / webcams /<br/>uploaded demo videos]
  edge[ngrok edge<br/>static domain]

  browser -->|HTML/JS| spa
  browser -->|REST + Bearer JWT| api
  api --> neon
  api --> disk
  worker -->|GET jobs, faces, videos<br/>POST alerts, heartbeat<br/>X-Service-Token| api
  api -->|POST /faces/embed<br/>X-Service-Token| edge
  edge --> agent --> worker
  cams --> worker
```

The browser loads the SPA from Vercel and calls the API directly (`VITE_API_BASE_URL`); CORS on the
API allows only the origins in `FRONTEND_URL`. The API is the only component that talks to the
database. The AI worker never accepts camera jobs pushed to it: it **pulls** its job list from the
API, reads frames from each camera itself, and **pushes** alerts and heartbeats back. The single
inbound call to the worker is face enrollment, which is why the worker needs a public URL (the
ngrok static domain) when the API runs in the cloud.

In the Docker Compose stack the same components run as containers on one network: `db`
(postgres:16), `backend`, `frontend` (nginx), `ai-worker`, and optionally `ngrok`.

### AI pipeline (job pull → detect → rules → alert → heartbeat)

1. `CameraManager` calls `GET /api/surveillance/ai/cameras` at start and every
   `AI_JOB_REFRESH_SEC` (20 s). Each job carries the camera id, a resolved capture source
   (`file` path plus `videoUrl`, `stream` URL with credentials, or `webcam` index) and the AI
   config. A pipeline thread is started, restarted or stopped when a job's signature changes.
2. For an uploaded video, if the backend's file path does not exist on the worker (a different
   machine or container), the worker downloads it once from
   `GET /api/surveillance/ai/cameras/:id/video` into `ai-service/.cache/videos/` and loops it.
3. `CameraPipeline` reads frames (`VideoSource`, reconnect with exponential back-off), resizes them
   to `AI_FRAME_WIDTH`, throttles to `AI_TARGET_FPS`, and runs the detectors the camera enables:
   `MotionDetector` (OpenCV MOG2), `PersonDetector` / `VehicleDetector` (YOLOv8n), `FaceDetector`
   (InsightFace), plus a vehicle tracker and speed estimator.
4. The `RuleEngine` evaluates the configured rules: `MotionClosedRule` (`MOTION`, fires outside
   operational hours or when armed `always`), `WallIntrusionRule` (`WALL_INTRUSION`),
   `ManInsideWagonRule` (`MAN_INSIDE_WAGON`), `OverSpeedRule` (`OVER_SPEED`),
   `CancelledVehicleRule` (`CANCELLED_VEHICLE`) and `FaceDetectionRule` (`FACE_DETECTION`).
5. A fired rule produces a JPEG snapshot; `AlertReporter` applies a local per-camera/per-type
   cooldown and posts `POST /api/surveillance/ai/alerts` (base64 snapshot). The backend
   de-duplicates again (authoritative cooldown, default `SURVEILLANCE_DEFAULT_COOLDOWN_SEC` = 30 s),
   stores the snapshot under `storage/surveillance/`, creates a `SurveillanceAlert` and writes an
   audit entry.
6. Every `AI_HEARTBEAT_SEC` (10 s) the worker posts `POST /api/surveillance/ai/heartbeat` with live
   per-camera state. The backend keeps this **in memory** and reports the service ONLINE while the
   last heartbeat is younger than `SURVEILLANCE_HEARTBEAT_TIMEOUT_SEC` (30 s).

### Face enrollment flow

1. A user with `FACE_MANAGE` creates an employee (`POST /api/faces`) and uploads a photo
   (`POST /api/faces/:id/faces`, base64 body, parsed with a larger body limit).
2. `faceService.embedImage` posts `{ imageBase64 }` to `${AI_ENROLLMENT_URL}/faces/embed` with
   `X-Service-Token`, timeout `AI_ENROLLMENT_TIMEOUT_MS` (15 s).
3. The worker's Flask app checks the token (401), decodes the image, runs the same InsightFace
   `buffalo_l` model used for live recognition, and requires exactly one face with detection score
   ≥ `AI_FACE_MIN_DET_SCORE`. Failures return 422 with `NO_FACE`, `MULTIPLE_FACES` or
   `LOW_QUALITY`; the backend maps these to user-facing messages (e.g. "No face was detected in
   the image…") and keeps the 422.
4. On success only the embedding vector, model name and quality are stored (`EmployeeFace`). The
   image is never written to disk on either side.
5. Workers refresh the registered-face gallery from `GET /api/surveillance/ai/faces` every
   `AI_FACE_REFRESH_SEC` (30 s).

If the worker is unreachable the backend answers 503 "The face enrollment service is unavailable".

---

## Tech stack

Versions below are the ones locked in `package-lock.json` (Node) or resolved inside the Docker image
(Python, whose `requirements.txt` uses minimum versions only).

| Layer      | Component                                                                       |
|------------|---------------------------------------------------------------------------------|
| Runtime    | Node.js 20 (Docker: `node:20-bookworm-slim`; Render: `NODE_VERSION=20`), Python 3.11 (`python:3.11-slim`) |
| Backend    | express 5.2.1, @prisma/client 6.9.0, prisma 6.9.0, bcrypt 6.0.0, jsonwebtoken 9.0.3, express-validator 7.3.2, qrcode 1.5.4, cors 2.8.6, dotenv 17.4.2, nodemon 3.1.14 (dev) |
| Frontend   | react 19.2.7, react-dom 19.2.7, react-router-dom 7.17.0, axios 1.17.0, leaflet 1.9.4, react-leaflet 5.0.0, vite 8.0.16, @vitejs/plugin-react 6.0.2, eslint 10.4.1 |
| AI worker  | (resolved in the Docker image) opencv-python-headless 4.14.0.94, numpy 2.4.6, ultralytics 8.4.183 (YOLOv8n weights), torch 2.14.1+cpu, insightface 2.1 (`buffalo_l`), onnxruntime 1.31.0, Flask 3.1.3, requests 2.34.2, python-dotenv 1.2.4 |
| Database   | PostgreSQL (Neon in production, `postgres:16` in Compose; also used with 17 natively) |
| Serving    | `nginxinc/nginx-unprivileged:1.27-alpine` for the frontend container            |
| Tunnel     | ngrok agent 3.39.12 (`ngrok/ngrok:3` image and native Windows install)          |

---

## Repository layout

```text
.
├── docker-compose.yml        full local stack (db, backend, frontend, ai-worker, ngrok profile)
├── .env.example              Compose variables
├── render.yaml               Render Blueprint for the backend
├── backend/
│   ├── Dockerfile, docker-entrypoint.sh
│   ├── server.js             binds the port, starts the stream-health loop, graceful shutdown
│   ├── prisma/               schema.prisma, migrations/, seed.js, seed_trucks.js
│   ├── scripts/seedAdmin.js  first-admin bootstrap
│   └── src/
│       ├── app.js            middleware order, route mounting, 404, error handler
│       ├── config/           env.js, cors.js, prisma.js, roles.js, truckStages.js
│       ├── middleware/       authenticate, authorize, authenticateService, streamAuthenticate, validate, errorHandler, collectRawBody
│       ├── routes/           one router per module
│       ├── controllers/      HTTP ↔ service translation
│       ├── services/         business logic and Prisma access
│       ├── validators/       express-validator chains
│       ├── sap/              SAP integration, connectors/ (mock, http), mock/ (simulated SAP ERP)
│       └── utils/            AppError, responseHelper, jwt, password, cryptoBox, qrPayload, streamProbe
├── frontend/
│   ├── Dockerfile, nginx.conf, vercel.json
│   └── src/                  pages/, components/, services/ (axios clients), config/api.js
├── ai-service/
│   ├── Dockerfile, start-demo.ps1, main.py, config.py
│   ├── camera/ detectors/ rules/ pipeline/ tracking/ speed/ zones/ face/ alerts/ enrollment/ utils/
└── docs/                     this file, phase documents, SAP integration spec
```

---

## Backend

### Layers

`routes/*.js` declare the path, the auth middleware, the validator chain and
`handleValidationErrors`, then hand over to a controller. Controllers only translate HTTP to
service calls and wrap results with `sendSuccess`. Services hold the business rules, use the shared
Prisma client (`src/config/prisma.js`) and write audit entries through `auditService`. Validators
are `express-validator` chains. `src/config/env.js` is the only file that reads `process.env`.

### Auth and RBAC

- `POST /api/auth/login` accepts `{ identifier, password }` (username **or** email), checks the
  bcrypt hash (`BCRYPT_SALT_ROUNDS`, default 12), updates `lastLogin` and returns a JWT
  (`{ id, role, username }`, lifetime `JWT_EXPIRES_IN`, default 8h) signed with `JWT_SECRET`.
- `authenticate` requires `Authorization: Bearer <token>` and reloads the user from the database on
  every request, so deactivated users lose access immediately.
- `streamAuthenticate` also accepts `?access_token=` for `<img>`/`<video>` URLs (stream playback,
  HLS manifest, alert snapshots).
- `authenticateService` protects `/api/surveillance/ai/*` with the `X-Service-Token` header compared
  in constant time against `AI_SERVICE_TOKEN` (401 on mismatch). If `AI_SERVICE_TOKEN` is unset these
  routes answer 503.
- `authorize(...GROUP)` checks the role against the groups in `src/config/roles.js`:

| Group                 | Roles                                 | Used for                                   |
|-----------------------|---------------------------------------|--------------------------------------------|
| `ANY`                 | all four                              | shared reads                               |
| `BAY_WRITE`           | ADMIN, SUPERVISOR                     | bay create/update/delete                   |
| `MATERIAL_WRITE`      | ADMIN, SUPERVISOR, OPERATOR           | materials, lots, QR generation             |
| `OPERATIONS`          | ADMIN, SUPERVISOR, OPERATOR           | mapping, move, remove, scan                |
| `DISPATCH_CREATE`     | ADMIN, SUPERVISOR, OPERATOR           | create / cancel dispatch                   |
| `DISPATCH_APPROVE`    | ADMIN, SUPERVISOR                     | approve / reject dispatch                  |
| `GATE`                | ADMIN, SUPERVISOR, OPERATOR           | gate validation and exit                   |
| `AUDIT_VIEW`          | ADMIN, MANAGER                        | audit log, SAP dashboards                  |
| `USER_ADMIN`          | ADMIN                                 | users, register, SAP manual sync           |
| `TRUCK_MANAGE`        | ADMIN, SUPERVISOR                     | trucks                                     |
| `RFID_MANAGE`         | ADMIN, SUPERVISOR                     | RFID readers                               |
| `RFID_EVENT`          | ADMIN, SUPERVISOR, OPERATOR           | RFID events and reader heartbeats          |
| `CAMERA_MANAGE`       | ADMIN, SUPERVISOR                     | cameras, video upload, AI configs          |
| `SURVEILLANCE_VIEW`   | all four                              | alert feed                                 |
| `SURVEILLANCE_MANAGE` | ADMIN, SUPERVISOR                     | acknowledge / resolve / dismiss alerts     |
| `FACE_MANAGE`         | ADMIN, SUPERVISOR                     | employees and face enrollment              |

### Response and error format

Every JSON response uses the envelope from `src/utils/responseHelper.js`:

```json
{ "success": true,  "message": "Login successful.", "data": { } }
{ "success": false, "message": "Validation failed.", "errors": [ ] }
```

`errorHandler.js` maps Prisma `P2002` → 409, `P2025` → 404, `P2003` → 400; `AppError`
(operational) errors keep their status and message; anything else is logged and returned as a
generic 500. Unknown routes return 404 `Route <METHOD> <path> not found.`

The global JSON body limit is 10 kb. `/api/surveillance/ai/*` (snapshots, limit
`SURVEILLANCE_INGEST_LIMIT`, 20 mb) and `/api/faces/:id/faces` (face image) parse their own bodies
with larger limits. Video upload (`POST /api/streams/:id/video`) takes a raw
`application/octet-stream` body up to `VIDEO_MAX_BYTES` (500 MB).

### SAP integration

`src/sap/connectors/index.js` picks the connector from `SAP_MODE`: `mock` (default) talks to the
in-process simulated SAP ERP mounted at `/sap` (`src/sap/mock/`), `http` calls a real gateway at
`SAP_BASE_URL` with `Authorization: Bearer <SAP_API_KEY>` and `x-api-key` headers, timeout
`SAP_TIMEOUT_MS`. Transient failures are retried (`SAP_MAX_RETRIES`, exponential from
`SAP_RETRY_BASE_DELAY_MS`). If SAP is unreachable, operations are allowed with a WARNING unless
`SAP_BLOCK_ON_UNAVAILABLE=true`; real validation failures always block. Sync and validation
results are logged in `SAPSyncLog` / `SAPValidationLog`. See `docs/SAP_INTEGRATION_SPEC.md`.

### QR codes

Generating a QR (`POST /api/qr/:entityType/:entityId/generate`) stores only the payload string,
status and version on the `Bay` / `MaterialLot` row. The PNG is rendered on every request with the
`qrcode` library (`GET .../image`, `GET .../download`); nothing is written to disk, so QR codes
survive ephemeral hosts. These two GET routes are unauthenticated because `<img>` and
`<a download>` cannot send headers; they expose only the public entity payload.

### Storage

`src/services/storageService.js` writes under `backend/storage/` (`/app/storage` in the container):
`videos/` (uploaded demo videos), `surveillance/` (alert snapshots) and `hls/`. The directories are
created at startup. In Compose this is the `backend-storage` volume. **On Render the disk is
ephemeral**: uploaded videos and snapshots are lost on every deploy or restart.

---

## API routes

All paths are relative to the backend origin. "JWT" means `authenticate` (Bearer token); a group
name means `authenticate` + `authorize(group)`; "service" means `X-Service-Token`; "JWT/query"
means `streamAuthenticate`.

**Health**

| Method | Path | Auth |
|---|---|---|
| GET | `/health`, `/api/health` | none |

**Auth** `/api/auth`

| Method | Path | Auth |
|---|---|---|
| POST | `/api/auth/login` | none |
| POST | `/api/auth/logout` | JWT |
| POST | `/api/auth/register` | USER_ADMIN |
| GET | `/api/auth/me` | JWT |
| PUT | `/api/auth/profile` | JWT |
| PUT | `/api/auth/password` | JWT |

**Users** `/api/users` (all USER_ADMIN)

| Method | Path |
|---|---|
| GET | `/api/users` |
| GET | `/api/users/:id` |
| PUT | `/api/users/:id` |
| POST | `/api/users/:id/deactivate` |
| POST | `/api/users/:id/activate` |

**Audit** — `GET /api/audit-logs` (AUDIT_VIEW)

**Bays** `/api/bays` (JWT; writes BAY_WRITE)

| Method | Path | Auth |
|---|---|---|
| GET | `/api/bays`, `/api/bays/:id` | JWT |
| POST | `/api/bays` | BAY_WRITE |
| PUT / DELETE | `/api/bays/:id` | BAY_WRITE |

**Materials** `/api/materials` and **Lots** `/api/lots` (JWT; writes MATERIAL_WRITE)

| Method | Path | Auth |
|---|---|---|
| GET | `/api/materials`, `/api/materials/:id`, `/api/lots`, `/api/lots/:id` | JWT |
| POST | `/api/materials`, `/api/lots` | MATERIAL_WRITE |
| PUT / DELETE | `/api/materials/:id`, `/api/lots/:id` | MATERIAL_WRITE |

**QR** `/api/qr`

| Method | Path | Auth |
|---|---|---|
| POST | `/api/qr/:entityType/:entityId/generate` | MATERIAL_WRITE |
| GET | `/api/qr/:entityType/:entityId/status` | JWT |
| GET | `/api/qr/:entityType/:entityId/download` | none |
| GET | `/api/qr/:entityType/:entityId/image` | none |

**Mappings** `/api/mappings` (JWT; writes OPERATIONS)

| Method | Path | Auth |
|---|---|---|
| POST | `/api/mappings` | OPERATIONS |
| POST | `/api/mappings/move` | OPERATIONS |
| POST | `/api/mappings/remove` | OPERATIONS |
| POST | `/api/mappings/scan/resolve` | OPERATIONS |
| POST | `/api/mappings/scan` | OPERATIONS |
| GET | `/api/mappings/inventory` | JWT |
| GET | `/api/mappings/inventory/summary` | JWT |
| GET | `/api/mappings/bay/:bayId/inventory` | JWT |
| GET | `/api/mappings/lot/:lotId/location` | JWT |
| GET | `/api/mappings/lot/:lotId/history` | JWT |
| GET | `/api/mappings/lot/:lotId/active` | JWT |

**Dispatches** `/api/dispatches` (JWT)

| Method | Path | Auth |
|---|---|---|
| POST | `/api/dispatches` | DISPATCH_CREATE |
| POST | `/api/dispatches/:id/approve` | DISPATCH_APPROVE |
| POST | `/api/dispatches/:id/reject` | DISPATCH_APPROVE |
| POST | `/api/dispatches/:id/cancel` | DISPATCH_CREATE |
| GET | `/api/dispatches/pending`, `/approved`, `/summary` | JWT |
| GET | `/api/dispatches/lot/:lotId/history` | JWT |
| GET | `/api/dispatches`, `/api/dispatches/:id` | JWT |

**Gate validations** `/api/gate-validations` (JWT)

| Method | Path | Auth |
|---|---|---|
| POST | `/api/gate-validations/scan/resolve` | GATE |
| POST | `/api/gate-validations/exit` | GATE |
| GET | `/api/gate-validations/pending`, `/summary` | JWT |
| GET | `/api/gate-validations`, `/api/gate-validations/:id` | JWT |

**SAP** `/api/sap` (JWT)

| Method | Path | Auth |
|---|---|---|
| GET | `/api/sap/status`, `/dashboard`, `/sync-logs`, `/validation-logs` | AUDIT_VIEW |
| POST | `/api/sap/sync/material/:materialId` | USER_ADMIN |
| POST | `/api/sap/sync/inventory/:materialId` | USER_ADMIN |
| POST | `/api/sap/sync/dispatch/:dispatchId` | USER_ADMIN |
| POST | `/api/sap/sync-logs/:id/retry` | USER_ADMIN |
| GET | `/api/sap/validate/dispatch/:id` | DISPATCH_APPROVE |
| GET | `/api/sap/validate/gate/:id` | GATE |

**Simulated SAP ERP** `/sap` (no auth; remove in production when using a real gateway)

`GET /sap/health`, `GET /sap/materials`, `GET /sap/materials/:id`, `GET /sap/lots`,
`GET /sap/lots/:id`, `GET /sap/inventory`, `GET /sap/inventory/:materialId`, `GET /sap/dispatches`,
`POST /sap/dispatches`, `GET /sap/dispatches/:id`, `POST /sap/validate/material`,
`POST /sap/validate/inventory`, `POST /sap/validate/dispatch`.

**Trucks** `/api/trucks` (JWT)

| Method | Path | Auth |
|---|---|---|
| GET | `/api/trucks/dashboard`, `/visits`, `/visits/:id/journey` | JWT |
| GET | `/api/trucks`, `/api/trucks/:id` | JWT |
| POST | `/api/trucks` | TRUCK_MANAGE |
| PUT | `/api/trucks/:id` | TRUCK_MANAGE |

**RFID** `/api/rfid` (JWT)

| Method | Path | Auth |
|---|---|---|
| POST | `/api/rfid/events` | RFID_EVENT |
| GET | `/api/rfid/readers/dashboard`, `/readers`, `/readers/:id` | JWT |
| POST | `/api/rfid/readers` | RFID_MANAGE |
| PUT / DELETE | `/api/rfid/readers/:id` | RFID_MANAGE |
| POST | `/api/rfid/readers/:id/heartbeat` | RFID_EVENT |

**Cameras** `/api/cameras` (JWT)

| Method | Path | Auth |
|---|---|---|
| GET | `/api/cameras/summary`, `/api/cameras`, `/api/cameras/:id` | JWT |
| POST | `/api/cameras/test` | CAMERA_MANAGE |
| POST | `/api/cameras` | CAMERA_MANAGE |
| PUT / DELETE | `/api/cameras/:id` | CAMERA_MANAGE |
| POST | `/api/cameras/:id/test` | CAMERA_MANAGE |

**Streams** `/api/streams`

| Method | Path | Auth |
|---|---|---|
| GET | `/api/streams/:id/playback` | JWT/query |
| GET | `/api/streams/:id/manifest.m3u8` | JWT/query |
| GET | `/api/streams/live` | JWT |
| POST | `/api/streams/:id/open`, `/close`, `/refresh` | JWT |
| GET | `/api/streams/:id/status`, `/logs` | JWT |
| POST | `/api/streams/:id/video?filename=<name>` (raw body) | CAMERA_MANAGE |
| DELETE | `/api/streams/:id/video` | CAMERA_MANAGE |

**Surveillance** `/api/surveillance`

| Method | Path | Auth |
|---|---|---|
| GET | `/api/surveillance/alerts/:id/snapshot` | JWT/query |
| GET | `/api/surveillance/ai/cameras` | service |
| GET | `/api/surveillance/ai/cameras/:id/video` | service |
| GET | `/api/surveillance/ai/faces` | service |
| POST | `/api/surveillance/ai/alerts` | service |
| POST | `/api/surveillance/ai/heartbeat` | service |
| GET | `/api/surveillance/status` | JWT |
| GET | `/api/surveillance/alerts`, `/alerts/summary`, `/alerts/:id` | JWT |
| POST | `/api/surveillance/alerts/:id/acknowledge`, `/resolve`, `/dismiss` | SURVEILLANCE_MANAGE |
| GET | `/api/surveillance/cameras/:id/alerts`, `/motion` | JWT |
| GET | `/api/surveillance/cameras/:id/{motion,wall,wagon,overspeed,cancelled,face}-config` | JWT |
| PUT | `/api/surveillance/cameras/:id/{motion,wall,wagon,overspeed,cancelled,face}-config` | CAMERA_MANAGE |
| GET | `/api/surveillance/cameras/:id/zones` | JWT |
| PUT | `/api/surveillance/cameras/:id/zones` | CAMERA_MANAGE |

**Face registry** `/api/faces` (JWT)

| Method | Path | Auth |
|---|---|---|
| GET | `/api/faces`, `/api/faces/summary`, `/api/faces/:id` | JWT |
| POST | `/api/faces` | FACE_MANAGE |
| PUT / DELETE | `/api/faces/:id` | FACE_MANAGE |
| GET | `/api/faces/:id/faces` | JWT |
| POST | `/api/faces/:id/faces` | FACE_MANAGE |
| DELETE | `/api/faces/:id/faces/:faceId` | FACE_MANAGE |

**AI worker** (Flask, port 8600)

| Method | Path | Auth |
|---|---|---|
| GET | `/health` → `{"ok": true, "faceModelAvailable": <bool>}` | none |
| POST | `/faces/embed` `{ imageBase64 }` | `X-Service-Token` |

---

## Database

PostgreSQL through Prisma 6 (`backend/prisma/schema.prisma`). The client is generated with
`binaryTargets = ["native", "debian-openssl-3.0.x"]`, so the same client runs on Windows and in
Debian-based containers (Render, the Docker image).

### Models

| Model                | Purpose / key fields |
|----------------------|----------------------|
| `User`               | `username`, `email`, bcrypt `password`, `role` (UserRole), `status`, `lastLogin` |
| `Bay`                | storage location: `bayCode`, `zone`, `latitude`/`longitude`, `polygonCoordinates` (JSON), QR fields (`qrCode`, `qrStatus`, `qrVersion`, `qrGeneratedAt`), `status` |
| `Material`           | material master: `materialCode`, `materialName`, `materialType`, `status` |
| `MaterialLot`        | lot of a material: `lotCode`, `quantity`, `unit`, QR fields, `status` (LotStatus) |
| `MaterialBayMapping` | lot ↔ bay history: `mappedBy`, `mappedAt`, `unmappedAt`, `status` (MappingStatus) |
| `Dispatch`           | dispatch request: `dispatchNumber`, quantities, requester/approver, `dispatchStatus`, `vehicleNumber` |
| `GateValidation`     | gate check for a dispatch: `validationStatus`, `gateExitTime`, validator |
| `AuditLog`           | `userId`, `module`, `action`, `entityId`, `remarks`, `timestamp` |
| `SAPSyncLog`         | outbound SAP sync attempts with request/response payloads and `attemptCount` |
| `SAPValidationLog`   | SAP validation results (`VALIDATED` / `WARNING` / `BLOCKED`) |
| `Truck`              | truck master: `truckNumber`, driver, transporter, `rfidTag`, `status` |
| `TruckVisit`         | one yard visit: `visitNumber`, `status` (VisitStatus), `currentStage`, `riskStatus`, entry/exit times |
| `TruckEvent`         | RFID/stage event of a visit: `stage`, `readerId`, `source`, `rawTag`, `eventTime` |
| `TruckAlert`         | visit alert: `alertType` (DELAY, SEQUENCE_VIOLATION, UNAUTHORIZED_REENTRY), `resolved` |
| `RFIDReader`         | reader registry: `readerCode`, `stage`, `ipAddress`, `status`, `lastHeartbeat` |
| `Camera`             | camera registry: stream type and URL, `passwordEncrypted` (AES-256-GCM), stream status fields, `videoFilePath`, `config`, `aiConfig` (JSON per detector) |
| `CameraStreamLog`    | stream connect/disconnect events |
| `SurveillanceAlert`  | AI alert: `alertType`, `detectorType`, `severity`, `status`, `message`, `snapshotPath`, `detectionDetails`, ack/resolve audit fields |
| `Employee`           | face registry person: `employeeCode`, `name`, `department`, `designation`, `status` |
| `EmployeeFace`       | stored embedding (JSON), `model`, `quality` — never the image |

### Enums

| Enum | Values |
|---|---|
| UserRole | ADMIN, SUPERVISOR, OPERATOR, MANAGER |
| UserStatus | ACTIVE, INACTIVE |
| BayStatus | AVAILABLE, OCCUPIED, INACTIVE |
| MaterialStatus | ACTIVE, INACTIVE |
| LotStatus | AVAILABLE, MAPPED, DISPATCHED |
| MappingStatus | ACTIVE, MOVED, UNMAPPED, DISPATCHED |
| DispatchStatus | PENDING, APPROVED, REJECTED, COMPLETED, CANCELLED |
| GateValidationStatus | PENDING, VALIDATED, DENIED, EXITED |
| QRStatus | UNGENERATED, GENERATED |
| SAPSyncType | MATERIAL, INVENTORY, DISPATCH, STATUS |
| SAPSyncStatus | PENDING, IN_PROGRESS, SUCCESS, FAILED |
| SAPValidationType | MATERIAL, LOT, INVENTORY, DISPATCH_APPROVAL, GATE_EXIT |
| SAPValidationStatus | VALIDATED, WARNING, BLOCKED |
| TruckStatus | ACTIVE, INACTIVE |
| VisitStatus | ACTIVE, PARKED, EXITED |
| TruckStage | ENTRY_GATE, WEIGH_BRIDGE_1, LOADING_DOCK, WEIGH_BRIDGE_2, INVOICE, PARKING, EXIT_GATE (order = expected sequence) |
| TruckAlertType | DELAY, SEQUENCE_VIOLATION, UNAUTHORIZED_REENTRY |
| RFIDReaderStatus | ONLINE, OFFLINE, MAINTENANCE |
| StreamType | RTSP, RTMP, HTTP, LOCAL_WEBCAM, UPLOADED_VIDEO |
| CameraStatus | ACTIVE, INACTIVE, MAINTENANCE |
| CameraHealth | ONLINE, OFFLINE, UNKNOWN |
| StreamStatus | OFFLINE, CONNECTING, ONLINE, RECONNECTING, ERROR |
| SurveillanceAlertType | MOTION, INTRUSION, WALL_INTRUSION, MAN_INSIDE_WAGON, OVER_SPEED, CANCELLED_VEHICLE, FACE_DETECTION, FACE, GEOFENCE, VEHICLE, OVERSPEED, DRIVER_MONITORING, OTHER |
| AlertSeverity | LOW, MEDIUM, HIGH, CRITICAL |
| AlertStatus | NEW, ACKNOWLEDGED, RESOLVED, DISMISSED |

### Migrations

Applied in order by `prisma migrate deploy` (`npm run migrate`; automatically by the Docker
entrypoint and by Render's build command):

```text
20260608103701_init_user_table
20260608104136_phase1_core_schema
20260609055514_add_polygon_coordinates
20260610120000_phase5_material_bay_mapping
20260611120000_phase6_dispatch_gate
20260611140000_phase7_auth_lastlogin
20260611160000_phase8_sap_integration
20260619120000_phase10_truck_rfid
20260620120000_phase11_camera
20260621120000_phase12_streaming
20260622120000_phase13_surveillance_alerts
20260623120000_phase14_man_inside_wagon
20260624120000_phase15_over_speed
20260625120000_phase16_cancelled_vehicle
20260626120000_phase17_face_registry
20260627120000_qr_material_status
```

**`20260627120000_qr_material_status`** exists because of schema drift: the `QRStatus` and
`MaterialStatus` enums, the `qrStatus` / `qrVersion` / `qrGeneratedAt` columns on `Bay` and
`MaterialLot`, `Material.status` and the unique indexes on `qrCode` were once applied to the
development database with `prisma db push`, which writes no migration. A fresh database built only
from migrations therefore lacked them. The migration adds them with guards (`DO $$ … EXCEPTION
WHEN duplicate_object`, `ADD COLUMN IF NOT EXISTS`, `CREATE UNIQUE INDEX IF NOT EXISTS`), so it is a
no-op on databases that already have them and complete on new ones. Use
`npm run migrate:dev` (`prisma migrate dev`) for schema changes, never `db push`.

`backend/prisma/migrations/**` is marked `-text` in `.gitattributes` because Prisma stores a
checksum of each applied migration file; converting its line endings would make Prisma report a
modified migration.

---

## AI worker

`ai-service/main.py` starts three things in one process: the `CameraManager` (job refresh,
heartbeat and one pipeline thread per camera), the Flask enrollment API in a daemon thread
(`app.run(..., threaded=True)` — Flask's **development server**, single process, adequate for
the low enrollment volume), and a background warm-up of the InsightFace model so the first
enrollment does not hit the 15 s backend timeout.

Models: YOLOv8n (`yolov8n.pt`, loaded by relative path from the working directory) and InsightFace
`buffalo_l` (`~/.insightface/models/buffalo_l`), both on CPU (`CPUExecutionProvider`). Natively they
download on first use; the Docker image downloads them at build time.

The Docker image (`ai-service/Dockerfile`): a build stage compiles the requirements into a
virtualenv (`build-essential` is there for dependencies without a prebuilt wheel; insightface 2.1 currently installs as a wheel),
installs PyTorch from the CPU-only index (image size about 3.8 GB, mostly PyTorch), and swaps the GUI `opencv-python` that ultralytics pulls
in for `opencv-python-headless` of the same version (the code never calls `imshow` or other GUI
functions). The runtime stage is `python:3.11-slim` plus `libgomp1` and `libglib2.0-0`, runs as
user `app` (uid 1000), and health-checks `http://localhost:8600/health`.

---

## Environment variables

### Backend (`backend/src/config/env.js`)

| Name | Req. | Default | Notes / example |
|---|---|---|---|
| `NODE_ENV` | no | `development` | `production` in Docker and on Render |
| `PORT` | no | `5000` | Render injects its own |
| `DATABASE_URL` | **yes** | — | `postgresql://user:pass@host:5432/db` |
| `FRONTEND_URL` | **yes** | — | comma-separated CORS allow-list, e.g. `http://localhost:5173,http://localhost:5174`; trailing slashes ignored |
| `JWT_SECRET` | **yes** | — | `openssl rand -hex 32` (or 48) |
| `JWT_EXPIRES_IN` | no | `8h` | |
| `BCRYPT_SALT_ROUNDS` | no | `12` | |
| `BOOTSTRAP_ADMIN_USERNAME` / `_EMAIL` / `_PASSWORD` | for `seed:admin` | empty | password ≥ 8 characters |
| `SAP_MODE` | no | `mock` | `mock` or `http` |
| `SAP_BASE_URL` | no | `http://localhost:5000/sap` | real gateway when `SAP_MODE=http` |
| `SAP_API_KEY`, `SAP_CLIENT_ID`, `SAP_CLIENT_SECRET` | no | empty | |
| `SAP_TIMEOUT_MS` | no | `8000` | |
| `SAP_MAX_RETRIES` | no | `3` | |
| `SAP_RETRY_BASE_DELAY_MS` | no | `200` | |
| `SAP_BLOCK_ON_UNAVAILABLE` | no | `false` | |
| `SAP_SIMULATE_DOWN` | no | `false` | mock only |
| `CAMERA_ENC_KEY` | no | derived from `JWT_SECRET` | AES-256-GCM key material for camera passwords; `openssl rand -hex 32` |
| `CAMERA_TEST_TIMEOUT_MS` | no | `6000` | |
| `STREAM_RECONNECT_INTERVAL_MS` | no | `5000` | |
| `STREAM_MAX_RECONNECT_ATTEMPTS` | no | `10` | |
| `STREAM_CONNECT_TIMEOUT_MS` | no | `8000` | |
| `STREAM_HEALTH_POLL_MS` | no | `15000` | |
| `STREAM_IDLE_TIMEOUT_MS` | no | `60000` | |
| `STREAM_GATEWAY_MODE` | no | `native` | `native` or `hls` |
| `STREAM_GATEWAY_BASE_URL` | no | empty | external HLS/WebRTC gateway |
| `STREAM_HLS_DIR` | no | `hls` | under `storage/` |
| `VIDEO_UPLOAD_DIR` | no | `videos` | under `storage/` |
| `VIDEO_MAX_BYTES` | no | `524288000` | 500 MB |
| `AI_SERVICE_TOKEN` | for AI | empty | shared with the worker; empty disables `/api/surveillance/ai/*` and face enrollment |
| `SURVEILLANCE_SNAPSHOT_DIR` | no | `surveillance` | under `storage/` |
| `SURVEILLANCE_INGEST_LIMIT` | no | `20mb` | |
| `SURVEILLANCE_DEFAULT_COOLDOWN_SEC` | no | `30` | |
| `SURVEILLANCE_OPERATIONAL_START` / `_END` | no | `08:00` / `20:00` | motion alarms arm outside this window |
| `SURVEILLANCE_OPERATIONAL_DAYS` | no | `1,2,3,4,5` | 0 = Sunday |
| `SURVEILLANCE_HEARTBEAT_TIMEOUT_SEC` | no | `30` | |
| `AI_ENROLLMENT_URL` | no | `http://localhost:8600` | worker base URL, e.g. `https://alexia-intertribal-nonsubtractively.ngrok-free.dev` |
| `AI_ENROLLMENT_TIMEOUT_MS` | no | `15000` | |

### Frontend (Vite, build time)

| Name | Req. | Default | Notes |
|---|---|---|---|
| `VITE_API_BASE_URL` | **yes** | none (`src/config/api.js` throws at startup if unset; a few service modules fall back to `http://localhost:5000/api`) | must end in `/api`; Docker build arg; on Vercel set for Production and Preview |

### AI worker (`ai-service/config.py`)

| Name | Req. | Default | Notes |
|---|---|---|---|
| `WARETRACE_API_URL` | yes | `http://localhost:5000` | backend origin without `/api` |
| `AI_SERVICE_TOKEN` | **yes** | empty | worker aborts if empty |
| `AI_JOB_REFRESH_SEC` | no | `20` | |
| `AI_HEARTBEAT_SEC` | no | `10` | |
| `AI_FRAME_WIDTH` | no | `640` | 0 disables resizing |
| `AI_TARGET_FPS` | no | `8.0` | per camera |
| `AI_RECONNECT_DELAY_SEC` | no | `3.0` | |
| `AI_MAX_RECONNECT_DELAY_SEC` | no | `30.0` | |
| `AI_HTTP_TIMEOUT_SEC` | no | `8.0` | |
| `AI_LOG_LEVEL` | no | `INFO` | |
| `AI_ENROLL_HOST` | no | `0.0.0.0` | Flask bind address |
| `AI_ENROLL_PORT` | no | `8600` | |
| `AI_FACE_MIN_DET_SCORE` | no | `0.5` | enrollment quality gate |
| `AI_FACE_REFRESH_SEC` | no | `30` | gallery refresh |

### Docker Compose (root `.env`)

| Name | Default | Read by |
|---|---|---|
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` | `waretrace` / `waretrace` / `warehouse_traceability` | `db`; also build the backend's `DATABASE_URL` |
| `BACKEND_PORT`, `FRONTEND_PORT`, `AI_WORKER_PORT` | `5000`, `8088`, `8600` | host port mappings |
| `FRONTEND_URL` | `http://localhost:8088` | backend CORS |
| `JWT_SECRET` | `local-dev-jwt-secret-change-me` (required) | backend |
| `CAMERA_ENC_KEY` | empty | backend |
| `SAP_MODE` | `mock` | backend |
| `BOOTSTRAP_ADMIN_USERNAME` / `_EMAIL` / `_PASSWORD` | `admin` / `admin@example.com` / `admin123` | `seed:admin` |
| `VITE_API_BASE_URL` | `http://localhost:5000/api` | frontend build arg |
| `AI_SERVICE_TOKEN` | `local-dev-service-token-change-me` (required) | backend and ai-worker |
| `WARETRACE_API_URL` | `http://backend:5000` | ai-worker |
| `AI_LOG_LEVEL` | `INFO` | ai-worker |
| `NGROK_AUTHTOKEN` | empty | ngrok (`tunnel` profile) |
| `NGROK_DOMAIN` | `alexia-intertribal-nonsubtractively.ngrok-free.dev` | ngrok (`tunnel` profile) |

Compose sets `AI_ENROLLMENT_URL=http://ai-worker:8600` for the backend itself.

---

## Deployment

### Vercel (frontend)

Project `warehouse-traceability`, root directory `frontend/`, Vite preset (`npm run build` →
`dist/`). `frontend/vercel.json` rewrites every path to `/index.html` for client-side routing.
`VITE_API_BASE_URL` is set for Production and Preview. Pushing to `main` deploys automatically.
`.vercelignore` keeps `backend/`, `ai-service/` and `docs/` out of uploads.

### Render (backend)

Free web service `warehouse-traceability-api` (described by `render.yaml`), root `backend/`,
region Ohio:

- Build: `npm install && npx prisma generate && npx prisma migrate deploy`
- Start: `npm start`
- Health check path: `/health`
- Env: `NODE_VERSION=20`, `NODE_ENV=production`, `SAP_MODE=mock`,
  `PRISMA_SCHEMA_DISABLE_ADVISORY_LOCK=1` (see Neon below), `AI_ENROLLMENT_URL`, plus the secrets
  `DATABASE_URL`, `FRONTEND_URL`, `JWT_SECRET`, `CAMERA_ENC_KEY`, `AI_SERVICE_TOKEN` and
  `BOOTSTRAP_ADMIN_*`.

Pushes do **not** deploy (the Render GitHub app is not installed on the repository). Deploy from
the dashboard ("Manual Deploy") or the API:

```bash
curl -X POST -H "Authorization: Bearer $RENDER_API_KEY" -H "Content-Type: application/json" \
  -d '{}' https://api.render.com/v1/services/srv-dbcj0dl9fdbs73a17mh0/deploys
```

Changing an env var also needs a deploy. Every deploy or restart wipes `storage/` (uploaded videos,
snapshots).

### Neon (database)

Managed PostgreSQL. `DATABASE_URL` is Neon's pooled (PgBouncer) connection string and
`prisma migrate deploy` runs through it; no separate `DIRECT_URL` is configured. Because the pooler
reuses server sessions, the session-level advisory lock Prisma takes during `migrate deploy` can
stay held after a build, and the next build then fails with `P1002 … Timed out trying to acquire a
postgres advisory lock`. Render therefore sets `PRISMA_SCHEMA_DISABLE_ADVISORY_LOCK=1`; this is safe
because only the single Render build ever runs migrations. (Alternative: run migrations against
Neon's direct, non-pooler host.)

### CORS

`FRONTEND_URL` is a comma-separated allow-list of exact origins; trailing slashes are stripped on
both sides. Requests without an `Origin` header (server-to-server, curl) are allowed. Production
uses `https://warehouse-traceability.vercel.app`.

### Docker

`docker compose up --build` builds three images and starts `db` → `backend` (waits for a healthy
db, runs migrations) → `frontend` and `ai-worker` (wait for a healthy backend). All services share
the `waretrace` network and restart `unless-stopped`.

| Image | Base | User | Healthcheck |
|---|---|---|---|
| backend | `node:20-bookworm-slim` + openssl | `node` | `GET /health` |
| frontend | build on `node:20-bookworm-slim`, serve on `nginxinc/nginx-unprivileged:1.27-alpine` :8080 | `nginx` (101) | `GET /` |
| ai-worker | `python:3.11-slim` | `app` (1000) | `GET :8600/health` |

Volumes: `db-data` (Postgres), `backend-storage` (`/app/storage`), `ai-cache` (`/app/.cache`,
downloaded demo videos), `ai-models` (`/home/app/.insightface`, seeded from the image on first
use).

### ngrok

The worker's enrollment API is published on the static domain
`alexia-intertribal-nonsubtractively.ngrok-free.dev` (free plan: one static domain, one agent session at a
time). Render's `AI_ENROLLMENT_URL` points at `https://alexia-intertribal-nonsubtractively.ngrok-free.dev`
permanently, so restarting the worker needs no Render change or redeploy (and therefore does not
wipe uploaded videos).

- Native: `ngrok http --url=https://alexia-intertribal-nonsubtractively.ngrok-free.dev 8600`
  (ngrok 3 flag `--url`; the authtoken lives in `%LOCALAPPDATA%\ngrok\ngrok.yml`), or
  `ai-service/start-demo.ps1`, which also starts the worker and waits for the tunnel.
- Docker: `docker compose --profile tunnel up`, with `NGROK_AUTHTOKEN` and `NGROK_DOMAIN` in `.env`.

**Free-plan interstitial.** ngrok's free plan shows an HTML warning page to requests whose
`User-Agent` looks like a browser. Server-to-server calls are not affected: the backend's Node
`fetch` to `/faces/embed` reaches the worker without any extra header (verified: JSON 422 through
the tunnel), so the backend sends no `ngrok-skip-browser-warning` header. Clients with a
browser-like user agent (browsers, Windows PowerShell's `Invoke-RestMethod`) get the HTML page
unless they send `ngrok-skip-browser-warning: 1`; `start-demo.ps1` does this for its readiness
probe.

**Public exposure.** Only the worker's Flask app is reachable through the tunnel. `GET /health`
returns `{"ok": true, "faceModelAvailable": true}` and nothing else; `POST /faces/embed` without
the correct `X-Service-Token` returns 401.

The Compose `ngrok` service has no healthcheck: `docker exec` cannot run inside the `ngrok/ngrok`
images (their `/etc/passwd` and `/etc/group` are absolute symlinks that Docker refuses to follow,
`openat etc/passwd: path escapes from parent`). Check the tunnel with
`curl https://<NGROK_DOMAIN>/health` or `docker compose logs ngrok` (look for `started tunnel`).

---

## Security

- **Secrets** are never committed: `.env` and `.env.*` (except `.env.example`) are git-ignored and
  excluded from Docker build contexts by each service's `.dockerignore`. Production secrets live
  in the Render dashboard, Vercel project settings, `ai-service/.env` on the worker host and the
  ngrok config file.
- **Headers**: users send `Authorization: Bearer <JWT>` (or `?access_token=` on media URLs); the
  worker and backend authenticate each other with `X-Service-Token`, compared in constant time on
  the backend and by equality on the worker.
- The public ngrok URL exposes only the worker's Flask app: `/health` returns two booleans;
  `/faces/embed` returns 401 without the token. The worker stores nothing it receives.
- Camera passwords are encrypted at rest (AES-256-GCM, key from `CAMERA_ENC_KEY` or derived from
  `JWT_SECRET`); the worker receives the decrypted stream URL over the service-token channel.
- `?access_token=` puts a JWT in URLs (and therefore in proxy logs); the 8h token lifetime limits
  the exposure.

**Rotate before real use:** `JWT_SECRET` (invalidates all sessions), `CAMERA_ENC_KEY` (re-enter
camera passwords afterwards), `AI_SERVICE_TOKEN` (backend and every worker together), the admin
password (`admin123` on the demo), the Neon database password, the ngrok authtoken, and any Render
or Vercel API tokens that were shared. Remove the `/sap` mock router and `BOOTSTRAP_ADMIN_PASSWORD`
from production once they are not needed.

---

## Known limitations

- **Cold starts**: Render's free tier sleeps after inactivity; the first request takes about
  30–60 s. The AI status shows OFFLINE until the worker's next heartbeat after a wake-up, and the
  heartbeat state is in memory, so it resets on every restart.
- **Ephemeral disk** on Render: uploaded demo videos and alert snapshots are lost on each deploy or
  restart (alerts remain in the database, their snapshot returns 404). A worker that already cached
  a video in `.cache/videos/` keeps playing it.
- **No media gateway**: browsers cannot play RTSP/RTMP; `STREAM_GATEWAY_MODE=native` only reports
  reachability. Live viewing of such cameras needs an external HLS/WebRTC gateway
  (`STREAM_GATEWAY_MODE=hls`, `STREAM_GATEWAY_BASE_URL`). The AI worker itself reads RTSP directly.
- **CPU-only inference**: YOLOv8n and InsightFace run on CPU; several cameras with person/vehicle or
  face detection will saturate a laptop. Lower `AI_TARGET_FPS` / `AI_FRAME_WIDTH` per worker.
- **The AI worker must be running and reachable**: without it there are no AI alerts and face
  enrollment fails with 503. With a cloud backend the enrollment path depends on the ngrok tunnel.
- The enrollment API uses Flask's development server (single process, threaded).

---

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| `cloudflared` quick tunnel "Tunnel not found" / QUIC timeouts | Replaced by ngrok. Cloudflare quick tunnels are deleted without notice, change URL on every start, and Cloudflare WARP on the worker host breaks QUIC (`--protocol http2` was the workaround). |
| ngrok `ERR_NGROK_334` (endpoint already online) | Another agent (native script or Docker profile) holds the static domain. Stop it first. |
| ngrok `ERR_NGROK_320` (domain reserved for another account) | The authtoken belongs to a different ngrok account than the domain. Use that account's authtoken, or that account's own domain. |
| `start-demo.ps1` says the tunnel did not answer, but the URL works | The probe got ngrok's browser interstitial; the script sends `ngrok-skip-browser-warning`. Check `ai-service/.cache/ngrok.log` and `worker.log`. |
| Backend fails to load the Prisma query engine in a Linux container | The client must be generated with the container's target (`debian-openssl-3.0.x`, already in `binaryTargets`) and OpenSSL must be installed; the Docker image does both. Re-run `npx prisma generate` after changing `binaryTargets`. |
| `Bind for 0.0.0.0:<port> failed: port is already allocated` | Change `FRONTEND_PORT` / `BACKEND_PORT` / `AI_WORKER_PORT` in `.env` (and `FRONTEND_URL` / `VITE_API_BASE_URL` to match). |
| `exec ./docker-entrypoint.sh: no such file or directory` | CRLF line endings in the script. `.gitattributes` forces LF for `*.sh`, Dockerfiles and compose files; save the file with LF or re-clone. |
| `LF will be replaced by CRLF` warnings on Windows | Expected with `* text=auto`; files covered by `eol=lf` stay LF in the working tree. |
| Render build fails with `P1002` "Timed out trying to acquire a postgres advisory lock" | Stale advisory lock on a pooled Neon session. Set `PRISMA_SCHEMA_DISABLE_ADVISORY_LOCK=1` on the service (already set) and redeploy. |
| Prisma reports a migration was modified | Its line endings were changed; migrations are `-text` in `.gitattributes`. Restore the file from git. |
| AI status OFFLINE | No heartbeat in 30 s: worker stopped, wrong `WARETRACE_API_URL`, or token mismatch (401 in the worker log). |
| Enrollment 503 "service is unavailable" | Backend cannot reach `AI_ENROLLMENT_URL`; `curl <url>/health`. |
| Enrollment 422 "No face was detected" | The AI path works; the photo has no usable face. |
| Worker log "Could not download demo video" | The backend lost the file (Render restart): re-upload the video. |
