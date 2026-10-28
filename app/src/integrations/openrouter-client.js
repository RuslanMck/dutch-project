// Client for one JSON chat answer from OpenRouter. The API key is sent only in the Authorization header, and every error
// text is scrubbed of it. Used by the word-order service to generate sentences.
const OPENROUTER_CHAT_URL = 'https://openrouter.ai/api/v1/chat/completions';
const REDACTED_TEXT = '[redacted]';
const MAXIMUM_PROVIDER_MESSAGE_LENGTH = 200;
const TIMEOUT_ERROR_NAMES = Object.freeze(['TimeoutError', 'AbortError']);

export function createOpenRouterClient({ apiKey, model, fetchFunction = fetch, timeoutMilliseconds = 90000 } = {}) {
  const isConfigured = Boolean(apiKey);

  // Returns choices[0].message.content of the answer.
  async function completeChat(messages) {
    if (!isConfigured) throw new Error('OpenRouter: API key is not configured');
    const response = await postChatRequest(messages);
    if (!response.ok) {
      const providerMessage = await readProviderMessage(response);
      throw new Error(`OpenRouter: HTTP ${response.status}${providerMessage ? `: ${providerMessage}` : ''}`);
    }
    return readMessageContent(response);
  }

  async function postChatRequest(messages) {
    try {
      return await fetchFunction(OPENROUTER_CHAT_URL, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, messages, response_format: { type: 'json_object' } }),
        signal: AbortSignal.timeout(timeoutMilliseconds),
      });
    } catch (error) {
      throw new Error(`OpenRouter: ${describeRequestFailure(error)}`);
    }
  }

  function describeRequestFailure(error) {
    if (TIMEOUT_ERROR_NAMES.includes(error?.name)) return 'request timed out';
    return scrubApiKey(error?.message ?? 'request failed');
  }

  async function readProviderMessage(response) {
    try {
      const parsedBody = JSON.parse(await response.text());
      const message = parsedBody?.error?.message;
      if (typeof message !== 'string') return '';
      return scrubApiKey(message).slice(0, MAXIMUM_PROVIDER_MESSAGE_LENGTH);
    } catch {
      return '';
    }
  }

  async function readMessageContent(response) {
    let body;
    try {
      body = await response.json();
    } catch {
      throw new Error('OpenRouter: response is not JSON');
    }
    const content = body?.choices?.[0]?.message?.content;
    if (typeof content !== 'string') throw new Error('OpenRouter: response has no message content');
    return content;
  }

  function scrubApiKey(text) {
    return apiKey ? String(text).split(apiKey).join(REDACTED_TEXT) : String(text);
  }

  return Object.freeze({ isConfigured, completeChat });
}
