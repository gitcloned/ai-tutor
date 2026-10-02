# Class and learning journey backend — implementation plan

**Source of truth:** `/Users/ashishjain/Documents/Projects/Projects/prodigy/user-journeys/class.md`

**Goal:** A child sees topics assigned by their classes and can start or continue the right learning activity. Progress is shared across classes, with one journey per student per subject.

This plan covers backend changes, migration and tests. It does not implement the frontend. Keep the existing ports and session handshake. Do not start replacement services for testing; coordinate any required restart of the running services.

## Rules to preserve

- CMS owns curriculum; ERP owns classes and enrollment; LP owns assignments and progress.
- Topic grades are recommendations, not restrictions.
- One journey per `(studentId, subjectId)`; one node per `(journeyId, conceptId)`.
- Keep the current `initialised`, `started`, `completed` session statuses. No `paused` status or separate `/continue` route.
- GET routes only read. Session start rechecks the decision before creating nodes or advancing state.
- Reuse saved conversation, teaching steps, prerequisite return points and practice progress.
- No fallback to `journeys[0]`. Missing curriculum links must produce a clear error.
- Keep IDs stable and use explicit IDs in bulk inserts/upserts; do not assume document save hooks run for every write operation.

## 1. Fix curriculum lookup and define subjects

**Files:** `cms/packages/types/src/index.ts`, `cms/packages/backend/src/models/`, `cms/packages/backend/src/server.ts`.

- [ ] Add a small Subject model with stable `id` and editable `title`; add `subjectId` to strands. Do not use a display name such as “Mathematics” as the identity.
- [ ] Add `recommendedGrades: number[]` to topics. Validate grade values; an empty list means no recommendation has been set.
- [ ] Audit actual CMS references before changing queries. Imported records currently use string IDs in places where schemas expect ObjectIds. In particular, `/topics/:id/concepts` currently returns an empty list for a populated imported topic.
- [ ] Use one consistent reference-resolution approach for curriculum, topic, subject and concept lookups. Support existing records during migration; do not interpret a failed relationship lookup as an empty topic.
- [ ] Add `GET /curriculum?grade=7`: return subjects → strands → units → topics → concepts, in CMS order. Include IDs, titles, topic grades, `recommended`, and concept `supportedPhases`. Do not hide other grades.
- [ ] Add `GET /topics/:id/subject`: return the stable subject ID. Missing topic/unit/strand links return a clear error, not an “Unknown” subject.
- [ ] Ensure concept responses expose the concept's actual topic ID. Use this when creating normal and prerequisite nodes.

**Check:** a known imported topic returns the same concepts through the hierarchy and topic-concepts routes. Grade recommendations do not restrict access. Subject title changes do not change identity.

## 2. Add models and uniqueness

**Files:** ERP and LP `src/models/`, their model exports, shared types, and `agent/src/types.ts`.

- [ ] ERP Class: add `kind: teacher | personal`, selected subjects, and `personalStudentId` for personal classes. Keep `ownerUserId`, name and grade.
- [ ] Require invitation-code fields only for teacher classes. Personal classes have no invitation code, reject invitation/join operations, and can contain only their linked child. Enforce one personal class per child with a partial unique index.
- [ ] Store class topic assignments with `classroomId`, `subjectId`, `topicId`; prevent duplicate topics within one class.
- [ ] LP Journey: add required `subjectId` after migration; enforce a **unique** `(studentId, subjectId)` index.
- [ ] Add `learning_journey_topics`: `id`, `journeyId`, `topicId`, `sourceClassIds`, `assignedAt`; unique `(journeyId, topicId)`.
- [ ] Add `topicId` to concept nodes. Retain existing node uniqueness, state, activity and prerequisite fields.
- [ ] Record the originating selected topic on sessions as `originTopicId`, including prerequisite sessions. This supports Home continuation without adding a second concept-state system. A node's `topicId` always means its actual CMS topic.

Do not create every concept node at enrollment. Create nodes when first needed, initially `not_assessed`.

## 3. Implement safe assignment sync

**Files:** ERP/LP server routes and extracted assignment helpers.

