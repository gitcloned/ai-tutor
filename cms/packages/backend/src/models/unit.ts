import { Schema, model, Types } from 'mongoose';
import type { IUnit } from '@prodigy/types';

const unitSchema = new Schema<IUnit>({
  id:            { type: String, required: true, unique: true },
  title:         { type: String, required: true },
  description:   { type: String, default: null },
  strand:        { type: Schema.Types.ObjectId, ref: 'Strand', required: true },
  order:         { type: Number, required: true },
  prerequisites: [{ type: Schema.Types.ObjectId, ref: 'Unit' }],
  kaSlug:        { type: String, index: true, sparse: true },
  source:        { type: String },
}, { collection: 'units', id: false });

unitSchema.pre('validate', function (next) {
  if (!this.id) this.id = new Types.ObjectId().toHexString();
  next();
});
unitSchema.index({ source: 1, kaSlug: 1 }, { unique: true, sparse: true });

export const Unit = model<IUnit>('Unit', unitSchema);
