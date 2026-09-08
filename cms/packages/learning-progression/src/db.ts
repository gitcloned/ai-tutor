import mongoose from 'mongoose';

const MONGO_URL = process.env.MONGO_URL ?? 'mongodb://localhost:27017';
const DB_NAME   = process.env.DB_NAME   ?? 'prodigy';

export async function connectDb(): Promise<void> {
  await mongoose.connect(`${MONGO_URL}/${DB_NAME}`);
  console.log(`Connected to MongoDB: ${DB_NAME}`);
}
