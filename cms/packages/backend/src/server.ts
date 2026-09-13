import express from 'express';
import { fileURLToPath } from 'node:url';
import { connectDb } from './db.js';
import { Strand, Unit, Topic, Concept, Resource, Question } from './models/index.js';

const app  = express();
const PORT = Number(process.env.PORT ?? 32001);

app.use(express.json());
app.use('/3d-models', express.static(fileURLToPath(new URL('../../resources/3d-models/', import.meta.url)), {
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
