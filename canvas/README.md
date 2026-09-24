# Prodigy canvas

A shared learning notebook connected to the agent's existing WebSocket event stream. Built with React, TypeScript, Vite, and tldraw.

For a stalled video or narration, run `JSON.stringify(window.canvasPlaybackDiagnostics(), null, 2)` in the browser console before refreshing. It reports queued block types, deferred video count, audio context state, and the last 200 received/presented event types with timestamps. It excludes lesson text, student input, and audio payloads. The trace starts when this version of the page loads; it cannot recover earlier wire events from the saved session transcript.

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

Canvas binds to `0.0.0.0:32000`, making it reachable from other devices on your network. It fails if port **32000** is occupied rather than silently switching ports. The default tutor socket uses the site's hostname on port **32004**, with `ws://` for HTTP and `wss://` for HTTPS. Saved addresses are reused only when their hostname and protocol match the current site. You can edit the tutor address before connecting. Preview also binds to `0.0.0.0`, on port **32005**.

## Firebase Hosting

Run `npm run deploy` from `canvas/` with the Firebase CLI signed into an account that can deploy to `prodigy-tutor`. Its predeploy hook builds the app and includes `cms/packages/resources/interactive-models/` under `dist/api/models/`. Hosting serves only the `dist` directory; agent configuration and secrets are not included. No Firebase browser SDK is needed for Hosting.

Set `VITE_TUTOR_WS_URL=wss://your-public-tutor-server` in `.env.production.local` to provide a default public tutor address before building. Without this setting, the hosted connection field starts empty and accepts a student-entered secure WebSocket URL. Production remembers manually entered `wss://` addresses across reloads. Firebase Hosting serves the UI and model resources; the tutor backend still needs a separate secure WebSocket endpoint.

Connect and Start learning try the last successful tutor address when available. An unsuccessful attempt opens the connection sheet; pending attempts time out after 10 seconds. Tapping the disconnected orb always opens the sheet directly. It offers the shared Cloudflare tunnel, up to four recent successful addresses, and a manual address field. Pasted HTTPS links are converted to WSS. Addresses are remembered only after the WebSocket opens, and insecure WS addresses are rejected on the HTTPS site. Quick-tunnel addresses may change when the tunnel restarts; use the manual field to connect to the replacement.

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

The package is at `cms/packages/resources/interactive-models/cuboid-volume-01/manifest.json`. Canvas fetches it through the development proxy `/api/models/` to the interactive-model resource server on port 32003. The CMS also serves `/interactive-models/` on port 32001. Production deployments must proxy `/api/models/` to that resource service, or set `VITE_MODEL_BASE_URL` at build time to its public `/interactive-models` URL.

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

- Double-tap the tutor orb to photograph paper work. Single taps wait 350ms to distinguish them from a double tap; holding still records speech. The camera starts with the front camera and remembers the last camera selected during this browser session.
- Capture as many pages as needed, tap a thumbnail to preview or delete it, then tap the camera's orb to send. Closing the camera keeps pending pages attached to the current notebook page; a regular orb submission includes them with pending text, drawings, and audio. Unsent photos stay in memory until reload. Camera access requires HTTPS on tablets and permission from the student.
- Photos are separate JPEG images, at most 1,600 pixels on the longest edge, with 82% quality. They are sent in capture order, followed by any canvas drawing image. Saved photos are never mirrored. Successful sends create a “Your work” stack on the canvas, persisted with the notebook; tap it to browse the original submitted pages. The saved stack is excluded from future work diffs.
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

All narration shares one ordered queue, including inside parallel groups. Parallel groups allow visuals to accompany narration; they never overlap two audio chunks or simulated sentences. Captions start when their narration reaches the front of that queue. `parallel:end` waits for both the visuals and queued narration to finish.

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
# Worked questions and annotations

`question: Q01` starts a saved worked example. The first `write:` is its question statement; later writes stay aligned below it. `annotate:` adds a green note on the right of the latest step. Tall notes reserve space before the next step. `question: end` closes the example without deleting it; a new question ID also closes the previous example. An open question can continue across tutor turns.

