import { Request, Response, NextFunction } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

declare module 'express-serve-static-core' {
  interface Request {
    idempotencyKey?: string;
    idempotencyRecord?: any;
  }
}

const IDEMPOTENCY_HEADER = 'x-idempotency-key';
const EXPIRE_HOURS = 24;

export function idempotencyMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const key = req.headers[IDEMPOTENCY_HEADER] as string;
  if (!key || (req.method !== 'POST' && req.method !== 'PUT')) {
    return next();
  }

  req.idempotencyKey = key;

  prisma.idempotencyRecord
    .findUnique({ where: { idempotencyKey: key } })
    .then((record) => {
      if (record && record.expiresAt > new Date()) {
        req.idempotencyRecord = record;
        return res.status(record.statusCode).json(record.responseBody);
      }
      next();
    })
    .catch(() => next());
}

export async function saveIdempotencyResponse(
  key: string,
  method: string,
  endpoint: string,
  transferId: string | undefined,
  statusCode: number,
  responseBody: any
) {
  try {
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + EXPIRE_HOURS);
    await prisma.idempotencyRecord.upsert({
      where: { idempotencyKey: key },
      create: {
        idempotencyKey: key,
        method,
        endpoint,
        transferId: transferId || null,
        statusCode,
        responseBody,
        expiresAt,
      },
      update: {
        statusCode,
        responseBody,
        expiresAt,
      },
    });
  } catch (e) {
    console.error('Save idempotency failed:', e);
  }
}
