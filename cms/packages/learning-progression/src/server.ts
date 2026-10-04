import express from 'express';
import { readFileSync } from 'fs';
import { resolve, dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { connectDb } from './db.js';
import { LearningJourney, LearningJourneyNode, LearningJourneyTopic, Session, Memory } from './models/index.js';
import {
  selectNextConcept,
  sessionActivity, withSessionActivity, resumableSession,
  isTerminalForConcept,
  type ConceptSummary,
  type NodeSummary,
  type NextLearningResult,
} from '@prodigy/progression';

const __dirname = dirname(fileURLToPath(import.meta.url));

const app  = express();
const PORT = Number(process.env.PORT ?? 32002);

// Canvas sends authenticated requests from its own origin. Handle preflight
// before routes so errors and successful responses both remain readable.
app.use((_req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  next();
});
app.options('*', (_req, res) => { res.sendStatus(204); });

app.use(express.json());

type AsyncHandler = (req: express.Request, res: express.Response, next: express.NextFunction) => Promise<unknown>;
function wrap(fn: AsyncHandler): express.RequestHandler {
  return (req, res, next) => fn(req, res, next).catch(next);
}

// ── Student image uploads (stored by agent) ────────────────────────────────────

const IMAGE_DIR = join(__dirname, '../../../../agent/tmp/images');
const AUDIO_DIR = join(__dirname, '../../../../agent/tmp/audio');
app.use('/image-uploads', express.static(IMAGE_DIR));
app.use('/audio-uploads', express.static(AUDIO_DIR));

// ── Admin UI ───────────────────────────────────────────────────────────────────

function readAdminHtml() {
  try {
    return readFileSync(resolve(__dirname, 'admin.html'), 'utf8');        // dev (src/)
  } catch {
    return readFileSync(resolve(__dirname, '../src/admin.html'), 'utf8'); // prod (dist/)
  }
}
// Read on every request so HTML changes take effect without a server restart.
app.get('/admin', (_req, res) => res.type('html').send(readAdminHtml()));

// ── Health ─────────────────────────────────────────────────────────────────────

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// ── Learning journeys ──────────────────────────────────────────────────────────

app.get('/students/:studentId/journeys', wrap(async (req, res) => {
  const journeys = await LearningJourney.find({ studentId: req.params.studentId });
  res.json(journeys);
}));

app.post('/students/:studentId/journeys', wrap(async (req, res) => {
  const journey = await LearningJourney.create({ ...req.body, studentId: req.params.studentId });
  res.status(201).json(journey);
}));

app.get('/journeys/:id/nodes', wrap(async (req, res) => {
  const nodes = await LearningJourneyNode.find({ journeyId: req.params.id }).sort({ order: 1 });
  res.json(nodes);
}));

// ── Service constants ──────────────────────────────────────────────────────────

const CMS_URL_LP = process.env['CMS_URL'] ?? 'http://localhost:32001';
const LP_SERVICE_SECRET = process.env['LP_SERVICE_SECRET'] ?? '';

function checkServiceAuth(req: express.Request, res: express.Response): boolean {
  if (!LP_SERVICE_SECRET) return true; // not configured — dev mode, allow
  const provided = req.headers['x-service-secret'];
  if (provided !== LP_SERVICE_SECRET) {
    res.status(403).json({ error: 'Invalid service secret' });
    return false;
  }
  return true;
}

async function cmsGetRaw(path: string): Promise<any> {
  const r = await fetch(`${CMS_URL_LP}${path}`, { signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw new Error(`CMS ${path} → ${r.status}`);
  return r.json();
}

// ── Class assignment sync (called by ERP) ──────────────────────────────────────

/**
 * PUT /students/:studentId/class-assignments/:classId
 * Body: { assignments: Array<{ subjectId: string; topicId: string }>, revision: number }
 *
 * Idempotent: upserts subject journeys and journey topics using unique indexes.
 * Removes this classId as a source from topics that are no longer selected.
 * Topics with no remaining sources are hidden from selection but not deleted.
 *
 * `revision` prevents an older retry from overwriting a newer selection.
 * Each journey-topic document caches the last seen revision per classId.
 */
app.put('/students/:studentId/class-assignments/:classId', wrap(async (req, res) => {
  if (!checkServiceAuth(req, res)) return;

  const { studentId, classId } = req.params;
  const { assignments, revision } = req.body as {
    assignments?: Array<{ subjectId: string; topicId: string }>;
    revision?: number;
  };

  if (!Array.isArray(assignments)) {
    return res.status(400).json({ error: 'assignments must be an array' });
  }

  // Validate all topic→subject memberships via CMS
  const validatedAssignments: Array<{ subjectId: string; topicId: string }> = [];
  for (const a of assignments) {
    if (typeof a.subjectId !== 'string' || typeof a.topicId !== 'string') continue;
    try {
      const subjectInfo = await cmsGetRaw(`/topics/${encodeURIComponent(a.topicId)}/subject`);
      if (subjectInfo.subjectId !== a.subjectId) {
        return res.status(400).json({
          error: `Topic '${a.topicId}' belongs to subject '${subjectInfo.subjectId}', not '${a.subjectId}'`,
        });
      }
      validatedAssignments.push(a);
    } catch (err: any) {
      return res.status(400).json({ error: `Invalid topicId '${a.topicId}': ${err.message}` });
    }
  }

  let created = 0;
  let updated = 0;

  // Group by subjectId
  const bySubject = new Map<string, string[]>();
  for (const a of validatedAssignments) {
    if (!bySubject.has(a.subjectId)) bySubject.set(a.subjectId, []);
    bySubject.get(a.subjectId)!.push(a.topicId);
  }

  for (const [subjectId, topicIds] of bySubject) {
    // Find or create the journey (unique on studentId + subjectId)
    let journey = await LearningJourney.findOne({ studentId, subjectId });
    if (!journey) {
      try {
        journey = await LearningJourney.create({ studentId, subjectId, objective: `Learn ${subjectId}` });
      } catch (err: any) {
        // Race: another request created it
        journey = await LearningJourney.findOne({ studentId, subjectId });
        if (!journey) throw err;
      }
    }

    for (const topicId of topicIds) {
      const existing = await LearningJourneyTopic.findOne({ journeyId: journey.id, topicId });
      if (!existing) {
        try {
          await LearningJourneyTopic.create({ journeyId: journey.id, topicId, sourceClassIds: [classId] });
          created++;
        } catch (err: any) {
          // Race: inserted by concurrent request — add classId as source
          await LearningJourneyTopic.updateOne(
            { journeyId: journey.id, topicId },
            { $addToSet: { sourceClassIds: classId } }
          );
          updated++;
        }
      } else if (!existing.sourceClassIds.includes(classId)) {
        await LearningJourneyTopic.updateOne(
          { journeyId: journey.id, topicId },
          { $addToSet: { sourceClassIds: classId } }
        );
        updated++;
      }
    }
  }

  // Remove this class as a source from topics no longer selected
  const incomingTopicIds = validatedAssignments.map(a => a.topicId);
  const studentJourneys = await LearningJourney.find({ studentId }).lean();
  const journeyIds = studentJourneys.map((j: any) => j.id);

  if (journeyIds.length > 0) {
    await LearningJourneyTopic.updateMany(
      {
        journeyId:      { $in: journeyIds },
        topicId:        { $nin: incomingTopicIds },
        sourceClassIds: classId,
      },
      { $pull: { sourceClassIds: classId } }
    );
  }

  res.json({ created, updated });
}));

// ── Student identity check ─────────────────────────────────────────────────────

/**
 * Verify that the caller may access this student's LP data.
 * We call ERP /me with the caller's Authorization header and check that
 * the returned studentId matches. Adults (teachers/parents) who manage
 * the student are accepted if ERP confirms their identity.
 */
const ERP_URL_LP = process.env['ERP_URL'] ?? 'http://localhost:32005';

async function verifyStudentAccess(req: express.Request, studentId: string): Promise<boolean> {
  const authHeader = req.headers['authorization'];
  if (!authHeader) return false;
  try {
    const r = await fetch(
      `${ERP_URL_LP}/me?studentId=${encodeURIComponent(studentId)}`,
      { headers: { authorization: authHeader }, signal: AbortSignal.timeout(8000) }
    );
    if (!r.ok) return false;
    const body: any = await r.json();
    // ERP returns { type:'student', studentId } or { type:'user', ... }
    // A student may only access their own data; an adult may access any student they manage
    if (body.type === 'student') return body.studentId === studentId;
    if (body.type === 'user') return true; // ERP already verified they manage this student via the ?studentId query
    return false;
  } catch {
    return false;
  }
}

// ── CMS helpers ────────────────────────────────────────────────────────────────

async function cmsGetConcepts(topicId: string): Promise<ConceptSummary[]> {
  const r = await fetch(`${CMS_URL_LP}/topics/${encodeURIComponent(topicId)}/concepts`, { signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw new Error(`CMS concepts for topic '${topicId}' → ${r.status}`);
  const docs: any[] = await r.json();
  return docs.map((d: any) => ({
    id:              d.id,
    order:           d.order ?? 0,
    supportedPhases: Array.isArray(d.supportedPhases) ? d.supportedPhases : [],
    tieBreakId:      d.id,
  }));
}

async function cmsGetTopicTitle(topicId: string): Promise<string> {
  try {
    const r = await fetch(`${CMS_URL_LP}/admin/topics/${encodeURIComponent(topicId)}`, { signal: AbortSignal.timeout(5000) });
    if (!r.ok) return topicId;
    const d: any = await r.json();
    return d.title ?? topicId;
  } catch { return topicId; }
}

async function resolveTopicContinuation(topicId:string, nodes:any[], sessions:any[]) {
  const concepts=await cmsGetConcepts(topicId);
  const enriched=withSessionActivity(nodes,sessions);
  const result=selectNextConcept(topicId,concepts,new Map(enriched.map(n=>[n.conceptId,n])),enriched);
  if(result.status!=='continue')return result;
  const node=enriched.find(n=>n.conceptId===result.conceptId);
  return {status:'continue' as const,topicId,conceptId:result.conceptId,state:result.state,resumeSessionId:node?resumableSession(sessions,node)?.id??null:null};
}

// ── LP Home ───────────────────────────────────────────────────────────────────

/**
 * GET /students/:studentId/home
 *
 * Returns:
 * - subjects: journeys with their assigned topics and per-topic status
 * - continueWith: the suggested next concept (from most recently active topic)
 */
app.get('/students/:studentId/home', wrap(async (req, res) => {
  const { studentId } = req.params;

  if (!await verifyStudentAccess(req, studentId)) {
    return res.status(403).json({ error: 'Access denied' });
  }

  const journeys = await LearningJourney.find({ studentId }).lean();
  if (journeys.length === 0) {
    return res.json({ subjects: [], continueWith: null });
  }

  const journeyIds = journeys.map((j: any) => j.id);

  // Load all nodes and journey topics in one pass
  const allNodes: any[] = await LearningJourneyNode.find({ journeyId: { $in: journeyIds } }).lean();
  const allNodesByConceptId = new Map<string, any>(allNodes.map(n => [n.conceptId, n]));
  const allNodeSummaries: NodeSummary[] = allNodes.map(n => ({
    conceptId:     n.conceptId,
    topicId:       n.topicId ?? null,
    state:         n.state,
    lastActivity:  n.lastActivity ?? null,
    cameFrom:      n.cameFrom ?? null,
    preReqToLearn: n.preReqToLearn ?? null,
  }));

  // For each journey, load assigned topics and compute status
  const subjects = await Promise.all(
    journeys.map(async (journey: any) => {
      const jTopics: any[] = await LearningJourneyTopic.find({ journeyId: journey.id }).sort({ assignedAt: 1 }).lean();
      // Only show topics with at least one source class
      const activeTopics = jTopics.filter((jt: any) => jt.sourceClassIds.length > 0);

      const topicsWithStatus = await Promise.all(
        activeTopics.map(async (jt: any) => {
          let status: 'not_started' | 'in_progress' | 'completed' | 'unavailable' = 'not_started';
          let conceptCount = 0;
          try {
            const concepts = await cmsGetConcepts(jt.topicId);
            conceptCount = concepts.length;
            if (concepts.length === 0) {
              status = 'unavailable';
            } else {
              const nodeMap = new Map<string, NodeSummary>(
                concepts
                  .map(c => allNodesByConceptId.get(c.id))
                  .filter(Boolean)
                  .map(n => [n.conceptId, {
                    conceptId: n.conceptId, topicId: n.topicId, state: n.state,
                    lastActivity: n.lastActivity, cameFrom: n.cameFrom, preReqToLearn: n.preReqToLearn,
                  }])
              );
              const allDone = concepts.every(c => isTerminalForConcept(nodeMap.get(c.id)?.state, c.supportedPhases));
              const anyStarted = concepts.some(c => nodeMap.has(c.id) && nodeMap.get(c.id)!.state !== 'not_assessed');
              status = allDone ? 'completed' : anyStarted ? 'in_progress' : 'not_started';
            }
          } catch {
            status = 'unavailable';
          }
          return {
            topicId:        jt.topicId,
            sourceClassIds: jt.sourceClassIds,
            assignedAt:     jt.assignedAt,
            status,
            conceptCount,
          };
        })
      );

      return {
        subjectId: journey.subjectId,
        journeyId: journey.id,
        topics:    topicsWithStatus,
      };
    })
  );

  // Rank previously visited assigned topics by actual conversation activity.
  // Missing node timestamps must not hide unfinished sessions.
  const sessions:any[]=await Session.find({studentId}).lean();
  const ranked: {topicId:string;journeyId:string;activity:number}[]=[];
  for(const subject of subjects){
    for(const topic of subject.topics.filter(t=>t.status==='in_progress')){
      const journeyNodes=allNodes.filter(n=>n.journeyId===subject.journeyId);
      const concepts=await cmsGetConcepts(topic.topicId).catch(()=>[]);
      const ids=new Set(concepts.map(c=>c.id));
      const enriched=withSessionActivity(journeyNodes,sessions);
      const activity=Math.max(0,...enriched.filter(n=>ids.has(n.conceptId)).map(n=>new Date(n.lastActivity??0).getTime()),...sessions.filter(s=>s.originTopicId===topic.topicId&&journeyNodes.some(n=>n.id===s.journeyNodeId)).map(sessionActivity));
      if(activity>0)ranked.push({topicId:topic.topicId,journeyId:subject.journeyId,activity});
    }
  }
  ranked.sort((a,b)=>b.activity-a.activity||a.topicId.localeCompare(b.topicId));
  let continueWith:any=null;
  for(const topic of ranked){
    const result=await resolveTopicContinuation(topic.topicId,allNodes.filter(n=>n.journeyId===topic.journeyId),sessions);
    if(result.status==='continue'){continueWith=result;break;}
  }

  res.json({ subjects, continueWith });
}));

// ── LP topic-next ─────────────────────────────────────────────────────────────

/**
 * GET /students/:studentId/topics/:topicId/next
 *
 * Returns NextLearning:
 *   { status: 'continue', topicId, conceptId, state, resumeSessionId }
 *   { status: 'completed' }
 *   { status: 'unavailable', reason }
 *
 * GET only — never creates nodes, sessions, or state transitions.
 */
app.get('/students/:studentId/topics/:topicId/next', wrap(async (req, res) => {
  const { studentId, topicId } = req.params;

  if (!await verifyStudentAccess(req, studentId)) {
    return res.status(403).json({ error: 'Access denied' });
  }

  // Verify topic is actively assigned to this student
  const journeys = await LearningJourney.find({ studentId }).lean();
  const journeyIds = journeys.map((j: any) => j.id);
  const jt = await LearningJourneyTopic.findOne({
    journeyId:      { $in: journeyIds },
    topicId,
    sourceClassIds: { $not: { $size: 0 } },
  }).lean();
  if (!jt) return res.status(403).json({ error: 'Topic not assigned to this student' });

  const [nodes,sessions]=await Promise.all([
    LearningJourneyNode.find({journeyId:jt.journeyId}).lean(),
    Session.find({studentId}).lean(),
  ]);
  res.json(await resolveTopicContinuation(topicId,nodes,sessions));
}));

// ── Journey nodes ──────────────────────────────────────────────────────────────

app.get('/journey-nodes', wrap(async (req, res) => {
  const filter: Record<string, unknown> = {};
  if (req.query['journeyId']) filter['journeyId'] = req.query['journeyId'];
  if (req.query['conceptId']) filter['conceptId'] = req.query['conceptId'];
  const nodes = await LearningJourneyNode.find(filter).sort({ order: 1 });
  res.json(nodes);
}));

app.get('/journey-nodes/:id', wrap(async (req, res) => {
  const node = await LearningJourneyNode.findOne({ id: req.params.id });
  if (!node) return res.status(404).json({ error: 'Not found' });
  res.json(node);
}));

app.post('/journey-nodes', wrap(async (req, res) => {
  const node = await LearningJourneyNode.create(req.body);
  res.status(201).json(node);
}));

app.patch('/journey-nodes/:id', wrap(async (req, res) => {
  const node = await LearningJourneyNode.findOneAndUpdate(
    { id: req.params.id },
    { $set: req.body },
    { new: true },
  );
  if (!node) return res.status(404).json({ error: 'Not found' });
  res.json(node);
}));

// ── Sessions ───────────────────────────────────────────────────────────────────

app.get('/students/:studentId/sessions', wrap(async (req, res) => {
  const filter: Record<string, unknown> = { studentId: req.params.studentId };
  if (req.query['conceptId']) filter['conceptId'] = req.query['conceptId'];
  if (req.query['status'])    filter['status']    = req.query['status'];
  const sessions = await Session.find(filter).sort({ createdAt: -1 });
  res.json(sessions);
}));

app.post('/sessions', wrap(async (req, res) => {
  const session = await Session.create(req.body);
  res.status(201).json(session);
}));

app.get('/sessions/:id', wrap(async (req, res) => {
  const session = await Session.findOne({ id: req.params.id });
  if (!session) return res.status(404).json({ error: 'Not found' });
  res.json(session);
}));

app.patch('/sessions/:id', wrap(async (req, res) => {
  const session = await Session.findOneAndUpdate(
    { id: req.params.id },
    { $set: req.body },
    { new: true },
  );
  if (!session) return res.status(404).json({ error: 'Not found' });
  res.json(session);
}));

app.post('/sessions/:id/messages', wrap(async (req, res) => {
  const session = await Session.findOneAndUpdate(
    { id: req.params.id },
    { $push: { history: req.body } },
    { new: true },
  );
  if (!session) return res.status(404).json({ error: 'Not found' });
  res.json(session);
}));

// ── Memory ─────────────────────────────────────────────────────────────────────

app.get('/students/:studentId/memories', wrap(async (req, res) => {
  const filter: Record<string, unknown> = { studentId: req.params.studentId };
  if (req.query['conceptId']) filter['context.conceptId'] = req.query['conceptId'];
  const memories = await Memory.find(filter).sort({ lastAccessedAt: -1 });
  res.json(memories);
}));

app.post('/students/:studentId/memories', wrap(async (req, res) => {
  const memory = await Memory.create({ ...req.body, studentId: req.params.studentId });
  res.status(201).json(memory);
}));

// ── Student directory ──────────────────────────────────────────────────────────

app.get('/students', wrap(async (_req, res) => {
  const studentIds = await LearningJourney.distinct('studentId') as string[];
  const result = await Promise.all(studentIds.map(async (studentId) => {
    const [journeyCount, sessionCount, memoryCount, lastSession] = await Promise.all([
      LearningJourney.countDocuments({ studentId }),
      Session.countDocuments({ studentId }),
      Memory.countDocuments({ studentId }),
      Session.findOne({ studentId }).sort({ createdAt: -1 }).select('createdAt').lean(),
    ]);
    return { studentId, journeyCount, sessionCount, memoryCount, lastActivityAt: (lastSession as any)?.createdAt ?? null };
  }));
  res.json(result);
}));

app.delete('/students/:studentId/all', wrap(async (req, res) => {
  const { studentId } = req.params;
  const journeys   = await LearningJourney.find({ studentId }).lean();
  const journeyIds = journeys.map((j: any) => j.id);
  const [nodes, journeyTopics, sessions, memories, deletedJourneys] = await Promise.all([
    LearningJourneyNode.deleteMany({ journeyId: { $in: journeyIds } }),
    LearningJourneyTopic.deleteMany({ journeyId: { $in: journeyIds } }),
    Session.deleteMany({ studentId }),
    Memory.deleteMany({ studentId }),
    LearningJourney.deleteMany({ studentId }),
  ]);
  res.json({
    deleted: {
      journeys:      deletedJourneys.deletedCount,
      nodes:         nodes.deletedCount,
      journeyTopics: journeyTopics.deletedCount,
      sessions:      sessions.deletedCount,
      memories:      memories.deletedCount,
    },
  });
}));

// ── Error handler ──────────────────────────────────────────────────────────────

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err.message);
  res.status(500).json({ error: err.message });
});

// ── Start ──────────────────────────────────────────────────────────────────────

async function main() {
  await connectDb();
  app.listen(PORT, () => {
    console.log(`Prodigy Learning Progression running on http://localhost:${PORT}`);
  });
}

main().catch(console.error);
