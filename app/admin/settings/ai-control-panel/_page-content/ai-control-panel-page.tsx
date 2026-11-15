"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import {
  Activity,
  Bot,
  Boxes,
  ChevronRight,
  CircleDollarSign,
  Database,
  Folder,
  FolderOpen,
  Gauge,
  Layers3,
  Server,
  ShoppingBag,
  Sparkles,
  Workflow,
} from "lucide-react";

import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Page from "@/components/ui/Page";
import Section from "@/components/ui/Section";
import Select from "@/components/ui/Select";
import Switch from "@/components/ui/Switch";
import Tabs from "@/components/ui/Tabs";
import Textarea from "@/components/ui/Textarea";
import {
  AI_CONTROL_TREE,
  AI_MODELS,
  AI_SETTINGS_STORAGE_KEY,
  areAiNodeParentsEnabled,
  createDefaultAiControlState,
  getAiControlNode,
  isAiNodeEffectivelyEnabled,
  parseAiControlState,
  serializeAiControlState,
  setAiNodeEnabled,
  type AiBotConfiguration,
  type AiControlNode,
  type AiControlState,
} from "./ai-control-panel-state";

const NODE_ICONS = {
  folder: Folder,
  "service-side-engine": Server,
  "client-side-engine": Workflow,
  "organization-context-hub": Layers3,
  "database-optimization": Database,
  "api-server-monitor": Activity,
  "log-diagnostics": Gauge,
  "order-management": ShoppingBag,
  "inventory-management": Boxes,
  finance: CircleDollarSign,
} as const;

type InspectorTab = "overview" | "model" | "tools";

const STORAGE_LOADING = "__AI_SETTINGS_LOADING__";
const STORAGE_EMPTY = "__AI_SETTINGS_EMPTY__";
const STORAGE_UNAVAILABLE = "__AI_SETTINGS_UNAVAILABLE__";
const STORAGE_UPDATED_EVENT = "ai-control-panel-storage-updated";

function readAiSettingsSnapshot(): string {
  try {
    return window.localStorage.getItem(AI_SETTINGS_STORAGE_KEY) ?? STORAGE_EMPTY;
  } catch {
    return STORAGE_UNAVAILABLE;
  }
}

function subscribeToAiSettings(listener: () => void) {
  window.addEventListener("storage", listener);
  window.addEventListener(STORAGE_UPDATED_EVENT, listener);
  return () => {
    window.removeEventListener("storage", listener);
    window.removeEventListener(STORAGE_UPDATED_EVENT, listener);
  };
}

function getServerAiSettingsSnapshot() {
  return STORAGE_LOADING;
}

function NodeIcon({ node, className = "h-5 w-5" }: { node: AiControlNode; className?: string }) {
  const Icon = node.id in NODE_ICONS
    ? NODE_ICONS[node.id as keyof typeof NODE_ICONS]
    : node.kind === "bot"
      ? Bot
      : Folder;
  return <Icon className={className} aria-hidden="true" />;
}

function StatusBadge({ active }: { active: boolean }) {
  return (
    <Badge
      className={
        active
          ? "border-[var(--erp-brand-soft)] bg-[var(--erp-brand-soft)] text-[var(--erp-brand)]"
          : "border-slate-200 bg-slate-100 text-slate-500"
      }
    >
      <span className={`mr-1.5 inline-block h-1.5 w-1.5 rounded-full ${active ? "bg-[var(--erp-brand)]" : "bg-slate-400"}`} />
      {active ? "Active" : "Inactive"}
    </Badge>
  );
}

