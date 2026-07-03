import * as jwt from 'jsonwebtoken';

const secret: jwt.Secret = process.env.JWT_SECRET || 'dev-secret';
const opts = (ttl: string): jwt.SignOptions => ({ expiresIn: ttl as any });

export function signTokens(userId: string, familyId: string) {
  const accessToken = jwt.sign({ sub: userId, fid: familyId, typ: 'access' }, secret, opts(process.env.JWT_ACCESS_TTL || '30d'));
  const refreshToken = jwt.sign({ sub: userId, fid: familyId, typ: 'refresh' }, secret, opts(process.env.JWT_REFRESH_TTL || '30d'));
  return { accessToken, refreshToken };
}

export const MEMBER_COLORS = ['#E8765A', '#4C82D8', '#2FA38A', '#C77DBB', '#D99036'];
