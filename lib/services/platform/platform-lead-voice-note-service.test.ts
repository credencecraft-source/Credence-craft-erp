import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  requirePlatformNavigationPermissionMock,
  findLeadMock,
  listVoiceNotesMock,
  createVoiceNoteMock,
  findVoiceNoteMock,
  createAuditEventMock,
  prismaMock,
} = vi.hoisted(() => {
  const findLead = vi.fn();
  const listVoiceNotes = vi.fn();
  const createVoiceNote = vi.fn();
  const findVoiceNote = vi.fn();
  const createAuditEvent = vi.fn();
  const transaction = {
    platformLead: { findUnique: findLead, findFirst: findLead },
    platformLeadVoiceNote: { create: createVoiceNote },
    platformAuditEvent: { create: createAuditEvent },
  };
  return {
    requirePlatformNavigationPermissionMock: vi.fn(),
    findLeadMock: findLead,
    listVoiceNotesMock: listVoiceNotes,
    createVoiceNoteMock: createVoiceNote,
    findVoiceNoteMock: findVoiceNote,
    createAuditEventMock: createAuditEvent,
    prismaMock: {
      platformLead: { findUnique: findLead, findFirst: findLead },
      platformLeadVoiceNote: {
        findMany: listVoiceNotes,
        findFirst: findVoiceNote,
      },
      platformAuditEvent: { create: createAuditEvent },
      $transaction: vi.fn((operation: (tx: typeof transaction) => unknown) => operation(transaction)),
    },
  };
});

vi.mock("@/lib/auth/platform-session-manager", () => ({
  requirePlatformNavigationPermission: requirePlatformNavigationPermissionMock,
}));

vi.mock("@/lib/database/prisma-client", () => ({ prisma: prismaMock }));

import {
  createPlatformLeadVoiceNote,
  getPlatformLeadVoiceNoteAudio,
  listPlatformLeadVoiceNotes,
} from "@/lib/services/platform/platform-lead-voice-note-service";

