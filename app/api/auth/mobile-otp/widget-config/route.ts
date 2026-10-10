import { NextResponse } from "next/server";

import {
  DATABASE_UNAVAILABLE_MESSAGE,
  isDatabaseUnavailableError,
} from "@/lib/database/database-errors";
import { getPlatformMobileOtpWidgetClientConfiguration } from "@/lib/services/platform/platform-mobile-otp-configuration-service";

export async function GET() {
  try {
    const configuration =
      await getPlatformMobileOtpWidgetClientConfiguration();
    if (!configuration) {
      return NextResponse.json(
        { error: "Mobile OTP is not configured. Contact your platform administrator." },
        { status: 503 },
      );
    }

    return NextResponse.json(configuration, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    if (isDatabaseUnavailableError(error)) {
      return NextResponse.json(
        { error: DATABASE_UNAVAILABLE_MESSAGE },
        { status: 503 },
      );
    }

    return NextResponse.json(
      { error: "Unable to load mobile OTP configuration." },
      { status: 500 },
    );
  }
}
