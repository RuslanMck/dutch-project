// Shared by the domain tool modules: registers a tool whose handler returns a value, sent to Claude as JSON
// text. A thrown error becomes an isError result with the error's message.
import { mapToDomainError } from '../errors/domain-errors.js';

export const READ_ONLY_TOOL_ANNOTATIONS = Object.freeze({ readOnlyHint: true });
export const DESTRUCTIVE_TOOL_ANNOTATIONS = Object.freeze({ destructiveHint: true });
export const DELETED_TOOL_RESULT = Object.freeze({ ok: true });

export function registerJsonTool(mcpServer, toolName, toolConfiguration, handleToolCall) {
  mcpServer.registerTool(toolName, toolConfiguration, async toolArguments => {
    try {
      const toolResult = await handleToolCall(toolArguments ?? {});
      return { content: [{ type: 'text', text: JSON.stringify(toolResult, null, 2) }] };
    } catch (error) {
      return { isError: true, content: [{ type: 'text', text: mapToDomainError(error).message }] };
    }
  });
}
