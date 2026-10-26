export type AiTool = {
  id: string;
  name: string;
  description: string;
};

export type AiControlNode = {
  id: string;
  name: string;
  description: string;
  kind: "folder" | "bot";
  children?: AiControlNode[];
  tools?: AiTool[];
};

export type AiBotConfiguration = {
  model: string;
  systemPrompt: string;
  enabledTools: string[];
};

export type AiControlState = {
  enabled: Record<string, boolean>;
  botConfigurations: Record<string, AiBotConfiguration>;
};

export const AI_SETTINGS_STORAGE_KEY = "credencecraft.ai-control-panel.v1";
export const AI_MODELS = ["GPT-4.1", "GPT-4.1 mini", "Claude Sonnet 4", "Gemini 2.5 Pro"] as const;

export const AI_CONTROL_TREE: AiControlNode = {
  id: "ai-bot-platform-controller",
  name: "AI Bot Platform Controller",
  description: "Top-level control for all AI engines and organization copilots.",
  kind: "folder",
  children: [
    {
      id: "service-side-engine",
      name: "Service-Side Engine",
      description: "Backend diagnostics and performance services.",
      kind: "folder",
      children: [
        {
          id: "database-optimization",
          name: "Database Optimization Bot",
          description: "Reviews query plans and suggests safe database optimizations.",
          kind: "bot",
          tools: [
            { id: "inspect-query-plans", name: "Inspect query plans", description: "Read query plan summaries." },
            { id: "analyze-indexes", name: "Analyze indexes", description: "Review index usage and recommendations." },
            { id: "suggest-optimizations", name: "Suggest optimizations", description: "Prepare recommendations without applying changes." },
          ],
        },
        {
          id: "api-server-monitor",
          name: "API & Server Monitor Bot",
          description: "Summarizes service health and request performance.",
          kind: "bot",
          tools: [
            { id: "read-health-checks", name: "Read health checks", description: "Read configured endpoint health." },
            { id: "read-request-metrics", name: "Read request metrics", description: "Summarize request volume and latency." },
            { id: "summarize-error-rates", name: "Summarize error rates", description: "Group service errors for review." },
          ],
        },
        {
          id: "log-diagnostics",
          name: "Log Diagnostics Bot",
          description: "Helps find patterns in sanitized application logs.",
          kind: "bot",
          tools: [
            { id: "search-redacted-logs", name: "Search redacted logs", description: "Search logs with sensitive values removed." },
            { id: "group-error-events", name: "Group error events", description: "Cluster related error messages." },
            { id: "trace-request-ids", name: "Trace request IDs", description: "Follow a request across service events." },
          ],
        },
      ],
    },
    {
      id: "client-side-engine",
      name: "Client-Side Engine",
      description: "Organization-facing user copilots and contextual tools.",
      kind: "folder",
      children: [
        {
          id: "organization-context-hub",
          name: "Organization Context Hub",
          description: "Organization-scoped copilots for day-to-day ERP work.",
          kind: "folder",
          children: [
            {
              id: "order-management",
              name: "Order Management Sub-Bot",
              description: "Assists with order review and fulfillment questions.",
              kind: "bot",
              tools: [
                { id: "read-orders", name: "Read orders", description: "Read authorized order summaries." },
                { id: "prepare-order-drafts", name: "Prepare order drafts", description: "Prepare drafts for a user to review." },
                { id: "read-fulfillment-status", name: "Read fulfillment status", description: "Read order fulfillment progress." },
              ],
            },
            {
              id: "inventory-management",
              name: "Inventory Management Sub-Bot",
              description: "Assists with stock visibility and inventory workflows.",
              kind: "bot",
              tools: [
                { id: "read-stock-availability", name: "Read stock availability", description: "Read authorized stock balances." },
                { id: "read-stock-movements", name: "Read stock movements", description: "Review inventory movement history." },
                { id: "prepare-transfer-drafts", name: "Prepare transfer drafts", description: "Prepare transfer drafts for review." },
              ],
            },
            {
              id: "finance",
              name: "Finance Sub-Bot",
              description: "Assists with finance summaries and receivables.",
              kind: "bot",
              tools: [
                { id: "read-ledger-summaries", name: "Read ledger summaries", description: "Read authorized ledger summaries." },
                { id: "prepare-invoice-drafts", name: "Prepare invoice drafts", description: "Prepare invoice drafts for review." },
                { id: "review-receivable-aging", name: "Review receivable aging", description: "Summarize receivable aging." },
              ],
            },
          ],
        },
      ],
    },
  ],
};

const getAllNodes = (node: AiControlNode): AiControlNode[] => [
  node,
  ...(node.children?.flatMap(getAllNodes) ?? []),
];

