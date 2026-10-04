# Class learning journey integration

The UI uses the existing ERP bearer token. Local ports remain Canvas 32000, CMS 32001, learning progression 32002, agent 32004 and ERP 32005.

For hosted builds configure `VITE_CMS_API_URL`, `VITE_LEARNING_API_URL`, `VITE_ERP_API_URL` and `VITE_AGENT_API_URL` with HTTPS endpoints. Each service must allow the Canvas origin and Authorization header; ERP must also allow PUT. Rebuild after changing these values.

## Home and lesson start

`GET /students/:id/home` (LP):

```json
{
  "subjects": [{
    "subjectId": "mathematics",
    "title": "Mathematics",
    "topics": [{
      "topicId": "linear-equations",
      "title": "Linear equations",
      "strandTitle": "Algebra",
      "unitTitle": "Equations and graphs",
      "status": "in_progress"
    }]
  }],
  "continueWith": {
    "topicId": "linear-equations",
    "conceptId": "graphing-solutions",
    "state": "learning",
    "resumeSessionId": "saved-session"
  }
}
```

Statuses: `not_started`, `in_progress`, `completed`, `unavailable`. Optional `reason` explains unavailable topics. No previous learning means `continueWith: null`.

The frontend temporarily enriches missing names/hierarchy from one CMS `/curriculum` request. It never calculates progression or guesses a continuation from local storage.

Both Start and Continue re-read LP `GET /students/:id/topics/:topicId/next`. Only `status: continue` proceeds to agent `POST /sessions` with `{studentId, topicId, conceptId, resumeSessionId}`. The existing session URL and authenticated WebSocket handshake are preserved.

Class filter uses ERP `GET /students/:id/classes/:classId/topics`, returning `{topics: [{subjectId, topicId}]}`.

## Setup and editing

CMS `/curriculum?grade=7` supplies subject → strand → unit → topic with `recommended`. Recommendations are selected initially; other grades remain selectable.

Teacher class creation sends name, grade, topics (`[{subjectId, topicId}]`), subjectIds and idempotencyKey to ERP `POST /classrooms`.

Parent creation sends name, grade, optional age, topics, subjectIds, `setupContext: parent` and idempotencyKey to `POST /students`. Teacher roster creation sends `setupContext: teacher`. Parent response should include code, personalClassId and setupStatus. Personal classes are hidden from class management (`kind: personal`). ERP classroom-list responses must include `kind`; the current response projection omits it, so the frontend cannot distinguish personal classes yet.

Creation retries reuse their key. ERP must persist it and resume incomplete setup. An explicitly empty topic selection must stay empty rather than invoking grade defaults.

**Additional read needed for class editing:** owner-authorized `GET /classrooms/:id/topics` returning `{topics: [{subjectId, topicId}]}`. This allows editing even before a class has students. The existing student-specific route cannot handle that case. The UI displays a retryable error until this read exists, and never replaces unknown assignments with defaults.

Saving uses `PUT /classrooms/:id/topics` with topics and subjectIds. Return `status: ready` only after synchronization succeeds; partial/pending responses remain visible and can be retried by saving again.

## Verification

`npm exec -- playwright test e2e/journey.spec.ts` exercises preview setup plus mocked LP and agent responses. These checks do not certify the real backend or its migration. Preview: `/login?preview=1`, student code `K7M9R2` or Parent or teacher → Try adult setup.
