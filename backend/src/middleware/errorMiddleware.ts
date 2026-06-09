import { Request, Response, NextFunction } from 'express';
import { BusinessException } from './errorHandler.js';

export function errorHandler(
  err: any,
  req: Request,
  res: Response,
  _next: NextFunction
) {
  console.error(`[${new Date().toISOString()}] ${req.method} ${req.url}`, err);

  if (err instanceof BusinessException) {
    return res.status(err.statusCode).json({
      success: false,
      message: err.message,
      code: err.code,
    });
  }

  if (err.name === 'PrismaClientKnownRequestError') {
    if (err.code === 'P2002') {
      return res.status(409).json({
        success: false,
        message: '数据唯一约束冲突',
        code: 'UNIQUE_CONSTRAINT',
      });
    }
    if (err.code === 'P2025') {
      return res.status(404).json({
        success: false,
        message: '记录不存在或已被删除',
        code: 'NOT_FOUND',
      });
    }
  }

  res.status(500).json({
    success: false,
    message: process.env.NODE_ENV === 'production'
      ? '服务器内部错误'
      : err.message || '服务器内部错误',
    code: 'INTERNAL_ERROR',
  });
}
