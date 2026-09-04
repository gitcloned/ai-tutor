# KA Content Import

Imports Khan Academy course content (concepts + resources) into MongoDB.

## How it works

```
get-session.mjs  →  ka-session.json
                          ↓
ka-algebra.json  →  import.mjs  →  MongoDB (concepts + resources)
```

1. **`get-session.mjs`** — Opens a real browser once (Playwright) to pass KA's bot detection. Captures session cookies and the exact GraphQL request signature. Saves to `ka-session.json`.

2. **`import.mjs`** — Reads the session and the topic tree JSON. Makes concurrent HTTP requests (10 at a time) directly to KA's internal GraphQL API using the captured cookies — no browser needed. Writes to MongoDB.

## Run

```bash
# Install deps
npm install mongodb playwright
npx playwright install chromium

# Step 1: get session (opens a browser window — takes ~15 seconds)
node get-session.mjs

# Step 2: copy the topic tree JSON here
cp /tmp/ka_algebra_clean.json ./ka-algebra.json

# Step 3: import
node import.mjs
```

## Performance

- Session capture: ~15 seconds (one-time, browser)
- Enrichment: ~35 seconds for 598 items at 10 concurrent HTTP requests
- Total for a full course: under 1 minute

## What gets imported

| Collection | Per KA unit/item | Key fields |
|---|---|---|
| `concepts` | One per KA unit | title, lessonPlan, prerequisites (prev unit), nextConcepts |
| `resources` | One per video/exercise/article | type, url, youtubeId, youtubeUrl, duration, cfuMarkers, thumbnail |

## Notes

- Session cookies expire — re-run `get-session.mjs` if requests start failing (403s)
- `pcv` (platform commit version) in the GraphQL URL changes on KA deploys — session re-capture fixes this
- Prerequisite chain is unit-order only (Unit N → Unit N-1) — refine manually
- Exercise answers are not available from KA's API (intentionally withheld)
- `cfuMarkers` on videos are populated from KA's own "key moments" (chapter timestamps)
