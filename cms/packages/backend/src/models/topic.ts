import { Schema, model, Types } from 'mongoose';
import type { ITopic } from '@prodigy/types';

const hintStepSchema = new Schema({}, { strict: false, _id: false });
const probingTreeSchema = new Schema({
  entryQuestion: { type: Schema.Types.ObjectId, ref: 'Question' },
  nodes:         [hintStepSchema],
}, { _id: false });

const topicSchema = new Schema<ITopic>({
  id:           { type: String, required: true, unique: true },
  title:        { type: String, required: true },
  description:  { type: String, default: null },
  unit:         { type: Schema.Types.ObjectId, ref: 'Unit', required: true },
  order:        { type: Number, required: true },
  probingTree:  { type: probingTreeSchema, default: null },
  practiceTests: [{ type: Schema.Types.ObjectId, ref: 'Resource' }],
  kaSlug:       { type: String, index: true, sparse: true },
  source:       { type: String },
}, { collection: 'topics', id: false });

topicSchema.pre('validate', function (next) {
  if (!this.id) this.id = new Types.ObjectId().toHexString();
  next();
});
topicSchema.index({ source: 1, kaSlug: 1 }, { unique: true, sparse: true });

export const Topic = model<ITopic>('Topic', topicSchema);
