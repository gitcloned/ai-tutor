import express from 'express';
import {issueToken,identityForToken,revokeToken} from './auth-session.js';
import {encryptCode,decryptCode} from './code-vault.js';
import { connectDb } from './db.js';
import { generateCode, hashCode, verifyCode } from './codes.js';
import { Student }    from './models/student.js';
import { User }       from './models/user.js';
import { Classroom }  from './models/classroom.js';
import { Enrollment }      from './models/enrollment.js';
import { ClassAssignment } from './models/class-assignment.js';

// Verify Google sign-in with Firebase; initialize lazily.
let firebaseAdmin: typeof import('firebase-admin') | null = null;
async function getFirebaseAdmin() {
  if (firebaseAdmin) return firebaseAdmin;

  const {default:admin} = await import('firebase-admin');
  if (!admin.apps.length) {
    admin.initializeApp({ projectId: process.env.FIREBASE_PROJECT_ID ?? 'prodigy-tutor' });
  }
  firebaseAdmin = admin;
  return firebaseAdmin;
}

const app  = express();
const PORT = Number(process.env.PORT ?? 32005);

const LP_URL  = process.env['LP_URL']  ?? 'http://localhost:32002';
const CMS_URL = process.env['CMS_URL'] ?? 'http://localhost:32001';
const LP_SERVICE_SECRET = process.env['LP_SERVICE_SECRET'] ?? '';

async function lpSyncClassAssignments(
  studentId: string,
  classroomId: string,
  assignments: Array<{ subjectId: string; topicId: string }>,
  revision: number,
): Promise<void> {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (LP_SERVICE_SECRET) headers['x-service-secret'] = LP_SERVICE_SECRET;
  const res = await fetch(
    `${LP_URL}/students/${encodeURIComponent(studentId)}/class-assignments/${encodeURIComponent(classroomId)}`,
    { method: 'PUT', headers, body: JSON.stringify({ assignments, revision }), signal: AbortSignal.timeout(12000) }
  );
  if (!res.ok) {
    const msg = await res.text().catch(() => '');
    throw new Error(`LP sync failed ${res.status}: ${msg}`);
  }
}

app.use(express.json());

// ── CORS ──────────────────────────────────────────────────────────────────────

app.use((_req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Student-Id, X-User-Id');
  next();
});

app.options('*', (_req, res) => { res.sendStatus(204); });

// Browser identities are backed by expiring, opaque login tokens.
app.use(async(req,res,next)=>{
  if(req.path==='/health'||req.path.startsWith('/auth/'))return next();
  try{
    const token=req.headers.authorization?.replace(/^Bearer /,'')||'';
    const auth=await identityForToken(token);
    if(!auth||!auth.subjectId)return res.status(401).json({error:'Please sign in again.'});
    res.locals.auth=auth;
    if(auth.kind==='student'){
      if(!['/me','/concepts','/classrooms','/classrooms/join'].includes(req.path))return res.status(403).json({error:'This page is for a parent or teacher.'});
      req.query.studentId=auth.subjectId;req.body={...req.body,studentId:auth.subjectId};
      if(req.method!=='GET'&&req.path!=='/classrooms/join')return res.status(403).json({error:'Not allowed.'});
    }else{
      // An adult may view a student's learning space only for their own profile.
      const studentId=req.query.studentId||req.body?.studentId;
      if(studentId&&['/me','/classrooms','/classrooms/join'].includes(req.path)&&!await Student.exists({id:studentId,createdByUserId:auth.subjectId}))return res.status(403).json({error:'This student is not one of your profiles.'});
    }
    (req as any).accessIdentity=auth;next();
  }catch(e){next(e);}
});
app.post('/auth/logout',wrap(async(req,res)=>{await revokeToken(req.headers.authorization?.replace(/^Bearer /,'')||'');res.json({ok:true});}));

// ── Helpers ───────────────────────────────────────────────────────────────────

type AsyncHandler = (req: express.Request, res: express.Response, next: express.NextFunction) => Promise<unknown>;
function wrap(fn: AsyncHandler): express.RequestHandler {
  return (req, res, next) => fn(req, res, next).catch(next);
}

