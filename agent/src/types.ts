// Domain types the agent needs — subset of @prodigy/types, kept in sync manually.

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  level:   LogLevel;
  message: string;
}

export type ConceptState = 'not_assessed' | 'learning' | 'learn-pre-req-before' | 'clarity' | 'mastered' | 'exam_ready';

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
  id:            string;
  title:         string;
  nextConcepts?: string[];
  probingTree?:  ProbingTree | null;
  lessonPlan?:   LessonStep[];
}

export type PlanStepType = 'probe' | 'teach' | 'inline' | 'store_memory' | 'advance_state' | 'resource' | 'practice';

export interface PlanStep {
  id:         number;
  content:    Record<string, unknown>;   // flexible JSON — shape depends on step type
  status:     'pending' | 'in_progress' | 'done';
  outcome?:   'pass' | 'fail' | 'not_sure';  // recorded when step completes
  type:       PlanStepType;
  ifCorrect:  number | null;   // step id to follow on pass or not_sure
  ifWrong:    number | null;   // step id to follow on fail
}

export interface Message { role: 'student' | 'agent'; content: string; timestamp: string; }

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