### LP: `PUT /students/:id/class-assignments/:classId`

- [ ] Accept the class's selected subject IDs and topic assignments, plus its assignment revision. Selected subjects are explicit so a subject can have a journey before topics are selected.
- [ ] Require service authentication from ERP. “Called by ERP” is not itself an access check.
- [ ] Validate the full request before writing. Resolve topic-to-subject membership from CMS; reject inconsistent IDs.
- [ ] Atomically upsert subject journeys and assigned topics, using the unique indexes. Concurrent retries must reuse the same records.
- [ ] Add this class to each topic's `sourceClassIds` using set semantics.
- [ ] Remove only this class's source from topics removed from the selection. Keep their nodes and sessions. A topic with no remaining sources is hidden from assigned-topic views and cannot be selected through `/next`.
- [ ] Prevent an older retry from replacing a newer assignment revision. Serialize or atomically guard updates per student/class.

### ERP: `PUT /classrooms/:id/topics`

- [ ] Use the existing verified identity (`accessIdentity` / owner lookup), not an undefined `requireAuth` or `req.userId`.
- [ ] Check class ownership and validate all selected subjects/topics with CMS before changing assignments.
- [ ] Replace the selection atomically. Do not use an unprotected `deleteMany` followed by `insertMany`. Use a transaction where available, or publish a validated revision through a single atomic class-record update with versioned assignment rows.
- [ ] Persist per-enrollment sync status/revision. Sync each child to LP and return `ready` or `pending` with retryable failures. Never swallow failures and report full success.
- [ ] Repeating the request with the same selection retries pending work without duplicating data or changing progress.

### ERP: `GET /students/:id/classes/:classId/topics`

- [ ] Check the caller may access this student/class, then check enrollment. An enrollment record alone does not authorize the caller.
- [ ] Return assigned subjects/topics with CMS titles and strand/unit hierarchy. Do not calculate learning progress here.
- [ ] Update ERP's student-route allowlist and CORS to support the intended authenticated GET and owner PUT requests.

**Check:** repeat/concurrent sync, two overlapping classes, removing one/all sources, invalid CMS IDs, LP outage, stale retry and successful recovery. No progress is deleted.

## 4. Connect class and child creation

**Files:** ERP student/class/enrollment routes and setup helpers.

- [ ] Teacher class creation accepts selected subjects/topics and validates them as in task 3.
- [ ] Every enrollment path runs assignment sync: new student, existing profile and invitation code. An “already joined” response must also retry any pending sync.
- [ ] Distinguish parent-created child setup from teacher roster creation using an explicit setup context. An adult can have both roles; do not infer the flow solely from their roles.
- [ ] Parent setup: create child → create personal class → save subjects/topics → enroll child → sync LP. Use grade recommendations when no explicit selection is supplied; preserve an explicitly empty selection. Normalize existing grades such as “Grade 7” before querying CMS.
- [ ] Return the existing child/access-code response plus setup status and personal class ID. Preserve the normal teacher student-creation flow; do not create an extra personal class for each teacher roster entry.
- [ ] Use a persisted idempotency key for creation. After a partial failure, retry from the last successful step and reuse the child, personal class and code. Do not silently discard assignment errors.

**Check:** parent setup, adult with both roles, teacher bulk creation, setup retry after each failed step, no duplicate enrollment, and rejection of a second child in a personal class.

## 5. Build one read-only next-learning resolver

**Files:** LP progression helper, `agent/src/learning/what-is-next.ts`, `agent/src/context.ts`, relevant shared types.

