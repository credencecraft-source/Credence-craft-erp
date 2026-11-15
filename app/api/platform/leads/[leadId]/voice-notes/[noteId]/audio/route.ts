import { NextResponse } from "next/server";

import { getPlatformLeadVoiceNoteAudio } from "@/lib/services/platform/platform-lead-voice-note-service";

export async function GET(
  _request: Request,
  context: { params: Promise<{ leadId: string; noteId: string }> },
) {
  try {
    const { leadId, noteId } = await context.params;
    const note = await getPlatformLeadVoiceNoteAudio(leadId, noteId);
    return new NextResponse(note.audio_data, {
      headers: {
        "Content-Type": note.content_type,
        "Content-Length": String(note.byte_size),
        "Content-Disposition": "inline",
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to play voice note." },
      { status: 404 },
    );
  }
}