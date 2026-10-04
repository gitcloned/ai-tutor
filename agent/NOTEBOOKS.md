# Canvas notebooks

A session stores `notebookId`. Initially it is the first session ID. Redirects keep
that ID, so assessment and prerequisite sessions can share one canvas.

The agent serves authenticated `GET /notebooks/:id` and `PUT /notebooks/:id`.
Ownership is checked against the student on the original session. PUT accepts
`{ revision, snapshot }`; GET returns `{ revision, updatedAt, snapshot }` or null.
A stale revision returns 409. Uploads are limited to 32 MiB.

Files live at `agent/data/notebooks/<studentId>/<notebookId>.json` by default.
Set `NOTEBOOK_DIR` to override the directory. Keep this directory on persistent
storage and include it in server backups. One file is atomically replaced on each
save. This filesystem implementation assumes one agent server process.

The canvas saves after `tutor-ended` has drained playback, on Back/Home, and on
page hide. Browser exit uploads are best-effort; small uploads use fetch keepalive.
Local IndexedDB persistence remains enabled for unfinished/offline work. There is
no timer or student-submission upload. A failed upload is retried at the next save
trigger; local work is retained.

On opening a session, the canvas downloads its notebook before connecting the
teaching socket. Existing work opens for review with “Let’s start”. That button
connects the tutor. Missing older snapshots produce a warning; matching local
pages are reused, including the original session page for prerequisite sessions.
A local copy with unsaved work is preserved. Conflicting server/local revisions
are never silently overwritten.

50 local pages is a cleanup threshold. Oldest backed-up, unmodified, inactive
pages are removed (up to half); unsaved pages are retained and may exceed 50.
The editor's safety ceiling is 1000 pages. Remote files are not deleted by local
cache cleanup. Resuming a lesson downloads an evicted notebook again.
