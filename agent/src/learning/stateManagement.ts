/**
 * Plan selection — single source of truth for building a concept plan.
 *
 * Delegates to plan-builder (v1 JSON) or plan-builder-v2 (markdown probe)
 * depending on the state and available content. Unimplemented states throw
 * explicitly so missing workflows are caught early.
 *
 * Used by: context.ts, tools/state.ts, tools/redirect.ts
 */

import type { ConceptState, Concept, PlanStep } from '../types.js';
import { buildPlan }                            from './plan-builder.js';
import { hasProbePlan, loadProbePlan }          from './plan-builder-v2.js';

export function buildConceptPlan(concept: Concept, state: ConceptState): PlanStep[] {
  switch (state) {
    case 'not_assessed':
      return hasProbePlan(concept.id) ? loadProbePlan(concept.id) : buildPlan(concept, state);

    case 'learning':
      return buildPlan(concept, state);

    case 'clarity':
      throw new Error(`buildConceptPlan: 'clarity' plan builder not yet implemented for concept "${concept.id}"`);

    case 'mastered':
      throw new Error(`buildConceptPlan: 'mastered' plan builder not yet implemented for concept "${concept.id}"`);

    case 'exam_ready':
      throw new Error(`buildConceptPlan: 'exam_ready' plan builder not yet implemented for concept "${concept.id}"`);

    case 'learn-pre-req-before':
      throw new Error(`buildConceptPlan: 'learn-pre-req-before' is an internal holding state — it has no plan`);

    default:
      throw new Error(`buildConceptPlan: unknown state "${state}" for concept "${concept.id}"`);
  }
}