function FolderBreadcrumbs({
  path,
  onNavigate,
}: {
  path: string[];
  onNavigate: (nextPath: string[]) => void;
}) {
  return (
    <nav aria-label="AI settings breadcrumb" className="flex min-w-0 items-center gap-1 overflow-x-auto text-sm">
      <Button
        variant="ghost"
        type="button"
        onClick={() => onNavigate([])}
        className={`h-auto min-h-0 shrink-0 rounded-md px-2 py-1 font-medium transition hover:bg-[var(--erp-brand-soft)] hover:text-[var(--erp-brand)] ${
          path.length === 0 ? "text-[var(--erp-text)]" : "text-slate-500"
        }`}
        aria-current={path.length === 0 ? "page" : undefined}
      >
        Root
      </Button>
      {path.map((id, index) => {
        const node = getAiControlNode(id);
        if (!node) return null;
        const isCurrent = index === path.length - 1;
        return (
          <span key={id} className="flex shrink-0 items-center gap-1">
            <ChevronRight className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
            <Button
              variant="ghost"
              type="button"
              onClick={() => onNavigate(path.slice(0, index + 1))}
              className={`h-auto min-h-0 max-w-48 truncate rounded-md px-2 py-1 font-medium transition hover:bg-[var(--erp-brand-soft)] hover:text-[var(--erp-brand)] ${
                isCurrent ? "text-[var(--erp-text)]" : "text-slate-500"
              }`}
              aria-current={isCurrent ? "page" : undefined}
              title={node.name}
            >
              {node.name}
            </Button>
          </span>
        );
      })}
    </nav>
  );
}

function DirectoryCard({
  node,
  state,
  isReady,
  onOpen,
  onToggle,
}: {
  node: AiControlNode;
  state: AiControlState;
  isReady: boolean;
  onOpen: (node: AiControlNode) => void;
  onToggle: (nodeId: string, enabled: boolean) => void;
}) {
  const active = isAiNodeEffectivelyEnabled(state, node.id);
  const canToggle = areAiNodeParentsEnabled(state, node.id);
  const isFolder = node.kind === "folder";

  return (
    <Card className={`flex min-h-48 flex-col justify-between p-5 transition-colors ${active ? "" : "bg-slate-50 opacity-75"}`}>
      <div>
        <div className="flex items-start justify-between gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--erp-brand-soft)] text-[var(--erp-brand)]">
            <NodeIcon node={node} />
          </span>
          <StatusBadge active={active} />
        </div>
        <Button
          type="button"
          variant="ghost"
          onClick={() => onOpen(node)}
          className="mt-4 h-auto max-w-full justify-start whitespace-normal px-0 py-0 text-left text-sm font-bold text-slate-900 hover:bg-transparent hover:text-[var(--erp-brand)]"
        >
          <span className="flex min-w-0 items-center gap-2">
            {isFolder ? <FolderOpen className="h-4 w-4 shrink-0" aria-hidden="true" /> : <Bot className="h-4 w-4 shrink-0" aria-hidden="true" />}
            <span>{node.name}</span>
          </span>
        </Button>
        <p className="mt-2 min-h-10 text-xs leading-5 text-slate-500">{node.description}</p>
      </div>
      <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3">
        <span className="text-xs font-medium text-slate-500">{isFolder ? "Open folder" : "Open configuration"}</span>
        <Switch
          label={`Enable ${node.name}`}
          checked={state.enabled[node.id] === true}
          disabled={!isReady || !canToggle}
          onCheckedChange={(enabled) => onToggle(node.id, enabled)}
        />
      </div>
    </Card>
  );
}

