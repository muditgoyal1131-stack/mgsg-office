import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export const login = async (req: Request, res: Response) => {
  const { email, password } = req.body;
  try {
    const user = await prisma.user.findUnique({
      where: { email },
      include: { staff: true },
    });
    if (!user) return res.status(401).json({ message: 'Invalid credentials' });

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(401).json({ message: 'Invalid credentials' });

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role, staffId: user.staffId },
      process.env.JWT_SECRET!,
      { expiresIn: '8h' }
    );

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        staffName: user.staff?.staffName,
        staffId: user.staffId,
        isPartner: user.staff?.isPartner ?? false,
      },
    });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
};

export const updatePassword = async (req: Request & { user?: any }, res: Response) => {
  const { currentPassword, newPassword } = req.body;
  const userId = req.user?.id;
  try {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return res.status(404).json({ message: 'User not found' });

    const valid = await bcrypt.compare(currentPassword, user.password);
    if (!valid) return res.status(400).json({ message: 'Current password incorrect' });

    const hashed = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({ where: { id: userId }, data: { password: hashed } });
    res.json({ message: 'Password updated successfully' });
  } catch {
    res.status(500).json({ message: 'Server error' });
  }
};

export const getProfile = async (req: Request & { user?: any }, res: Response) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user?.id },
      select: {
        id: true, email: true, role: true, staffId: true, createdAt: true,
        staff: true,
      },
    });
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json({
      ...user,
      isPartner: user.staff?.isPartner ?? false,
    });
  } catch {
    res.status(500).json({ message: 'Server error' });
  }
};
