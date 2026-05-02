import { describe, it, expect } from 'vitest'
import {
  transformAnthropicRequest,
  transformAnthropicResponse,
} from '../../server/ai-transformers.mjs'

// ── transformAnthropicRequest ─────────────────────────────────────────────────

describe('transformAnthropicRequest', () => {
  it('passes model and messages through', () => {
    const result = transformAnthropicRequest({
      model: 'claude-3-5-sonnet-20241022',
      messages: [{ role: 'user', content: 'Hello' }],
    })
    expect(result.model).toBe('claude-3-5-sonnet-20241022')
    expect(result.messages).toEqual([{ role: 'user', content: 'Hello' }])
  })

  it('defaults max_tokens to 1024 when absent', () => {
    const result = transformAnthropicRequest({
      model: 'claude-3',
      messages: [{ role: 'user', content: 'Hi' }],
    })
    expect(result.max_tokens).toBe(1024)
  })

  it('uses the provided max_tokens when present', () => {
    const result = transformAnthropicRequest({
      model: 'claude-3',
      max_tokens: 2048,
      messages: [{ role: 'user', content: 'Hi' }],
    })
    expect(result.max_tokens).toBe(2048)
  })

  it('extracts a single system message into the top-level system field', () => {
    const result = transformAnthropicRequest({
      model: 'claude-3',
      messages: [
        { role: 'system', content: 'You are helpful.' },
        { role: 'user', content: 'Hello' },
      ],
    })
    expect(result.system).toBe('You are helpful.')
    expect(result.messages).toEqual([{ role: 'user', content: 'Hello' }])
  })

  it('concatenates multiple system messages with a newline', () => {
    const result = transformAnthropicRequest({
      model: 'claude-3',
      messages: [
        { role: 'system', content: 'First.' },
        { role: 'system', content: 'Second.' },
        { role: 'user', content: 'Hi' },
      ],
    })
    expect(result.system).toBe('First.\nSecond.')
  })

  it('omits the system field when there are no system messages', () => {
    const result = transformAnthropicRequest({
      model: 'claude-3',
      messages: [{ role: 'user', content: 'Hi' }],
    })
    expect(result.system).toBeUndefined()
  })

  it('converts a data: image_url block to a base64 Anthropic image block', () => {
    const dataUrl = 'data:image/jpeg;base64,/9j/abc123'
    const result = transformAnthropicRequest({
      model: 'claude-3',
      messages: [
        {
          role: 'user',
          content: [{ type: 'image_url', image_url: { url: dataUrl } }],
        },
      ],
    })
    expect(result.messages[0].content[0]).toEqual({
      type: 'image',
      source: { type: 'base64', media_type: 'image/jpeg', data: '/9j/abc123' },
    })
  })

  it('converts an http image_url block to a url Anthropic image block', () => {
    const imageUrl = 'https://example.com/card.jpg'
    const result = transformAnthropicRequest({
      model: 'claude-3',
      messages: [
        {
          role: 'user',
          content: [{ type: 'image_url', image_url: { url: imageUrl } }],
        },
      ],
    })
    expect(result.messages[0].content[0]).toEqual({
      type: 'image',
      source: { type: 'url', url: imageUrl },
    })
  })

  it('treats a malformed data: URL without a comma as a url-type image block', () => {
    const malformed = 'data:image/jpeg'
    const result = transformAnthropicRequest({
      model: 'claude-3',
      messages: [
        {
          role: 'user',
          content: [{ type: 'image_url', image_url: { url: malformed } }],
        },
      ],
    })
    expect(result.messages[0].content[0]).toEqual({
      type: 'image',
      source: { type: 'url', url: malformed },
    })
  })

  it('treats a non-base64 data URL (no ;base64) as a url-type image block', () => {
    const urlEncoded = 'data:image/png,Hello%20World'
    const result = transformAnthropicRequest({
      model: 'claude-3',
      messages: [
        {
          role: 'user',
          content: [{ type: 'image_url', image_url: { url: urlEncoded } }],
        },
      ],
    })
    expect(result.messages[0].content[0]).toEqual({
      type: 'image',
      source: { type: 'url', url: urlEncoded },
    })
  })

  it('uses image/jpeg as media_type fallback for data: URLs with empty type', () => {
    const noType = 'data:;base64,abc123'
    const result = transformAnthropicRequest({
      model: 'claude-3',
      messages: [
        {
          role: 'user',
          content: [{ type: 'image_url', image_url: { url: noType } }],
        },
      ],
    })
    expect(result.messages[0].content[0]).toEqual({
      type: 'image',
      source: { type: 'base64', media_type: 'image/jpeg', data: 'abc123' },
    })
  })

  it('leaves non-image_url content blocks unchanged', () => {
    const textBlock = { type: 'text', text: 'Describe this.' }
    const result = transformAnthropicRequest({
      model: 'claude-3',
      messages: [{ role: 'user', content: [textBlock] }],
    })
    expect(result.messages[0].content[0]).toEqual(textBlock)
  })

  it('passes temperature and top_p through when provided', () => {
    const result = transformAnthropicRequest({
      model: 'claude-3',
      messages: [{ role: 'user', content: 'Hi' }],
      temperature: 0.7,
      top_p: 0.9,
    })
    expect(result.temperature).toBe(0.7)
    expect(result.top_p).toBe(0.9)
  })

  it('omits temperature and top_p when not provided', () => {
    const result = transformAnthropicRequest({
      model: 'claude-3',
      messages: [{ role: 'user', content: 'Hi' }],
    })
    expect(result.temperature).toBeUndefined()
    expect(result.top_p).toBeUndefined()
  })

  it('omits response_format even when present in the input', () => {
    const result = transformAnthropicRequest({
      model: 'claude-3',
      messages: [{ role: 'user', content: 'Hi' }],
      response_format: { type: 'json_object' },
    })
    expect(result.response_format).toBeUndefined()
  })

  it('handles string content in non-system messages unchanged', () => {
    const result = transformAnthropicRequest({
      model: 'claude-3',
      messages: [{ role: 'user', content: 'plain text' }],
    })
    expect(result.messages[0].content).toBe('plain text')
  })
})

