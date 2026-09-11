# Document Config

docs_folder: /Users/ashishjain/Documents/Projects/Projects/prodigy
sync_branches: [main]
categories: [system,data,api,decisions]

## Documentation Style

- Short bullets, not paragraphs — one idea per line
- Tables for structured data (entities, endpoints, dependencies)
- Decisions in one line: "Chose X over Y — reason"
- Plain English — no jargon without a plain explanation
- Simple flow diagrams when useful: A → B → C in a code block

## Documentation Rules

- Document the system architecture — component structure, tech stack, and key technology choices with rationale
- Keep a data model section current with key entities, fields, and storage decisions
- Log API contract changes — endpoints added, modified, or removed; include auth requirements and query params
- Record architectural decisions with rationale — what was decided, why, and what alternatives were ruled out

## Documentation Exclusions

- Do not document internal implementation details — only interfaces and decisions

## Documentation Index

### Structure
*Snapshot: 2026-09-10*

| File | Lines | Last modified | Since last sync |
|---|---|---|---|
| prodigy.md | 26 | 2026-09-09 | unchanged |
| system.md | 108 | 2026-09-09 | unchanged |
| data.md | 429 | 2026-09-10 | +13 lines |
| decisions.md | 205 | 2026-09-10 | +15 lines |
| agent/overview.md | 164 | 2026-09-09 | unchanged |
| agent/harness.md | 199 | 2026-09-10 | +32 lines |
| agent/skills.md | 120 | 2026-09-09 | unchanged |
| agent/tools.md | 125 | 2026-09-10 | +4 lines |
| agent/transport.md | 183 | 2026-09-10 | +10 lines |
| api/lp.md | 178 | 2026-09-09 | unchanged |
| api/cms.md | 22 | 2026-09-09 | unchanged |
| rough.md | 102 | 2026-09-10 | new (scratch notes — not a category file) |

### Semantic Map

| Category | File(s) | Topics | Last synced |
|---|---|---|---|
| system | system.md | Overview, Monorepo structure (cms/ + agent/), KA import pipeline, Tech stack (Gemini, Transport) | 2026-09-09 |
| data | data.md | Board, Class, Strand, Exam, Resource, Question, HintStep, Concept, LearningJourney, LearningJourneyNode, Session, PlanHistoryEntry, TeachingPlan, Memory, Relationships | 2026-09-10 |
| api | api/lp.md, api/cms.md | LP: Journeys, JourneyNodes, Sessions, Memories; CMS: Concepts | 2026-09-09 |
| decisions | decisions.md | Content Model, Tech Stack, Content Sourcing, Question Format, Hint Trees, Student State, Agent LLM (Gemini), Session Lifecycle, Agent Architecture, Journey Navigation | 2026-09-10 |
| agent/overview | agent/overview.md | Architecture diagram, Session lifecycle, Turn flow, History format | 2026-09-09 |
| agent/harness | agent/harness.md | AgentContext, TurnEngine (action event), SessionManager (fire-and-forget persist), Agent, PlanStep (practice/resource types), Plan compilation (probing + teaching) | 2026-09-10 |
| agent/skills | agent/skills.md | SkillLoader, SKILL.md format, State→skill mapping, Probing skill detail | 2026-09-09 |
| agent/tools | agent/tools.md | read_plan, get_next_step, update_step (internal redirect/state), store_memory | 2026-09-10 |
| agent/transport | agent/transport.md | Transport interface, LogEntry, TurnEvent (incl. action), StdinTransport (pendingAutoSend), CLI flags, Adding transports | 2026-09-10 |
