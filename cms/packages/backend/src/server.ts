import express from 'express';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import mongoose from 'mongoose';
import { connectDb } from './db.js';
import { Subject, Strand, Unit, Topic, Concept, Resource, Question } from './models/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const app  = express();
const PORT = Number(process.env.PORT ?? 32001);

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
  const db = rawDb();
  const strand = await db.collection('strands').findOne({ id: req.params.id });
  if (!strand) return res.status(404).json({ error: 'Not found' });
  const units = await db.collection('units').find({ strand: (strand as any).id }).sort({ order: 1 }).toArray();
  res.json(units);
}));

app.get('/units/:id/topics', wrap(async (req, res) => {
  const db = rawDb();
  const unit = await db.collection('units').findOne({ id: req.params.id });
  if (!unit) return res.status(404).json({ error: 'Not found' });
  const topics = await db.collection('topics').find({ unit: (unit as any).id }).sort({ order: 1 }).toArray();
  res.json(topics);
}));

app.get('/topics/:id/concepts', wrap(async (req, res) => {
  const db = rawDb();
  const topic = await db.collection('topics').findOne({ id: req.params.id });
  if (!topic) return res.status(404).json({ error: 'Not found' });
  // Concepts store `topic` as the string topic.id (not ObjectId) — use rawDb to avoid cast failure
  const concepts = await db.collection('concepts')
    .find({ topic: (topic as any).id })
    .sort({ order: 1 })
    .toArray();
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
  // `topic` is stored as a string slug but the Mongoose schema types it as ObjectId,
  // so Mongoose returns null on read. Fetch the raw value and re-attach it.
  const raw = await rawDb().collection('concepts').findOne({ id: req.params.id }, { projection: { topic: 1 } });
  const obj = concept.toObject() as unknown as Record<string, unknown>;
  obj.topic = (raw as any)?.topic ?? null;
  res.json(obj);
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

app.get('/concepts/:id/mastery-questions', wrap(async (req, res) => {
  const concept = await Concept.findOne({ id: req.params.id })
    .populate<{ masteryQuestions: Array<{ id: string; questions: unknown[] }> }>({
      path:         'masteryQuestions',
      foreignField: 'id',
      justOne:      false,
      populate:     { path: 'questions', foreignField: 'id', justOne: false },
    });
  if (!concept) return res.status(404).json({ error: 'Not found' });
  const questions = (concept.masteryQuestions ?? []).flatMap((r: any) => r.questions ?? []);
  res.json(questions);
}));

// ── Subjects ──────────────────────────────────────────────────────────────────

app.get('/subjects', wrap(async (_req, res) => {
  const subjects = await Subject.find().sort({ title: 1 });
  res.json(subjects);
}));

app.post('/subjects', wrap(async (req, res) => {
  const { title } = req.body as { title?: string };
  if (!title?.trim()) return res.status(400).json({ error: 'title is required' });
  const subject = await Subject.create({ title: title.trim() });
  res.status(201).json(subject);
}));

// ── Curriculum tree ───────────────────────────────────────────────────────────

app.get('/curriculum', wrap(async (req, res) => {
  const grade = req.query['grade'] !== undefined ? Number(req.query['grade']) : null;
  const db = rawDb();

  const strands = await db.collection('strands').find({}).sort({ title: 1 }).toArray() as any[];

  // Group strands by subjectId (fall back to subject string if subjectId not yet set)
  const subjectMap = new Map<string, { subjectId: string; title: string; strands: any[] }>();

  // Load all subjects for title lookup
  const subjectDocs = await db.collection('subjects').find({}).toArray() as any[];
  const subjectById = new Map(subjectDocs.map((s: any) => [s.id, s]));

  for (const strand of strands) {
    const subjectId: string = strand.subjectId ?? strand.subject ?? 'unknown';
    if (!subjectMap.has(subjectId)) {
      const subjectDoc = subjectById.get(subjectId);
      subjectMap.set(subjectId, {
        subjectId,
        title: subjectDoc?.title ?? strand.subject ?? subjectId,
        strands: [],
      });
    }

    const units = await db.collection('units')
      .find({ strand: strand.id })
      .sort({ order: 1 })
      .toArray() as any[];

    for (const unit of units) {
      const topics = await db.collection('topics')
        .find({ unit: unit.id })
        .sort({ order: 1 })
        .toArray() as any[];

      unit.topics = await Promise.all(topics.map(async (t: any) => {
        const concepts = await db.collection('concepts')
          .find({ topic: t.id }, { projection: { id: 1, title: 1, order: 1, supportedPhases: 1, _id: 0 } })
          .sort({ order: 1 })
          .toArray();
        const grades: number[] = Array.isArray(t.recommendedGrades) ? t.recommendedGrades : [];
        return {
          ...t,
          recommendedGrades: grades,
          recommended: grade !== null && grades.includes(grade),
          concepts,
        };
      }));
    }
    strand.units = units;
    subjectMap.get(subjectId)!.strands.push(strand);
  }

  res.json(Array.from(subjectMap.values()));
}));

// ── Topic subject lookup (used by agent to find the correct journey) ──────────

app.get('/topics/:id/subject', wrap(async (req, res) => {
  const db = rawDb();
  const topic = await db.collection('topics').findOne({ id: req.params.id });
  if (!topic) return res.status(404).json({ error: `Topic '${req.params.id}' not found` });

  const unit = await db.collection('units').findOne({ id: (topic as any).unit });
  if (!unit) return res.status(404).json({ error: `Unit '${(topic as any).unit}' not found — broken curriculum link` });

  const strand = await db.collection('strands').findOne({ id: (unit as any).strand });
  if (!strand) return res.status(404).json({ error: `Strand '${(unit as any).strand}' not found — broken curriculum link` });

  const subjectId: string | null = (strand as any).subjectId ?? null;
  if (!subjectId) {
    return res.status(404).json({ error: `Strand '${(strand as any).id}' has no subjectId — run migration first` });
  }

  res.json({ subjectId });
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