function BotInspector({
  bot,
  state,
  isReady,
  onConfigurationChange,
}: {
  bot: AiControlNode;
  state: AiControlState;
  isReady: boolean;
  onConfigurationChange: (botId: string, update: (current: AiBotConfiguration) => AiBotConfiguration) => void;
}) {
  const [tab, setTab] = useState<InspectorTab>("overview");
  const configuration = state.botConfigurations[bot.id];
  const active = isAiNodeEffectivelyEnabled(state, bot.id);
  const tabs = [
    { value: "overview" as const, label: "Overview" },
    { value: "model" as const, label: "Model & Prompts" },
    { value: "tools" as const, label: "Tool Permissions" },
  ];

  if (!configuration) return null;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[var(--erp-brand-soft)] text-[var(--erp-brand)]">
            <Bot className="h-5 w-5" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="erp-eyebrow">Bot configuration</p>
            <h2 className="text-lg font-bold text-slate-900">{bot.name}</h2>
            <p className="mt-1 text-sm text-slate-500">{bot.description}</p>
          </div>
        </div>
        <StatusBadge active={active} />
      </div>

      <Tabs
        tabs={tabs}
        value={tab}
        onChange={setTab}
        ariaLabel={`${bot.name} configuration`}
      />

      {tab === "overview" && (
        <div className="space-y-4" role="tabpanel">
          <div className="grid gap-4 sm:grid-cols-3">
            {[
              { label: "Query count", value: "—" },
              { label: "Response latency", value: "—" },
              { label: "Runtime", value: "Not connected" },
            ].map((metric) => (
              <Card key={metric.label} className="p-5">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{metric.label}</p>
                <p className="mt-2 text-lg font-bold text-slate-900">{metric.value}</p>
              </Card>
            ))}
          </div>
          <Card className="flex items-start gap-3 bg-slate-50 p-5">
            <Activity className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" aria-hidden="true" />
            <p className="text-sm leading-6 text-slate-600">
              Live usage telemetry will appear here after this control panel is connected to an AI runtime.
            </p>
          </Card>
        </div>
      )}

      {tab === "model" && (
        <Card className="space-y-5 p-5" role="tabpanel">
          <Select
            label="Model"
            value={configuration.model}
            disabled={!isReady}
            onChange={(event) =>
              onConfigurationChange(bot.id, (current) => ({ ...current, model: event.target.value }))
            }
            options={AI_MODELS.map((model) => ({ label: model, value: model }))}
          />
          <Textarea
            label="System prompt"
            textCase="preserve"
            rows={12}
            maxLength={8000}
            value={configuration.systemPrompt}
            disabled={!isReady}
            hint={`${configuration.systemPrompt.length}/8000 characters · saved automatically in this browser`}
            onChange={(event) =>
              onConfigurationChange(bot.id, (current) => ({ ...current, systemPrompt: event.target.value }))
            }
          />
          <p className="text-xs leading-5 text-slate-500">
            Model selection and prompts are saved as configuration only; model execution is not connected.
          </p>
        </Card>
      )}

      {tab === "tools" && (
        <Card className="space-y-1 p-5" role="tabpanel">
          <div className="mb-4">
            <h3 className="text-sm font-bold text-slate-900">Available functions</h3>
            <p className="mt-1 text-xs text-slate-500">
              Choose which tools this bot may request. Enabling a tool here does not grant user or organization permissions.
            </p>
          </div>
          {(bot.tools ?? []).map((tool) => {
            const checked = configuration.enabledTools.includes(tool.id);
            return (
              <div key={tool.id} className="flex items-center justify-between gap-4 border-t border-slate-100 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-800">{tool.name}</p>
                  <p className="mt-1 text-xs text-slate-500">{tool.description}</p>
                </div>
                <Switch
                  label={`Allow ${tool.name}`}
                  checked={checked}
                  disabled={!isReady}
                  onCheckedChange={(enabled) =>
                    onConfigurationChange(bot.id, (current) => ({
                      ...current,
                      enabledTools: enabled
                        ? [...current.enabledTools, tool.id]
                        : current.enabledTools.filter((toolId) => toolId !== tool.id),
                    }))
                  }
                />
              </div>
            );
          })}
        </Card>
      )}
    </div>
  );
}

