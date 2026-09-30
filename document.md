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
*Snapshot: 2026-09-30*

| File | Lines | Last modified | Since last sync |
|---|---|---|---|
| prodigy.md | 26 | 2026-09-09 | unchanged |
| system.md | 189 | 2026-09-30 | +81 lines |
| data.md | 451 | 2026-09-30 | +22 lines |
| decisions.md | 234 | 2026-09-30 | +29 lines |
| agent/overview.md | 164 | 2026-09-09 | unchanged |
| agent/harness.md | 275 | 2026-09-30 | +76 lines |
| agent/skills.md | 161 | 2026-09-30 | +41 lines |
| agent/tools.md | 153 | 2026-09-30 | +28 lines |
| agent/transport.md | 232 | 2026-09-30 | +49 lines |
| api/lp.md | 178 | 2026-09-09 | unchanged |
| api/cms.md | 22 | 2026-09-09 | unchanged |
| rough.md | 102 | 2026-09-10 | unchanged |

### Semantic Map

| Category | File(s) | Topics | Last synced |
|---|---|---|---|
| system | system.md | Overview (canvas+agent+cms), Monorepo, Medium architecture, Modalities, KA import, Tech stack | 2026-09-30 |
| data | data.md | Board, Class, Strand, Exam, Resource, Question (DB + questions.json format), HintStep, Concept, LearningJourney, LearningJourneyNode, Session (questionProgress), PlanHistoryEntry, TeachingPlan, Memory, Relationships | 2026-09-30 |
| api | api/lp.md, api/cms.md | LP: Journeys, JourneyNodes, Sessions, Memories; CMS: Concepts | 2026-09-09 |
| decisions | decisions.md | Content Model, Tech Stack, Content Sourcing, Question Format, Hint Trees, Student State, Agent LLM, Session Lifecycle, Agent Architecture, Journey Navigation, Medium Architecture, Mastery Phase, returnToOrigin fix | 2026-09-30 |
| agent/overview | agent/overview.md | Architecture diagram, Session lifecycle, Turn flow, History format | 2026-09-09 |
| agent/harness | agent/harness.md | AgentContext (practice, modelPrompt), TurnEngine, SessionManager, Agent, PlanStep, Markdown plan builder v2 (probe/teach/mastery.md + questions.json), transitionState (in-session), Legacy DB plan compilation | 2026-09-30 |
| agent/skills | agent/skills.md | SkillLoader, SKILL.md format, State→skill mapping, Probing skill, Learning skill, Mastering skill (get_next_question loop) | 2026-09-30 |
| agent/tools | agent/tools.md | read_plan, get_next_step, update_step, get_next_question (practice loop, stepsToSolve/hints), store_memory | 2026-09-30 |
| agent/transport | agent/transport.md | Transport interface, TurnEvent (action types: send-ok, open-camera, parallel), StdinTransport, WebSocketTransport (protocol, modalities, CLI flags) | 2026-09-30 |