// Resolve the adult attached by the login-token middleware.
async function resolveUserId(req: express.Request): Promise<string | null> {
  const auth=(req as any).accessIdentity;
  if(auth){if(auth.kind!=='adult')return null;const user=await User.findOne({id:auth.subjectId}).lean();return user?.firebaseUid??null;}
  return null;
}

// ── Auth: student ─────────────────────────────────────────────────────────────

app.post('/auth/student', wrap(async (req, res) => {
  const { code } = req.body as { code?: string };
  if (!code) return res.status(400).json({ error: 'code is required' });

  const students = await Student.find({}).lean();
  for (const student of students) {
    if (await verifyCode(code, student.hashedCode)) {
      return res.json({ studentId: student.id, name: student.name, grade: student.grade, token: await issueToken('student',student.id) });
    }
  }

  return res.status(401).json({ error: "That code didn't work. Check it and try again." });
}));

// ── Auth: Google (adult) ──────────────────────────────────────────────────────

app.post('/auth/google', wrap(async (req, res) => {
  const header = req.headers['authorization'];
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authorization header required' });
  }
  const token = header.slice(7);

  let firebaseUid: string;
  let name: string;
  let email: string;

  const admin = await getFirebaseAdmin();
  try {
    const decoded = await admin.auth().verifyIdToken(token);
    firebaseUid = decoded.uid;
    name = decoded.name ?? decoded.email ?? 'Unknown';
    email = decoded.email ?? '';
  } catch {
    return res.status(401).json({ error: 'Invalid Firebase token' });
  }

  if (!await User.findOne({ firebaseUid }).lean()) {
    await User.create({ firebaseUid, name, email, roles: [] });
  }
  const user = await User.findOne({ firebaseUid }).lean();
  if (!user) return res.status(500).json({ error: 'Failed to create user' });

  return res.json({ userId: user.id, name: user.name, email: user.email, roles: user.roles, token:await issueToken('adult',user.id) });
}));

// ── Profile ───────────────────────────────────────────────────────────────────

app.get('/me', wrap(async (req, res) => {
  // Student via query param
  const studentId = req.query['studentId'] as string | undefined;
  if (studentId) {
    const student = await Student.findOne({ id: studentId }).lean();
    if (!student) return res.status(404).json({ error: 'Student not found' });
    return res.json({ type: 'student', studentId: student.id, name: student.name, grade: student.grade });
  }

  // Adult via Authorization header
  const uid = await resolveUserId(req);
  if (!uid) return res.status(401).json({ error: 'Authorization required' });

  const user = await User.findOne({ firebaseUid: uid }).lean();
  if (!user) return res.status(404).json({ error: 'User not found' });

  return res.json({ type: 'user', userId: user.id, name: user.name, email: user.email, roles: user.roles });
}));

app.patch('/me', wrap(async (req, res) => {
  const uid = await resolveUserId(req);
  if (!uid) return res.status(401).json({ error: 'Authorization required' });

  const { name, roles } = req.body as { name?: string; roles?: string[] };
  const update: Record<string, unknown> = {};
  if (name)  update['name']  = name;
  if (roles) update['roles'] = roles;

  const user = await User.findOneAndUpdate({ firebaseUid: uid }, { $set: update }, { new: true }).lean();
  if (!user) return res.status(404).json({ error: 'User not found' });

  return res.json({ userId: user.id, name: user.name, email: user.email, roles: user.roles });
}));

// ── Students ──────────────────────────────────────────────────────────────────

