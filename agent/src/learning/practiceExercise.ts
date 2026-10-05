import type { Question, QuestionOutcome, QuestionResult } from '../types.js';
import { lp } from '../api.js';

export interface PracticeNextResult {
  done:     false;
  question: Question;
  index:    number;   // 1-based
  total:    number;
}

export interface PracticeDoneResult {
  done:     true;
  summary:  { total: number; passed: number; failed: number };
}

export type PracticeResult = PracticeNextResult | PracticeDoneResult;

/**
 * In-memory entity that manages a practice exercise for the current session.
 *
 * Loaded by buildContext when the concept has mastery questions. On resume,
 * initialised with the existing questionProgress from the session so the student
 * continues from where they left off.
 *
 * next(outcome?) is the single call-site:
 *   - First call (no outcome): returns the first unanswered question.
 *   - Subsequent calls: records outcome for the current question, persists to
 *     session, then returns the next question (or a done summary).
 */
export class PracticeExercise {
  private questions:  Question[];
  private results:    QuestionResult[];
  private sessionId:  string;

  constructor(questions: Question[], existingProgress: QuestionResult[], sessionId: string) {
    this.questions = questions;
    this.results   = [...existingProgress];
    this.sessionId = sessionId;
  }

  /** The question currently being presented (based on how many have been answered). */
  get currentQuestion(): Question | null {
    return this.questions[this.results.length] ?? null;
  }

  get isDone(): boolean {
    return this.results.length >= this.questions.length;
  }

  get total(): number { return this.questions.length; }
  get progress(): QuestionResult[] { return [...this.results]; }
  get presentation() {
    const points=(q:Question|undefined)=>typeof q?.score==='number'&&Number.isFinite(q.score)&&q.score>=0?q.score:undefined;
    const earnedPoints=this.results.reduce((sum,r)=>sum+(r.outcome==='pass'?(points(this.questions.find(q=>q.id===r.questionId)!)??0):0),0);
    const question=this.currentQuestion;
    return {index:this.results.length+1,total:this.total,earnedPoints,question:question?{
      id:question.id,stem:question.stem??'',points:points(question),
      timeSeconds:typeof question.timeSeconds==='number'&&Number.isFinite(question.timeSeconds)&&question.timeSeconds>0?question.timeSeconds:undefined,
    }:null,results:this.results.map(r=>({questionId:r.questionId,outcome:r.outcome,awardedPoints:r.outcome==='pass'?(points(this.questions.find(q=>q.id===r.questionId)!)??0):0}))};
  }

  /**
   * Mark the current question with `outcome` (if provided), then advance and
   * return the next question — or a done summary if all questions are answered.
   *
   * On the very first call `outcome` is omitted and the first question is returned
   * without recording anything.
   */
  async next(outcome?: QuestionOutcome): Promise<PracticeResult> {
    if (outcome && this.currentQuestion) {
      this.results.push({ questionId: this.currentQuestion.id, outcome });
      try { await lp.patch(`/sessions/${this.sessionId}`, { questionProgress: this.results }); }
      catch(error) { this.results.pop(); throw error; }
    }

    if (this.isDone) {
      const passed = this.results.filter(r => r.outcome === 'pass').length;
      return {
        done:    true,
        summary: { total: this.questions.length, passed, failed: this.questions.length - passed },
      };
    }

    return {
      done:     false,
      question: this.currentQuestion!,
      index:    this.results.length + 1,
      total:    this.questions.length,
    };
  }
}
