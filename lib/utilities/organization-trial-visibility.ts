export function isOrganizationTrialInactive(
  trialEnabled: boolean,
  trialStartedAt: string | null,
  trialEndsAt: string | null,
  now = Date.now(),
) {
  if (!trialEnabled || !trialStartedAt || !trialEndsAt) return true;

  const startedAt = Date.parse(trialStartedAt);
  const endsAt = Date.parse(trialEndsAt);
  return !Number.isFinite(startedAt) || !Number.isFinite(endsAt) || endsAt <= now;
}

export function shouldBlockOrganizationForUserPricing(
  pricingMode: string,
  hasConfiguredPricingType: boolean,
  hasTrialOrSubscriptionAccess: boolean,
) {
  return pricingMode === "USER_BASED"
    && hasConfiguredPricingType
    && !hasTrialOrSubscriptionAccess;
}