app.post('/students', wrap(async (req, res) => {
  const auth = (req as any).accessIdentity;
  if (!auth || auth.kind !== 'adult') return res.status(401).json({ error: 'Login required' });

  const user = await User.findOne({ id: auth.subjectId }).lean();
  if (!user) return res.status(404).json({ error: 'User not found' });

  const { name, age, grade, topics, setupContext, idempotencyKey } = req.body as {
    name?: string; age?: number; grade?: string;
    topics?: Array<{ subjectId: string; topicId: string }>;
    setupContext?: 'parent' | 'teacher'; // 'parent' triggers personal class
    idempotencyKey?: string;             // client-supplied key to make retries safe
  };
  if (!name) return res.status(400).json({ error: 'name is required' });

  // Idempotency: if key supplied, return existing student if one was already created with this key
  // We store the idempotency key in the student doc to detect retries
  if (idempotencyKey) {
    const existing = await Student.findOne({ idempotencyKey, createdByUserId: user.id }).lean();
    if (existing) {
      // Return partial result — also ensure personal class and code are returned
      const pClass = setupContext === 'parent'
        ? await Classroom.findOne({ personalStudentId: existing.id, kind: 'personal' }).lean()
        : null;
      return res.json({
        studentId: existing.id,
        name: existing.name,
        grade: existing.grade,
        code: decryptCode(existing.encryptedCode),
        personalClassId: (pClass as any)?.id ?? null,
        resumed: true,
      });
    }
  }

  const code       = generateCode();
  const hashedCode = await hashCode(code);

  const studentData: Record<string, unknown> = {
    name, age, grade, hashedCode, encryptedCode: encryptCode(code), createdByUserId: user.id,
  };
  if (idempotencyKey) studentData['idempotencyKey'] = idempotencyKey;

  const student = await Student.create(studentData);

  let personalClassId: string | null = null;
  let setupStatus: 'ready' | 'partial' = 'ready';

  // Parent setup: create personal class and sync LP
  if (setupContext === 'parent') {
    try {
      const pClass = await Classroom.create({
        name:              `${student.name}'s Class`,
        ownerUserId:       user.id,
        kind:              'personal',
        personalStudentId: student.id,
        hashedClassCode:   null,
      });
      personalClassId = pClass.id;

      await Enrollment.create({ classroomId: pClass.id, studentId: student.id });

      // Use provided topics or grade-based defaults from CMS
      let selectedTopics = Array.isArray(topics) ? topics : [];
      if (selectedTopics.length === 0 && grade) {
        const gradeNum = normaliseGradeNumber(grade);
        if (gradeNum !== null) {
          try {
            const curriculum = await fetch(
              `${CMS_URL}/curriculum?grade=${gradeNum}`,
              { signal: AbortSignal.timeout(8000) }
            ).then(r => r.json()) as any[];
            // Take recommended topics from the first subject
            for (const subj of curriculum) {
              for (const strand of subj.strands ?? []) {
                for (const unit of strand.units ?? []) {
                  for (const topic of unit.topics ?? []) {
                    if (topic.recommended && topic.id) {
                      selectedTopics.push({ subjectId: subj.subjectId, topicId: topic.id });
                    }
                  }
                }
              }
            }
          } catch (err: any) {
            console.error(`[parent-setup] CMS grade-default fetch failed: ${err.message}`);
          }
        }
      }

      if (selectedTopics.length > 0) {
        for (const t of selectedTopics) {
          await ClassAssignment.findOneAndUpdate(
            { classroomId: pClass.id, topicId: t.topicId },
            { $set: { subjectId: t.subjectId } },
            { upsert: true }
          );
        }
        lpSyncClassAssignments(student.id, pClass.id, selectedTopics, Date.now()).catch(err =>
          console.error(`[LP sync] parent-setup student=${student.id}: ${err.message}`)
        );
      }
    } catch (err: any) {
      console.error(`[parent-setup] personal class creation failed: ${err.message}`);
      setupStatus = 'partial';
    }
  }

  return res.status(201).json({
    studentId: student.id,
    name: student.name,
    grade: student.grade,
    code,
    personalClassId,
    setupStatus,
  });
}));

app.get('/students', wrap(async (req, res) => {
  const uid = await resolveUserId(req);
  if (!uid) return res.status(401).json({ error: 'Authorization required' });

  const user = await User.findOne({ firebaseUid: uid }).lean();
  if (!user) return res.status(404).json({ error: 'User not found' });

  const students = await Student.find({ createdByUserId: user.id }, { hashedCode: 0 }).lean();
  return res.json(students.map(s => ({ studentId: s.id, name: s.name, grade: s.grade, age: s.age })));
}));

