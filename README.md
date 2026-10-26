# GridBricks — UK Wind Forecast Intelligence

**Live Demo:** https://gridbricks-evdcs.vercel.app/
**Source Code:** https://github.com/Anmoldubey2648/Evdcs

A full-stack wind forecast intelligence dashboard built with React, FastAPI, and Neon PostgreSQL. GridBricks evaluates Elexon national wind generation forecasts against observed generation for January 2026 day-ahead decisions.

## Features

- **Overview:** Forecast performance and hourly coverage.
- **Forecast Analysis:** Compare eligible forecasts with observed wind generation.
- **Historical Accuracy:** Review daily forecast errors and coverage.
- **Data Explorer:** Inspect hourly records and missing data.
- **Forecast Vintage Selection:** Select the latest forecast published before the decision cutoff.
- **Accuracy Metrics:** MAE, RMSE, MBE, and MAPE with explicit sample counts.

## Tech Stack

| Layer | Technologies |
|---|---|
| Frontend | React, Vite, Recharts |
| Backend | Python, FastAPI |
| Database | Neon PostgreSQL, SQLAlchemy |
| Data Source | Elexon BMRS — FUELHH and WINDFOR |
| Deployment | Vercel Services |
| Local Infrastructure | Docker, Docker Compose, Nginx |

## Data Methodology

- Decision dates: January 1–31, 2026.
- Default forecast cutoff: 11:00 UTC.
- Actual generation: Elexon FUELHH, filtered to `fuelType=WIND`.
- Forecasts: Elexon WINDFOR publication vintages.
- Hourly actuals are calculated only when both half-hour records are available.
- Forecasts and actuals are matched using UTC hour-start timestamps.
- Forecasts published after the decision cutoff are excluded.

**Scope:** GridBricks evaluates forecast accuracy. It does not recommend purchase quantities or model electricity demand, prices, contracts, or other generation sources.

## Architecture

Elexon BMRS → FastAPI ingestion → Neon PostgreSQL → FastAPI API → React dashboard

The Vercel deployment serves the frontend at `/` and routes backend requests through `/api/*`.

## Run Locally

### Prerequisites

Python 3.10+, Node.js 20.19+, npm, and a Neon PostgreSQL database.

### Backend

```powershell
cd backend
py -3 -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

Configure `backend/.env` using `backend/.env.example`, then start the API:

```powershell
uvicorn main:app --reload --host 127.0.0.1 --port 8001
```

### Frontend

In a separate terminal at the repository root:

```powershell
npm ci
npm run dev -- --host 127.0.0.1 --port 5173
```

Open http://localhost:5173.

### Data Synchronization

With the backend environment active and `DATABASE_URL` configured:

```powershell
cd backend
python sync.py
```

### Docker

Configure the root `.env` file with your own database connection, then run:

```powershell
docker compose --env-file .env up --build -d
```

Open http://localhost:80.

## Tests

```powershell
python -m pytest backend/tests -q
npm run build
```

## Environment Variables

- `DATABASE_URL` — required PostgreSQL connection.
- `DECISION_CUTOFF_TIME` — optional UTC cutoff; defaults to `11:00`.
- `ALLOWED_ORIGINS` — permitted frontend origins.
- `SYNC_SECRET` — secret used to authorize data synchronization.

Never commit `.env` files or expose credentials in frontend code.

## Repository Structure

- `src/` — React dashboard and shared components.
- `backend/main.py` — FastAPI endpoints.
- `backend/elexon_client.py` — Elexon API integration.
- `backend/metrics.py` — Forecast matching and accuracy calculations.
- `backend/database.py` — Database schema and connection.
- `backend/sync.py` — Historical data ingestion.
- `backend/tests/` — Backend tests.
- `Dockerfile`, `backend/Dockerfile` — Container images.
- `docker-compose.yml`, `nginx.conf` — Local deployment configuration.
- `vercel.json` — Vercel service routing.
- `VIDEO_SCRIPT.md` — Demo and technical walkthrough script.

## Limitations

- Evaluation is limited to January 2026 decision dates.
- Results depend on available source records and eligible forecast vintages.
- Incomplete hourly actuals are excluded rather than interpolated.
- MAPE excludes observations with zero actual generation.
- Historical summary cards use unweighted averages of daily metrics.

## AI Assistance

GitHub Copilot via Copilot SDK in VS Code was used during development. Source-data interpretation, metric calculations, security, and deployment behavior should be reviewed before client delivery.

## License

No license has been specified.
