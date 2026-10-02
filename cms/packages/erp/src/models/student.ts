import { Schema, model, Types } from 'mongoose';

const studentSchema = new Schema({
  id:               { type: String, required: true, unique: true },
  name:             { type: String, required: true },
  age:              { type: Number },
  grade:            { type: String },
  encryptedCode:    { type: String },
  hashedCode:       { type: String, required: true },
  createdByUserId:  { type: String, required: true },
  idempotencyKey:   { type: String, default: null }, // optional client-supplied key for safe retry
  createdAt:        { type: Date, default: Date.now },
}, { collection: 'students', id: false });

studentSchema.pre('validate', function (next) {
  if (!this.id) this.id = new Types.ObjectId().toHexString();
  next();
});

studentSchema.index({ createdByUserId: 1 });

export const Student = model('Student', studentSchema);