- [ ] Extract reusable pure phase/progression rules from the agent into a shared module/package with explicit build dependencies. LP and agent must not maintain separate hardcoded definitions of completion or phase transitions.
- [ ] Keep selection in an LP helper used by both Home and topic-next. The agent calls topic-next again at session start and applies the shared transition rules; it does not trust a stale browser result.
- [ ] Completion uses each concept's `supportedPhases`: `clarity` may finish a learn-only concept; `mastered` is not enough when exam readiness remains. Preserve compatibility with the existing `exam_ready` terminal marker. Missing nodes are unassessed. Empty/broken topics are unavailable, never completed.
- [ ] For a fresh topic, select its last concept by explicit CMS order. Define a stable ID tie-break for equal order values.
- [ ] Otherwise continue the most recently active unfinished path, including prerequisite detours outside the selected topic. Preserve `originTopicId` when returning a different concept.
- [ ] Use node `lastActivity` and saved session message/plan timestamps, not only session creation time. Update activity during real teaching/student turns and prerequisite transitions. Backfill older activity from session history.
- [ ] At checkpoints, use existing next-phase/return-to-origin rules without writing during GET. Keep the current node state distinct internally from the proposed phase; the agent must apply a transition only once.
- [ ] If no unfinished path remains, select the last unassessed concept by CMS order. Treat existing nodes at `not_assessed` as unassessed too. Never rely on MongoDB's unsorted result order.
- [ ] Restrict normal selection to the assigned topic. Prerequisite routing is the exception; do not silently continue into an unrelated topic when `goTo` crosses its boundary.
- [ ] Detect prerequisite cycles and missing links; return an unavailable reason instead of returning an unresolved hold node after a depth limit.
- [ ] Resume lookup requires the student, selected journey node, correct phase and an unfinished `started` session. Reject superseded sessions with a completed phase. Keep saved prerequisite return sessions eligible for their intended return point.

**Check:** fresh topic, existing unassessed nodes, no activity timestamps, stale assessment followed by mastery, optional exam phase, learn-only completion, empty topic, out-of-topic prerequisite and return, cyclic links, equal-order concepts and all concepts complete.

## 6. Add LP Home and topic-next APIs

**Files:** LP server, identity/access helper, response types.

- [ ] Protect these student routes using verified student/owner identity. Reuse ERP identity validation, or a shared verified-token helper; do not trust URL IDs or caller-supplied identity headers. Configure browser CORS for the new read APIs and service credentials for assignment sync.
- [ ] `GET /students/:id/topics/:topicId/next`: require an active assignment, call the resolver, return one of:

```typescript
type NextLearning =
  | { status: 'continue'; topicId: string; conceptId: string;
      state: string; resumeSessionId: string | null }
  | { status: 'completed' }
  | { status: 'unavailable'; reason: string };
```

`topicId` is the selected/origin topic. `state` is the phase proposed for continuation (or `not_assessed` for a fresh concept). It is a suggestion, not a client instruction to update the node.

- [ ] `GET /students/:id/home`: join journeys and active topic assignments with CMS names/hierarchy. Return each topic's `not_started`, `in_progress`, `completed` or `unavailable` status, derived using the same rules.
- [ ] Choose Home's `continueWith` from the most recently active unfinished assigned topic and use the same resolver result. Exclude source-less assignments and preserve topic origin during prerequisite work.
- [ ] Return `continueWith: null` when there is no previous unfinished learning. A new child sees assigned topics, not an automatically chosen first lesson. No journeys returns `{ subjects: [], continueWith: null }`.
- [ ] Batch curriculum/node/session reads where possible; avoid making a separate full curriculum request for every topic.
- [ ] Do not add `/continue`. Do not create journeys, nodes, sessions or state transitions during GET.

**Check:** names/hierarchy and completion visible to the frontend, no cross-student reads, no source-less topics, Home and topic-next agree, and repeated GET calls leave the database unchanged.

## 7. Update the existing agent handshake and resume flow

**Files:** `agent/src/session-manager.ts`, `context.ts`, `types.ts`, `transports/ws-multi.ts`, `tools/redirect.ts`, `tools/plan.ts`, `tools/state.ts`, `scripts/cli.mjs` and their callers/tests.

