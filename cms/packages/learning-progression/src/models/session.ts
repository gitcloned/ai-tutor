import { Schema, model, Types } from 'mongoose';
import type { ISession } from '@prodigy/types';

const teachingPlanSchema = new Schema({
  content:   { type: String, default: '' },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
}, { _id: false });

const planHistoryEntrySchema = new Schema({
  conceptId:    { type: String, required: true },
  conceptTitle: { type: String, required: true },
  plan:         { type: [Schema.Types.Mixed], default: [] },
  startedAt:    { type: Date, default: Date.now },
}, { _id: false });

const messageSchema = new Schema({
  role:      { type: String, enum: ['student', 'agent'], required: true },
  content:   { type: String, required: true },
  timestamp: { type: Date, default: Date.now },
}, { _id: false });

const rawTurnSchema = new Schema({
  role:      { type: String, enum: ['student', 'agent', 'tool_call', 'tool_result'], required: true },
  content:   { type: Schema.Types.Mixed, required: true },
  name:      { type: String },
  timestamp: { type: Date, default: Date.now },
}, { _id: false });

const sessionSchema = new Schema<ISession>({
  id:                  { type: String, required: true, unique: true },
  studentId:           { type: String, required: true },
  conceptId:           { type: String, required: true },
  journeyNodeId:       { type: String, required: true },
  status:              { type: String, enum: ['initialised', 'started', 'completed'], default: 'initialised' },
  conceptStateAtStart: { type: String, enum: ['not_assessed', 'learning', 'learn-pre-req-before', 'clarity', 'mastered', 'exam_ready'], required: true },
  conceptStateAtEnd:   { type: String, enum: ['not_assessed', 'learning', 'learn-pre-req-before', 'clarity', 'mastered', 'exam_ready'], default: null },
  teachingPlan:        { type: teachingPlanSchema, required: true },
  planHistory:         { type: [planHistoryEntrySchema], default: [] },
  history:             { type: [messageSchema], default: [] },
  rawHistory:          { type: [rawTurnSchema], default: [] },
  systemPrompt:        { type: String },
  memory:              [{ type: String }],
  createdAt:           { type: Date, default: Date.now },
  endedAt:             { type: Date, default: null },
}, { collection: 'sessions', id: false });

sessionSchema.pre('validate', function (next) {
  if (!this.id) this.id = new Types.ObjectId().toHexString();
  next();
});
sessionSchema.index({ studentId: 1, createdAt: -1 });
sessionSchema.index({ journeyNodeId: 1 });

export const Session = model<ISession>('Session', sessionSchema);
