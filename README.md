# WareTrace — Warehouse Traceability

End-to-end warehouse and yard traceability: bay and material/lot mapping with QR codes, dispatch
approval and gate validation, truck journey tracking with RFID, SAP validation, role-based access,
and AI camera surveillance (motion, person/wall intrusion, vehicle speed, face registry).

## Architecture

```
┌────────────────┐   REST + JWT    ┌───────────────────┐   Prisma   ┌──────────────┐
│ frontend       │ ───────────────▶│ backend           │──────────▶│ PostgreSQL   │
│ React 19+Vite  │  :5173 → :5000  │ Node 20 / Express │            └──────────────┘
└────────────────┘                 │ auth/RBAC, SAP,   │
                                   │ camera streaming  │◀── X-Service-Token ──┐
                                   └───────────────────┘                      │
                                        │ face enrollment (HTTP :8600)        │
                                        ▼                                     │
                                   ┌───────────────────────────────┐          │
                                   │ ai-service (Python)           │──────────┘
                                   │ YOLOv8 · InsightFace · rules  │  pulls camera jobs,
                                   └───────────────────────────────┘  pushes alerts/heartbeat
```

| Folder        | What it is                                                                          |
|---------------|-------------------------------------------------------------------------------------|
| `frontend/`   | React 19 + Vite 8 SPA (react-router, react-leaflet yard map, axios)                 |
| `backend/`    | Express 5 API, Prisma ORM (PostgreSQL, SQL migrations), JWT auth + RBAC, SAP connector (mock/HTTP), camera streaming |
| `ai-service/` | Python worker: YOLOv8 detectors, face registry, rule engine, alert reporting        |
| `docs/`       | Phase documents and the SAP integration spec                                        |

Roles: `ADMIN`, `SUPERVISOR`, `OPERATOR`, `MANAGER` (see `backend/src/config/roles.js`).

## Prerequisites

- **Node.js 20+** and npm
- **PostgreSQL** (developed and tested against 17)
- **Python 3.11** for `ai-service` (optional unless you use camera AI; other versions are untested)
  - A GPU is **not** required; inference runs on CPU. A camera or video file is only needed to exercise detection.

## Setup

```bash
git clone https://github.com/dhanushkumarb01/warehourseTraceability.git
cd warehourseTraceability
```

### 1. Database

Create an empty PostgreSQL database, e.g.:

```bash
createdb -U postgres warehouse_traceability
```

### 2. Backend

```bash
cd backend
cp .env.example .env        # then edit: DATABASE_URL, JWT_SECRET, AI_SERVICE_TOKEN
npm install
npm run prisma:generate
npm run migrate             # prisma migrate deploy — applies all SQL migrations
```

### 3. Frontend

```bash
cd frontend
cp .env.example .env        # VITE_API_BASE_URL=http://localhost:5000/api
npm install
```

### 4. AI service (optional)

```bash
cd ai-service
python -m venv .venv
.venv\Scripts\activate          # Windows   (Linux/macOS: source .venv/bin/activate)
pip install -r requirements.txt
cp .env.example .env            # AI_SERVICE_TOKEN must equal the backend's
```

Model weights are fetched automatically on first run (`yolov8n.pt` by ultralytics, `buffalo_l` by
InsightFace). The first start therefore needs internet access.

## Environment variables

Real `.env` files are git-ignored. Each service ships a documented `.env.example`.

| Service     | File                       | Required                                                                 |
|-------------|----------------------------|--------------------------------------------------------------------------|
| backend     | `backend/.env.example`     | `DATABASE_URL`, `FRONTEND_URL` (CORS origins), `JWT_SECRET`; `AI_SERVICE_TOKEN` for the AI worker |
| frontend    | `frontend/.env.example`    | `VITE_API_BASE_URL` (must end in `/api`)                                 |
| ai-service  | `ai-service/.env.example`  | `AI_SERVICE_TOKEN` (same value as backend), `WARETRACE_API_URL`          |

Generate secrets with e.g. `openssl rand -hex 48` (`JWT_SECRET`) and `openssl rand -hex 32` (`AI_SERVICE_TOKEN`).
SAP runs in `SAP_MODE=mock` by default; see `docs/SAP_INTEGRATION_SPEC.md` for switching to a real gateway.

## Create the first admin user

The seed script reads credentials **only from environment variables** (no defaults). Choose your own
strong password and supply it for this one command:

```bash
cd backend
# bash / macOS / Linux
BOOTSTRAP_ADMIN_USERNAME=admin BOOTSTRAP_ADMIN_EMAIL=admin@example.com \
BOOTSTRAP_ADMIN_PASSWORD='<choose-a-strong-password>' npm run seed:admin
```

```powershell
# PowerShell
$env:BOOTSTRAP_ADMIN_USERNAME='admin'; $env:BOOTSTRAP_ADMIN_EMAIL='admin@example.com'
$env:BOOTSTRAP_ADMIN_PASSWORD='<choose-a-strong-password>'; npm run seed:admin
```

The script does nothing if an `ADMIN` already exists. Sign in with the username **or** email.
Optional demo data: `npm run seed:demo` (bays, materials, lots) and `npm run seed:trucks`.

## Run (development)

Start each in its own terminal:

| Service    | Command                                   | URL                       |
|------------|-------------------------------------------|---------------------------|
| backend    | `cd backend && npm run dev`               | http://localhost:5000/api/health |
| frontend   | `cd frontend && npm run dev`              | http://localhost:5173     |
| ai-service | `cd ai-service && python main.py`         | enrollment API on :8600   |

The backend allows the origins listed in `FRONTEND_URL` (default `5173` and `5174`).
Use `npm start` instead of `npm run dev` for the backend without file watching.

## Quality checks

```bash
cd frontend && npm run lint && npm run build
```

## Build and deploy

**Frontend** — static files. `VITE_API_BASE_URL` is baked in at build time:

```bash
cd frontend
VITE_API_BASE_URL=https://your-host/api npm run build     # outputs frontend/dist
```

Serve `frontend/dist` from any static host / reverse proxy, with a fallback to `index.html`
for client-side routes.

**Backend**

```bash
cd backend
npm ci                   # the Prisma CLI is a devDependency and is needed for generate/migrate
npm run prisma:generate
npm run migrate          # applies pending migrations only (prisma migrate deploy)
NODE_ENV=production npm start
```

Set `NODE_ENV=production`, a unique `JWT_SECRET`, `FRONTEND_URL=https://your-frontend-origin`
and a dedicated `CAMERA_ENC_KEY`. Run it under a process manager (systemd, pm2, a container).
Runtime files (QR codes, alert snapshots, uploaded videos) are written to `backend/storage/` — persist it.

**AI service** — run `python main.py` under a process manager on a host that can reach both the
cameras and the backend; set `WARETRACE_API_URL` and the shared `AI_SERVICE_TOKEN`.

## Troubleshooting

- **`[CONFIG] Required environment variable ... is not set`** — create `backend/.env` from the example.
- **CORS errors in the browser** — add the frontend's exact origin to `FRONTEND_URL` and restart the backend.
- **`Port 5173 is in use`** — run `npm run dev -- --port 5174` (already in the CORS list).
- **AI worker "Aborting" at start** — `AI_SERVICE_TOKEN` is empty in `ai-service/.env`.

## Documentation

See [`docs/`](docs/) — `PHASE5_MATERIAL_BAY_MAPPING.md`, `PHASE6_DISPATCH_GATE.md`,
`PHASE7_AUTH_RBAC.md`, `SAP_INTEGRATION_SPEC.md`, and [`ai-service/README.md`](ai-service/README.md).
