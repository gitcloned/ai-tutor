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
*Snapshot: 2026-09-03*

| File | Lines | Last modified | Since last sync |
|---|---|---|---|
| api.md | 9 | 2026-08-25 | unchanged |
| content framework.md | 29 | 2026-08-25 | unchanged |
| data.md | 355 | 2026-09-03 | +65 lines |
| decisions.md | 120 | 2026-09-03 | +9 lines |
| harness.md | 158 | 2026-09-03 | new |
| prodigy.md | 11 | 2026-09-03 | +1 line |
| system.md | 73 | 2026-08-29 | unchanged |

### Semantic Map

| Category | File(s) | Topics | Last synced |
|---|---|---|---|
| system | system.md | Overview, Monorepo structure, Scripts, Tech stack | 2026-08-29 |
| data | data.md | Board, Class, Strand, Exam, Resource, Question (incl. Perseus, teachingTree), HintStep (probing vs teaching tree), Concept (probingTree, masteryQuestions, examQuestions), LearningJourney, LearningJourneyNode (state), Session, TeachingPlan, Memory, Relationships | 2026-09-03 |
| api | api.md | — | — |
| decisions | decisions.md | Content Model, Tech Stack, Structure, Content Sourcing (KA), Question Format (Perseus), Adaptive Hint Trees, Student Concept State, LearningJourneyNode merge, TeachingPlan as text, Memory types | 2026-09-03 |
| harness | harness.md | Objective, Architecture, Session flow, Agent state, Tools, Skills, Concept probing detail, TeachingPlan, State transitions, Memory | 2026-09-03 |