describe("platform lead voice notes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requirePlatformNavigationPermissionMock.mockResolvedValue({ id: "admin-1" });
  });

  it("stores each recording separately and audits safe metadata", async () => {
    findLeadMock.mockResolvedValue({ id: "lead-1" });
    createVoiceNoteMock.mockResolvedValue({
      id: "note-1",
      content_type: "audio/webm",
      byte_size: 3,
      duration_ms: 1200,
      created_at: new Date("2026-10-19T10:00:00Z"),
    });

    await expect(createPlatformLeadVoiceNote("lead-1", {
      audioData: new Uint8Array([1, 2, 3]),
      contentType: "audio/webm;codecs=opus",
      durationMs: 1200,
    })).resolves.toMatchObject({ id: "note-1", byte_size: 3 });

    expect(createVoiceNoteMock).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ lead_id: "lead-1", content_type: "audio/webm", byte_size: 3 }),
    }));
    expect(createAuditEventMock).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        action: "PLATFORM_LEAD_VOICE_NOTE_CREATED",
        details: {
          leadId: "lead-1",
          contentType: "audio/webm",
          byteSize: 3,
          durationMs: 1200,
          source: "RECORDED",
        },
      }),
    }));
  });

  it("rejects unsupported, oversized, or excessively long recordings before writing", async () => {
    await expect(createPlatformLeadVoiceNote("lead-1", {
      audioData: new Uint8Array([1]),
      contentType: "application/octet-stream",
      durationMs: 1000,
    })).rejects.toThrow("Record audio in a supported browser format");
    await expect(createPlatformLeadVoiceNote("lead-1", {
      audioData: new Uint8Array(5 * 1024 * 1024 + 1),
      contentType: "audio/webm",
      durationMs: 1000,
    })).rejects.toThrow("smaller than 5 MB");
    await expect(createPlatformLeadVoiceNote("lead-1", {
      audioData: new Uint8Array([1]),
      contentType: "audio/webm",
      durationMs: 180_001,
    })).rejects.toThrow("3 minutes or shorter");
    expect(createVoiceNoteMock).not.toHaveBeenCalled();
  });

  it("lists metadata without audio and scopes playback by both lead and note", async () => {
    findLeadMock.mockResolvedValue({ id: "lead-1" });
    listVoiceNotesMock.mockResolvedValue([{ id: "note-1", byte_size: 3 }]);
    findVoiceNoteMock.mockResolvedValue({ audio_data: new Uint8Array([1, 2, 3]), content_type: "audio/webm", byte_size: 3 });

    await expect(listPlatformLeadVoiceNotes("lead-1")).resolves.toEqual([{ id: "note-1", byte_size: 3 }]);
    expect(listVoiceNotesMock).toHaveBeenCalledWith(expect.objectContaining({ where: { lead_id: "lead-1" } }));
    expect(listVoiceNotesMock).toHaveBeenCalledWith(expect.objectContaining({
      orderBy: [{ created_at: "desc" }, { id: "desc" }],
    }));
    await getPlatformLeadVoiceNoteAudio("lead-1", "note-1");
    expect(findVoiceNoteMock).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "note-1", lead_id: "lead-1" },
    }));
  });

  it("rejects voice-note lists for unknown leads and playback for unknown notes", async () => {
    findLeadMock.mockResolvedValue(null);
    await expect(listPlatformLeadVoiceNotes("missing-lead")).rejects.toThrow("Lead not found.");
    expect(listVoiceNotesMock).not.toHaveBeenCalled();

    findLeadMock.mockResolvedValue({ id: "lead-1" });
    findVoiceNoteMock.mockResolvedValue(null);
    await expect(getPlatformLeadVoiceNoteAudio("lead-1", "missing-note"))
      .rejects.toThrow("Voice note not found.");
    expect(findVoiceNoteMock).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "missing-note", lead_id: "lead-1" },
    }));
  });

  it("requires lead permission and rejects recordings for missing leads", async () => {
    requirePlatformNavigationPermissionMock.mockRejectedValueOnce(new Error("Access denied."));
    await expect(listPlatformLeadVoiceNotes("lead-1")).rejects.toThrow("Access denied.");
    expect(listVoiceNotesMock).not.toHaveBeenCalled();

    requirePlatformNavigationPermissionMock.mockResolvedValue({ id: "admin-1" });
    findLeadMock.mockResolvedValue(null);
    await expect(createPlatformLeadVoiceNote("missing-lead", {
      audioData: new Uint8Array([1]),
      contentType: "audio/webm",
      durationMs: 1000,
    })).rejects.toThrow("Lead not found.");
    expect(createVoiceNoteMock).not.toHaveBeenCalled();
    expect(createAuditEventMock).not.toHaveBeenCalled();
  });

  it("allows read-only voice-note access to assigned leads while keeping uploads owner-scoped", async () => {
    requirePlatformNavigationPermissionMock.mockResolvedValue({
      id: "sales-manager-1",
      actualRole: "ADMIN",
      team_role: "SALES_MANAGER",
    });
    findLeadMock
      .mockResolvedValueOnce({ id: "lead-owned-by-another-manager" })
      .mockResolvedValueOnce(null);
    listVoiceNotesMock.mockResolvedValue([]);

    await expect(listPlatformLeadVoiceNotes("lead-owned-by-another-manager")).resolves.toEqual([]);

    expect(findLeadMock).toHaveBeenNthCalledWith(1, {
      where: {
        id: "lead-owned-by-another-manager",
        assigned_sales_manager_id: { not: null },
      },
      select: { id: true },
    });
    expect(listVoiceNotesMock).toHaveBeenCalledWith(expect.objectContaining({
      where: { lead_id: "lead-owned-by-another-manager" },
    }));

    await expect(createPlatformLeadVoiceNote("lead-owned-by-another-manager", {
      audioData: new Uint8Array([1]),
      contentType: "audio/mpeg",
      durationMs: 1000,
      source: "UPLOADED",
    })).rejects.toThrow("Lead not found.");
    expect(findLeadMock).toHaveBeenNthCalledWith(2, {
      where: {
        id: "lead-owned-by-another-manager",
        assigned_sales_manager_id: "sales-manager-1",
      },
      select: { id: true },
    });
  });
});