export type LeadAssignmentQueue = "ASSIGNED" | "UNASSIGNED";

export function filterLeadStageTabs<T extends { value: string }>(
  tabs: readonly T[],
  showAllOnly: boolean,
) {
  return showAllOnly ? tabs.filter(({ value }) => value === "ALL") : tabs;
}

type LeadAssignment = {
  assigned_sales_manager_id: string | null;
};

export function filterLeadsByAssignmentQueue<T extends LeadAssignment>(
  leads: T[],
  queue: LeadAssignmentQueue,
) {
  return leads.filter(({ assigned_sales_manager_id }) =>
    queue === "UNASSIGNED"
      ? assigned_sales_manager_id === null
      : assigned_sales_manager_id !== null,
  );
}

export function countLeadsByAssignmentQueue<T extends LeadAssignment & { stage: string }>(
  leads: T[],
  queue: LeadAssignmentQueue,
  allowedStages: readonly string[],
) {
  return filterLeadsByAssignmentQueue(leads, queue)
    .filter(({ stage }) => allowedStages.includes(stage))
    .length;
}
