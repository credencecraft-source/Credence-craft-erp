export type CopilotChatTurn = {
  role: "user" | "assistant";
  content: string;
};

export type CopilotChatRequest = {
  message: string;
  organization_id: string;
  current_module: string;
  history: CopilotChatTurn[];
};

export function createCopilotChatRequest(
  message: string,
  organizationId: string,
  currentModule: string,
  history: readonly CopilotChatTurn[],
): CopilotChatRequest {
  return {
    message,
    organization_id: organizationId,
    current_module: currentModule,
    history: history.map(({ role, content }) => ({ role, content })),
  };
}
