import { Schema, model, Types } from 'mongoose';
import type { ILearningJourneyTopic } from '@prodigy/types';

const learningJourneyTopicSchema = new Schema<ILearningJourneyTopic>({
  id:             { type: String, required: true, unique: true },
  journeyId:      { type: String, required: true },
  topicId:        { type: String, required: true },
  sourceClassIds: { type: [String], default: [] },
  assignedAt:     { type: Date, default: Date.now },
}, { collection: 'learning_journey_topics', id: false });

learningJourneyTopicSchema.pre('validate', function (next) {
  if (!this.id) this.id = new Types.ObjectId().toHexString();
  next();
});

// A topic is assigned at most once per journey
learningJourneyTopicSchema.index({ journeyId: 1, topicId: 1 }, { unique: true });
learningJourneyTopicSchema.index({ journeyId: 1 });

export const LearningJourneyTopic = model<ILearningJourneyTopic>('LearningJourneyTopic', learningJourneyTopicSchema);
