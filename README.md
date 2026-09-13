# Prodigy

AI-powered tutoring platform. Two sub-systems:
- **CMS** (`cms/`) — content management for concepts, questions, and resources
- **Agent** (`agent/`) — AI teaching harness (Gemini-powered, session-based)

---

## Prerequisites

- Node.js 20+
- pnpm (`npm install -g pnpm`)
- MongoDB running locally on `mongodb://127.0.0.1:27017/prodigy`
- Gemini API key (for the agent)

---

## Setup

```bash
# 1. Clone
git clone https://github.com/gitcloned/ai-tutor.git prodigy
cd prodigy

# 2. Install CMS dependencies
cd cms && pnpm install && cd ..

# 3. Install agent dependencies
cd agent && pnpm install && cd ..

# 4. Add agent env
echo "GEMINI_API_KEY=your_key_here" > agent/.env
```

---

## Running

### CMS backend (port 32001)

```bash
cd cms
pnpm dev
```

### Learning Progression service (port 32002)

```bash
cd cms/packages/learning-progression
pnpm dev
```

### Agent CLI

```bash
cd agent
pnpm build   # compile TypeScript once

node scripts/cli.mjs --concept <ka-slug> --student <student-id>
```

Example:
```bash
node scripts/cli.mjs --concept graphing-solutions-to-2-variable-linear-equations-1 --student gaurav_chopra
```

Type your messages and press Enter. Type `/exit` to end the session.

---

## Environment variables

Prodigy application services use dedicated local ports:

| Service | Port |
|---|---|
| Canvas development server | 32000 |
| CMS | 32001 |
| Learning progression | 32002 |
| Model resources | 32003 |
| Agent WebSocket / replay (run one at a time) | 32004 |
| Canvas production preview | 32005 |

Open Canvas at `http://127.0.0.1:32000` and connect to `ws://127.0.0.1:32004`. Vite uses strict ports. MongoDB is an external shared dependency and remains at its configured address (default port 27017).

| Variable | Where | Required | Notes |
|---|---|---|---|
| `GEMINI_API_KEY` | `agent/.env` | Yes | Gemini Flash API key |
| `CMS_URL` | `agent/.env` | No | Default: `http://localhost:32001` |
| `LP_URL` | `agent/.env` | No | Default: `http://localhost:32002` |
| `WS_PORT` | `agent/.env` | No | Agent CLI and replay default: 32004; `--port` overrides it |
| `PORT` | env | No | CMS backend default: 32001; LP default: 32002 |
| `MONGO_URI` | env | No | Default: `mongodb://127.0.0.1:27017/prodigy` |

---

## Importing content (KA)

Khan Academy content import pipeline lives in `scripts/ka-import/`. See [System docs](docs are in `/Users/ashishjain/Documents/Projects/Projects/prodigy/system.md`) for the 3-step pipeline.

---

## Docs

Full documentation at `/Users/ashishjain/Documents/Projects/Projects/prodigy/`.

| | |
|---|---|
| System | Architecture, monorepo, tech stack |
| Data Model | Entities and fields |
| Agent | Session flow, harness, skills, tools, transport |
| API | LP and CMS endpoint contracts |
| Decisions | Design choices and rationale |
