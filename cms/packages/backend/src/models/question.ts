import { Schema, model, Types } from 'mongoose';
import type { IQuestion } from '@prodigy/types';

const solutionStepSchema = new Schema({
  description: { type: String },
  hint: {
    whatToShow:  { type: String },
    whatToSpeak: { type: String },
  },
}, { _id: false });

const hintStepSchema = new Schema({}, { strict: false, _id: false });
const perseusWidgetSchema = new Schema({}, { strict: false, _id: false });

const perseusContentSchema = new Schema({
  content: { type: String },
  widgets: { type: Map, of: perseusWidgetSchema },
  hints:   { type: [Schema.Types.Mixed], default: [] },
}, { _id: false });

const examAppearanceSchema = new Schema({
  exam: { type: Schema.Types.ObjectId, ref: 'Exam' },
  link: { type: String },
}, { _id: false });

const questionSchema = new Schema<IQuestion>({
  id:              { type: String, required: true, unique: true },
  type:            { type: String, enum: ['mcq', 'fib', 'subjective', 'perseus'], required: true },
  source:          { type: String },
  kaSlug:          { type: String, index: true, sparse: true },
  difficultyLevel: { type: String, enum: ['lots', 'mots', 'hots'] },
  appearedInExams: { type: [examAppearanceSchema], default: [] },
  relatedQuestions: [{ type: Schema.Types.ObjectId, ref: 'Question' }],
  stem:            { type: String },
  idealAnswer:     { type: String },
  steps:           { type: [solutionStepSchema], default: [] },
  perseusContent:  { type: perseusContentSchema, default: null },
  teachingTree:    { type: hintStepSchema, default: null },
}, { collection: 'questions', id: false });

questionSchema.pre('validate', function (next) {
  if (!this.id) this.id = new Types.ObjectId().toHexString();
  next();
});
questionSchema.index({ source: 1, kaSlug: 1 }, { unique: true, sparse: true });

export const Question = model<IQuestion>('Question', questionSchema);
