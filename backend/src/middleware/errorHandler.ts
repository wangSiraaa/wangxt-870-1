export class BusinessException extends Error {
  statusCode: number;
  code: string;

  constructor(message: string, statusCode = 400, code = 'BUSINESS_ERROR') {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.name = 'BusinessException';
  }
}

export class UnauthorizedException extends BusinessException {
  constructor(message = '未授权访问') {
    super(message, 401, 'UNAUTHORIZED');
  }
}

export class ForbiddenException extends BusinessException {
  constructor(message = '无权限执行此操作') {
    super(message, 403, 'FORBIDDEN');
  }
}

export class NotFoundException extends BusinessException {
  constructor(message = '资源不存在') {
    super(message, 404, 'NOT_FOUND');
  }
}

export class ConflictException extends BusinessException {
  constructor(message = '资源冲突') {
    super(message, 409, 'CONFLICT');
  }
}

export class VersionMismatchException extends BusinessException {
  constructor(message = '版本不匹配，数据已被他人修改') {
    super(message, 409, 'VERSION_MISMATCH');
  }
}

export class ArchivedModificationException extends BusinessException {
  constructor(message = '已归档的申请不可修改') {
    super(message, 400, 'ARCHIVED_MODIFICATION');
  }
}