async function canManageStudent(userId:string,studentId:string,createdByUserId:string){
  if(userId===createdByUserId)return true;
  const classrooms=await Classroom.find({ownerUserId:userId,status:'active'}).lean();
  return !!await Enrollment.exists({studentId,classroomId:{$in:classrooms.map(c=>c.id)}});
}
app.get('/students/:id/code', wrap(async(req,res)=>{
  const uid=await resolveUserId(req);
  if(!uid)return res.status(401).json({error:'Please sign in.'});
  const user=await User.findOne({firebaseUid:uid}).lean();
  const student=await Student.findOne({id:req.params.id}).lean();
  if(!student)return res.status(404).json({error:'Student not found'});
  if(!user||!await canManageStudent(user.id,student.id,student.createdByUserId))return res.status(403).json({error:'This student is not in your profiles or classes.'});
  res.setHeader('Cache-Control','no-store');
  return res.json({code:decryptCode(student.encryptedCode)});
}));

app.post('/students/:id/reset-code', wrap(async (req, res) => {
  const uid = await resolveUserId(req);
  if (!uid) return res.status(401).json({ error: 'Authorization required' });

  const user    = await User.findOne({ firebaseUid: uid }).lean();
  const student = await Student.findOne({ id: req.params.id });
  if (!student) return res.status(404).json({ error: 'Student not found' });
  if (!user || !await canManageStudent(user.id, student.id, student.createdByUserId)) {
    return res.status(403).json({ error: 'Not authorised to reset this student\'s code' });
  }

  const code       = generateCode();
  const hashedCode = await hashCode(code);
  student.hashedCode = hashedCode;
  student.encryptedCode = encryptCode(code);
  await student.save();

  return res.json({ code });
}));

// ── Grade normalisation ────────────────────────────────────────────────────────

/** Normalise "Grade 7" / "7th Grade" / "7" / 7 to numeric 7, or null. */
function normaliseGradeNumber(grade: string | number | undefined | null): number | null {
  if (grade == null) return null;
  const s = String(grade).replace(/[^0-9]/g, '');
  const n = parseInt(s, 10);
  return isNaN(n) ? null : n;
}

// ── Classrooms ────────────────────────────────────────────────────────────────

app.post('/classrooms', wrap(async (req, res) => {
  const auth = (req as any).accessIdentity;
  if (!auth || auth.kind !== 'adult') return res.status(401).json({ error: 'Login required' });

  const user = await User.findOne({ id: auth.subjectId }).lean();
  if (!user) return res.status(404).json({ error: 'User not found' });

  const { name, subject, grade, topics } = req.body as {
    name?: string; subject?: string; grade?: string;
    topics?: Array<{ subjectId: string; topicId: string }>;
  };
  if (!name) return res.status(400).json({ error: 'name is required' });

  const classCode        = generateCode();
  const hashedClassCode  = await hashCode(classCode);

  const classroom = await Classroom.create({ name, subject, grade, ownerUserId: user.id, hashedClassCode, kind: 'teacher' });

  // Optionally set initial topic selection
  if (Array.isArray(topics) && topics.length > 0) {
    const validated: Array<{ subjectId: string; topicId: string }> = [];
    for (const t of topics) {
      if (typeof t.subjectId !== 'string' || typeof t.topicId !== 'string') continue;
      validated.push(t);
    }
    for (const t of validated) {
      await ClassAssignment.findOneAndUpdate(
        { classroomId: classroom.id, topicId: t.topicId },
        { $set: { subjectId: t.subjectId } },
        { upsert: true }
      );
    }
  }

  return res.status(201).json({ classroomId: classroom.id, name: classroom.name, classCode });
}));

