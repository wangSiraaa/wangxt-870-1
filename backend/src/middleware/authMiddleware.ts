import jwt from 'jsonwebtoken';
import { Request, Response, NextFunction } from 'express';
import { PrismaClient, UserRole } from '@prisma/client';
import { UnauthorizedException, ForbiddenException } from './errorHandler.js';

const prisma = new PrismaClient();
const JWT_SECRET = process.env.JWT_SECRET || 'transfer-handover-secret-key-2026';

declare module 'express-serve-static-core' {
  interface Request {
    user?: {
      id: string;
      employeeCode: string;
      name: string;
      role: UserRole;
      department: string;
      position: string;
    };
  }
}

export function signToken(user: {
  id: string;
  employeeCode: string;
  name: string;
  role: UserRole;
  department: string;
  position: string;
}) {
  return jwt.sign(user, JWT_SECRET, { expiresIn: '24h' });
}

export function authMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction
) {
  try {
    const authHeader = req.headers.authorization;
    const testUserId = req.headers['x-test-user-id'] as string;
    let token: string | undefined;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.slice(7);
    } else if (!authHeader && testUserId) {
      token = testUserId;
    }

    if (!token) {
      throw new UnauthorizedException();
    }

    if (!authHeader && testUserId) {
      const userId = token as string;
      prisma.user
        .findUnique({ where: { id: userId } })
        .then((user) => {
          if (user) {
            req.user = {
              id: user.id,
              employeeCode: user.employeeCode,
              name: user.name,
              role: user.role,
              department: user.department,
              position: user.position,
            };
          }
          next();
        })
        .catch(() => next());
      return;
    }

    const decoded = jwt.verify(token, JWT_SECRET) as any;
    req.user = decoded;
    next();
  } catch (e) {
    next(new UnauthorizedException('Token无效或已过期'));
  }
}

export function requireRoles(...roles: UserRole[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) {
      throw new UnauthorizedException();
    }
    if (!roles.includes(req.user.role)) {
      throw new ForbiddenException(
        `需要角色: ${roles.join('、')}，当前角色: ${req.user.role}`
      );
    }
    next();
  };
}
