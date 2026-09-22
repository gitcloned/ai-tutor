import express from 'express';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import mongoose from 'mongoose';
import { connectDb } from './db.js';
import { Strand, Unit, Topic, Concept, Resource, Question } from './models/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const app  = express();
const PORT = Number(process.env.PORT ?? 32001);

app.use(express.json());
app.use('/interactive-models', express.static(fileURLToPath(new URL('../../resources/interactive-models/', import.meta.url)), {
  setHeaders: res => res.setHeader('Access-Control-Allow-Origin', '*'),
}));

type AsyncHandler = (req: express.Request, res: express.Response, next: express.NextFunction) => Promise<unknown>;
function wrap(fn: AsyncHandler): express.RequestHandler {
  return (req, res, next) => fn(req, res, next).catch(next);
}

// ── Health ────────────────────────────────────────────────────────────────────

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// ── Content hierarchy ─────────────────────────────────────────────────────────

app.get('/strands', wrap(async (_req, res) => {
  const strands = await Strand.find().sort({ title: 1 });
  res.json(strands);
}));

app.get('/strands/:id/units', wrap(async (req, res) => {
  const strand = await Strand.findOne({ id: req.params.id });
  if (!strand) return res.status(404).json({ error: 'Not found' });
  const units = await Unit.find({ strand: strand._id }).sort({ order: 1 });
  res.json(units);
}));

app.get('/units/:id/topics', wrap(async (req, res) => {
  const unit = await Unit.findOne({ id: req.params.id });
  if (!unit) return res.status(404).json({ error: 'Not found' });
  const topics = await Topic.find({ unit: unit._id }).sort({ order: 1 });
  res.json(topics);
}));

app.get('/topics/:id/concepts', wrap(async (req, res) => {
  const topic = await Topic.findOne({ id: req.params.id });
  if (!topic) return res.status(404).json({ error: 'Not found' });
  const concepts = await Concept.find({ topic: topic._id }).sort({ order: 1 });
  res.json(concepts);
}));

app.get('/concepts', wrap(async (req, res) => {
  const filter: Record<string, unknown> = {};
  if (req.query['kaSlug']) filter['kaSlug'] = req.query['kaSlug'];
  if (req.query['title'])  filter['title']  = { $regex: req.query['title'], $options: 'i' };
  const concepts = await Concept.find(filter).limit(20);
  res.json(concepts);
}));

app.get('/concepts/:id', wrap(async (req, res) => {
  const concept = await Concept.findOne({ id: req.params.id })
    .populate({ path: 'lessonPlan.resources', foreignField: 'id', justOne: false })
    .populate('lessonPlan.learningIndicator.assessmentQuestion')
    .populate('masteryQuestions')
    .populate('examQuestions');
  if (!concept) return res.status(404).json({ error: 'Not found' });
  res.json(concept);
}));

app.patch('/concepts/:id', wrap(async (req, res) => {
  const concept = await Concept.findOneAndUpdate({ id: req.params.id }, { $set: req.body }, { new: true });
  if (!concept) return res.status(404).json({ error: 'Not found' });
  res.json(concept);
}));

// ── Resources + Questions ─────────────────────────────────────────────────────

app.get('/resources/:id', wrap(async (req, res) => {
  const resource = await Resource.findOne({ id: req.params.id });
  if (!resource) return res.status(404).json({ error: 'Not found' });
  res.json(resource);
}));

app.get('/questions/:id', wrap(async (req, res) => {
  const question = await Question.findOne({ id: req.params.id });
  if (!question) return res.status(404).json({ error: 'Not found' });
  res.json(question);
}));

// ── Admin routes (raw MongoDB — bypass Mongoose type casting) ─────────────────
// Refs (strand, unit, topic, prerequisites, nextConcepts) are stored as string
// IDs, not ObjectIds. Raw driver operations avoid cast failures.

function rawDb() { return mongoose.connection.db!; }

