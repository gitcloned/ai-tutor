import { Schema, model, Types } from 'mongoose';
import type { ILearningJourneyNode } from '@prodigy/types';

const learningJourneyNodeSchema = new Schema<ILearningJourneyNode>({
  id:           { type: String, required: true, unique: true },
  journeyId:    { type: String, required: true },
  conceptId:    { type: String, required: true },
  order:        { type: Number, required: true },
  state:          { type: String, enum: ['not_assessed', 'learning', 'learn-pre-req-before', 'clarity', 'mastered', 'exam_ready'], default: 'not_assessed' },
  masteryLevel:   { type: String, enum: ['lots', 'mots', 'hots'], default: null },
  probingPath:    { type: [Schema.Types.Mixed], default: [] },
  goTo:           { type: String, default: null },
  cameFrom:       { type: String, default: null },
  preReqToLearn:  { type: String, default: null },
  lastActivity:   { type: Date },
  completedAt:    { type: Date, default: null },
}, { collection: 'learning_journey_nodes', id: false });

learningJourneyNodeSchema.pre('validate', function (next) {
  if (!this.id) this.id = new Types.ObjectId().toHexString();
  next();
});
learningJourneyNodeSchema.index({ journeyId: 1, order: 1 });
learningJourneyNodeSchema.index({ journeyId: 1, conceptId: 1 }, { unique: true });

export const LearningJourneyNode = model<ILearningJourneyNode>('LearningJourneyNode', learningJourneyNodeSchema);
