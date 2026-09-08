import { Schema, model } from 'mongoose';
import type { IExam } from '@prodigy/types';

const examSchema = new Schema<IExam>({
  name: { type: String, required: true },
  year: { type: Number },
}, { collection: 'exams' });

export const Exam = model<IExam>('Exam', examSchema);
