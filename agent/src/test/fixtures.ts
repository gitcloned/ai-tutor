/**
 * Real concept fixtures from the DB (graphing-solutions-to-2-variable-linear-equations-1
 * and its prereqs). Used across all tests.
 */

import type { Concept, JourneyNode, Session, Resource } from '../types.js';
import type { AgentContext } from '../context.js';

// ── Concepts ──────────────────────────────────────────────────────────────────

export const CONCEPT_COMPLETING_SOLUTIONS: Concept = {
  id:           'graphing-solutions-to-2-variable-linear-equations-1',
  title:        'Completing solutions to 2-variable equations',
  nextConcepts: [],   // end of the sequence for now
  lessonPlan: [
    {
      type: 'ido',
      instruction: 'Demonstrate substituting y = -2 into x - 5y = -15 and solving for x',
      resources: [
        {
          id:         'res-completing-1',
          title:      'Completing solutions to 2-variable equations',
          type:       'teaching-video',
          youtubeUrl: 'https://www.youtube.com/watch?v=example1',
          url:        null,
        } as Resource,
      ],
      learningIndicator: {
        text: 'Student can substitute a given value and solve for the unknown variable',
        assessmentQuestion: null,
      },
    },
    {
      type: 'youdo',
      instruction: 'Guide the student through a practice problem',
      resources: [],
      learningIndicator: {
        text:               'Given y = 3, find x in x - 5y = -15',
        assessmentQuestion: {
          id:          'q-completing-1',
          stem:        'If y = 3, what is x in the equation x - 5y = -15?',
          idealAnswer: '0',
          type:        'fib',
        },
      },
    },
  ],
  probingTree: {
    nodes: [
      {
        probe:       'In the pair ( ___, -2 ), what does -2 represent — is it the value of x or the value of y?',
        idealAnswer: 'y',
        ifCorrect: {
          type: 'steps',
          steps: [
            {
              probe:       'Right! So y = -2. Substitute y = -2 into x - 5×(-2) = -15. What does the left side simplify to?',
              idealAnswer: 'x + 10',
              ifCorrect: {
                type: 'steps',
                steps: [
                  {
                    probe:       'Great — so now you have x + 10 = -15. What is x?',
                    idealAnswer: '-25',
                    ifCorrect:   { type: 'question' },
                    ifWrong: {
                      type:    'inline',
                      content: 'Subtract 10 from both sides: x = -25',
                      thenAsk: {
                        probe:       'Now try: if x + 10 = -15, what is x?',
                        idealAnswer: '-25',
                        ifCorrect:   { type: 'question' },
                        ifWrong: {
                          type:        'teach',
                          conceptId:   'graphing-solutions-to-2-variable-linear-equations-1',
                          title:       'Completing solutions to 2-variable equations',
                        },
                      },
                    },
                  },
                ],
              },
              ifWrong: {
                type:    'inline',
                content: 'Replace y with -2: x - 5×(-2) = x + 10',
                thenAsk: {
                  probe:       'Now that you know x + 10 = -15, what is x?',
                  idealAnswer: '-25',
                  ifCorrect:   { type: 'question' },
                  ifWrong: {
                    type:      'teach',
                    conceptId: 'graphing-solutions-to-2-variable-linear-equations-1',
                    title:     'Completing solutions to 2-variable equations',
                  },
                },
              },
            },
          ],
        },
        ifWrong: {
          type: 'steps',
          steps: [
            {
              probe:       'Let\'s try something simpler. In x - 5y = -15, if x = 0, what is y?',
              idealAnswer: '3',
              ifCorrect: {
                // child can substitute but doesn't know ordered pair notation
                type:      'teach',
                conceptId: 'checking-ordered-pair-solutions-to-equations-1',
                title:     'Solutions to 2-variable equations',
              },
              ifWrong: {
                // child cannot substitute at all
                type:      'teach',
                conceptId: '2-variable-linear-equations-graphs',
                title:     'Two-variable linear equations intro',
              },
            },
          ],
        },
      },
    ],
  },
};

export const CONCEPT_ORDERED_PAIRS: Concept = {
  id:           'checking-ordered-pair-solutions-to-equations-1',
  title:        'Solutions to 2-variable equations',
  nextConcepts: [],
  lessonPlan:   [],
  probingTree:  null,
};

export const CONCEPT_TWO_VAR_INTRO: Concept = {
  id:           '2-variable-linear-equations-graphs',
  title:        'Two-variable linear equations intro',
  nextConcepts: [],
  lessonPlan: [
    { type: 'ido', instruction: null },
  ],
  probingTree: null,
};

// ── Journey nodes ─────────────────────────────────────────────────────────────

export function makeNode(overrides: Partial<JourneyNode> = {}): JourneyNode {
  return {
    id:            'node-completing',
    journeyId:     'journey-1',
    conceptId:     CONCEPT_COMPLETING_SOLUTIONS.id,
    state:         'not_assessed',
    goTo:          null,
    cameFrom:      null,
    preReqToLearn: null,
    ...overrides,
  };
}

// ── Sessions ──────────────────────────────────────────────────────────────────

export function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    id:                  'session-1',
    studentId:           'gaurav_chopra',
    conceptId:           CONCEPT_COMPLETING_SOLUTIONS.id,
    journeyNodeId:       'node-completing',
    status:              'initialised',
    conceptStateAtStart: 'not_assessed',
    teachingPlan:        { content: '', updatedAt: new Date().toISOString() },
    planHistory:         [],
    history:             [],
    rawHistory:          [],
    ...overrides,
  };
}

// ── Agent context ─────────────────────────────────────────────────────────────

export function makeCtx(overrides: Partial<AgentContext> = {}): AgentContext {
  return {
    session:     makeSession(),
    concept:     CONCEPT_COMPLETING_SOLUTIONS,
    journeyNode: makeNode(),
    memories:    [],
    plan:        [],
    log:         () => {},
    ...overrides,
  };
}
