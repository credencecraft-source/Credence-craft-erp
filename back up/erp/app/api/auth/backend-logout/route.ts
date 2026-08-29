import { NextResponse } from "next/server";

export async function POST() {
  const response = NextResponse.json({ message: "Logged out from backend." });
  response.cookies.set({
    name: "erp_backend_session",
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });

  return response;
}
