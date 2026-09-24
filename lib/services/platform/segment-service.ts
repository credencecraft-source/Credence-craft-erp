import { prisma } from "@/lib/database/prisma-client";

const DEFAULT_SEGMENTS = ["Free", "Standard", "Professional", "Premium", "Elite", "Ultimate"];

export async function ensureDefaultSegments() {
  let lastOrder = (await prisma.segment.findFirst({ orderBy: { sort_order: "desc" }, select: { sort_order: true } }))?.sort_order ?? 0;
  for (const name of DEFAULT_SEGMENTS) {
    const existing = await prisma.segment.findUnique({ where: { name }, select: { id: true } });
    if (existing) continue;
    lastOrder += 1;
    await prisma.segment.create({ data: { name, sort_order: lastOrder } });
  }
}

export async function listSegments() {
  await ensureDefaultSegments();
  return prisma.segment.findMany({ orderBy: [{ sort_order: "asc" }, { name: "asc" }] });
}

export async function createSegment(input: { name: string; description?: string }) {
  const name = input.name.trim();
  if (!name) throw new Error("Segment name is required.");

  const existing = await prisma.segment.findUnique({ where: { name } });
  if (existing) throw new Error("A segment with this name already exists.");

  const lastSegment = await prisma.segment.findFirst({ orderBy: { sort_order: "desc" }, select: { sort_order: true } });

  return prisma.segment.create({
    data: {
      name,
      description: input.description?.trim() || null,
      sort_order: (lastSegment?.sort_order ?? 0) + 1,
    },
  });
}

export async function updateSegmentSortOrder(id: string, requestedOrder: number) {
  if (!Number.isInteger(requestedOrder) || requestedOrder < 1) {
    throw new Error("Rank must be a positive whole number.");
  }

  return prisma.$transaction(async (transaction) => {
    const segments = await transaction.segment.findMany({ orderBy: [{ sort_order: "asc" }, { name: "asc" }] });
    const currentIndex = segments.findIndex((segment) => segment.id === id);
    if (currentIndex < 0) throw new Error("Segment not found.");

    const [segment] = segments.splice(currentIndex, 1);
    const nextIndex = Math.min(requestedOrder - 1, segments.length);
    segments.splice(nextIndex, 0, segment);

    await Promise.all(
      segments.map((item, index) =>
        transaction.segment.update({ where: { id: item.id }, data: { sort_order: index + 1 } }),
      ),
    );

    return segments[nextIndex];
  });
}

export async function deleteSegment(id: string) {
  return prisma.segment.delete({ where: { id } });
}
