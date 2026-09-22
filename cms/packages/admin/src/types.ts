export interface ConceptStub {
  id: string;
  title: string;
  kaSlug?: string;
}

export interface ResourceStub {
  id: string;
  title: string;
  type: string;
  kaSlug?: string;
}

export interface Resource {
  id: string;
  title: string;
  type: string;
  kaSlug?: string;
  url?: string;
  youtubeId?: string;
  youtubeUrl?: string;
  thumbnail?: string;
  duration?: number;
  questions?: string[];
  description?: string | null;
}

export interface Question {
  id: string;
  type: string;
  kaSlug?: string;
  perseusContent?: unknown;
  difficultyLevel?: string | null;
}

export interface LessonStep {
  type: 'ido' | 'wedo' | 'youdo';
  instruction: string | null;
  resources: string[];
  learningIndicator: { text?: string; assessmentQuestion?: string | null } | null;
}

export interface Misconception {
  text: string;
  prereqConcept?: string | null;
}

export interface Concept {
  id: string;
  title: string;
  kaSlug?: string;
  source?: string;
  order: number;
  conceptWeightage?: number | null;
  supportedPhases: string[];
  prerequisites: string[];
  nextConcepts: string[];
  boards: unknown[];
  classApplicableTo: unknown[];
  lessonPlan: LessonStep[];
  probingTree: unknown;
  misconceptions: Misconception[];
  masteryQuestions: string[];
  examQuestions: string[];
}

export interface TopicStub {
  id: string;
  title: string;
  concepts: ConceptStub[];
}

export interface UnitNode {
  id: string;
  title: string;
  topics: TopicStub[];
}

export interface StrandNode {
  id: string;
  title: string;
  units: UnitNode[];
}

export interface Topic {
  id: string;
  title: string;
  description?: string | null;
  kaSlug?: string;
  order: number;
  source?: string;
  practiceTests: string[];
}
