import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function getChecklistItemsByPositionTemplate(
  position: string,
  department: string
) {
  return prisma.positionTemplate.findMany({
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
  fromDepartment: string
) {
  const fromItems = await getChecklistItemsByPositionTemplate(
    fromPosition,
    fromDepartment
  );
  const toItems = await getChecklistItemsByPositionTemplate(
    toPosition,
    toDepartment
  );

  const existing = await prisma.checklistItem.findMany({
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

  return prisma.checklistItem.createMany({ data: createData });
}
