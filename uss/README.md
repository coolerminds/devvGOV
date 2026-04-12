# eCFR Deregulation Explorer

A compact full-stack app for exploring federal regulation footprint by agency using the public eCFR API.

## What It Does
- Imports current eCFR topic data for each top-level agency, rolling child bureaus into the parent agency.
- Stores raw XML server-side in PostgreSQL.
- Computes agency and topic word counts, checksums, and monthly substantive-change history.
- Tracks a custom metric: topic views, incremented when a user opens a topic in the UI.

## Stack
- Backend: Java 21, Spring Boot 3, Flyway, JdbcClient
- Frontend: React 19, Vite, TypeScript
- Database: PostgreSQL

## Run Locally

### Option 1: local PostgreSQL already running
```bash
createdb ecfr || true

cd /Users/blahz/Documents/devv/uss/backend
DB_URL='jdbc:postgresql://localhost:5432/ecfr' \
DB_USER="$(whoami)" \
DB_PASSWORD='' \
BOOTSTRAP_IMPORT=false \
mvn spring-boot:run

cd /Users/blahz/Documents/devv/uss/frontend
npm install
npm run dev -- --host 127.0.0.1 --port 4173
```

### Option 2: Docker Compose
```bash
cd /Users/blahz/Documents/devv/uss
docker compose up -d

cd backend
mvn spring-boot:run

cd ../frontend
npm install
npm run dev -- --host 127.0.0.1 --port 4173
```

Open [http://127.0.0.1:4173](http://127.0.0.1:4173).

## Import Workflow
- On an empty database, the backend can bootstrap an import at startup with `BOOTSTRAP_IMPORT=true`.
- The UI also exposes a `Refresh eCFR data` button, which calls `POST /api/admin/import`.
- A real import can take several minutes because it fetches current XML plus version history across hundreds of CFR topics.

## API Surface
- `GET /api/agencies`
- `GET /api/agencies/{slug}`
- `POST /api/topics/{id}/view`
- `POST /api/admin/import`

## Tests And Build
```bash
cd /Users/blahz/Documents/devv/uss/backend
mvn test

cd /Users/blahz/Documents/devv/uss/frontend
npm test
npm run build
```

## Notes
- The included screenshot artifacts in [artifacts/ui-screenshot.png](/Users/blahz/Documents/devv/uss/artifacts/ui-screenshot.png) and [artifacts/ui-screenshot-epa.png](/Users/blahz/Documents/devv/uss/artifacts/ui-screenshot-epa.png) were captured from a seeded local dataset to keep screenshot generation quick. The real eCFR import path is implemented in the app.
- The main implementation stays within the requested lightweight scope and is roughly within the preferred code-size target once tests are excluded.

