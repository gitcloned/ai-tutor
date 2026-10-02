import { Schema, model, Types } from 'mongoose';
import type { ISubject } from '@prodigy/types';

const subjectSchema = new Schema<ISubject>({
  id:    { type: String, required: true, unique: true },
  title: { type: String, required: true },
}, { collection: 'subjects', id: false });

subjectSchema.pre('validate', function (next) {
  if (!this.id) this.id = new Types.ObjectId().toHexString();
  next();
});

export const Subject = model<ISubject>('Subject', subjectSchema);
