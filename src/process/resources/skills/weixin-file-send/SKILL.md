---
name: weixin-file-send
description: |
  Emit a strict channel-send protocol block when the current Weixin channel conversation
  should send a locally generated image or file back to the user. Use only when the file
  already exists on disk and should be delivered to the current chat.
---

# Weixin File Send

Use this skill only when:

- You are in a Weixin channel conversation.
- A local file has already been created and should be sent back to the current chat.

Do not claim a file was sent unless you emit the protocol block exactly.

## Protocol

Append one or more protocol blocks at the end of the final reply:

```text
[AIONUI_CHANNEL_SEND]
{"type":"image","path":"./output/chart.png","caption":"Chart ready"}
[/AIONUI_CHANNEL_SEND]
```

```text
[AIONUI_CHANNEL_SEND]
{"type":"file","path":"./output/report.pdf","fileName":"report.pdf","caption":"Report ready"}
[/AIONUI_CHANNEL_SEND]
```

## Rules

- `type` must be `image` or `file`.
- `path` must point to a real local file that already exists.
- Use relative paths when the file is inside the workspace.
- `fileName` is optional for `file`.
- `caption` is optional.
- Place protocol blocks after the user-visible answer.
- Do not wrap the JSON in Markdown code fences.
- Do not emit the protocol block if the file does not exist.

## Examples

User-visible text with image:

```text
I generated the chart and sent it below.

[AIONUI_CHANNEL_SEND]
{"type":"image","path":"./output/chart.png","caption":"Sales chart"}
[/AIONUI_CHANNEL_SEND]
```

File only:

```text
[AIONUI_CHANNEL_SEND]
{"type":"file","path":"./output/report.pdf","fileName":"report.pdf","caption":"Weekly report"}
[/AIONUI_CHANNEL_SEND]
```
