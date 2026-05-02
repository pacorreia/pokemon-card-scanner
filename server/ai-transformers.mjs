/**
 * server/ai-transformers.mjs
 *
 * Pure request/response transformers for the Anthropic Claude API.
 *
 * Anthropic's /v1/messages format differs from OpenAI chat/completions in three
 * ways: auth headers, request shape, and response shape. These transformers
 * bridge the gap so the rest of the server code stays provider-agnostic.
 */

/**
 * Convert an OpenAI-style chat/completions request body into the Anthropic
 * /v1/messages request body.
 *
 * Notable conversions:
 *  - System-role messages are extracted into the top-level `system` field.
 *  - `image_url` content blocks are converted to Anthropic `image` blocks.
 *  - `response_format` is intentionally omitted (not supported by Anthropic).
 *  - `max_tokens` defaults to 1024 when absent.
 */
export function transformAnthropicRequest(body) {
  const { messages, model, max_tokens, temperature, top_p } = body

  // Split system-role messages into the top-level `system` field
  let systemPrompt = ''
  const filteredMessages = []
  for (const msg of messages) {
    if (msg.role === 'system') {
      const text = typeof msg.content === 'string' ? msg.content : ''
      systemPrompt += (systemPrompt ? '\n' : '') + text
    } else {
      // Convert OpenAI image_url content blocks to Anthropic image blocks
      const content = Array.isArray(msg.content)
        ? msg.content.map(item => {
          if (item.type === 'image_url') {
            const url = item.image_url?.url ?? ''
            if (url.startsWith('data:')) {
              const commaIdx = url.indexOf(',')
              if (commaIdx === -1) {
                return { type: 'image', source: { type: 'url', url } }
              }
              const prefix = url.slice(0, commaIdx)
              const data = url.slice(commaIdx + 1)
              const isBase64 = prefix.includes(';base64')
              const mediaType = prefix.split(':')[1]?.split(';')[0] || 'image/jpeg'
              // Only emit a base64 block when the data URL uses base64 encoding.
              // Non-base64 data URLs are passed as a url-type block instead.
              if (isBase64) {
                return { type: 'image', source: { type: 'base64', media_type: mediaType, data } }
              }
              return { type: 'image', source: { type: 'url', url } }
            }
            return { type: 'image', source: { type: 'url', url } }
          }
          return item
        })
        : msg.content
      filteredMessages.push({ role: msg.role, content })
    }
  }

  const result = { model, max_tokens: max_tokens || 1024, messages: filteredMessages }
  if (systemPrompt) result.system = systemPrompt
  if (temperature !== undefined) result.temperature = temperature
  if (top_p !== undefined) result.top_p = top_p
  // Anthropic does not support `response_format` — omit it intentionally
  return result
}

/**
 * Convert an Anthropic /v1/messages response body (as raw text) back into an
 * OpenAI chat/completions response shape, so downstream consumers don't need to
 * know which provider was used.
 *
 * Returns the input text unchanged when it can't be parsed as JSON.
 */
export function transformAnthropicResponse(text) {
  let data
  try { data = JSON.parse(text) } catch { return text }

  // Surface Anthropic API-level errors in OpenAI error shape
  if (data.type === 'error') {
    return JSON.stringify({ error: { message: data.error?.message || 'Anthropic API error' } })
  }

  const content = data.content?.[0]?.text ?? ''
  const usage = data.usage
    ? {
      prompt_tokens: data.usage.input_tokens,
      completion_tokens: data.usage.output_tokens,
      total_tokens: (data.usage.input_tokens || 0) + (data.usage.output_tokens || 0),
    }
    : undefined

  return JSON.stringify({ choices: [{ message: { role: 'assistant', content } }], usage })
}
