import { describe, expect, it } from "vitest";

import { createCopilotChatRequest } from "./ai-copilot-chat-state";

describe("AI Copilot chat request", () => {
  it("sends tenant and module context with only the previous chat turns", () => {
    const history = [
      { role: "user" as const, content: "Show my latest orders" },
      { role: "assistant" as const, content: "Here are your latest orders." },
    ];

    expect(createCopilotChatRequest(
      "Which one is delayed?",
      "public-org-id",
      "Order Management",
      history,
    )).toEqual({
      message: "Which one is delayed?",
      organization_id: "public-org-id",
      current_module: "Order Management",
      history,
    });
  });

  it("copies prior turns so request shaping does not mutate chat state", () => {
    const history = [{ role: "user" as const, content: "Summarize inventory" }];
    const request = createCopilotChatRequest("Any low stock?", "org-1", "Inventory", history);

    request.history[0].content = "changed";
    expect(history[0].content).toBe("Summarize inventory");
  });
});
