import { NextResponse } from "next/server";

import {
  receiveEsslPush,
  validateEsslPushPayload,
} from "@/lib/services/organizations/essl-biometric-integration-service";

const MAX_BODY_BYTES = 64 * 1024;

async function readLimitedBody(request: Request) {
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > MAX_BODY_BYTES) {
    throw new Error("ESSL attendance push exceeds the 64 KB limit.");
  }
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BODY_BYTES) {
      await reader.cancel();
      throw new Error("ESSL attendance push exceeds the 64 KB limit.");
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}

export async function POST(request: Request) {
  const authorization = request.headers.get("authorization") ?? "";
  const match = /^Bearer ([A-Za-z0-9_-]{32,128})$/.exec(authorization);
  if (!match) {
    return new Response("Unauthorized", { status: 401 });
  }

  let payload: string;
  try {
    payload = await readLimitedBody(request);
    validateEsslPushPayload(payload);
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Invalid ESSL attendance payload.",
      },
      { status: 413 },
    );
  }

  try {
    await receiveEsslPush(match[1], payload);
    return new Response("OK", {
      status: 200,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized ESSL attendance receiver.") {
      return new Response("Unauthorized", { status: 401 });
    }
    return NextResponse.json(
      { error: "Unable to store ESSL attendance push." },
      { status: 503 },
    );
  }
}
