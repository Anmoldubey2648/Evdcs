# GridBricks — UK Wind Forecast Intelligence

A data-driven dashboard for evaluating **day-ahead national wind generation forecasts** against observed generation in Great Britain. Built with React, FastAPI, and Neon PostgreSQL, GridBricks helps users inspect forecast vintages, measure prediction accuracy, and understand data coverage using Elexon BMRS data.

> **Scope:** This application evaluates wind forecasts; it does not recommend electricity purchase quantities or model demand, contracts, prices, or other generation sources.

## Overview

GridBricks brings forecast analysis and historical accuracy into one interface, using a consistent hourly delivery dataset across all dashboard sections.

### Key features

- **Overview** — Review forecast performance and hourly data coverage for a selected decision date.
- **Forecast Analysis** — Compare eligible forecasts with observed wind generation across the delivery day.
- **Historical Accuracy** — Explore daily forecast error and coverage across January 2026.
- **Data Explorer** — Inspect matched hourly records and identify missing source data.
- **Forecast vintage selection** — Select the latest forecast published on or before the configured decision cutoff.
- **Transparent metrics** — Calculate MAE, RMSE, mean bias error (MBE), and MAPE with explicit sample counts.
- **Persistent data storage** — Retain raw source records and forecast publication vintages in Neon PostgreSQL.
- **Reproducible setup** — Run the frontend and backend locally or with Docker Compose.

## Data sources and methodology

GridBricks uses Elexon BMRS datasets exclusively.

| Dataset | Purpose |
|---|---|
| `FUELHH` | Observed generation, filtered to `fuelType=WIND` |
| `WINDFOR` | Published wind generation forecast vintages |

