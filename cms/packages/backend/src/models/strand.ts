import { Schema, model, Types } from 'mongoose';
import type { IStrand } from '@prodigy/types';

const strandSchema = new Schema<IStrand>({
  id:      { type: String, required: true, unique: true },
  title:   { type: String, required: true },
  subject: { type: String, required: true },
  weight:  { type: Number, default: null },
  kaSlug:  { type: String, index: true, sparse: true },
  source:  { type: String },
}, { collection: 'strands', id: false });

strandSchema.pre('validate', function (next) {
  if (!this.id) this.id = new Types.ObjectId().toHexString();
  next();
});
strandSchema.index({ source: 1, kaSlug: 1 }, { unique: true, sparse: true });

export const Strand = model<IStrand>('Strand', strandSchema);