app.get('/classrooms', wrap(async (req, res) => {
  // Student: ?studentId=xxx
  const studentId = req.query['studentId'] as string | undefined;
  if (studentId) {
    const enrollments = await Enrollment.find({ studentId }).lean();
    const classroomIds = enrollments.map(e => e.classroomId);
    const classrooms = await Classroom.find({ id: { $in: classroomIds }, status: 'active' }, { hashedClassCode: 0 }).lean();
    return res.json(classrooms.map(c => ({ id: c.id, classroomId: c.id, name: c.name, subject: c.subject, grade: c.grade, createdByUserId: c.ownerUserId, status: c.status })));
  }

  // Teacher: Authorization header
  const uid = await resolveUserId(req);
  if (!uid) return res.status(401).json({ error: 'Authorization or studentId required' });

  const user = await User.findOne({ firebaseUid: uid }).lean();
  if (!user) return res.status(404).json({ error: 'User not found' });

  const classrooms = await Classroom.find({ ownerUserId: user.id }, { hashedClassCode: 0 }).lean();
  return res.json(classrooms.map(c => ({ id: c.id, classroomId: c.id, name: c.name, subject: c.subject, grade: c.grade, createdByUserId: c.ownerUserId, status: c.status })));
}));

app.post('/classrooms/join', wrap(async (req, res) => {
  const { studentId, classCode } = req.body as { studentId?: string; classCode?: string };
  if (!studentId || !classCode) return res.status(400).json({ error: 'studentId and classCode are required' });

  const student = await Student.findOne({ id: studentId }).lean();
  if (!student) return res.status(404).json({ error: 'Student not found' });

  // Find matching classroom by checking classCode against all active classrooms
  // Only teacher classrooms have an invitation code; personal classes do not
  const classrooms = await Classroom.find({ status: 'active', kind: { $ne: 'personal' } }).lean();
  let matched: (typeof classrooms)[number] | null = null;
  for (const c of classrooms) {
    if (c.hashedClassCode && await verifyCode(classCode, c.hashedClassCode)) {
      matched = c;
      break;
    }
  }

  if (!matched) {
    return res.status(404).json({ error: "We couldn't find that class. Check the code with your teacher." });
  }

  // Idempotent join
  const existing = await Enrollment.findOne({ classroomId: matched.id, studentId });
  const alreadyJoined = !!existing;
  if (!alreadyJoined) {
    await Enrollment.create({ classroomId: matched.id, studentId });
  }

  // Always retry LP sync (handles previously failed syncs and new joins)
  const assignments = await ClassAssignment.find({ classroomId: matched.id }).lean();
  const payload = assignments.map((a: any) => ({ subjectId: a.subjectId, topicId: a.topicId }));
  lpSyncClassAssignments(studentId, matched.id, payload, Date.now()).catch(err =>
    console.error(`[LP sync] join student=${studentId} class=${matched.id}: ${err.message}`)
  );

  return res.json({ status: alreadyJoined ? 'already_joined' : 'joined', classroomId: matched.id, name: matched.name });
}));

app.get('/classrooms/:id/students', wrap(async (req, res) => {
  const uid = await resolveUserId(req);
  if (!uid) return res.status(401).json({ error: 'Authorization required' });

  const user      = await User.findOne({ firebaseUid: uid }).lean();
  const classroom = await Classroom.findOne({ id: req.params.id }).lean();
  if (!classroom) return res.status(404).json({ error: 'Classroom not found' });
  if (!user || classroom.ownerUserId !== user.id) {
    return res.status(403).json({ error: 'Not authorised' });
  }

  const enrollments = await Enrollment.find({ classroomId: classroom.id }).lean();
  const studentIds  = enrollments.map(e => e.studentId);
  const students    = await Student.find({ id: { $in: studentIds } }, { hashedCode: 0 }).lean();

  const byId = new Map(students.map(s => [s.id, s]));
  return res.json(enrollments.map(e => {
    const s = byId.get(e.studentId);
    return { studentId: e.studentId, name: s?.name, grade: s?.grade, joinedAt: e.joinedAt };
  }));
}));

// ── Journey UI integration ────────────────────────────────────────────────────

