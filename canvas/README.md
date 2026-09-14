# Prodigy canvas

A shared learning notebook connected to the agent's existing WebSocket event stream. Built with React, TypeScript, Vite, and tldraw.

## Run with the teaching replay

Terminal 1, from the repository root:

```sh
cd agent
pnpm install
pnpm build
node scripts/canvas.mjs --scenario both --delay 10 --port 32004
```

Terminal 2:

```sh
cd canvas
npm install
npm run dev
```

Open http://127.0.0.1:32000, choose **Start learning**, and connect to `ws://localhost:32004`. The replay begins on connection. `--scenario algebra`, `heart`, and `text` work too. The replay tool restarts its scenarios on any text reply; it does not assess student answers.

The default replay socket is `ws://127.0.0.1:32004`. Canvas uses port **32000** and fails if it is occupied rather than silently switching ports.

## Cuboid volume chapter

Start the static CMS resource package (no database needed):

```sh
cd cms/packages/resources
npm run dev
```

Then start the replay from `agent` after building it:

```sh
npm run build
node scripts/canvas.mjs --scenario cuboid-volume --delay 0 --tts test --port 32004
```

Start Canvas with `npm run dev` and connect to `ws://127.0.0.1:32004`. The chapter plays continuously past intermediate questions; no reply is required. Like the other replays, a text reply restarts the script without grading it. `--tts test` displays narration captions; omit it to use the configured TTS provider.

The chapter builds a 12-cube base and asks for a prediction, fills all 24 cubes and explains the formula, then rearranges the same cubes into 6 × 2 × 2 and 8 × 3 × 1 before a transfer question. The model is a real canvas object. While following, the camera frames it on the left with new writing 40 canvas units to its right; its vertical page position follows the camera so it remains visible as writing scrolls. Narrow screens zoom out to fit both. Drag inside the model using the select tool to rotate. Its geometry, position, state and view persist in the notebook and appear in PNG exports.

The package is at `cms/packages/resources/3d-models/cuboid-volume-01/manifest.json`. Canvas fetches it through the development proxy `/api/models/` to the resource server on port 32003. The existing CMS also serves `/3d-models/` on port 32001. Production deployments must proxy `/api/models/` to the resource service, or set `VITE_MODEL_BASE_URL` at build time to its public `/3d-models` URL.

The cuboid uses procedural 3D geometry projected to SVG, with depth ordering and pointer rotation. It is not a GLB mesh or WebGL viewer. Packages can hold GLB files, but displaying those needs a future mesh renderer. The current runtime accepts `unit-cubes` manifests only, validates finite routines, and never runs remote code.

```text
model3d: cuboid-volume-01
/action: build-base
```

Model actions reuse the page's existing object, load it if absent, and finish before sequential narration continues. Supported actions: `build-base`, `build-volume`, `same-volume`, `reset`. Send `model3d: cuboid-volume-01` with `/action: remove` to delete that model; removing an absent model does nothing. The LLM receives this vocabulary in the canvas prompt. Camera following currently anchors the first model on the page.

Verify with the resource server and cuboid replay running:

```sh
CANVAS_URL=http://127.0.0.1:32000 npm exec -- playwright test e2e/cuboid.spec.ts
```

## Controls

- Left toolbar: select, pencil, erase, text, shapes, pan, ink colors, undo/redo. Standard tldraw keyboard shortcuts remain available.
- Tutor orb: tap to send pending student work. Hold for 420ms to start microphone recording; release to send audio together with pending text and drawings. Move more than 90 pixels away to cancel. Tutor playback pauses while recording. A tap with nothing pending shows a short notice.
- Keyboard button: type a reply. Conversation button: review this connection's transcript.
- Notebook: switch between saved pages or use the trash button to delete one. Undo restores deleted pages. Disconnect before deleting so incoming teaching cannot target a deleted page. Drawings and pages persist through tldraw IndexedDB, scoped to the browser origin (host and port). The tutor address uses localStorage; conversation text is in memory only.
- Export: save the current page as PNG. Embedded third-party videos may not export.
- Drawing or panning disables camera follow. **Back to the lesson** restores it.

