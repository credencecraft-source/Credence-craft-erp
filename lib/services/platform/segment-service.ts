import { prisma } from "@/lib/database/prisma-client";

const DEFAULT_SEGMENTS = ["Free", "Standard", "Professional", "Premium", "Elite", "Ultimate"];

export async function ensureDefaultSegments() {
  await Promise.all(
    DEFAULT_SEGMENTS.map((name) =>
      prisma.segment.upsert({
        where: { name },
        update: {},
        create: { name },
      }),
    ),
  );
}

export async function listSegments() {
  await ensureDefaultSegments();
  return prisma.segment.findMany({ orderBy: [{ is_active: "desc" }, { name: "asc" }] });
}

export async function createSegment(input: { name: string; description?: string }) {
  const name = input.name.trim();
  if (!name) throw new Error("Segment name is required.");

  const existing = await prisma.segment.findUnique({ where: { name } });
  if (existing) throw new Error("A segment with this name already exists.");

  return prisma.segment.create({
    data: { name, description: input.description?.trim() || null },
  });
}

export async function deleteSegment(id: string) {
  return prisma.segment.delete({ where: { id } });
}
