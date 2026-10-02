import { Schema, model, Types } from 'mongoose';

const classroomSchema = new Schema({
  id:             { type: String, required: true, unique: true },
  name:           { type: String, required: true },
  ownerUserId:    { type: String, required: true },
  subject:        { type: String },
  grade:          { type: String },
  hashedClassCode:{ type: String, required: true },
  status:         { type: String, enum: ['active', 'archived'], default: 'active' },
  createdAt:      { type: Date, default: Date.now },
}, { collection: 'classrooms', id: false });

classroomSchema.pre('validate', function (next) {
  if (!this.id) this.id = new Types.ObjectId().toHexString();
  next();
});

classroomSchema.index({ ownerUserId: 1 });

export const Classroom = model('Classroom', classroomSchema);
