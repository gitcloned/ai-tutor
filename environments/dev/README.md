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
| `canvas` | 32000 | React UI (Vite dev server) |

## Agent sessions

The agent is not a pm2 process — start it per session:

```bash
cd agent
node scripts/cli.mjs --concept <concept-id> --medium canvas --port 32004
```

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
