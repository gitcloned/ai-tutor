import { Schema, model, Types } from 'mongoose';
import type { IResource } from '@prodigy/types';

const cfuMarkerSchema = new Schema({
  timestamp: { type: Number, required: true },
  label:     { type: String, required: true },
  question:  { type: Schema.Types.ObjectId, ref: 'Question', default: null },
}, { _id: false });

const resourceSchema = new Schema<IResource>({
  id:          { type: String, required: true, unique: true },
  title:       { type: String, required: true },
  type:        { type: String, enum: ['teaching-video', 'practice-test', 'article', 'simulation', 'other'], required: true },
  source:      { type: String },
  description: { type: String, default: null },
  url:         { type: String, default: null },
  kaSlug:      { type: String, index: true, sparse: true },
  youtubeId:   { type: String, default: null },
  youtubeUrl:  { type: String, default: null },
  duration:    { type: Number, default: null },
  thumbnail:   { type: String, default: null },
  cfuMarkers:  { type: [cfuMarkerSchema], default: [] },
  questions:   [{ type: Schema.Types.ObjectId, ref: 'Question' }],
}, { collection: 'resources', id: false });

resourceSchema.pre('validate', function (next) {
  if (!this.id) this.id = new Types.ObjectId().toHexString();
  next();
});
resourceSchema.index({ source: 1, kaSlug: 1 }, { unique: true, sparse: true });

export const Resource = model<IResource>('Resource', resourceSchema);
