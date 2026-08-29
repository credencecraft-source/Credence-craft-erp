import { NextResponse } from "next/server";
import { getCurrentUser } from "../../../lib/auth";

export async function GET() {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ user: null }, { status: 200 });
  }

  const profileName = user.profileName || user.name || "workspace";

  return NextResponse.json({
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      profileName,
    },
  });
}
