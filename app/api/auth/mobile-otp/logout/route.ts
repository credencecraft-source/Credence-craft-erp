import { NextResponse } from "next/server";

import { logoutSession } from "@/lib/auth/session-manager";

export async function POST() {
  await logoutSession();
  return NextResponse.json({ ok: true });
}
