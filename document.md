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
*Snapshot: 2026-10-01*

| File | Lines | Last modified | Since last sync |
|---|---|---|---|
| prodigy.md | 26 | 2026-09-09 | unchanged |
| system.md | 198 | 2026-10-01 | +9 lines |
| data.md | 516 | 2026-10-01 | +65 lines |
| decisions.md | 258 | 2026-10-01 | +24 lines |
| agent/overview.md | 164 | 2026-09-09 | unchanged |
| agent/harness.md | 276 | 2026-09-30 | unchanged |
| agent/skills.md | 161 | 2026-09-30 | unchanged |
| agent/tools.md | 153 | 2026-09-30 | unchanged |
| agent/transport.md | 232 | 2026-09-30 | unchanged |
| api/lp.md | 178 | 2026-09-09 | unchanged |
| api/cms.md | 22 | 2026-09-09 | unchanged |
| api/erp.md | 172 | 2026-10-01 | new |
| rough.md | 102 | 2026-09-10 | unchanged |

### Semantic Map

| Category | File(s) | Topics | Last synced |
|---|---|---|---|
| system | system.md | Overview (canvas+agent+erp+cms), Monorepo, MultiSessionServer vs cli.mjs, Medium architecture, Modalities, KA import, Tech stack | 2026-10-01 |
| data | data.md | Board, Class, Strand, Exam, Resource, Question, HintStep, Concept, LearningJourney, LearningJourneyNode, Session, PlanHistoryEntry, TeachingPlan, Memory, erp_students, erp_users, erp_classrooms, erp_enrollments, Access code format | 2026-10-01 |
| api | api/lp.md, api/cms.md, api/erp.md | LP: Journeys, JourneyNodes, Sessions, Memories; CMS: Concepts; ERP: student auth, adult auth, students, classrooms, enrollment, sessions | 2026-10-01 |
| decisions | decisions.md | Content Model, Tech Stack, Content Sourcing, Question Format, Hint Trees, Student State, Agent LLM, Session Lifecycle, Agent Architecture, Journey Navigation, Medium Architecture, Mastery Phase, returnToOrigin fix, ERP v1 scope, Multi-session WS | 2026-10-01 |
| agent/overview | agent/overview.md | Architecture diagram, Session lifecycle, Turn flow, History format | 2026-09-09 |
| agent/harness | agent/harness.md | AgentContext (practice, modelPrompt), TurnEngine, SessionManager, Agent, PlanStep, Markdown plan builder v2 (probe/teach/mastery.md + questions.json), transitionState (in-session), Legacy DB plan compilation | 2026-09-30 |
| agent/skills | agent/skills.md | SkillLoader, SKILL.md format, State→skill mapping, Probing skill, Learning skill, Mastering skill (get_next_question loop) | 2026-09-30 |
| agent/tools | agent/tools.md | read_plan, get_next_step, update_step, get_next_question (practice loop, stepsToSolve/hints), store_memory | 2026-09-30 |
| agent/transport | agent/transport.md | Transport interface, TurnEvent (action types: send-ok, open-camera, parallel), StdinTransport, WebSocketTransport (protocol, modalities, CLI flags) | 2026-09-30 |