export default function AiControlPanelPage() {
  const savedSnapshot = useSyncExternalStore(
    subscribeToAiSettings,
    readAiSettingsSnapshot,
    getServerAiSettingsSnapshot,
  );
  const [volatileState, setVolatileState] = useState<AiControlState | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [path, setPath] = useState<string[]>([]);

  const defaultState = useMemo(() => createDefaultAiControlState(), []);
  const parsedSettings = useMemo(() => {
    if (savedSnapshot === STORAGE_LOADING || savedSnapshot === STORAGE_EMPTY || savedSnapshot === STORAGE_UNAVAILABLE) {
      return { state: null, error: undefined };
    }
    return parseAiControlState(savedSnapshot);
  }, [savedSnapshot]);
  const state = volatileState ?? parsedSettings.state ?? defaultState;
  const isReady = savedSnapshot !== STORAGE_LOADING;
  const saveStatus = isReady
    ? saveError
      ? saveError
      : parsedSettings.error
        ? `${parsedSettings.error} Defaults are active until you save a change.`
        : savedSnapshot === STORAGE_EMPTY
          ? "No saved settings · changes save automatically in this browser"
          : savedSnapshot === STORAGE_UNAVAILABLE
            ? "Browser storage is unavailable · changes are temporary"
            : "Saved in this browser · changes save automatically"
    : "Loading saved preferences…";
  const currentNode = path.length > 0 ? getAiControlNode(path[path.length - 1]) : undefined;
  const isBotView = currentNode?.kind === "bot";
  const entries = useMemo(() => {
    if (isBotView) return [];
    return (currentNode ?? AI_CONTROL_TREE).children ?? [];
  }, [currentNode, isBotView]);

  const saveState = (nextState: AiControlState) => {
    try {
      window.localStorage.setItem(AI_SETTINGS_STORAGE_KEY, serializeAiControlState(nextState));
      setVolatileState(null);
      setSaveError(null);
      window.dispatchEvent(new Event(STORAGE_UPDATED_EVENT));
    } catch {
      setVolatileState(nextState);
      setSaveError("Could not save to browser storage · changes are temporary");
    }
  };

  const toggleNode = (nodeId: string, enabled: boolean) => {
    saveState(setAiNodeEnabled(state, nodeId, enabled));
  };

  const updateBotConfiguration = (
    botId: string,
    update: (current: AiBotConfiguration) => AiBotConfiguration,
  ) => {
    const current = state.botConfigurations[botId];
    if (!current) return;
    saveState({
      ...state,
      botConfigurations: {
        ...state.botConfigurations,
        [botId]: update(current),
      },
    });
  };

  const openNode = (node: AiControlNode) => setPath((currentPath) => [...currentPath, node.id]);

  return (
    <Page className="max-w-7xl">
      <Section className="space-y-6">
        <Card className="flex flex-wrap items-center justify-between gap-4 p-4 sm:p-5">
          <div className="min-w-0 flex-1">
            <FolderBreadcrumbs path={path} onNavigate={setPath} />
            <p className="mt-2 truncate text-xs text-slate-500" aria-live="polite">{saveStatus}</p>
          </div>
          <div className="flex items-center gap-3 rounded-xl border border-[var(--erp-border)] bg-[var(--erp-surface-soft)] px-3 py-2">
            <div className="min-w-0">
              <p className="text-xs font-semibold text-slate-800">Master toggle</p>
              <p className="text-[10px] text-slate-500">AI Bot Platform Controller</p>
            </div>
            <Switch
              label="Enable AI Bot Platform Controller"
              checked={state.enabled[AI_CONTROL_TREE.id] === true}
              disabled={!isReady}
              onCheckedChange={(enabled) => toggleNode(AI_CONTROL_TREE.id, enabled)}
            />
          </div>
        </Card>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-[var(--erp-brand)]" aria-hidden="true" />
            <h1 className="text-xl font-bold text-slate-900">AI Control Panel</h1>
            <StatusBadge active={isAiNodeEffectivelyEnabled(state, AI_CONTROL_TREE.id)} />
          </div>
          <p className="text-xs text-slate-500">Configuration is browser-local and does not control a connected AI runtime.</p>
        </div>

        {isBotView && currentNode ? (
          <BotInspector
            key={currentNode.id}
            bot={currentNode}
            state={state}
            isReady={isReady}
            onConfigurationChange={updateBotConfiguration}
          />
        ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <FolderOpen className="h-4 w-4 text-[var(--erp-brand)]" aria-hidden="true" />
              <h2 className="text-sm font-bold text-slate-800">
                {currentNode?.name ?? AI_CONTROL_TREE.name}
              </h2>
              <span className="text-xs text-slate-500">{entries.length} {entries.length === 1 ? "item" : "items"}</span>
            </div>
            <div className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {entries.map((node) => (
                <DirectoryCard
                  key={node.id}
                  node={node}
                  state={state}
                  isReady={isReady}
                  onOpen={openNode}
                  onToggle={toggleNode}
                />
              ))}
            </div>
          </div>
        )}
      </Section>
    </Page>
  );
}
