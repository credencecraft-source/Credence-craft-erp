import { NextResponse } from "next/server";

import { requirePlatformNavigationPermission } from "@/lib/auth/platform-session-manager";
import {
  createPlatformLeadVoiceNote,
  listPlatformLeadVoiceNotes,
  PLATFORM_LEAD_VOICE_NOTE_MAX_BYTES,
} from "@/lib/services/platform/platform-lead-voice-note-service";

type RouteContext = { params: Promise<{ leadId: string }> };

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { leadId } = await context.params;
    const notes = await listPlatformLeadVoiceNotes(leadId);
    return NextResponse.json({ notes });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to load voice notes." },
      { status: 400 },
    );
  }
}

export async function POST(request: Request, context: RouteContext) {
  try {
    await requirePlatformNavigationPermission("canAccessLeadsAndSubscriptions");
    const declaredLength = Number(request.headers.get("content-length"));
    if (Number.isFinite(declaredLength) && declaredLength > PLATFORM_LEAD_VOICE_NOTE_MAX_BYTES + 64 * 1024) {
      return NextResponse.json({ error: "Voice notes must be smaller than 5 MB." }, { status: 413 });
    }
    const { leadId } = await context.params;
    const formData = await request.formData();
    const audio = formData.get("audio");
    const durationValue = formData.get("durationMs");
    if (!(audio instanceof File) || typeof durationValue !== "string") {
      return NextResponse.json({ error: "Record a voice note before saving." }, { status: 400 });
    }
    if (audio.size > PLATFORM_LEAD_VOICE_NOTE_MAX_BYTES) {
      return NextResponse.json({ error: "Voice notes must be smaller than 5 MB." }, { status: 400 });
    }

    const note = await createPlatformLeadVoiceNote(leadId, {
      audioData: new Uint8Array(await audio.arrayBuffer()),
      contentType: audio.type,
      durationMs: Number(durationValue),
    });
    return NextResponse.json({ note }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to save voice note." },
      { status: 400 },
    );
  }
}