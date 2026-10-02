import { Schema, model, Types } from 'mongoose';

const classroomSchema = new Schema({
  id:               { type: String, required: true, unique: true },
  name:             { type: String, required: true },
  ownerUserId:      { type: String, required: true },
  kind:             { type: String, enum: ['teacher', 'personal'], default: 'teacher' },
  personalStudentId:{ type: String, default: null }, // set only when kind='personal'
  subject:          { type: String },
  grade:            { type: String },
  hashedClassCode:  { type: String, default: null }, // null for personal classes
  status:           { type: String, enum: ['active', 'archived'], default: 'active' },
  createdAt:        { type: Date, default: Date.now },
}, { collection: 'classrooms', id: false });

classroomSchema.pre('validate', function (next) {
  if (!this.id) this.id = new Types.ObjectId().toHexString();
  next();
});

classroomSchema.index({ ownerUserId: 1 });
// One personal class per child — enforced via partial unique index
classroomSchema.index(
  { personalStudentId: 1 },
  { unique: true, sparse: true, partialFilterExpression: { kind: 'personal' } } as any
);

export const Classroom = model('Classroom', classroomSchema);
