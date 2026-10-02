import { Schema, model, Types } from 'mongoose';

const userSchema = new Schema({
  id:          { type: String, required: true, unique: true },
  firebaseUid: { type: String, required: true, unique: true },
  name:        { type: String, required: true },
  email:       { type: String, required: true },
  roles:       { type: [String], default: [] }, // 'parent' | 'teacher'
  createdAt:   { type: Date, default: Date.now },
}, { collection: 'users', id: false });

userSchema.pre('validate', function (next) {
  if (!this.id) this.id = new Types.ObjectId().toHexString();
  next();
});

export const User = model('User', userSchema);
