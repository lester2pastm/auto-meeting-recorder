# Auto Meeting Recorder v2.7.3

This release broadens meeting-title generation compatibility across common reasoning-capable providers while preserving the previously restored DeepSeek behavior.

## Highlights

- Added provider-specific title request controls for GLM, Qwen, MiniMax, OpenAI reasoning models, OpenRouter, and DashScope-compatible gateways.
- Kept the existing DeepSeek `thinking: { type: "disabled" }` title workaround intact so earlier DeepSeek compatibility stays stable.
- Improved title sanitization so stray `<think>` / `<thinking>` blocks and `Title:`-style prefixes are removed before the meeting title is saved.

## Provider compatibility improvements

- Direct GLM-compatible title requests now disable thinking output explicitly.
- DashScope-compatible title requests now disable thinking for common Qwen, GLM, and MiniMax model names before the title response is generated.
- Direct MiniMax title requests now split reasoning away from `message.content` so the short title parser sees clean title text more reliably.
- OpenAI reasoning models and OpenRouter-hosted OpenAI reasoning models continue to use provider-specific reasoning controls instead of a one-size-fits-all flag.

## Testing and verification

- Expanded title reliability unit coverage for direct and gateway-based provider combinations, including DeepSeek, GLM, Qwen, MiniMax, OpenAI, OpenRouter, and DashScope.
- Re-ran title sanitization, title persistence, UI rendering, and provider compatibility regression tests before release.

## Version

- App version: `2.7.3`
- Tag: `v2.7.3`