Annotations support `/mark: circle` or `/mark: underline`, with optional `/target: exact phrase` (first occurrence in the latest step; omit to mark the whole step). A mark can have no text:

```text
question: Q01
write: Solve 2x + 3 = 7
annotate:
/mark: underline
/target: + 3
write: 2x = 4
annotate: Subtract 3 from both sides.
question: end
```

Annotations do not pause for student input. Existing `ask:` lessons keep their previous behavior. Outside a question, an annotation targets the most recent plain write in the current renderer session.

Replay from `agent/`: `npm run build`, then `node scripts/canvas.mjs --scenario question-algebra --tts test --port 32014`. Connect the canvas to `ws://localhost:32014` (use the server's hostname when accessing remotely).
# Video viewing and orb feedback

Video `play:` blocks are deferred until the backend sends `{ "type": "event", "event": { "type": "tutor-ended" } }` and all speech and visuals from that turn finish. This works even when `play:` arrives before its introduction or outside a parallel group. The viewer fills the browser window automatically and requests native fullscreen when permitted, keeping the completion button accessible. If native fullscreen requires a user gesture, use the fullscreen button. The replay script emits the same turn boundary.

“I’m done watching” pauses and closes the viewer, keeps the video on the canvas, and sends `{ "type": "message", "text": "I am done watching" }`. Native video autoplay has a Play button fallback when the browser blocks it; YouTube retains its player controls. The replay server acknowledges completion without restarting the lesson.

The orb shows Sending, Sent, then Waiting for tutor. It remains busy from `tutor-started` through `tutor-ended` and until queued speech/writing finishes. Students can keep drawing while waiting.

## Function graph activity

From `agent/`, build once (`npm run build`) and run:

```sh
node scripts/canvas.mjs --scenario function-graph --tts test --delay 0 --port 32004
```

Connect the canvas to `ws://localhost:32004`. Use `function-graph-plot` for exploration with the curve visible. The graph renderer lives in `canvas/src/models/` and loads JSXGraph on demand; this activity needs no CMS asset server.

```text
model: function-graph
/equation: y = 2*x - 3
/action: ask
/targets: 2,3,4
/x-range: -5,7
/y-range: -5,7
/snap: 1
write: Plot the points for x = 2, 3, and 4.
```

`plot` and `explore` show the curve and track `(x, f(x))` under the crosshair. `ask` hides the curve and lets students tap or drag/release to place grid-snapped points. Arrow keys move the crosshair; Enter submits. Targets are x-values; omit them to accept any point satisfying the equation. Correct points stay fixed; repeated placement at a solved x-value does not send a duplicate. Incorrect attempts remain visible with a different color, and feedback invites another calculation without revealing the answer.

Expressions must be explicit `y = f(x)`: arithmetic, parentheses, powers (`^`), `sin`, `cos`, `sqrt`, `abs`, `pi`, and `e`. Expressions are parsed with a restricted arithmetic grammar, not evaluated as JavaScript. Implicit equations such as `x + y = 3` and vertical lines are not supported. Choose a snap interval that can reach the required coordinates; invalid configurations produce a recoverable notification. Ranges default to include the targets.

Each committed attempt automatically sends one WebSocket message:

```json
{"type":"message","activity":{"type":"graph-point","model":"function-graph","activityId":"function-graph","equation":"y = 2*x - 3","x":2,"y":1,"correct":true,"complete":false,"remaining":[3,4]}}
```

The input parser validates and includes this structured result in the tutor's student-message history. Coordinates and correctness are client-reported; the tutor can use the equation to reason about them. New attempts wait while the tutor responds, without blocking crosshair exploration. The replay gives brief scripted feedback and reveals the line once all targets are solved; live tutoring uses the agent's response.

Repeat `model: function-graph` with `/action: plot` to reveal the same activity and retain points; `/action: reset` clears attempts, and `/action: remove` removes it. A changed equation or target set clears attempts. `/id` identifies a separate activity. Configuration and attempts are saved with the notebook. The graph stays visible on the left while new teaching appears on the right.
