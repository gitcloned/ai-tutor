import { Schema, model, Types } from 'mongoose';
import type { ILearningJourney } from '@prodigy/types';

const learningJourneySchema = new Schema<ILearningJourney>({
  id:        { type: String, required: true, unique: true },
  studentId: { type: String, required: true },
  objective: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
}, { collection: 'learning_journeys', id: false });

learningJourneySchema.pre('validate', function (next) {
  if (!this.id) this.id = new Types.ObjectId().toHexString();
  next();
});
learningJourneySchema.index({ studentId: 1 });

export const LearningJourney = model<ILearningJourney>('LearningJourney', learningJourneySchema);