// ── transformAnthropicResponse ────────────────────────────────────────────────

describe('transformAnthropicResponse', () => {
  it('converts a successful Anthropic response to OpenAI shape', () => {
    const anthropicResponse = JSON.stringify({
      id: 'msg_01',
      type: 'message',
      role: 'assistant',
      content: [{ type: 'text', text: 'Hello there!' }],
      usage: { input_tokens: 10, output_tokens: 5 },
    })
    const result = JSON.parse(transformAnthropicResponse(anthropicResponse))
    expect(result.choices[0].message.role).toBe('assistant')
    expect(result.choices[0].message.content).toBe('Hello there!')
  })

  it('maps usage tokens to OpenAI naming conventions', () => {
    const anthropicResponse = JSON.stringify({
      type: 'message',
      content: [{ type: 'text', text: 'Hi' }],
      usage: { input_tokens: 20, output_tokens: 8 },
    })
    const result = JSON.parse(transformAnthropicResponse(anthropicResponse))
    expect(result.usage.prompt_tokens).toBe(20)
    expect(result.usage.completion_tokens).toBe(8)
    expect(result.usage.total_tokens).toBe(28)
  })

  it('omits usage when the Anthropic response has no usage field', () => {
    const anthropicResponse = JSON.stringify({
      type: 'message',
      content: [{ type: 'text', text: 'Hi' }],
    })
    const result = JSON.parse(transformAnthropicResponse(anthropicResponse))
    expect(result.usage).toBeUndefined()
  })

  it('returns an empty content string when content array is empty', () => {
    const anthropicResponse = JSON.stringify({
      type: 'message',
      content: [],
    })
    const result = JSON.parse(transformAnthropicResponse(anthropicResponse))
    expect(result.choices[0].message.content).toBe('')
  })

  it('converts an Anthropic error type response to OpenAI error shape', () => {
    const anthropicError = JSON.stringify({
      type: 'error',
      error: { type: 'authentication_error', message: 'Invalid API key' },
    })
    const result = JSON.parse(transformAnthropicResponse(anthropicError))
    expect(result.error.message).toBe('Invalid API key')
    expect(result.choices).toBeUndefined()
  })

  it('uses a fallback message for Anthropic errors without a message field', () => {
    const anthropicError = JSON.stringify({ type: 'error', error: {} })
    const result = JSON.parse(transformAnthropicResponse(anthropicError))
    expect(result.error.message).toBe('Anthropic API error')
  })

  it('returns the raw text unchanged when it is not valid JSON', () => {
    const garbage = 'not-json at all'
    expect(transformAnthropicResponse(garbage)).toBe(garbage)
  })
})
