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
*Snapshot: 2026-09-09*

| File | Lines | Last modified | Since last sync |
|---|---|---|---|
| prodigy.md | 26 | 2026-09-09 | unchanged |
| system.md | 108 | 2026-09-09 | unchanged |
| data.md | 398 | 2026-09-09 | unchanged |
| decisions.md | 162 | 2026-09-09 | unchanged |
| agent/overview.md | 164 | 2026-09-09 | unchanged |
| agent/harness.md | 167 | 2026-09-09 | unchanged |
| agent/skills.md | 120 | 2026-09-09 | unchanged |
| agent/tools.md | 121 | 2026-09-09 | unchanged |
| agent/transport.md | 109 | 2026-09-09 | unchanged |
| api/lp.md | 178 | 2026-09-09 | unchanged |
| api/cms.md | 22 | 2026-09-09 | unchanged |

### Semantic Map

| Category | File(s) | Topics | Last synced |
|---|---|---|---|
| system | system.md | Overview, Monorepo structure (cms/ + agent/), KA import pipeline, Tech stack (Gemini, Transport) | 2026-09-09 |
| data | data.md | Board, Class, Strand, Exam, Resource, Question, HintStep, Concept, LearningJourney, LearningJourneyNode, Session (status: initialised/started/completed), TeachingPlan, Memory, Relationships | 2026-09-09 |
| api | api/lp.md, api/cms.md | LP: Journeys, JourneyNodes, Sessions, Memories; CMS: Concepts | 2026-09-09 |
| decisions | decisions.md | Content Model, Tech Stack, Content Sourcing, Question Format, Hint Trees, Student State, Agent LLM (Gemini), Session Lifecycle, Agent Architecture | 2026-09-09 |
| agent/overview | agent/overview.md | Architecture diagram, Session lifecycle, Turn flow, History format | 2026-09-09 |
| agent/harness | agent/harness.md | AgentContext, TurnEngine, SessionManager, Agent, PlanStep, Plan compilation | 2026-09-09 |
| agent/skills | agent/skills.md | SkillLoader, SKILL.md format, State→skill mapping, Probing skill detail | 2026-09-09 |
| agent/tools | agent/tools.md | read_plan, get_next_step, update_step, advance_state, store_memory | 2026-09-09 |
| agent/transport | agent/transport.md | Transport interface, TurnEvent types, StdinTransport, Adding transports | 2026-09-09 |
