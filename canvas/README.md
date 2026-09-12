# Prodigy canvas

A shared learning notebook connected to the agent's existing WebSocket event stream. Built with React, TypeScript, Vite, and tldraw.

## Run with the teaching replay

Terminal 1, from the repository root:

```sh
cd agent
pnpm install
pnpm build
node scripts/canvas.mjs --scenario both --delay 10 --port 8080
```

Terminal 2:

```sh
cd canvas
npm install
npm run dev
```

Open http://127.0.0.1:5173, choose **Start learning**, and connect to `ws://localhost:8080`. The replay begins on connection. `--scenario algebra`, `heart`, and `text` work too. The replay tool restarts its scenarios on any text reply; it does not assess student answers.

The current verification instance uses port **8093**. Connect to `ws://localhost:8093` while that process is running.

## Controls

- Left toolbar: select, pencil, erase, text, shapes, pan, ink colors, undo/redo. Standard tldraw keyboard shortcuts remain available.
- Tutor orb: tap to pause/resume during teaching; otherwise open a reply. Hold to dictate where browser speech recognition is available. Dictation opens a preview for review before sending. Move more than 90 pixels away to cancel the hold.
- Keyboard button: type a reply. Conversation button: review this connection's transcript.
- Notebook: switch between saved scenario pages. Drawing and canvas pages persist in this browser through tldraw IndexedDB. Conversation text is in memory only.
- Export: save the current page as PNG. Embedded third-party videos may not export.
- Drawing or panning disables camera follow. **Back to the lesson** restores it.

## Event contract

`BlockAdapter` buffers writes until the empty `text_chunk` with `attrs` sentinel. This keeps adjacent equations separate and allows final positional attributes to apply before rendering. Baseline `text` closes plain text. SVGs and questions are already complete blocks.

The server sends `{type: 'session', sessionId, conceptId, title}` immediately after a WebSocket connection. Canvas uses the concept title for the notebook page before teaching begins. The replay script emits the same event contract.

`Playback` preserves incoming order. Real audio is awaited until playback ends, then subsequent visuals render. `audio_chunk` with `attrs.mimeType: text/plain` is the replay tool's UTF-8 caption simulation. It uses a bounded reading delay, not TTS. Pause suspends both visual timing and Web Audio playback. Disconnect discards queued presentation. The backend still owns LLM parsing, transformations, and event sequencing.

Writing appears one character at a time at a 45ms cadence. Sequential write → speech and diagram → speech transitions add 1200ms and 1600ms pauses respectively, after the visual is fully rendered. Explicit `parallel-start` / `parallel-end` groups bypass these pauses and continue to present their contents together.

Explicit position and center/top-left anchors are honored exactly in canvas coordinates. Missing positions use vertical placement with collision avoidance. Camera following preserves zoom and pans only enough to bring new material into a focus zone slightly above center. SVGs are sanitized and stored as vector image assets. Videos use tldraw embeds/video shapes. HTTP(S) links are validated before rendering.

## Current limits

- The backend accepts `{type: 'message', text}` only. Canvas image submission is explicitly unavailable; the app never claims it sent handwritten work.
- Browser dictation availability varies and may use the browser vendor's service. Raw microphone audio is not sent to the backend. No continuous listening.
- Pausing is local presentation control, not server generation cancellation. Reconnection is explicit because the live session manager ends sessions on disconnect.
- The `both` replay moves automatically from algebra to heart, including after questions, matching the script. Pages remain available in the notebook.
- SVGs enter as complete vector objects, not independently editable diagram primitives.
- CMS concept selection is not wired to session creation: the CLI still chooses the live concept/student.
- tldraw loads its default assets and retains its license watermark. Check tldraw's license requirements before production deployment.

## Verify

```sh
npm test
npm run build
# Start the app and replay (--scenario both --delay 0 --port 8093), then:
npm exec -- playwright test
```

The browser test uses installed Google Chrome in an isolated profile. It covers replay rendering, both notebook pages, drawing undo/redo, persistence after reload, and mobile overflow. Screenshots are written to `artifacts/`.
