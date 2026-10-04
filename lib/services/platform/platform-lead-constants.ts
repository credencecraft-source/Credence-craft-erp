export const PLATFORM_LEAD_STAGES = [
  "1-new",
  "Verification",
  "Demo Booked",
  "Demo Attended",
  "Potential Dead",
  "3-Dead",
  "Paid",
  "Interested For Demo",
  "2-Potential",
  "Testing WhatsApp msg",
  "MARK AS FROUD",
  "Froud Verfication",
  "Hello blocked",
] as const;

export type PlatformLeadStage = (typeof PLATFORM_LEAD_STAGES)[number];
