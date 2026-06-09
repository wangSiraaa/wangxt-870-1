#!/usr/bin/env bash
set -e

cd "$(dirname "$0")"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log() { echo -e "${GREEN}[START]${NC} $1"; }
ok()  { echo -e "${BLUE}[OK]${NC} $1"; }
warn(){ echo -e "${YELLOW}[WARN]${NC} $1"; }
err() { echo -e "${RED}[ERR]${NC} $1"; }

echo -e "${BLUE}
╔══════════════════════════════════════════════════╗
║       员工转岗交接清单 - 一键启动脚本              ║
║       Backend :3002  |  Frontend :5173            ║
╚══════════════════════════════════════════════════╝
${NC}"

command -v npm >/dev/null 2>&1 || { err "npm 未安装"; exit 1; }
command -v docker >/dev/null 2>&1 || { err "docker 未安装"; exit 1; }
command -v docker-compose >/dev/null 2>&1 || command -v docker >/dev/null 2>&1 || { err "docker-compose 未安装"; exit 1; }

COMPOSE_CMD="docker compose"
if ! docker compose version >/dev/null 2>&1; then
  COMPOSE_CMD="docker-compose"
fi

log "启动 PostgreSQL (固定端口 5432)..."
cd backend
$COMPOSE_CMD up -d

log "等待数据库就绪..."
for i in $(seq 1 30); do
  if $COMPOSE_CMD exec -T postgres pg_isready -U transfer >/dev/null 2>&1; then
    ok "数据库已就绪"
    break
  fi
  echo -n "."
  sleep 1
done
echo ""

log "安装后端依赖..."
if [ ! -d "node_modules" ]; then
  npm install
fi
ok "后端依赖已就绪"

log "生成 Prisma Client..."
npx prisma generate >/dev/null
ok "Prisma Client 已生成"

log "执行数据库迁移..."
npx prisma migrate deploy 2>/dev/null || npx prisma migrate dev --name init --skip-seed
ok "数据库迁移完成"

log "导入种子数据..."
npx tsx prisma/seed.ts
ok "种子数据已导入"

echo ""
echo -e "${GREEN}══════════════════════════════════════════${NC}"
ok "后端服务准备就绪！启动命令: cd backend && npm run dev"
ok "后端地址: http://localhost:3002"
ok "健康检查: curl http://localhost:3002/health"
ok "登录接口: POST http://localhost:3002/api/auth/login  body: {employeeCode:'EMP006'}"
echo ""
echo -e "${YELLOW}测试账号（employeeCode登录）:${NC}"
echo "  EMP001 | APPLICANT       | 赵申请人  (HR专员)"
echo "  EMP002 | HANDOVER        | 钱交出    (高级开发)"
echo "  EMP003 | RECEIVER        | 孙接收    (开发工程师)"
echo "  EMP004 | ASSET_ADMIN     | 周资产    (资产管理员)"
echo "  EMP005 | PERMISSION_ADMIN| 吴权限    (权限管理员)"
echo "  EMP006 | MANAGER         | 郑主管    (研发总监)"
echo "  EMP007 | AUDITOR         | 王审计    (审计专员)"
echo ""
echo -e "${BLUE}前端目录: ../frontend/${NC}"
echo -e "${BLUE}启动前端: cd frontend && npm install && npm run dev${NC}"
echo -e "${BLUE}运行验收: cd backend && npm test${NC}"
echo -e "${GREEN}══════════════════════════════════════════${NC}"

if [ "${1:-}" = "--dev" ] || [ "${1:-}" = "--start" ]; then
  log "启动后端开发服务器..."
  npm run dev
fi
