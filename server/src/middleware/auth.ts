import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';

// Single shared instance — never instantiate inside request handlers
const prisma = new PrismaClient();

export interface AuthRequest extends Request {
  user?: { id: number; email: string; role: string; staffId?: number };
}

export const authenticate = (req: AuthRequest, res: Response, next: NextFunction) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ message: 'No token provided' });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as {
      id: number;
      email: string;
      role: string;
      staffId?: number;
    };
    req.user = decoded;
    next();
  } catch {
    res.status(401).json({ message: 'Invalid token' });
  }
};

export const requireAdmin = (req: AuthRequest, res: Response, next: NextFunction) => {
  if (req.user?.role !== 'ADMIN') {
    return res.status(403).json({ message: 'Admin access required' });
  }
  next();
};

export const requireHR = (req: AuthRequest, res: Response, next: NextFunction) => {
  if (req.user?.role !== 'HR' && req.user?.role !== 'ADMIN') {
    return res.status(403).json({ message: 'HR access required' });
  }
  next();
};

export const requirePartnerOrAdmin = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (req.user?.role === 'ADMIN') return next();
    if (!req.user?.staffId) return res.status(403).json({ message: 'Staff profile required' });
    const staff = await prisma.staff.findUnique({ where: { id: req.user.staffId } });
    if (!staff?.isPartner) return res.status(403).json({ message: 'Partner or Admin access required' });
    next();
  } catch (err) {
    next(err);
  }
};

export const requirePartnerHROrAdmin = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (req.user?.role === 'ADMIN' || req.user?.role === 'HR') return next();
    if (!req.user?.staffId) return res.status(403).json({ message: 'Staff profile required' });
    const staff = await prisma.staff.findUnique({ where: { id: req.user.staffId } });
    if (!staff?.isPartner) return res.status(403).json({ message: 'Partner, HR or Admin access required' });
    next();
  } catch (err) {
    next(err);
  }
};
