import express from 'express';
import { readFileSync } from 'fs';
import { resolve, dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { connectDb } from './db.js';
import { LearningJourney, LearningJourneyNode, Session, Memory } from './models/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const app  = express();
const PORT = Number(process.env.PORT ?? 32002);

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
    const [journeyCount, sessionCount, memoryCount] = await Promise.all([
      LearningJourney.countDocuments({ studentId }),
      Session.countDocuments({ studentId }),
      Memory.countDocuments({ studentId }),
    ]);
    return { studentId, journeyCount, sessionCount, memoryCount };
  }));
  res.json(result);
}));

app.delete('/students/:studentId/all', wrap(async (req, res) => {
  const { studentId } = req.params;
  const journeys   = await LearningJourney.find({ studentId }).lean();
  const journeyIds = journeys.map((j: any) => j.id);
  const [nodes, sessions, memories, deletedJourneys] = await Promise.all([
    LearningJourneyNode.deleteMany({ journeyId: { $in: journeyIds } }),
    Session.deleteMany({ studentId }),
    Memory.deleteMany({ studentId }),
    LearningJourney.deleteMany({ studentId }),
  ]);
  res.json({
    deleted: {
      journeys: deletedJourneys.deletedCount,
      nodes:    nodes.deletedCount,
      sessions: sessions.deletedCount,
      memories: memories.deletedCount,
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
