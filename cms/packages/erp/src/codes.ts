import { randomBytes } from 'crypto';
import bcrypt from 'bcryptjs';

// No vowels, no 0, no 1 — reduces ambiguity when reading aloud or handwriting
const CHARSET = 'BCDFGHJKLMNPQRSTVWXYZ23456789';

export function generateCode(): string {
  const bytes = randomBytes(6);
  return Array.from(bytes).map(b => CHARSET[b % CHARSET.length]).join('');
}

export async function hashCode(code: string): Promise<string> {
  return bcrypt.hash(code.trim().toUpperCase(), 10);
}

export async function verifyCode(code: string, hash: string): Promise<boolean> {
  return bcrypt.compare(code.trim().toUpperCase(), hash);
}
