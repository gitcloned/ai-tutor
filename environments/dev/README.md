# Dev Environment

AWS Ubuntu dev server for running Prodigy locally.

## Server access

```bash
ssh -i environments/dev/ashish-prodigy-dev-server ubuntu@10.0.65.166
```

> The key file is gitignored — never commit it. Share it out-of-band.

## Setup (fresh machine)

```bash
git clone https://github.com/lbpl-co/prodigy.git
cd prodigy

# Fill in API keys before running
cp environments/dev/.env.example agent/.env
nano agent/.env

bash environments/dev/setup.sh
```

## Health check

```bash
bash environments/dev/setup.sh health
```

## Services managed by pm2

| Name | Port | What |
|---|---|---|
| `cms-backend` | 32001 | CMS content API (Express + MongoDB) |
| `lp-server` | 32002 | Learning Progression API (Express + MongoDB) |
| `erp-server` | 32005 | Student and classroom API |
| `agent-server` | 32004 | Multi-session tutor HTTP API and WebSocket |
| `canvas` | 32000 | React UI (Vite dev server) |

## Agent sessions

Home starts and resumes sessions through `/api/agent`. The agent runs continuously under PM2 and returns public WebSocket URLs using `/ws`.

After updating the repository on the Ubuntu server, apply configuration with:

```bash
bash environments/dev/setup.sh
bash environments/dev/setup.sh health
```

Do not run a separate CLI tutor on port 32004 while `agent-server` is running.

## Firebase frontend using the dev backend

From a machine signed into Firebase, run:

```bash
bash environments/dev/deploy-firebase.sh
```

This supplies all four public API URLs to Firebase's build hook. A plain build without these variables cannot connect to services when hosted over HTTPS. The Ubuntu backend must already have the updated nginx routes and running tutor server.

## Useful pm2 commands

```bash
pm2 status           # list all processes
pm2 logs             # tail all logs
pm2 logs lp-server   # tail one service
pm2 restart all      # restart everything
pm2 stop all         # stop everything
pm2 startup          # enable auto-start on reboot (run printed command, then pm2 save)
```

## DB sync (local → dev)

Dumps local MongoDB and restores it on the dev server.

```bash
# Full flow: dump → upload → restore
bash environments/dev/db-sync.sh

# Dump only (no upload)
bash environments/dev/db-sync.sh dump

# Upload + restore last dump
bash environments/dev/db-sync.sh upload
```

Dumps are saved locally in `environments/dev/dumps/` (gitignored) with IST timestamps.

## Files

| File | Purpose |
|---|---|
| `setup.sh` | Full install + start, or health check |
| `db-sync.sh` | Dump local DB and restore on dev server |
| `ashish-prodigy-dev-server` | SSH private key (gitignored) |
| `dumps/` | Local dump archives (gitignored) |
