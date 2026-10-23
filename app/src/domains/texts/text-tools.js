// MCP adapter for texts: registers the text tools.
import { identifierSchema } from '../../contracts/shared-contracts.js';
import { createTextInputSchema } from '../../contracts/text-contracts.js';
import { READ_ONLY_TOOL_ANNOTATIONS, registerJsonTool } from '../../model-context-protocol/mcp-tool-registration.js';

export function registerTextTools({ mcpServer, textService }) {
  registerJsonTool(mcpServer, 'add_text', {
    title: 'Add text',
    description: 'Add a bilingual text, e.g. a textbook dialogue. '
      + 'body format: one Dutch line, then its Ukrainian line; '
      + 'pairs are separated by a blank line. A speaker prefix such as "Jasper:" / "Яспер:" may start a line. '
      + 'Returns the text.',
    inputSchema: createTextInputSchema.shape,
  }, textInput => textService.createText(textInput));

  registerJsonTool(mcpServer, 'list_texts', {
    title: 'List texts',
    description: 'Texts without bodies, newest first. Use get_text for a body.',
    annotations: READ_ONLY_TOOL_ANNOTATIONS,
  }, () => textService.listTexts().map(mapTextToCompactText));

  registerJsonTool(mcpServer, 'get_text', {
    title: 'Get text',
    description: 'One text by id, including its body.',
    inputSchema: { id: identifierSchema },
    annotations: READ_ONLY_TOOL_ANNOTATIONS,
  }, ({ id }) => textService.getText(id));
}

// The shape returned to Claude for text lists: no body.
function mapTextToCompactText(text) {
  return { id: text.id, title: text.title, section: text.section, added_at: text.added_at };
}
