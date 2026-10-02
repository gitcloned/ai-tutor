import express from 'express';
import {issueToken,identityForToken,revokeToken} from './auth-session.js';
import {encryptCode,decryptCode} from './code-vault.js';
import { connectDb } from './db.js';
import { generateCode, hashCode, verifyCode } from './codes.js';
import { Student }    from './models/student.js';
import { User }       from './models/user.js';
import { Classroom }  from './models/classroom.js';
import { Enrollment } from './models/enrollment.js';

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
  const uid = await resolveUserId(req);
  if (!uid) return res.status(401).json({ error: 'Authorization required' });

  const user = await User.findOne({ firebaseUid: uid }).lean();
  if (!user) return res.status(404).json({ error: 'User not found' });

  const { name, age, grade } = req.body as { name?: string; age?: number; grade?: string };
  if (!name) return res.status(400).json({ error: 'name is required' });

  const code       = generateCode();
  const hashedCode = await hashCode(code);

  const student = await Student.create({ name, age, grade, hashedCode, encryptedCode: encryptCode(code), createdByUserId: user.id });

  return res.status(201).json({ studentId: student.id, name: student.name, grade: student.grade, code });
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

// ── Classrooms ────────────────────────────────────────────────────────────────

app.post('/classrooms', wrap(async (req, res) => {
  const uid = await resolveUserId(req);
  if (!uid) return res.status(401).json({ error: 'Authorization required' });

  const user = await User.findOne({ firebaseUid: uid }).lean();
  if (!user) return res.status(404).json({ error: 'User not found' });

  const { name, subject, grade } = req.body as { name?: string; subject?: string; grade?: string };
  if (!name) return res.status(400).json({ error: 'name is required' });

  const classCode        = generateCode();
  const hashedClassCode  = await hashCode(classCode);

  const classroom = await Classroom.create({ name, subject, grade, ownerUserId: user.id, hashedClassCode });

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
  const classrooms = await Classroom.find({ status: 'active' }).lean();
  let matched: (typeof classrooms)[number] | null = null;
  for (const c of classrooms) {
    if (await verifyCode(classCode, c.hashedClassCode)) {
      matched = c;
      break;
    }
  }

  if (!matched) {
    return res.status(404).json({ error: "We couldn't find that class. Check the code with your teacher." });
  }

  // Idempotent join
  const existing = await Enrollment.findOne({ classroomId: matched.id, studentId });
  if (existing) {
    return res.json({ status: 'already_joined', classroomId: matched.id, name: matched.name });
  }

  await Enrollment.create({ classroomId: matched.id, studentId });
  return res.json({ status: 'joined', classroomId: matched.id, name: matched.name });
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
  const uid = await resolveUserId(req);
  const user = uid ? await User.findOne({ firebaseUid: uid }).lean() : null;
  const classroom = await Classroom.findOne({ id: req.params.id, status: 'active' }).lean();
  if (!classroom) return res.status(404).json({ error: 'Classroom not found' });
  if (!user || classroom.ownerUserId !== user.id) return res.status(403).json({ error: 'Not authorised' });
  const student = await Student.findOne({ id: req.body.studentId }).lean();
  if (!student) return res.status(404).json({ error: 'Student not found' });
  if(student.createdByUserId!==user.id)return res.status(403).json({error:'Ask this student to join using the class invitation code.'});
  await Enrollment.updateOne({classroomId:classroom.id,studentId:student.id}, {$setOnInsert:{joinedAt:new Date()}}, {upsert:true});
  return res.json({status:'enrolled',classroomId:classroom.id,studentId:student.id});
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