app.get('/admin/hierarchy', wrap(async (_req, res) => {
  const db = rawDb();
  const strands = await db.collection('strands').find({}).sort({ title: 1 }).toArray();
  for (const strand of strands as any[]) {
    const units = await db.collection('units').find({ strand: strand.id }).sort({ order: 1 }).toArray();
    for (const unit of units as any[]) {
      const topics = await db.collection('topics').find({ unit: unit.id }).sort({ order: 1 }).toArray();
      for (const topic of topics as any[]) {
        topic.concepts = await db.collection('concepts')
          .find({ topic: topic.id }, { projection: { id: 1, title: 1, order: 1, supportedPhases: 1 } })
          .sort({ order: 1 }).toArray();
      }
      unit.topics = topics;
    }
    strand.units = units;
  }
  res.json(strands);
}));

app.get('/admin/concepts/all', wrap(async (req, res) => {
  const db = rawDb();
  const filter: Record<string, unknown> = {};
  if (req.query['q']) filter['title'] = { $regex: req.query['q'], $options: 'i' };
  const docs = await db.collection('concepts')
    .find(filter, { projection: { id: 1, title: 1, kaSlug: 1 } })
    .sort({ title: 1 }).toArray();
  res.json(docs);
}));

app.get('/admin/concepts/:id', wrap(async (req, res) => {
  const db = rawDb();
  const doc = await db.collection('concepts').findOne({ id: req.params.id });
  if (!doc) return res.status(404).json({ error: 'Not found' });
  res.json(doc);
}));

app.patch('/admin/concepts/:id', wrap(async (req, res) => {
  const db = rawDb();
  const result = await db.collection('concepts').findOneAndUpdate(
    { id: req.params.id },
    { $set: req.body },
    { returnDocument: 'after' }
  );
  if (!result) return res.status(404).json({ error: 'Not found' });
  res.json(result);
}));

app.get('/admin/topics/:id', wrap(async (req, res) => {
  const db = rawDb();
  const doc = await db.collection('topics').findOne({ id: req.params.id });
  if (!doc) return res.status(404).json({ error: 'Not found' });
  res.json(doc);
}));

app.patch('/admin/topics/:id', wrap(async (req, res) => {
  const db = rawDb();
  const result = await db.collection('topics').findOneAndUpdate(
    { id: req.params.id },
    { $set: req.body },
    { returnDocument: 'after' }
  );
  if (!result) return res.status(404).json({ error: 'Not found' });
  res.json(result);
}));

app.get('/admin/resources/all', wrap(async (req, res) => {
  const db = rawDb();
  const filter: Record<string, unknown> = {};
  if (req.query['q']) filter['title'] = { $regex: req.query['q'], $options: 'i' };
  const docs = await db.collection('resources')
    .find(filter, { projection: { id: 1, title: 1, type: 1, kaSlug: 1 } })
    .sort({ title: 1 }).limit(300).toArray();
  res.json(docs);
}));

app.get('/admin/resources/:id', wrap(async (req, res) => {
  const doc = await rawDb().collection('resources').findOne({ id: req.params.id });
  if (!doc) return res.status(404).json({ error: 'Not found' });
  res.json(doc);
}));

app.get('/admin/questions/:id', wrap(async (req, res) => {
  const doc = await rawDb().collection('questions').findOne({ id: req.params.id });
  if (!doc) return res.status(404).json({ error: 'Not found' });
  res.json(doc);
}));

// Serve admin SPA (production build)
const adminDist = join(__dirname, '../../../admin/dist');
app.use('/admin', express.static(adminDist, { index: 'index.html' }));
app.get('/admin/*path', (_req, res) => res.sendFile(join(adminDist, 'index.html')));

// ── Error handler ─────────────────────────────────────────────────────────────

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err.message);
  res.status(500).json({ error: err.message });
});

// ── Start ─────────────────────────────────────────────────────────────────────

async function main() {
  await connectDb();
  app.listen(PORT, () => {
    console.log(`Prodigy CMS running on http://localhost:${PORT}`);
  });
}

main().catch(console.error);
