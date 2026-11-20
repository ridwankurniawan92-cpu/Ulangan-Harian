import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import type { Request, Response, NextFunction } from 'express';
import type { RoleName } from '../shared/types.ts';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const SECRET_FILE = path.join(DATA_DIR, '.session_secret');

function getSessionSecret(): string {
  if (process.env.SESSION_SECRET && process.env.SESSION_SECRET.length >= 16) {
    return process.env.SESSION_SECRET;
  }
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (fs.existsSync(SECRET_FILE)) {
    return fs.readFileSync(SECRET_FILE, 'utf-8').trim();
  }
  const generated = crypto.randomBytes(32).toString('hex');
  fs.writeFileSync(SECRET_FILE, generated, { mode: 0o600 });
  return generated;
}

export const SESSION_COOKIE_NAME = 'uh_k3_session';

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const parts = storedHash.split(':');
  if (parts.length !== 2) return false;
  const [salt, originalHex] = parts;
  const derived = crypto.scryptSync(password, salt, 64);
  const originalBuf = Buffer.from(originalHex, 'hex');
  if (derived.length !== originalBuf.length) return false;
  return crypto.timingSafeEqual(derived, originalBuf);
}

interface TokenPayload {
  uid: number;
  role: RoleName;
  exp: number;
}

export function createSessionToken(userId: number, role: RoleName): string {
  const secret = getSessionSecret();
  const payload: TokenPayload = {
    uid: userId,
    role,
    exp: Date.now() + 1000 * 60 * 60 * 24 * 7, // 7 days
  };
  const encoded = Buffer.from(JSON.stringify(payload), 'utf-8').toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(encoded).digest('base64url');
  return `${encoded}.${sig}`;
}

export function verifySessionToken(token: string | undefined): TokenPayload | null {
  if (!token || !token.includes('.')) return null;
  const secret = getSessionSecret();
  const [encoded, sig] = token.split('.');
  if (!encoded || !sig) return null;
  const expectedSig = crypto.createHmac('sha256', secret).update(encoded).digest('base64url');
  const sigBuf = Buffer.from(sig);
  const expectedBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
    return null;
  }
  try {
    const parsed = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf-8')) as TokenPayload;
    if (!parsed.uid || !parsed.role || Date.now() > parsed.exp) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export interface AuthenticatedRequest extends Request {
  auth?: {
    userId: number;
    role: RoleName;
    username: string;
    fullName: string;
    studentId?: number;
    studentClass?: string;
    parentId?: number;
  };
}

function isHttpsRequest(req: Request): boolean {
  const proto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim();
  return req.secure || proto === 'https' || process.env.NODE_ENV === 'production';
}

export function setSessionCookie(req: Request, res: Response, token: string): void {
  const isHttps = isHttpsRequest(req);
  res.cookie(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: isHttps ? 'none' : 'lax',
    secure: isHttps,
    maxAge: 1000 * 60 * 60 * 24 * 7,
    path: '/',
  });
}

export function clearSessionCookie(req: Request, res: Response): void {
  const isHttps = isHttpsRequest(req);
  res.clearCookie(SESSION_COOKIE_NAME, {
    httpOnly: true,
    sameSite: isHttps ? 'none' : 'lax',
    secure: isHttps,
    path: '/',
  });
}

export function requireRole(allowedRoles: RoleName[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.auth) {
      return res.status(401).json({ error: 'Sesi login tidak ditemukan atau telah berakhir. Silakan login kembali.' });
    }
    if (!allowedRoles.includes(req.auth.role)) {
      return res.status(403).json({ error: 'Anda tidak memiliki hak akses untuk fitur ini.' });
    }
    next();
  };
}