const allNodes = getAllNodes(AI_CONTROL_TREE);
const nodesById = new Map(allNodes.map((node) => [node.id, node]));

export function getAiControlNode(id: string): AiControlNode | undefined {
  return nodesById.get(id);
}

export function getAiControlPath(id: string): AiControlNode[] {
  const findPath = (node: AiControlNode, path: AiControlNode[]): AiControlNode[] | undefined => {
    const nextPath = [...path, node];
    if (node.id === id) return nextPath;
    for (const child of node.children ?? []) {
      const found = findPath(child, nextPath);
      if (found) return found;
    }
    return undefined;
  };
  return findPath(AI_CONTROL_TREE, []) ?? [];
}

export function createDefaultAiControlState(): AiControlState {
  const enabled = Object.fromEntries(allNodes.map((node) => [node.id, true]));
  const botConfigurations = Object.fromEntries(
    allNodes
      .filter((node) => node.kind === "bot")
      .map((node) => [
        node.id,
        {
          model: "GPT-4.1 mini",
          systemPrompt: `You are the ${node.name}. Follow organization permissions, use only approved tools, and ask for confirmation before preparing consequential changes.`,
          enabledTools: [],
        },
      ]),
  );
  return { enabled, botConfigurations };
}

export function setAiNodeEnabled(
  state: AiControlState,
  nodeId: string,
  enabled: boolean,
): AiControlState {
  if (!nodesById.has(nodeId)) return state;

  const nextEnabled = { ...state.enabled, [nodeId]: enabled };
  if (!enabled) {
    const disableDescendants = (node: AiControlNode) => {
      for (const child of node.children ?? []) {
        nextEnabled[child.id] = false;
        disableDescendants(child);
      }
    };
    disableDescendants(nodesById.get(nodeId)!);
  }
  return { ...state, enabled: nextEnabled };
}

export function isAiNodeEffectivelyEnabled(state: AiControlState, nodeId: string): boolean {
  const path = getAiControlPath(nodeId);
  return path.length > 0 && path.every((node) => state.enabled[node.id] === true);
}

export function areAiNodeParentsEnabled(state: AiControlState, nodeId: string): boolean {
  const path = getAiControlPath(nodeId);
  return path.length > 1 && path.slice(0, -1).every((node) => state.enabled[node.id] === true);
}

export function parseAiControlState(raw: string): { state: AiControlState | null; error?: string } {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || !("version" in parsed) || parsed.version !== 1) {
      return { state: null, error: "Saved AI settings have an unsupported format." };
    }
    if (!("settings" in parsed) || !parsed.settings || typeof parsed.settings !== "object") {
      return { state: null, error: "Saved AI settings could not be read." };
    }
    const settings = parsed.settings as Partial<AiControlState>;
    if (!settings.enabled || typeof settings.enabled !== "object" || !settings.botConfigurations || typeof settings.botConfigurations !== "object") {
      return { state: null, error: "Saved AI settings are incomplete." };
    }

    let state = createDefaultAiControlState();
    for (const node of allNodes) {
      const value = settings.enabled[node.id];
      if (typeof value === "boolean") state.enabled[node.id] = value;
    }

    for (const node of allNodes.filter((item) => item.kind === "bot")) {
      const configuration = settings.botConfigurations[node.id];
      if (!configuration || typeof configuration !== "object") {
        return { state: null, error: `Saved configuration for ${node.name} is missing.` };
      }
      if (
        typeof configuration.model !== "string" ||
        !AI_MODELS.includes(configuration.model as (typeof AI_MODELS)[number]) ||
        typeof configuration.systemPrompt !== "string" ||
        configuration.systemPrompt.length > 8000 ||
        !Array.isArray(configuration.enabledTools)
      ) {
        return { state: null, error: `Saved configuration for ${node.name} is invalid.` };
      }
      const allowedTools = new Set((node.tools ?? []).map((tool) => tool.id));
      if (configuration.enabledTools.some((toolId) => typeof toolId !== "string")) {
        return { state: null, error: `Saved tool permissions for ${node.name} are invalid.` };
      }
      state.botConfigurations[node.id] = {
        model: configuration.model,
        systemPrompt: configuration.systemPrompt,
        enabledTools: configuration.enabledTools.filter((toolId) => allowedTools.has(toolId)),
      };
    }
    for (const node of allNodes) {
      if (!state.enabled[node.id]) state = setAiNodeEnabled(state, node.id, false);
    }
    return { state };
  } catch {
    return { state: null, error: "Saved AI settings are not valid JSON." };
  }
}

export function serializeAiControlState(state: AiControlState): string {
  return JSON.stringify({ version: 1, settings: state });
}
