// Domain types the agent needs — subset of @prodigy/types, kept in sync manually.

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  level:   LogLevel;
  message: string;
}

/** Single source of truth for concept state string values. Use CS.* everywhere instead of bare literals. */
export const CS = {
  NOT_ASSESSED:          'not_assessed',
  ASSESSING:             'assessing',
  LEARNING:              'learning',
  LEARN_PRE_REQ_BEFORE:  'learn-pre-req-before',
  CLARITY:               'clarity',
  MASTERING:             'mastering',
  MASTERED:              'mastered',
  GETTING_EXAM_READY:    'getting_exam_ready',
  EXAM_READY:            'exam_ready',
} as const;

export type ConceptState = typeof CS[keyof typeof CS];

export interface HintAction { type: string; [key: string]: unknown; }
export interface HintStep   { probe: string; idealAnswer: string; ifCorrect: HintAction; ifWrong: HintAction; }
export interface ProbingTree { nodes: HintStep[]; }

export interface Resource {
  id:         string;
  title:      string;
  type:       string;
  youtubeUrl?: string | null;
  url?:        string | null;
}

export interface Question {
  id:          string;
  stem?:       string | null;
  idealAnswer?: string | null;
  type:        string;
}

export type QuestionOutcome = 'pass' | 'fail' | 'not_sure';
export interface QuestionResult { questionId: string; outcome: QuestionOutcome; }

export interface LessonIndicator {
  text?:               string | null;
  assessmentQuestion?: Question | null;
}

export interface LessonStep {
  type:               'ido' | 'wedo' | 'youdo';
  instruction?:       string | null;
  resources?:         Resource[];
  learningIndicator?: LessonIndicator;
}

export interface Concept {
  id:              string;
  title:           string;
  nextConcepts?:   string[];
  supportedPhases?: string[];
  probingTree?:    ProbingTree | null;
  lessonPlan?:     LessonStep[];
}

export type PlanStepType = 'probe' | 'teach' | 'redirect' | 'inline' | 'store_memory' | 'resource' | 'practice' | 'step';

export interface PlanStep {
  id:         string;
  content:    Record<string, unknown>;   // flexible JSON — shape depends on step type
  status:     'pending' | 'in_progress' | 'done';
  outcome?:   'pass' | 'fail' | 'not_sure';  // recorded when step completes
  type:       PlanStepType;
  ifCorrect:  string | null;   // step id to follow on pass or not_sure
  ifWrong:    string | null;   // step id to follow on fail
}

export interface Message { role: 'student' | 'agent'; content: string; timestamp: string; }

export interface RawTurn {
  role: 'student' | 'agent' | 'tool_call' | 'tool_result';
  content: unknown;
  name?: string;   // tool name for tool_call / tool_result
  timestamp: string;
}

export interface PlanHistoryEntry {
  conceptId:    string;
  conceptTitle: string;
  plan:         PlanStep[];
  startedAt:    string;
}

export interface Session {
  id:                  string;
  studentId:           string;
  conceptId:           string;
  journeyNodeId:       string;
  status:              'initialised' | 'started' | 'completed';
  conceptStateAtStart: ConceptState;
  teachingPlan:        { content: string; updatedAt: string };
  planHistory:         PlanHistoryEntry[];
  history:             Message[];
  rawHistory:          RawTurn[];
  systemPrompt?:       string;
  /** Step id to restart at when returning from a prereq redirect. */
  resumeFromStep?:     string | null;
  /** Per-question outcomes recorded during a practice exercise. */
  questionProgress?:   QuestionResult[];
}

export interface Journey { id: string; studentId: string; objective: string; }

export interface JourneyNode {
  id:            string;
  journeyId:     string;
  conceptId:     string;
  state:         ConceptState;
  goTo?:         string | null;
  cameFrom?:     string | null;
  preReqToLearn?: string | null;
}
export interface Memory      { id: string; type: 'factual' | 'reflected'; content: string; }
