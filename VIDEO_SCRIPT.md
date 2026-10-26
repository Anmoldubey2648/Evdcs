# GridBricks demo script

Target duration: approximately 8 minutes total. Keep Part 1 under five minutes and Part 2 under five minutes. This script is a recording aid; it is not evidence that a video has been recorded or uploaded.

## Part 1 — customer pitch and application (about 4 minutes)

### 0:00–0:40 — The procurement problem

**Say:** “A day-ahead procurement decision depends on the renewable generation information actually available at decision time. GridBricks brings Elexon wind forecasts, their publication vintages, observed wind generation, and measured forecast error into one view. It helps assess the wind outlook and uncertainty; it does not calculate the final purchase quantity because demand and contracted-supply data are outside this assignment.”

### 0:40–1:30 — Overview

Open Overview and point out the selected January 2026 decision date, associated delivery date, UTC decision cutoff, wind forecast and actual generation, accuracy KPIs, and matched/unmatched coverage.

**Say:** “For this delivery, only forecast publications at or before the displayed cutoff are eligible. The score is based on records that can be matched; the coverage count is shown separately so a partial sample is not mistaken for full coverage.”

For the currently verified local sample, report 24/24 hourly matches for the selected delivery day. Do not imply this is guaranteed for other dates or refreshed datasets.

### 1:30–2:35 — Forecast Analysis

Open Forecast Analysis. Identify the hourly FUELHH actual-mean series and WINDFOR forecast series, publication timestamp badges, UTC timestamps, and the forecast-minus-actual error.

**Say:** “FUELHH has half-hourly actual periods, while WINDFOR has hourly delivery starts. For each UTC hour, GridBricks averages the two source actuals only when both are present. It compares that hourly mean with the hourly forecast and does not interpolate incomplete hours.”

Select a forecast point and read its timestamp and values from the tooltip. Change the decision date and show that delivery date, publication information, chart, and matching count refresh together.

### 2:35–3:15 — Historical Accuracy

Open Historical Accuracy. Point out the January decision-date scope, daily metrics, coverage, and February 1 delivery corresponding to the January 31 decision.

**Say:** “The summary is an unweighted mean of each scored delivery day’s metric, not a pooled calculation over every settlement period.”

### 3:15–4:00 — Data Explorer and limitations

Open Data Explorer, select a delivery date, inspect matched and unmatched rows, publication times, and use the search field.

**Say:** “This table makes missing periods auditable. The current product is a forecast-intelligence and accuracy tool. To recommend a purchase volume, the utility would need to add demand, other supply, contracts, and market-position data, which are explicitly outside this scope.”

## Part 2 — architecture and engineering review (about 4 minutes)

### 0:00–1:05 — Architecture and source data

Show the React client, FastAPI backend, Neon PostgreSQL persistence, Elexon client, Docker configuration, and deployment template. State whether Docker and the deployment URL were verified in the current run.

**Say:** “FUELHH is requested with `fuelType=WIND`; the WINDFOR stream provides delivery start time and publication time. The local health response reports source record counts and the last synchronization times.”

### 1:05–2:10 — Forecast cutoff and matching

Show `backend/metrics.py` and the API handlers in `backend/main.py`.

**Say:** “Timestamps are normalized to UTC. For each delivery start time, the backend chooses the latest forecast publication at or before the configured decision cutoff. Matching is exact by delivery start time; unmatched values stay null. The application does not silently carry forecasts forward.”

### 2:10–3:00 — Metrics and coverage

Show `compute_metrics` and Historical Accuracy.

**Say:** “MAE and RMSE use absolute and squared forecast-minus-actual errors; mean bias preserves the sign; MAPE excludes zero-actual samples and exposes its sample count. Coverage is matched hourly pairs divided by the 24 expected delivery hours. The verified January sample contains 31 decision dates and 744/744 matched hours; deliveries run January 2 through February 1.”

### 3:00–3:35 — Tests and local verification

Show the backend test suite and frontend build output from the current verified run.

**Say:** “Report the exact backend test and frontend build results from this checkout. Docker is not verified unless a Docker daemon is available and the compose build and startup succeed.”

### 3:35–4:00 — Deployment and disclosure

**Say:** “The repository includes a Vercel rewrite template and container configuration; replace the backend placeholder and verify a public deployment before release. GitHub publication, YouTube recording/upload, and the submission form are manual release steps. AI coding assistance used: GitHub Copilot via Copilot SDK in VS Code.”
