import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    { error: "Password sign-in is unavailable. Use the platform email verification code." },
    { status: 410 },
  );
}
