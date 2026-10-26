export const PLATFORM_LEAD_STAGES = [
  "1-new",
  "Verification",
  "Need To Call",
  "Not Picked",
  "Call Back Later",
  "Interested For Demo",
  "Demo Booked",
  "Demo Attended",
  "2-Potential",
  "3-Dead",
  "Paid",
  "Old",
  "MARK AS FROUD",
] as const;

export const PLATFORM_LEAD_DEAD_STAGES = ["MARK AS FROUD"] as const;

export const PLATFORM_LEAD_PAID_STAGES = ["Paid"] as const;

export const PLATFORM_LEAD_OLD_STAGES = ["Old"] as const;

export const PLATFORM_LEAD_NOT_INTERESTED_STAGES = ["3-Dead"] as const;

export const PLATFORM_LEAD_CLAIM_BLOCKED_STAGES = [
  ...PLATFORM_LEAD_DEAD_STAGES,
  ...PLATFORM_LEAD_PAID_STAGES,
  ...PLATFORM_LEAD_OLD_STAGES,
  ...PLATFORM_LEAD_NOT_INTERESTED_STAGES,
] as const;

export function canAcceptPlatformLead(stage: string) {
  return !PLATFORM_LEAD_CLAIM_BLOCKED_STAGES.includes(
    stage as (typeof PLATFORM_LEAD_CLAIM_BLOCKED_STAGES)[number],
  );
}

export const PLATFORM_LEAD_VERIFIED_NEED_TO_CALL_STAGES = [
  "Need To Call",
  "Not Picked",
  "Call Back Later",
] as const;

export const PLATFORM_LEAD_VERIFIED_INTERESTED_STAGES = [
  "Interested For Demo",
  "Demo Booked",
  "Demo Attended",
  "2-Potential",
] as const;

export const PLATFORM_LEAD_VERIFIED_STAGES = [
  "Verification",
  ...PLATFORM_LEAD_VERIFIED_NEED_TO_CALL_STAGES,
  ...PLATFORM_LEAD_VERIFIED_INTERESTED_STAGES,
] as const;

export const PLATFORM_LEAD_THIRD_PARTY_STAGES = PLATFORM_LEAD_STAGES.filter(
  (stage) =>
    !PLATFORM_LEAD_DEAD_STAGES.includes(stage as (typeof PLATFORM_LEAD_DEAD_STAGES)[number]) &&
    !PLATFORM_LEAD_PAID_STAGES.includes(stage as (typeof PLATFORM_LEAD_PAID_STAGES)[number]) &&
    !PLATFORM_LEAD_OLD_STAGES.includes(stage as (typeof PLATFORM_LEAD_OLD_STAGES)[number]) &&
    !PLATFORM_LEAD_NOT_INTERESTED_STAGES.includes(stage as (typeof PLATFORM_LEAD_NOT_INTERESTED_STAGES)[number]),
);

export type PlatformLeadStage = (typeof PLATFORM_LEAD_STAGES)[number];
