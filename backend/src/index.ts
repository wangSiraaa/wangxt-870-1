import express, { Request, Response } from 'express';
import cors from 'cors';
import { PrismaClient, UserRole } from '@prisma/client';
import { errorHandler } from './middleware/errorMiddleware.js';
import { authMiddleware, signToken, requireRoles } from './middleware/authMiddleware.js';
import { idempotencyMiddleware } from './middleware/idempotencyMiddleware.js';
import { auditMiddleware } from './middleware/auditMiddleware.js';
import transferRoutes from './routes/transfers.js';
import checklistRoutes from './routes/checklist.js';
import assetRoutes from './routes/assets.js';
import permissionRoutes from './routes/permissions.js';
import approvalRoutes from './routes/approvals.js';
import auditRoutes from './routes/audit.js';

export const prisma = new PrismaClient();

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

app.get('/health', (_req: Request, res: Response) => {
  res.json({
    success: true,
    data: {
      status: 'ok',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
    },
  });
});

app.post('/api/auth/login', async (req: Request, res: Response, next) => {
  try {
    const { employeeCode } = req.body;
    if (!employeeCode) {
      return res
        .status(400)
        .json({ success: false, message: 'employeeCode 必填' });
    }
    const user = await prisma.user.findUnique({
      where: { employeeCode: String(employeeCode) },
    });
    if (!user) {
      return res.status(404).json({ success: false, message: '用户不存在' });
    }
    const token = signToken({
      id: user.id,
      employeeCode: user.employeeCode,
      name: user.name,
      role: user.role,
      department: user.department,
      position: user.position,
    });
    res.json({
      success: true,
      data: {
        token,
        user: {
          id: user.id,
          employeeCode: user.employeeCode,
          name: user.name,
          email: user.email,
          role: user.role,
          department: user.department,
          position: user.position,
        },
      },
    });
  } catch (e) {
    next(e);
  }
});

app.get('/api/users', authMiddleware, async (req: Request, res: Response, next) => {
  try {
    const { role, department } = req.query;
    const where: any = {};
    if (role) where.role = String(role) as UserRole;
    if (department) where.department = String(department);
    const users = await prisma.user.findMany({
      where,
      orderBy: { employeeCode: 'asc' },
    });
    res.json({ success: true, data: users });
  } catch (e) {
    next(e);
  }
});

app.use('/api', authMiddleware, idempotencyMiddleware, auditMiddleware);
app.use('/api/transfers', transferRoutes);
app.use('/api/checklist', checklistRoutes);
app.use('/api/assets', assetRoutes);
app.use('/api/permissions', permissionRoutes);
app.use('/api/approvals', approvalRoutes);
app.use('/api/audit', auditRoutes);

app.use(errorHandler);

if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(
      `[${new Date().toISOString()}] Server started on http://0.0.0.0:${PORT}`
    );
  });
}

export default app;
