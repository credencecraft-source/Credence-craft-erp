export const PLATFORM_LEAD_STAGES = [
  "1-new",
  "Verification",
  "Interested For Demo",
  "Demo Booked",
  "Demo Attended",
  "2-Potential",
  "Potential Dead",
  "3-Dead",
  "Paid",
  "Testing WhatsApp msg",
  "MARK AS FROUD",
  "Froud Verfication",
  "Hello blocked",
] as const;

export const PLATFORM_LEAD_DEAD_STAGES = [
  "MARK AS FROUD",
  "Froud Verfication",
  "Hello blocked",
] as const;

export const PLATFORM_LEAD_PAID_STAGES = ["Paid"] as const;

export const PLATFORM_LEAD_VERIFIED_INTERESTED_STAGES = [
  "Interested For Demo",
  "Demo Booked",
  "Demo Attended",
  "2-Potential",
] as const;

export const PLATFORM_LEAD_VERIFIED_NOT_INTERESTED_STAGES = [
  "Potential Dead",
  "3-Dead",
  "Testing WhatsApp msg",
] as const;

export const PLATFORM_LEAD_VERIFIED_STAGES = [
  "Verification",
  ...PLATFORM_LEAD_VERIFIED_INTERESTED_STAGES,
  ...PLATFORM_LEAD_VERIFIED_NOT_INTERESTED_STAGES,
] as const;

export const PLATFORM_LEAD_THIRD_PARTY_STAGES = PLATFORM_LEAD_STAGES.filter(
  (stage) =>
    !PLATFORM_LEAD_DEAD_STAGES.includes(stage as (typeof PLATFORM_LEAD_DEAD_STAGES)[number]) &&
    !PLATFORM_LEAD_PAID_STAGES.includes(stage as (typeof PLATFORM_LEAD_PAID_STAGES)[number]),
);

export type PlatformLeadStage = (typeof PLATFORM_LEAD_STAGES)[number];
