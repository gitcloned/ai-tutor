import { Schema, model, Types } from 'mongoose';
import type { IConcept } from '@prodigy/types';

const lessonStepSchema = new Schema({
  type:        { type: String, enum: ['ido', 'wedo', 'youdo'], required: true },
  instruction: { type: String, default: null },
  resources:   [{ type: String, ref: 'Resource' }],
  learningIndicator: {
    text:               { type: String },
    assessmentQuestion: { type: Schema.Types.ObjectId, ref: 'Question', default: null },
  },
}, { _id: false });

const misconceptionSchema = new Schema({
  text:          { type: String, required: true },
  prereqConcept: { type: Schema.Types.ObjectId, ref: 'Concept', default: null },
  questions:     [{ type: Schema.Types.ObjectId, ref: 'Question' }],
}, { _id: false });

const hintStepSchema = new Schema({}, { strict: false, _id: false });

const probingTreeSchema = new Schema({}, { strict: false, _id: false });

const conceptSchema = new Schema<IConcept>({
  id:               { type: String, required: true, unique: true },
  title:            { type: String, required: true },
  topic:            { type: Schema.Types.ObjectId, ref: 'Topic', required: true },
  order:            { type: Number, required: true },
  conceptWeightage: { type: Number, default: null },
  classApplicableTo: [{ type: Schema.Types.ObjectId, ref: 'Class' }],
  boards:           [{ type: Schema.Types.ObjectId, ref: 'Board' }],
  prerequisites:    [{ type: Schema.Types.ObjectId, ref: 'Concept' }],
  nextConcepts:     [{ type: Schema.Types.ObjectId, ref: 'Concept' }],
  misconceptions:   { type: [misconceptionSchema], default: [] },
  lessonPlan:       { type: [lessonStepSchema], default: [] },
  probingTree:      { type: probingTreeSchema, default: null },
  masteryQuestions: [{ type: Schema.Types.ObjectId, ref: 'Resource' }],
  examQuestions:    [{ type: Schema.Types.ObjectId, ref: 'Resource' }],
  kaSlug:           { type: String, index: true, sparse: true },
  localId:          { type: String, index: true, sparse: true },
  source:           { type: String },
}, { collection: 'concepts', id: false });

conceptSchema.pre('validate', function (next) {
  if (!this.id) this.id = new Types.ObjectId().toHexString();
  next();
});
conceptSchema.index({ source: 1, kaSlug: 1 }, { unique: true, sparse: true });

export const Concept = model<IConcept>('Concept', conceptSchema);
