import { Schema, model, Types } from 'mongoose';

const classAssignmentSchema = new Schema({
  id:          { type: String, required: true, unique: true },
  classroomId: { type: String, required: true },
  subjectId:   { type: String, required: true },
  topicId:     { type: String, required: true },
  createdAt:   { type: Date, default: Date.now },
}, { collection: 'class_assignments', id: false });

classAssignmentSchema.pre('validate', function (next) {
  if (!this.id) this.id = new Types.ObjectId().toHexString();
  next();
});

// Each topic may be assigned to a classroom at most once
classAssignmentSchema.index({ classroomId: 1, topicId: 1 }, { unique: true });
classAssignmentSchema.index({ classroomId: 1 });

export const ClassAssignment = model('ClassAssignment', classAssignmentSchema);