app.post('/classrooms/:id/students', wrap(async (req, res) => {
  const auth = (req as any).accessIdentity;
  if (!auth || auth.kind !== 'adult') return res.status(401).json({ error: 'Login required' });

  const user = await User.findOne({ id: auth.subjectId }).lean();
  const classroom = await Classroom.findOne({ id: req.params.id, status: 'active' }).lean();
  if (!classroom) return res.status(404).json({ error: 'Classroom not found' });
  if (!user || (classroom as any).ownerUserId !== user.id) return res.status(403).json({ error: 'Not authorised' });

  const student = await Student.findOne({ id: req.body.studentId }).lean();
  if (!student) return res.status(404).json({ error: 'Student not found' });
  if (student.createdByUserId !== user.id) {
    return res.status(403).json({ error: 'Ask this student to join using the class invitation code.' });
  }

  await Enrollment.updateOne(
    { classroomId: classroom.id, studentId: student.id },
    { $setOnInsert: { joinedAt: new Date() } },
    { upsert: true }
  );

  // Sync LP
  const assignments = await ClassAssignment.find({ classroomId: classroom.id }).lean();
  const payload = assignments.map((a: any) => ({ subjectId: a.subjectId, topicId: a.topicId }));
  lpSyncClassAssignments(student.id, classroom.id, payload, Date.now()).catch(err =>
    console.error(`[LP sync] direct-enroll student=${student.id} class=${classroom.id}: ${err.message}`)
  );

  return res.json({ status: 'enrolled', classroomId: classroom.id, studentId: student.id });
}));

app.post('/classrooms/:id/reset-code', wrap(async (req, res) => {
  const uid = await resolveUserId(req);
  const user = uid ? await User.findOne({ firebaseUid: uid }).lean() : null;
  const classroom = await Classroom.findOne({ id: req.params.id, status:'active' });
  if (!classroom) return res.status(404).json({ error: 'Classroom not found' });
  if (!user || classroom.ownerUserId !== user.id) return res.status(403).json({ error: 'Not authorised' });
  const code = generateCode();
  classroom.hashedClassCode = await hashCode(code);
  await classroom.save();
  return res.json({code});
}));

// ── Class topic assignments ────────────────────────────────────────────────────

/**
 * PUT /classrooms/:id/topics
 * Replace all topic selections for a classroom; sync LP for every enrolled student.
 * Body: { topics: Array<{ subjectId: string; topicId: string }> }
 */
app.put('/classrooms/:id/topics', wrap(async (req, res) => {
  const auth = (req as any).accessIdentity;
  if (!auth || auth.kind !== 'adult') return res.status(401).json({ error: 'Login required' });

  const user = await User.findOne({ id: auth.subjectId }).lean();
  if (!user) return res.status(401).json({ error: 'User not found' });

  const classroom = await Classroom.findOne({ id: req.params.id }).lean();
  if (!classroom) return res.status(404).json({ error: 'Classroom not found' });
  if ((classroom as any).ownerUserId !== user.id) return res.status(403).json({ error: 'Not your classroom' });

  const { topics } = req.body as { topics?: Array<{ subjectId: string; topicId: string }> };
  if (!Array.isArray(topics)) return res.status(400).json({ error: 'topics must be an array' });

  // Validate each topic exists in CMS and its subjectId is correct
  const validated: Array<{ subjectId: string; topicId: string }> = [];
  for (const t of topics) {
    if (typeof t.subjectId !== 'string' || typeof t.topicId !== 'string') continue;
    const cmsRes = await fetch(`${CMS_URL}/topics/${encodeURIComponent(t.topicId)}/subject`, { signal: AbortSignal.timeout(8000) });
    if (!cmsRes.ok) return res.status(400).json({ error: `Topic '${t.topicId}' not found in curriculum` });
    const { subjectId: cmsSubjectId } = await cmsRes.json() as { subjectId: string };
    if (cmsSubjectId !== t.subjectId) {
      return res.status(400).json({ error: `Topic '${t.topicId}' belongs to subject '${cmsSubjectId}', not '${t.subjectId}'` });
    }
    validated.push(t);
  }

  // Deduplicate by topicId
  const unique = new Map(validated.map(t => [t.topicId, t]));
  const deduped = Array.from(unique.values());

  // Replace assignments atomically by inserting new records and deleting old ones
  // Use a revision number based on timestamp for staleness protection in LP
  const revision = Date.now();
  const newIds: string[] = [];
  for (const t of deduped) {
    const doc = await ClassAssignment.findOneAndUpdate(
      { classroomId: req.params.id, topicId: t.topicId },
      { $set: { subjectId: t.subjectId, classroomId: req.params.id, topicId: t.topicId } },
      { upsert: true, new: true }
    );
    newIds.push(t.topicId);
  }
  // Remove topics no longer selected
  await ClassAssignment.deleteMany({ classroomId: req.params.id, topicId: { $nin: newIds } });

  // Sync LP for every enrolled student (record per-enrollment status)
  const enrollments = await Enrollment.find({ classroomId: req.params.id }).lean();
  const syncResults = await Promise.allSettled(
    enrollments.map(async (e: any) => {
      await lpSyncClassAssignments(e.studentId, req.params.id, deduped, revision);
      return e.studentId;
    })
  );

  const failed = syncResults
    .filter((r): r is PromiseRejectedResult => r.status === 'rejected')
    .map(r => r.reason?.message ?? String(r.reason));

  if (failed.length > 0) {
    console.error(`[LP sync] classroom=${req.params.id} failures:`, failed);
    return res.status(207).json({
      classroomId: req.params.id,
      topicCount: deduped.length,
      status: 'partial',
      failedCount: failed.length,
      errors: failed,
    });
  }

  res.json({ classroomId: req.params.id, topicCount: deduped.length, status: 'ready' });
}));

