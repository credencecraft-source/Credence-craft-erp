import { requirePlatformNavigationPermission } from "@/lib/auth/platform-session-manager";
import { prisma } from "@/lib/database/prisma-client";

export const PLATFORM_LEAD_VOICE_NOTE_MAX_BYTES = 5 * 1024 * 1024;
const MAX_VOICE_NOTE_DURATION_MS = 180_000;
const ALLOWED_VOICE_NOTE_TYPES = new Set([
  "audio/webm",
  "audio/ogg",
  "audio/mp4",
  "audio/mpeg",
  "audio/wav",
  "audio/x-wav",
]);

export type PlatformLeadVoiceNoteInput = {
  audioData: Uint8Array;
  contentType: string;
  durationMs: number;
};

function validateId(value: string, label: string) {
  const id = value.trim();
  if (!id || id.length > 255) throw new Error(`Select a valid ${label}.`);
  return id;
}

function normalizeVoiceNote(input: PlatformLeadVoiceNoteInput) {
  const contentType = input.contentType.split(";")[0].trim().toLowerCase();
  const byteSize = input.audioData.byteLength;
  if (!ALLOWED_VOICE_NOTE_TYPES.has(contentType)) {
    throw new Error("Record audio in a supported browser format and try again.");
  }
  if (byteSize < 1 || byteSize > PLATFORM_LEAD_VOICE_NOTE_MAX_BYTES) {
    throw new Error("Voice notes must be smaller than 5 MB.");
  }
  if (!Number.isSafeInteger(input.durationMs)
    || input.durationMs < 1
    || input.durationMs > MAX_VOICE_NOTE_DURATION_MS) {
    throw new Error("Voice notes must be 3 minutes or shorter.");
  }
  return { contentType, byteSize };
}

export async function listPlatformLeadVoiceNotes(leadId: string) {
  await requirePlatformNavigationPermission("canAccessLeadsAndSubscriptions");
  const id = validateId(leadId, "lead");
  return prisma.platformLeadVoiceNote.findMany({
    where: { lead_id: id },
    orderBy: [{ created_at: "desc" }, { id: "desc" }],
    select: {
      id: true,
      content_type: true,
      byte_size: true,
      duration_ms: true,
      created_at: true,
    },
  });
}

export async function createPlatformLeadVoiceNote(
  leadId: string,
  input: PlatformLeadVoiceNoteInput,
) {
  const admin = await requirePlatformNavigationPermission("canAccessLeadsAndSubscriptions");
  const id = validateId(leadId, "lead");
  const { contentType, byteSize } = normalizeVoiceNote(input);
  const audioData = new Uint8Array(input.audioData);

  return prisma.$transaction(async (transaction) => {
    const lead = await transaction.platformLead.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!lead) throw new Error("Lead not found.");

    const note = await transaction.platformLeadVoiceNote.create({
      data: {
        lead_id: id,
        content_type: contentType,
        byte_size: byteSize,
        duration_ms: input.durationMs,
        audio_data: audioData,
      },
      select: {
        id: true,
        content_type: true,
        byte_size: true,
        duration_ms: true,
        created_at: true,
      },
    });
    await transaction.platformAuditEvent.create({
      data: {
        platform_admin_id: admin.id,
        action: "PLATFORM_LEAD_VOICE_NOTE_CREATED",
        entity_type: "PlatformLeadVoiceNote",
        entity_id: note.id,
        details: { leadId: id, contentType, byteSize, durationMs: input.durationMs },
      },
    });
    return note;
  });
}

export async function getPlatformLeadVoiceNoteAudio(leadId: string, noteId: string) {
  await requirePlatformNavigationPermission("canAccessLeadsAndSubscriptions");
  const id = validateId(leadId, "lead");
  const voiceNoteId = validateId(noteId, "voice note");
  const note = await prisma.platformLeadVoiceNote.findFirst({
    where: { id: voiceNoteId, lead_id: id },
    select: { audio_data: true, content_type: true, byte_size: true },
  });
  if (!note) throw new Error("Voice note not found.");
  return note;
}