import { Schema, model } from 'mongoose';

const enrollmentSchema = new Schema({
  classroomId: { type: String, required: true },
  studentId:   { type: String, required: true },
  joinedAt:    { type: Date, default: Date.now },
}, { collection: 'enrollments', id: false });

// Unique index — joining twice is idempotent
enrollmentSchema.index({ classroomId: 1, studentId: 1 }, { unique: true });
enrollmentSchema.index({ studentId: 1 });

export const Enrollment = model('Enrollment', enrollmentSchema);
