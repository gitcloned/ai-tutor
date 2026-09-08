import { Schema, model, Types } from 'mongoose';
import type { IMemory } from '@prodigy/types';

const memorySchema = new Schema<IMemory>({
  id:        { type: String, required: true, unique: true },
  studentId: { type: String, required: true },
  context: {
    conceptId: { type: String },
    strandId:  { type: String },
  },
  type:           { type: String, enum: ['factual', 'reflected'], required: true },
  content:        { type: String, required: true },
  lastAccessedAt: { type: Date, default: Date.now },
  createdAt:      { type: Date, default: Date.now },
}, { collection: 'memories', id: false });

memorySchema.pre('validate', function (next) {
  if (!this.id) this.id = new Types.ObjectId().toHexString();
  next();
});
memorySchema.index({ studentId: 1, 'context.conceptId': 1 });

export const Memory = model<IMemory>('Memory', memorySchema);
