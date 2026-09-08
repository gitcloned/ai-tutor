import { Schema, model } from 'mongoose';
import type { IClass } from '@prodigy/types';

const classSchema = new Schema<IClass>({
  name: { type: String, required: true },
  code: { type: String, required: true },
}, { collection: 'classes' });

export const Class = model<IClass>('Class', classSchema);