Source documentation: [FUELHH — Elexon BMRS](https://bmrs.elexon.co.uk/api-documentation/endpoint/datasets/FUELHH/stream) · [WINDFOR — Elexon BMRS](https://bmrs.elexon.co.uk/api-documentation/endpoint/datasets/WINDFOR/stream)

### Decision dates and forecast eligibility

- Decision dates cover **1–31 January 2026**.
- Each decision date maps to the following UTC delivery date. Therefore, the final January decision includes delivery on **1 February 2026**.
- The default decision cutoff is **11:00 UTC**, configurable through `DECISION_CUTOFF_TIME`.
- For each delivery hour, the application selects the latest forecast vintage published at or before the configured cutoff.
- Forecasts published after the cutoff are not eligible for that decision.

### Hourly aggregation and matching

- Raw `FUELHH` half-hour records and distinct `WINDFOR` `(startTime, publishTime)` vintages are retained in Neon.
- Hourly actual generation is calculated only when both UTC half-hours (`HH:00` and `HH:30`) are available.
- The two half-hour average-MW values are averaged to derive the hourly actual. Incomplete hours are neither interpolated nor scored.
- Forecasts and actuals are matched using the exact UTC hour-start timestamp.
- Missing forecasts or actuals remain missing and reduce reported coverage.
- Forecast `generation` values are preserved as returned by Elexon, without conversion.

**Important:** FUELHH represents average MW over a 30-minute settlement period. The dashboard reports values in the source datasets’ MW context.

### Accuracy metrics

| Metric | Definition | Interpretation |
|---|---|---|
| MAE | Mean absolute error | Average magnitude of forecast error |
| RMSE | Root mean squared error | Gives greater weight to larger errors |
| MBE | Mean forecast-minus-actual error | Positive indicates overforecasting; negative indicates underforecasting |
| MAPE | Mean absolute percentage error | Excludes zero-actual observations |

MAPE reports its valid sample count separately. Coverage reflects the availability of eligible forecasts and matching actuals. Historical summary cards use an **unweighted mean of daily metrics**, rather than recalculating metrics across all hourly observations.

## Architecture

```text
                 Elexon BMRS API
                 /             \
             FUELHH             WINDFOR
                 \               /
                  Backend ingestion
                 sync.py / elexon_client.py
                           |
                           v
                    Neon PostgreSQL
                           |
                           v
                 FastAPI application
              main.py / metrics.py
                           |
                       /api proxy
                           |
                           v
                 React + Vite + Recharts
                           |
       Overview | Forecast | Accuracy | Explorer
```

### Technology stack

- **Frontend:** React, Vite, Recharts
- **Backend:** Python, FastAPI
- **Database:** Neon PostgreSQL, SQLAlchemy
- **Data integration:** Elexon BMRS API
- **Deployment:** Docker, Docker Compose, Nginx
- **Hosting configuration:** Vercel rewrite template

## Repository structure

| Path | Description |
|---|---|
| `src/` | React application, shared components, styles, date utilities, and dashboard sections |
| `src/assets/` | Dashboard visual assets |
| `backend/main.py` | FastAPI health, KPI, timeseries, accuracy, explorer, and sync endpoints |
| `backend/elexon_client.py` | Elexon API client and source filtering |
| `backend/metrics.py` | UTC aggregation, cutoff-vintage selection, matching, and accuracy calculations |
| `backend/date_ranges.py` | Decision-date and delivery-window definitions |
| `backend/database.py` | Database connection, schema initialization, constraints, and indexes |
| `backend/sync.py` | Idempotent source-data ingestion |
| `backend/tests/` | Backend tests for metrics, dates, API contracts, and source filtering |
| `Dockerfile` | Frontend production image served by Nginx |
| `backend/Dockerfile` | FastAPI backend image |
| `docker-compose.yml` | Local frontend/backend orchestration |
| `nginx.conf` | Frontend hosting and API proxy configuration |
| `vercel.json` | SPA fallback and external backend rewrite template |
| `start.bat` | Windows development launcher |
| `VIDEO_SCRIPT.md` | Customer demo and technical walkthrough recording guide |

## Getting started

### Prerequisites

- Python 3.10 or later
- Node.js 20.19 or a compatible newer release
- npm
- A Neon PostgreSQL database
- Git

### 1. Configure environment variables

Create the backend environment file:

```powershell
Copy-Item backend/.env.example backend/.env
```

Set `DATABASE_URL` to your Neon PostgreSQL connection string in `backend/.env`.

Required:

- `DATABASE_URL` — PostgreSQL connection string

Optional:

- `DECISION_CUTOFF_TIME` — forecast eligibility cutoff in UTC; defaults to `11:00`
- `ALLOWED_ORIGINS` — permitted frontend origins
- `SYNC_SECRET` — secret required to authorize the historical sync endpoint

Keep secrets in local environment files or deployment environment settings. **Never commit `.env` files or expose database credentials in frontend code, screenshots, logs, or `VITE_*` variables.**

### 2. Start the backend

In PowerShell:

```powershell
cd backend
py -3 -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn main:app --reload --host 127.0.0.1 --port 8001
```

Backend health check: [http://localhost:8001/health](http://localhost:8001/health)

Interactive API documentation: [http://localhost:8001/docs](http://localhost:8001/docs)

### 3. Start the frontend

In a separate terminal, from the repository root:

```powershell
npm ci
npm run dev -- --host 127.0.0.1 --port 5173
```

Open [http://localhost:5173](http://localhost:5173).

Vite proxies `/api` requests to `http://localhost:8001` by default. Set `VITE_API_PROXY_TARGET` before starting Vite if your backend uses a different address.

On Windows, `start.bat` provides a single-command launcher for the local development setup.

## Database synchronization

FastAPI initializes the database schema and indexes at startup. Neon is the persistent data store; containers do not store application data.

To ingest the historical Elexon records, activate the backend environment and run:

```powershell
cd backend
python sync.py
```

The sync process fetches the configured historical actuals and forecast vintages and uses database uniqueness constraints to make repeated ingestion idempotent.

Check `/health` for database connectivity, record counts, and last-sync information. Review `/docs` for the current endpoint schemas.

### API endpoints

| Endpoint | Description |
|---|---|
| `GET /health` | Database health, record counts, and sync status |
| `GET /kpis?decision_date=YYYY-MM-DD&delivery_date=YYYY-MM-DD` | Selected-decision metrics and coverage |
| `GET /timeseries` | Expected hourly delivery series |
| `GET /accuracy/daily` | Daily accuracy and coverage for the decision period |
| `GET /explorer?delivery_date=YYYY-MM-DD` | Hourly source-match records |
| `POST /sync?secret=...` | Authorized historical data synchronization |

Consult `/docs` for required parameters, response fields, and authorization details.

## Run with Docker Compose

Requirements: Docker Desktop or another working Docker Engine with Docker Compose v2, plus a reachable Neon database.

Create the root environment file:

```powershell
Copy-Item .env.example .env
```

Edit `.env` and set your own `DATABASE_URL`, then validate and start the services:

```powershell
docker compose --env-file .env config
docker compose --env-file .env up --build -d
docker compose ps
docker compose logs -f backend
```

Run historical synchronization inside the backend container:

```powershell
docker compose exec backend python sync.py
```

Open the application at [http://localhost:80](http://localhost:80). The backend health endpoint is available at [http://localhost:8000/health](http://localhost:8000/health).

Nginx forwards `/api/` requests to the Compose backend service. The backend listens on port `8000` inside the container; the local development setup uses port `8001`.

To stop the services:

```powershell
docker compose down
```

The root `Dockerfile` builds and serves the frontend through Nginx. `backend/Dockerfile` runs FastAPI. Neon remains external; no database container is defined.

## Tests and production build

Run the backend test suite from the repository root:

```powershell
python -m pytest backend/tests -q
```

Build the frontend for production:

```powershell
npm run build
```

The backend tests cover hourly aggregation, incomplete half-hours, cutoff selection, source matching, metric calculations, date windows, API response contracts, and Elexon filtering.

Docker runtime checks require a working Docker daemon. Run the tests and build commands in your environment before treating the project as verified.

## Deployment

The repository includes Docker configuration and a `vercel.json` template for frontend hosting and backend rewriting.

Before deploying:

1. Deploy the FastAPI backend to a service that supports persistent application hosting.
2. Configure its `DATABASE_URL`, `DECISION_CUTOFF_TIME`, `ALLOWED_ORIGINS`, and `SYNC_SECRET` environment variables as needed.
3. Set the real backend URL in the Vercel rewrite configuration and configure the frontend’s allowed origin on the backend.
4. Ensure the Neon database is reachable from the deployed backend.
5. Run the historical sync and verify the API responses and dashboard in a private/incognito browser window.

**Live deployment URL:** Add the actual public URL here after deployment and verification.

## Known limitations

- The evaluation period is limited to January 2026 decision dates.
- Only Elexon national wind forecasts and wind actuals are included.
- Results depend on source-data availability and eligible forecast publication vintages.
- Incomplete hourly actuals are excluded rather than estimated.
- MAPE excludes zero-actual observations.
- Historical summary cards average daily metrics without weighting by each day's sample count.
- The application is an analysis tool, not a purchasing or trading recommendation system.

## AI assistance and review

AI coding assistance was used during development: **GitHub Copilot via Copilot SDK in VS Code**.

The implementation, source-data interpretation, metric calculations, security configuration, tests, and deployment behavior should be reviewed and validated by a human before client delivery.

## License

No license has been specified. Add a `LICENSE` file if you intend to grant permission for reuse or redistribution.
