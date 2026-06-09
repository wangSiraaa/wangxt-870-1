import { PrismaClient, Prisma } from '@prisma/client';

type TransactionCtx = Prisma.TransactionClient | PrismaClient;

export async function getChecklistItemsByPositionTemplate(
  position: string,
  department: string,
  tx: TransactionCtx
) {
  return tx.positionTemplate.findMany({
    where: {
      OR: [
        { position, department },
        { position, department: '*' },
        { position: '*', department },
        { position: '*', department: '*' },
      ],
    },
    orderBy: [{ category: 'asc' }, { sortOrder: 'asc' }],
  });
}

export async function generateChecklistFromTemplate(
  transferId: string,
  toPosition: string,
  toDepartment: string,
  fromPosition: string,
  fromDepartment: string,
  tx: TransactionCtx
) {
  const fromItems = await getChecklistItemsByPositionTemplate(
    fromPosition,
    fromDepartment,
    tx
  );
  const toItems = await getChecklistItemsByPositionTemplate(
    toPosition,
    toDepartment,
    tx
  );

  const existing = await tx.checklistItem.findMany({
    where: { transferId },
    select: { itemName: true, category: true },
  });
  const existingSet = new Set(
    existing.map((e) => `${e.category}::${e.itemName}`)
  );

  const combined = [...fromItems, ...toItems];
  const uniqueItems = combined.filter((item, idx, arr) => {
    const key = `${item.category}::${item.itemName}`;
    if (existingSet.has(key)) return false;
    return arr.findIndex((i) => `${i.category}::${i.itemName}` === key) === idx;
  });

  if (uniqueItems.length === 0) return [];

  const createData = uniqueItems.map((item, idx) => ({
    transferId,
    category: item.category,
    itemName: item.itemName,
    description: item.description,
    isCritical: item.isCritical,
    sortOrder: idx + existing.length + 1,
  }));

  return tx.checklistItem.createMany({ data: createData });
}
