import { Schema, model } from 'mongoose';
import type { IBoard } from '@prodigy/types';

const boardSchema = new Schema<IBoard>({
  name:        { type: String, required: true },
  description: { type: String },
}, { collection: 'boards' });

export const Board = model<IBoard>('Board', boardSchema);
