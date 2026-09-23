/**
 * Plan selection — single source of truth for building a concept plan.
 *
 * Priority: markdown file override (v2) → JSON-driven builder (v1).
 * Used by: context.ts, tools/state.ts, tools/redirect.ts
 */

import { CS } from '../types.js';
import type { ConceptState, Concept, PlanStep } from '../types.js';
import { buildPlan }                            from './plan-builder.js';
import { hasProbePlan, loadProbePlan, hasTeachPlan, loadTeachPlan, hasMasteryPlan, loadMasteryPlan } from './plan-builder-v2.js';

export interface ConceptPlan {
  plan:   PlanStep[];
  models: string[];  // model IDs declared in the markdown preamble (empty for v1 JSON plans)
}

export function buildConceptPlan(concept: Concept, state: ConceptState): ConceptPlan {
  switch (state) {
    case CS.NOT_ASSESSED:
      if (hasProbePlan(concept.id)) {
        const { steps, models } = loadProbePlan(concept.id);
        return { plan: steps, models };
      }
      return { plan: buildPlan(concept, state), models: [] };

    case CS.ASSESSING:
      // Probing is re-used for this state (student is mid-assessment)
      if (hasProbePlan(concept.id)) {
        const { steps, models } = loadProbePlan(concept.id);
        return { plan: steps, models };
      }
      return { plan: buildPlan(concept, CS.NOT_ASSESSED), models: [] };

    case CS.LEARNING:
      if (hasTeachPlan(concept.id)) {
        const { steps, models } = loadTeachPlan(concept.id);
        return { plan: steps, models };
      }
      return { plan: buildPlan(concept, state), models: [] };

    case CS.CLARITY:
    case CS.MASTERING:
      if (hasMasteryPlan(concept.id)) {
        const { steps, models } = loadMasteryPlan(concept.id);
        return { plan: steps, models };
      }
      return { plan: buildPlan(concept, CS.CLARITY), models: [] };

    case CS.MASTERED:
    case CS.GETTING_EXAM_READY:
      return { plan: buildPlan(concept, CS.MASTERED), models: [] };

    case CS.EXAM_READY:
      return { plan: buildPlan(concept, state), models: [] };

    case CS.LEARN_PRE_REQ_BEFORE:
      throw new Error(`buildConceptPlan: '${CS.LEARN_PRE_REQ_BEFORE}' is an internal holding state — it has no plan`);

    default:
      throw new Error(`buildConceptPlan: unknown state "${state}" for concept "${concept.id}"`);
  }
}