## Event contract

`BlockAdapter` buffers writes until the empty `text_chunk` with `attrs` sentinel. This keeps adjacent equations separate and allows final positional attributes to apply before rendering. Baseline `text` closes plain text. SVGs and questions are already complete blocks.

The server sends `{type: 'session', sessionId, conceptId, title}` immediately after a WebSocket connection. Canvas uses the concept title for the notebook page before teaching begins. The replay script emits the same event contract.

`Playback` preserves incoming order. Real audio is awaited until playback ends, then subsequent visuals render. `audio_chunk` with `attrs.mimeType: text/plain` is the replay tool's UTF-8 caption simulation. It uses a bounded reading delay, not TTS. Pause suspends both visual timing and Web Audio playback. Disconnect discards queued presentation. The backend still owns LLM parsing, transformations, and event sequencing.

Writing appears one character at a time at a 45ms cadence. Sequential write → speech and diagram → speech transitions add 1200ms and 1600ms pauses respectively, after the visual is fully rendered. Explicit `parallel-start` / `parallel-end` groups bypass these pauses and continue to present their contents together.

Ordinary canvas content honors explicit positions and center/top-left anchors. With a model present, teaching uses a right-hand column and vertical positions are treated as minimums to prevent overlaps. Questions use green ink, retain the same font and size, receive a `Q.` prefix unless already labeled, and have extra space above them. Missing positions use vertical placement with collision avoidance. Camera following pans new material into view and zooms to fit model and writing together. Simple clicks keep following enabled; deliberate dragging or wheel navigation pauses it. Fit lesson or Back to the lesson resumes following. SVGs are sanitized and stored as vector image assets. Videos use tldraw embeds/video shapes. HTTP(S) links are validated before rendering.

## Current limits

Narration captions reveal the `attrs.sentence` text over the decoded audio chunk's duration and pause with playback. This is approximate character timing; the stream does not provide word timestamps. Later audio chunks without sentence text retain the current caption.

- The backend accepts `{type: 'message', text?, audio?, images?}`. Media fields use `{data: base64, mimeType}`. Recordings use MediaRecorder's supported audio MIME type; drawings export as cropped JPEG at quality 0.8 with a maximum target dimension of 1280px. The replay tool does not evaluate these inputs.
- Student work is compared at the object-content level: new or changed student objects are included, tutor objects and unchanged objects are excluded, and moving an object alone does not resend it. Text objects become plain text; drawings and other visual objects become an image. Edited objects are resent in their current form, not as pixel patches. Deletions are not sent. Existing objects at app startup form the initial baseline; send tracking is in memory for that app visit.
- The baseline advances only after WebSocket send succeeds. The protocol has no receipt acknowledgement, so successful queuing does not prove backend processing. Failed preparation or a disconnected socket leaves work pending. Microphone recording requires browser permission and a secure context (localhost is supported); there is no continuous listening or browser speech transcription.
- Pausing is local presentation control, not server generation cancellation. Reconnection is explicit because the live session manager ends sessions on disconnect.
- The `both` replay moves automatically from algebra to heart, including after questions, matching the script. Pages remain available in the notebook.
- SVGs enter as complete vector objects, not independently editable diagram primitives.
- CMS concept selection is not wired to session creation: the CLI still chooses the live concept/student.
- tldraw loads its default assets and retains its license watermark. Check tldraw's license requirements before production deployment.

## Verify

```sh
npm test
npm run build
# Start the app and replay (--scenario both --delay 0 --port 32004), then:
npm exec -- playwright test
```

The browser test uses installed Google Chrome in an isolated profile. It covers replay rendering, both notebook pages, drawing undo/redo, persistence after reload, and mobile overflow. Screenshots are written to `artifacts/`.
