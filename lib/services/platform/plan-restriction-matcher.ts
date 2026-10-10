import { ERP_MODULES } from "@/components/erp/erp-config-registry";

export type PlanRestrictionRule = {
  master_module: string | null;
  main_module: string | null;
  sub_module: string | null;
  restriction_type: string;
};

export type FeaturePath = {
  key?: string;
  label?: string;
  master: string;
  main: string;
  sub: string[];
  route: string[];
};

export function normalizeRestrictionPart(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9*]+/g, "-").replace(/^-|-$/g, "");
}

function matchesPart(rulePart: string, candidates: string[]) {
  const normalizedRule = normalizeRestrictionPart(rulePart || "*");
  return normalizedRule === "*" || candidates
    .flatMap((candidate) => [candidate, ...candidate.split("/")])
    .some((candidate) => normalizeRestrictionPart(candidate) === normalizedRule);
}

function isSubmoduleRule(rule: PlanRestrictionRule) {
  return rule.restriction_type.trim().toLowerCase() === "block"
    && Boolean(rule.sub_module)
    && normalizeRestrictionPart(rule.sub_module || "") !== "*";
}

function hasSubmoduleTarget(rule: PlanRestrictionRule) {
  return Boolean(rule.sub_module)
    && normalizeRestrictionPart(rule.sub_module || "") !== "*";
}

function matchesRouteTarget(rule: PlanRestrictionRule, master: string, main: string, descendants: string[]) {
  return matchesPart(rule.master_module || "*", [master])
    && matchesPart(rule.main_module || "*", [main])
    && matchesPart(rule.sub_module || "*", descendants);
}

export function restrictionMatchesFeature(rule: PlanRestrictionRule, feature: FeaturePath) {
  const restrictionType = rule.restriction_type.trim().toLowerCase();
  const isFeatureRestriction = restrictionType === "block" || restrictionType === "hide";
  if (!isFeatureRestriction || !hasSubmoduleTarget(rule) || feature.sub.length === 0) return false;
  return matchesPart(rule.master_module || "*", [feature.master])
    && matchesPart(rule.main_module || "*", [feature.main, feature.route[1] || "", feature.key || ""])
    && matchesPart(rule.sub_module || "", [...feature.sub, ...feature.route.slice(2), feature.key || "", feature.label || ""]);
}

export function restrictionMatchesRoute(rule: PlanRestrictionRule, routeSegments: string[], featureKeys: string[] = []) {
  if (!isSubmoduleRule(rule) || !hasSubmoduleTarget(rule)) return false;
  return matchesRouteTarget(rule, routeSegments[0] || "", routeSegments[1] || "", [...featureKeys, ...routeSegments.slice(2)]);
}

export function restrictionMatchesHiddenRoute(rule: PlanRestrictionRule, routeSegments: string[], featureKeys: string[] = []) {
  if (rule.restriction_type.trim().toLowerCase() !== "hide" || !hasSubmoduleTarget(rule)) return false;
  return matchesRouteTarget(rule, routeSegments[0] || "", routeSegments[1] || "", [...featureKeys, ...routeSegments.slice(2)]);
}

export function getSidebarFeatureKeysForRoute(routeSegments: string[]) {
  const keys: string[] = [];
  const startsWith = (route: string[], prefix: string[]) => prefix.every((part, index) => normalizeRestrictionPart(route[index] || "") === normalizeRestrictionPart(part));

  const visit = (items: typeof ERP_MODULES[number]["children"], keyPath: string[], routePath: string[]) => {
    for (const item of items) {
      const nextKeyPath = [...keyPath, item.key];
      const nextRoutePath = [...routePath, ...(item.pathSegment || item.key).split("/").filter(Boolean)];
      if (startsWith(routeSegments, nextRoutePath)) {
        keys.push(...nextKeyPath);
        if (item.children?.length) visit(item.children, nextKeyPath, nextRoutePath);
      }
    }
  };

  for (const moduleEntry of ERP_MODULES) {
    if (startsWith(routeSegments, [moduleEntry.pathSegment])) {
      keys.push(moduleEntry.key);
      visit(moduleEntry.children, [moduleEntry.key], [moduleEntry.pathSegment]);
    }
  }
  return keys;
}
