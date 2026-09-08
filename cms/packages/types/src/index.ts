import type { Types } from 'mongoose';

// ── Primitive aliases ─────────────────────────────────────────────────────────

export type ObjectId = Types.ObjectId;

// ── Enums ─────────────────────────────────────────────────────────────────────

export type ResourceType = 'teaching-video' | 'practice-test' | 'article' | 'simulation' | 'other';
export type QuestionType = 'mcq' | 'fib' | 'subjective' | 'perseus';
export type DifficultyLevel = 'lots' | 'mots' | 'hots';
export type LessonStepType = 'ido' | 'wedo' | 'youdo';
export type ConceptState = 'not_assessed' | 'learning' | 'clarity' | 'mastered' | 'exam_ready';
export type MasteryLevel = 'lots' | 'mots' | 'hots';
export type SessionStatus = 'initialised' | 'started' | 'completed';
export type MemoryType = 'factual' | 'reflected';

// ── Hint / Probing tree ───────────────────────────────────────────────────────

export interface HintActionSteps  { type: 'steps';    steps: HintStep[]; }
export interface HintActionInline { type: 'inline';   content: string; thenAsk?: HintStep; }
export interface HintActionTeach  { type: 'teach';    conceptId: string; title: string; thenAsk?: HintStep; }
export interface HintActionResource { type: 'resource'; resourceId: string; title: string; url?: string; youtubeUrl?: string; }
export interface HintActionConcept  { type: 'concept';  conceptId: string; title: string; }
export interface HintActionQuestion { type: 'question'; }

export type HintAction =
  | HintActionSteps | HintActionInline | HintActionTeach
  | HintActionResource | HintActionConcept | HintActionQuestion;

export interface HintStep {
  probe: string;
  idealAnswer: string;
  ifCorrect: HintAction;
  ifWrong: HintAction;
}

export interface ProbingTree {
  entryQuestion?: string;
  nodes: HintStep[];
}

// ── Embedded types ────────────────────────────────────────────────────────────

export interface CfuMarker { timestamp: number; label: string; question?: string | null; }
export interface LearningIndicator { text: string; assessmentQuestion?: string | null; }

export interface LessonStep {
  type: LessonStepType;
  instruction?: string | null;
  resources: ObjectId[];
  learningIndicator?: LearningIndicator | null;
}

export interface Misconception { text: string; prereqConcept?: string | null; questions: ObjectId[]; }

export interface SolutionStep {
  description: string;
  hint: { whatToShow: string; whatToSpeak: string; };
}

export interface PerseusWidget { type: string; graded?: boolean; options?: Record<string, unknown>; }
export interface PerseusContent { content: string; widgets: Record<string, PerseusWidget>; hints?: unknown[]; }
export interface ExamAppearance { exam: ObjectId; link?: string; }
export interface TeachingPlan   { content: string; createdAt: Date; updatedAt: Date; }
export interface Message        { role: 'student' | 'agent'; content: string; timestamp: Date; }

// ── Entity interfaces ─────────────────────────────────────────────────────────

export interface IBoard  { id?: string; name: string; description?: string; }
export interface IClass  { id?: string; name: string; code: string; }
export interface IExam   { id?: string; name: string; year: number; }

export interface IStrand {
  id: string;
  title: string;
  subject: string;
  weight?: number | null;
  kaSlug?: string;
  source?: string;
}

export interface IUnit {
  id: string;
  title: string;
  description?: string | null;
  strand: ObjectId;
  order: number;
  prerequisites: ObjectId[];
  kaSlug?: string;
  source?: string;
}

export interface ITopic {
  id: string;
  title: string;
  description?: string | null;
  unit: ObjectId;
  order: number;
  probingTree?: ProbingTree | null;
  practiceTests: ObjectId[];
  kaSlug?: string;
  source?: string;
}

export interface IResource {
  id: string;
  title: string;
  type: ResourceType;
  source?: string;
  description?: string | null;
  url?: string | null;
  kaSlug?: string;
  youtubeId?: string | null;
  youtubeUrl?: string | null;
  duration?: number | null;
  thumbnail?: string | null;
  cfuMarkers?: CfuMarker[];
  questions?: ObjectId[];
}

export interface IQuestion {
  id: string;
  type: QuestionType;
  source?: string;
  kaSlug?: string;
  difficultyLevel?: DifficultyLevel;
  appearedInExams: ExamAppearance[];
  relatedQuestions: ObjectId[];
  stem?: string;
  idealAnswer?: string;
  steps?: SolutionStep[];
  perseusContent?: PerseusContent;
  teachingTree?: HintStep | null;
}

export interface IConcept {
  id: string;
  title: string;
  topic: ObjectId;
  order: number;
  conceptWeightage?: number | null;
  classApplicableTo: ObjectId[];
  boards: ObjectId[];
  prerequisites: ObjectId[];
  nextConcepts: ObjectId[];
  misconceptions: Misconception[];
  lessonPlan: LessonStep[];
  probingTree?: ProbingTree | null;
  masteryQuestions: ObjectId[];
  examQuestions: ObjectId[];
  kaSlug?: string;
  localId?: string;
  source?: string;
}

export interface ILearningJourney {
  id: string;
  studentId: string;
  objective: string;
  createdAt: Date;
}

export interface ILearningJourneyNode {
  id: string;
  journeyId: string;
  conceptId: string;
  order: number;
  state: ConceptState;
  masteryLevel?: MasteryLevel | null;
  probingPath: unknown[];
  lastActivity?: Date;
  completedAt?: Date | null;
}

export interface ISession {
  id: string;
  studentId: string;
  conceptId: string;
  journeyNodeId: string;
  status: SessionStatus;
  conceptStateAtStart: ConceptState;
  conceptStateAtEnd?: ConceptState | null;
  teachingPlan: TeachingPlan;
  history: Message[];
  memory: string[];
  createdAt: Date;
  endedAt?: Date | null;
}

export interface IMemory {
  id: string;
  studentId: string;
  context: {
    conceptId?: string;
    strandId?: string;
  };
  type: MemoryType;
  content: string;
  lastAccessedAt: Date;
  createdAt: Date;
}
