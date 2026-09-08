// Domain types the agent needs — subset of @prodigy/types, kept in sync manually.

export type ConceptState = 'not_assessed' | 'learning' | 'clarity' | 'mastered' | 'exam_ready';

export interface HintAction { type: string; [key: string]: unknown; }
export interface HintStep   { probe: string; idealAnswer: string; ifCorrect: HintAction; ifWrong: HintAction; }
export interface ProbingTree { nodes: HintStep[]; }

export interface LessonStep  { type: string; instruction?: string | null; }

export interface Concept {
  id:           string;
  title:        string;
  probingTree?: ProbingTree | null;
  lessonPlan?:  LessonStep[];
}

export type PlanStepType = 'probe' | 'teach' | 'inline' | 'store_memory' | 'advance_state';

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

export interface Session {
  id:                  string;
  studentId:           string;
  conceptId:           string;
  journeyNodeId:       string;
  status:              'initialised' | 'started' | 'completed';
  conceptStateAtStart: ConceptState;
  teachingPlan:        { content: string; updatedAt: string };
  history:             Message[];
}

export interface Journey     { id: string; studentId: string; objective: string; }
export interface JourneyNode { id: string; journeyId: string; conceptId: string; state: ConceptState; }
export interface Memory      { id: string; type: 'factual' | 'reflected'; content: string; }
