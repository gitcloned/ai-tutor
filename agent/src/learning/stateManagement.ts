/**
 * Plan selection — single source of truth for building a concept plan.
 *
 * Priority: markdown file override (v2) → JSON-driven builder (v1).
 * Used by: context.ts, tools/state.ts, tools/redirect.ts
 */

import type { ConceptState, Concept, PlanStep } from '../types.js';
import { buildPlan }                            from './plan-builder.js';
import { hasProbePlan, loadProbePlan, hasTeachPlan, loadTeachPlan } from './plan-builder-v2.js';

export interface ConceptPlan {
  plan:   PlanStep[];
  models: string[];  // model IDs declared in the markdown preamble (empty for v1 JSON plans)
}

export function buildConceptPlan(concept: Concept, state: ConceptState): ConceptPlan {
  switch (state) {
    case 'not_assessed':
      if (hasProbePlan(concept.id)) {
        const { steps, models } = loadProbePlan(concept.id);
        return { plan: steps, models };
      }
      return { plan: buildPlan(concept, state), models: [] };

    case 'learning':
      if (hasTeachPlan(concept.id)) {
        const { steps, models } = loadTeachPlan(concept.id);
        return { plan: steps, models };
      }
      return { plan: buildPlan(concept, state), models: [] };

    case 'clarity':
    case 'mastered':
    case 'exam_ready':
      return { plan: buildPlan(concept, state), models: [] };

    case 'learn-pre-req-before':
      throw new Error(`buildConceptPlan: 'learn-pre-req-before' is an internal holding state — it has no plan`);

    default:
      throw new Error(`buildConceptPlan: unknown state "${state}" for concept "${concept.id}"`);
  }
}
