import { describe, expect, it } from "vitest";

import {
  AI_CONTROL_TREE,
  createDefaultAiControlState,
  isAiNodeEffectivelyEnabled,
  parseAiControlState,
  serializeAiControlState,
  setAiNodeEnabled,
} from "./ai-control-panel-state";

describe("AI control panel state", () => {
  it("turning off a folder disables all descendants without changing sibling branches", () => {
    const initial = createDefaultAiControlState();
    const next = setAiNodeEnabled(initial, "service-side-engine", false);

    expect(next.enabled["service-side-engine"]).toBe(false);
    expect(next.enabled["database-optimization"]).toBe(false);
    expect(next.enabled["api-server-monitor"]).toBe(false);
    expect(next.enabled["log-diagnostics"]).toBe(false);
    expect(next.enabled["client-side-engine"]).toBe(true);
    expect(isAiNodeEffectivelyEnabled(next, "client-side-engine")).toBe(true);
  });

  it("turning off one bot does not change its siblings", () => {
    const next = setAiNodeEnabled(createDefaultAiControlState(), "database-optimization", false);

    expect(next.enabled["database-optimization"]).toBe(false);
    expect(next.enabled["api-server-monitor"]).toBe(true);
    expect(next.enabled["log-diagnostics"]).toBe(true);
  });

  it("round-trips saved settings and rejects malformed data", () => {
    const state = createDefaultAiControlState();
    const roundTrip = parseAiControlState(serializeAiControlState(state));

    expect(roundTrip.state).toEqual(state);
    expect(parseAiControlState("{").error).toBe("Saved AI settings are not valid JSON.");
    expect(AI_CONTROL_TREE.children).toHaveLength(2);
  });

  it("normalizes persisted descendants when an ancestor is disabled", () => {
    const state = createDefaultAiControlState();
    state.enabled["service-side-engine"] = false;
    const restored = parseAiControlState(serializeAiControlState(state)).state;

    expect(restored?.enabled["service-side-engine"]).toBe(false);
    expect(restored?.enabled["database-optimization"]).toBe(false);
    expect(restored?.enabled["api-server-monitor"]).toBe(false);
  });
});