- [ ] Extend `POST /sessions` to accept `topicId` and optional `resumeSessionId` alongside student/concept IDs. Keep the response: `sessionId`, `resumed`, concept/state and `wsUrl`.
- [ ] Authenticate the caller and ask LP for the current topic decision. Completed/unavailable topics must not silently restart. Recheck any suggested session ID against current progress.
- [ ] Resolve the correct subject journey; do not fall back to the first journey on CMS failure. Create a node only when needed, using its actual concept-to-topic relationship from CMS.
- [ ] Preserve backward compatibility for trusted CLI concept-only starts by deriving topic/subject from CMS. Avoid shifting the positional `forceState` argument: use an options object and update all callers explicitly.
- [ ] Update **both** normal resume in `buildContext()` and prerequisite return in `redirect.ts` to use the stricter session selection. Return-from-prerequisite must preserve `resumeFromStep` and the matching saved plan entry.
- [ ] Restore unfinished teaching steps and practice outcomes from the selected session. Current context building compiles a fresh plan; explicitly preserve the saved matching plan/status rather than assuming conversation history alone restores the cursor.
- [ ] At actual phase completion, persist `completed` and the ending state/time. Keep in-memory session state consistent with LP. Audit normal phase completion as well as the existing prerequisite completion path.
- [ ] On disconnect, save unfinished work as `started`, leave completed sessions completed, and remove only the live connection. Do not unconditionally rewrite every session to `started` or clear a real completion time.
- [ ] Repeated start requests reuse an eligible active session rather than creating competing agents for the same work. Persist all continuation data needed after process restart.
- [ ] Keep `/sessions/:id` and the WebSocket ticket flow. Session lookup GET currently serves only loaded sessions; saved-session recovery goes through `POST /sessions`. Document this for the frontend so it can restart the handshake after an expired live connection.

**Check:** browser handshake, existing CLI arguments, wrong topic/subject rejection, stale resume ID, normal and prerequisite resume, phase completion then disconnect, incomplete disconnect/restart/resume, and repeated session-start requests.

## 8. Migrate existing data before enforcing the new model

**Files:** rerunnable migration scripts under `cms/scripts/`, migration report and rollback notes.

- [ ] Provide dry-run mode and a backup/export step. Report unresolved mappings; do not guess and silently move progress.
- [ ] Create stable subject IDs and backfill strand links. Backfill topic grade recommendations from an explicit reviewed mapping; unknown recommendations stay empty and are reported.
- [ ] Normalize/resolve existing curriculum references, and verify concept counts before/after.
- [ ] Split old student journeys by each node's CMS subject. Reuse/merge subject journeys without resetting states. Resolve duplicate concept nodes using chronological session/plan evidence, not a simplistic highest-state ranking.
- [ ] Preserve session IDs/history and update their journey-node references when nodes merge. Preserve prerequisite relationships and saved return points. Backfill node topic/activity and session origin where evidence permits.
- [ ] Backfill class assignments, journey-topic sources and parent personal classes. Classify parent-created versus teacher-created children using reliable ownership/enrollment evidence; report ambiguous cases instead of giving every student a personal class.
- [ ] Do not blindly reopen historical completed sessions. Recover only demonstrably unfinished work, or report it for review.
- [ ] Verify no orphan references or duplicate student/subject pairs, then enable required fields and unique indexes. A rerun must make no additional changes.

Migration is part of this delivery, not an out-of-scope follow-up. Coordinate a maintenance window or write freeze for the data move; do not run it on the user's database during implementation without presenting the dry-run result.

## 9. Verification and delivery

- [ ] Add automated unit tests for shared progression rules and selection; integration tests for assignments, identity checks, retry handling and migrations. Curl smoke tests are supplementary.
- [ ] Run type checks/builds for shared packages, CMS, ERP, LP and agent; run the existing parser, progression and redirect tests affected by the changes.
- [ ] Test one real parent setup and one teacher enrollment using isolated fixture records against the existing services. Verify overlap does not duplicate progress.
- [ ] Test topic-start → authenticated session handshake → tutor response → disconnect → resume with the same saved teaching progress. Test the completed-topic case separately.
- [ ] Confirm the new routes supply titles, hierarchy, completion and continuation without frontend progression logic.
- [ ] Document request/response contracts, setup idempotency and retry statuses, migration order, service credentials and required restarts. Keep secrets out of logs.

**Delivery order:** implement models and migration tooling → curriculum lookups → assignment sync and ERP setup → shared progression/resume logic → LP read APIs → agent handshake → tests → reviewed migration and coordinated rollout. Do not claim migration or live integration passed unless it was actually run.