/**
 * GET /students/:id/classes/:classId/topics
 * Return topics assigned to a classroom, enriched with CMS titles.
 * Caller must be the student themselves or the classroom owner.
 */
app.get('/students/:id/classes/:classId/topics', wrap(async (req, res) => {
  const auth = (req as any).accessIdentity;
  if (!auth) return res.status(401).json({ error: 'Login required' });

  // Access check: student accessing their own data, or adult who owns the class
  const classroomId = req.params.classId;
  const studentId   = req.params.id;

  const enrollment = await Enrollment.findOne({ classroomId, studentId }).lean();
  if (!enrollment) return res.status(403).json({ error: 'Student not enrolled in this class' });

  if (auth.kind === 'student' && auth.subjectId !== studentId) {
    return res.status(403).json({ error: 'Not your profile' });
  }
  if (auth.kind === 'adult') {
    const classroom = await Classroom.findOne({ id: classroomId }).lean();
    const user = await User.findOne({ id: auth.subjectId }).lean();
    const isOwner = classroom && user && (classroom as any).ownerUserId === user.id;
    const isCreator = await Student.exists({ id: studentId, createdByUserId: auth.subjectId });
    if (!isOwner && !isCreator) return res.status(403).json({ error: 'Not authorised to view this student\'s class' });
  }

  const assignments = await ClassAssignment.find({ classroomId }).lean();

  const topics = await Promise.all(
    assignments.map(async (a: any) => {
      let title = a.topicId;
      try {
        const cmsRes = await fetch(`${CMS_URL}/admin/topics/${encodeURIComponent(a.topicId)}`, { signal: AbortSignal.timeout(5000) });
        if (cmsRes.ok) { const t: any = await cmsRes.json(); title = t.title ?? a.topicId; }
      } catch { /* best effort */ }
      return { topicId: a.topicId, subjectId: a.subjectId, title };
    })
  );

  res.json({ classroomId, studentId, topics });
}));

app.get('/concepts', wrap(async (_req, res) => {
  const base = (process.env.CMS_URL ?? 'http://localhost:32001').replace(/\/$/, '');
  const response = await fetch(`${base}/admin/concepts/all`, {signal:AbortSignal.timeout(10000)});
  if (!response.ok) return res.status(502).json({error:'Lessons are unavailable right now. Please try again.'});
  const concepts = await response.json() as {id:string;title:string}[];
  return res.json(concepts.map(({id,title})=>({id,title})));
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
    console.log(`Prodigy ERP running on http://localhost:${PORT}`);
  });
}

main().catch(console.error);
