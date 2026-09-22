import { useEffect, useState } from 'react';
import { useParams, NavLink } from 'react-router-dom';
import { useForm, useFieldArray, Controller } from 'react-hook-form';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Select from 'react-select';
import { api } from './api';
import type { Concept, Resource } from './types';
import { PracticeResourceCard } from './PracticeResourceCard';

// ── Utility UI ────────────────────────────────────────────────────────────────

function Label({ children }: { children: React.ReactNode }) {
  return <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">{children}</label>;
}

function Badge({ children, color = 'gray' }: { children: React.ReactNode; color?: string }) {
  const cls: Record<string, string> = {
    gray:   'bg-gray-100 text-gray-600 border-gray-200',
    blue:   'bg-blue-50  text-blue-700  border-blue-100',
    green:  'bg-green-50 text-green-700 border-green-100',
    purple: 'bg-purple-50 text-purple-700 border-purple-100',
    amber:  'bg-amber-50  text-amber-700  border-amber-100',
  };
  return (
    <span className={`inline-block px-1.5 py-0.5 text-xs rounded border ${cls[color] ?? cls.gray}`}>
      {children}
    </span>
  );
}

function Section({ title, children, defaultOpen = true }: {
  title: string; children: React.ReactNode; defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden mb-4">
      <button type="button" onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-4 py-2.5 bg-gray-50 hover:bg-gray-100 text-left"
      >
        <span className="font-semibold text-gray-700 text-sm">{title}</span>
        <svg className={`w-4 h-4 text-gray-400 transition-transform ${open ? '' : '-rotate-90'}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && <div className="p-4 space-y-4 bg-white">{children}</div>}
    </div>
  );
}

// ── Video card ─────────────────────────────────────────────────────────────────

function extractYtId(r: Resource): string | null {
  if (r.youtubeId) return r.youtubeId;
  try { return new URL(r.youtubeUrl!).searchParams.get('v'); } catch { return null; }
}

function VideoCard({ resource }: { resource: Resource }) {
  const [expanded, setExpanded] = useState(false);
  const ytId  = extractYtId(resource);
  const thumb = ytId ? `https://img.youtube.com/vi/${ytId}/mqdefault.jpg` : null;
  const ytUrl = resource.youtubeUrl ?? (ytId ? `https://www.youtube.com/watch?v=${ytId}` : resource.url);
  const mins = resource.duration ? `${Math.floor(resource.duration / 60)}:${String(resource.duration % 60).padStart(2, '0')}` : null;
  const embedId = ytId;

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      <div className="flex items-center gap-3 p-2">
        {thumb ? (
          <button type="button" onClick={() => setExpanded(v => !v)} className="shrink-0">
            <img src={thumb} alt="" className="w-24 h-14 object-cover rounded border border-gray-200" />
          </button>
        ) : (
          <div className="w-24 h-14 bg-gray-100 rounded flex items-center justify-center shrink-0">
            <span className="text-xs text-gray-400">no thumb</span>
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="font-medium text-sm text-gray-800 truncate">{resource.title}</div>
          <div className="flex items-center gap-2 mt-0.5">
            <Badge color="blue">video</Badge>
            {mins && <span className="text-xs text-gray-400">{mins}</span>}
            <span className="text-xs text-gray-400 font-mono truncate">{resource.id}</span>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {ytUrl && (
            <a href={ytUrl} target="_blank" rel="noreferrer"
              className="text-xs px-2 py-1 bg-red-50 text-red-600 border border-red-200 rounded hover:bg-red-100 flex items-center gap-1"
            >
              <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor">
                <path d="M23.5 6.2a3 3 0 0 0-2.1-2.1C19.6 3.6 12 3.6 12 3.6s-7.6 0-9.4.5A3 3 0 0 0 .5 6.2 31.4 31.4 0 0 0 0 12a31.4 31.4 0 0 0 .5 5.8 3 3 0 0 0 2.1 2.1C4.4 20.4 12 20.4 12 20.4s7.6 0 9.4-.5a3 3 0 0 0 2.1-2.1A31.4 31.4 0 0 0 24 12a31.4 31.4 0 0 0-.5-5.8zM9.6 15.6V8.4l6.3 3.6-6.3 3.6z"/>
              </svg>
              Watch
            </a>
          )}
          {embedId && (
            <button type="button" onClick={() => setExpanded(v => !v)}
              className="text-xs px-2 py-1 bg-gray-50 text-gray-600 border border-gray-200 rounded hover:bg-gray-100"
            >
              {expanded ? 'Hide' : 'Embed'}
            </button>
          )}
        </div>
      </div>
      {expanded && embedId && (
        <div className="px-2 pb-2">
          <iframe
            src={`https://www.youtube-nocookie.com/embed/${embedId}`}
            className="w-full rounded border border-gray-200"
            style={{ height: 315 }}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        </div>
      )}
    </div>
  );
}


// ── Resolved resource in lesson plan step ────────────────────────────────────

function LessonResource({ id, allResources }: { id: string; allResources: { id: string; title: string; type: string }[] }) {
  const stub = allResources.find(r => r.id === id);
  const needFull = stub?.type === 'teaching-video' || !stub;
  const { data: full } = useQuery({
    queryKey: ['resource', id],
    queryFn: () => api.getResource(id),
    enabled: needFull,
  });
  const res = (needFull ? full : stub) as Resource | undefined;
  if (!res) return <div className="text-xs text-gray-400 font-mono">{id}</div>;
  if (res.type === 'teaching-video' || full?.youtubeId) {
    return <VideoCard resource={{ ...stub, ...full } as Resource} />;
  }
  return (
    <div className="flex items-center gap-2 px-3 py-2 border border-gray-200 rounded-lg text-sm">
      <Badge color="amber">{res.type}</Badge>
      <span className="font-medium text-gray-800">{res.title}</span>
      {res.url && (
        <a href={res.url} target="_blank" rel="noreferrer"
          className="ml-auto text-xs text-blue-600 hover:underline">Open ↗</a>
      )}
    </div>
  );
}

// ── Lesson plan step editor ───────────────────────────────────────────────────

const STEP_TYPE_OPTS = [
  { value: 'ido', label: 'I Do' },
  { value: 'wedo', label: 'We Do' },
  { value: 'youdo', label: 'You Do' },
];

function LessonStepEditor({ index, control, register, remove, resourceOpts, allResources, watchResources }: {
  index: number; control: any; register: any; remove: (i: number) => void;
  resourceOpts: { value: string; label: string }[];
  allResources: { id: string; title: string; type: string }[];
  watchResources: string[];
}) {
  return (
    <div className="border border-gray-200 rounded-md p-3 space-y-3 bg-gray-50">
      <div className="flex items-center gap-2">
        <span className="text-xs font-bold text-gray-400 w-5">{index + 1}</span>
        <div className="w-36">
          <Controller name={`lessonPlan.${index}.type`} control={control} render={({ field }) => (
            <Select classNamePrefix="rs" options={STEP_TYPE_OPTS}
              value={STEP_TYPE_OPTS.find(o => o.value === field.value)}
              onChange={opt => field.onChange(opt?.value)}
              menuPortalTarget={document.body} styles={{ menuPortal: b => ({ ...b, zIndex: 9999 }) }} />
          )} />
        </div>
        <button type="button" onClick={() => remove(index)}
          className="ml-auto text-xs text-red-400 hover:text-red-600 px-2 py-1 rounded hover:bg-red-50">
          Remove
        </button>
      </div>
      <textarea {...register(`lessonPlan.${index}.instruction`)} placeholder="Instruction (optional)" rows={2}
        className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-400" />
      <div>
        <Label>Resources</Label>
        <Controller name={`lessonPlan.${index}.resources`} control={control} render={({ field }) => (
          <Select classNamePrefix="rs" isMulti options={resourceOpts}
            value={field.value.map((id: string) => resourceOpts.find(o => o.value === id) ?? { value: id, label: id })}
            onChange={opts => field.onChange(opts.map((o: any) => o.value))}
            placeholder="Select resources..."
            menuPortalTarget={document.body} styles={{ menuPortal: b => ({ ...b, zIndex: 9999 }) }} />
        )} />
        {/* Preview resolved resources */}
        {watchResources.length > 0 && (
          <div className="mt-2 space-y-2">
            {watchResources.map(id => (
              <LessonResource key={id} id={id} allResources={allResources} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Concept navigation pill ───────────────────────────────────────────────────

function ConceptNavPills({ ids, allConcepts }: {
  ids: string[]; allConcepts: { id: string; title: string }[];
}) {
  if (!ids.length) return null;
  return (
    <div className="flex flex-wrap gap-1.5 mt-2">
      {ids.map(id => {
        const c = allConcepts.find(c => c.id === id);
        return (
          <NavLink key={id} to={`/concepts/${id}`}
            className="inline-flex items-center gap-1 px-2 py-1 bg-blue-50 text-blue-700 border border-blue-200 rounded-full text-xs hover:bg-blue-100 font-medium"
          >
            {c?.title ?? id}
            <svg className="w-3 h-3 opacity-60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </NavLink>
        );
      })}
    </div>
  );
}

// ── Form types ────────────────────────────────────────────────────────────────

interface FormValues {
  title: string;
  order: string;
  conceptWeightage: string;
  supportedPhases: string[];
  prerequisites: string[];
  nextConcepts: string[];
  masteryQuestions: string[];
  lessonPlan: Array<{ type: 'ido' | 'wedo' | 'youdo'; instruction: string; resources: string[] }>;
  misconceptions: Array<{ text: string; prereqConcept: string }>;
  probingTreeJson: string;
}

const ALL_PHASES = ['learn', 'master', 'exam_readiness'];

function conceptToForm(c: Concept): FormValues {
  return {
    title:            c.title ?? '',
    order:            String(c.order ?? 1),
    conceptWeightage: c.conceptWeightage != null ? String(c.conceptWeightage) : '',
    supportedPhases:  c.supportedPhases ?? [],
    prerequisites:    c.prerequisites ?? [],
    nextConcepts:     c.nextConcepts ?? [],
    masteryQuestions: c.masteryQuestions ?? [],
    lessonPlan: (c.lessonPlan ?? []).map(s => ({
      type:        s.type,
      instruction: s.instruction ?? '',
      resources:   s.resources ?? [],
    })),
    misconceptions: (c.misconceptions ?? []).map(m => ({
      text:          m.text ?? '',
      prereqConcept: String(m.prereqConcept ?? ''),
    })),
    probingTreeJson: c.probingTree != null ? JSON.stringify(c.probingTree, null, 2) : '',
  };
}

function formToConcept(v: FormValues): Partial<Concept> {
  let probingTree: unknown = null;
  if (v.probingTreeJson.trim()) {
    try { probingTree = JSON.parse(v.probingTreeJson); } catch { /* keep null */ }
  }
  return {
    title:            v.title,
    order:            parseInt(v.order) || 1,
    conceptWeightage: v.conceptWeightage.trim() ? parseFloat(v.conceptWeightage) : null,
    supportedPhases:  v.supportedPhases,
    prerequisites:    v.prerequisites,
    nextConcepts:     v.nextConcepts,
    masteryQuestions: v.masteryQuestions,
    lessonPlan:       v.lessonPlan.map(s => ({
      type: s.type, instruction: s.instruction || null,
      resources: s.resources, learningIndicator: null,
    })),
    misconceptions: v.misconceptions
      .filter(m => m.text.trim())
      .map(m => ({ text: m.text, prereqConcept: m.prereqConcept || null })),
    probingTree,
  };
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function ConceptPage() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  const { data: concept, isLoading, error } = useQuery({
    queryKey: ['concept', id],
    queryFn: () => api.getConcept(id!),
    enabled: !!id,
  });

  const { data: allConcepts = [] } = useQuery({
    queryKey: ['concepts-all'],
    queryFn: () => api.conceptsAll(),
  });

  const { data: allResources = [] } = useQuery({
    queryKey: ['resources-all'],
    queryFn: () => api.resourcesAll(),
  });

  // Fetch the topic this concept belongs to (for practiceTests)
  const topicId = (concept as any)?.topic as string | undefined;
  const { data: topic } = useQuery({
    queryKey: ['topic', topicId],
    queryFn: () => api.getTopic(topicId!),
    enabled: !!topicId,
  });

  const mutation = useMutation({
    mutationFn: (body: Partial<Concept>) => api.patchConcept(id!, body),
    onSuccess: updated => {
      qc.setQueryData(['concept', id], updated);
      setSaveMsg('Saved');
      setTimeout(() => setSaveMsg(null), 2000);
    },
    onError: (e: Error) => setSaveMsg(`Error: ${e.message}`),
  });

  const conceptOpts = allConcepts
    .filter(c => c.id !== id)
    .map(c => ({ value: c.id, label: c.title }));

  const resourceOpts = allResources.map(r => ({
    value: r.id,
    label: `${r.title} (${r.type})`,
  }));

  const { control, register, reset, handleSubmit, watch } = useForm<FormValues>({
    defaultValues: conceptToForm({
      id: '', title: '', order: 1, supportedPhases: [], prerequisites: [], nextConcepts: [],
      boards: [], classApplicableTo: [], lessonPlan: [], misconceptions: [], masteryQuestions: [],
      probingTree: null, examQuestions: [],
    }),
  });

  const lpArray   = useFieldArray({ control, name: 'lessonPlan' });
  const miscArray = useFieldArray({ control, name: 'misconceptions' });

  useEffect(() => { if (concept) reset(conceptToForm(concept)); }, [concept, reset]);

  if (isLoading) return <div className="p-8 text-gray-400">Loading...</div>;
  if (error)     return <div className="p-8 text-red-500">Error loading concept</div>;
  if (!concept)  return null;

  const watchedNextConcepts = watch('nextConcepts');
  const watchedPrereqs      = watch('prerequisites');

  return (
    <form onSubmit={handleSubmit(v => mutation.mutate(formToConcept(v)))} className="max-w-3xl mx-auto px-6 py-6">

      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <div className="flex items-center gap-2 text-xs text-gray-400 mb-1">
            {topic && (
              <NavLink to={`/topics/${topicId}`} className="hover:text-blue-600 hover:underline">
                {topic.title}
              </NavLink>
            )}
            {topic && <span>/</span>}
            <span className="font-mono">{concept.id}</span>
          </div>
          <h1 className="text-lg font-bold text-gray-800">{concept.title}</h1>
          <div className="flex gap-1.5 mt-1">
            {(concept.supportedPhases ?? []).map(p => (
              <Badge key={p} color={p === 'master' ? 'purple' : p === 'exam_readiness' ? 'amber' : 'blue'}>
                {p}
              </Badge>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {saveMsg && (
            <span className={`text-xs px-2 py-1 rounded ${saveMsg.startsWith('Error') ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-600'}`}>
              {saveMsg}
            </span>
          )}
          <button type="submit" disabled={mutation.isPending}
            className="px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-md hover:bg-blue-700 disabled:opacity-50"
          >
            {mutation.isPending ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>

      {/* Identity */}
      <Section title="Identity">
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <Label>Title</Label>
            <input {...register('title')}
              className="w-full px-3 py-1.5 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-blue-400" />
          </div>
          <div>
            <Label>kaSlug</Label>
            <input value={concept.kaSlug ?? ''} readOnly
              className="w-full px-3 py-1.5 border border-gray-200 rounded-md text-sm bg-gray-50 text-gray-400" />
          </div>
          <div>
            <Label>Source</Label>
            <input value={concept.source ?? ''} readOnly
              className="w-full px-3 py-1.5 border border-gray-200 rounded-md text-sm bg-gray-50 text-gray-400" />
          </div>
          <div>
            <Label>Order</Label>
            <input {...register('order')} type="number" min={1}
              className="w-full px-3 py-1.5 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-blue-400" />
          </div>
          <div>
            <Label>Concept Weightage</Label>
            <input {...register('conceptWeightage')} type="number" step="0.01" placeholder="null"
              className="w-full px-3 py-1.5 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-blue-400" />
          </div>
        </div>
      </Section>

      {/* Supported Phases */}
      <Section title="Supported Phases">
        <div className="flex gap-6">
          {ALL_PHASES.map(phase => (
            <Controller key={phase} name="supportedPhases" control={control} render={({ field }) => (
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input type="checkbox"
                  checked={field.value.includes(phase)}
                  onChange={e => {
                    const next = e.target.checked
                      ? [...field.value, phase]
                      : field.value.filter((p: string) => p !== phase);
                    field.onChange(next);
                  }}
                  className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-400" />
                <span className="text-sm capitalize text-gray-700">{phase.replace('_', ' ')}</span>
              </label>
            )} />
          ))}
        </div>
      </Section>

      {/* Graph */}
      <Section title="Concept Graph">
        <div>
          <Label>Prerequisites</Label>
          <Controller name="prerequisites" control={control} render={({ field }) => (
            <Select classNamePrefix="rs" isMulti options={conceptOpts}
              value={field.value.map((id: string) => conceptOpts.find(o => o.value === id) ?? { value: id, label: id })}
              onChange={opts => field.onChange(opts.map((o: any) => o.value))}
              placeholder="Select prerequisite concepts…" noOptionsMessage={() => 'No concepts found'} />
          )} />
          <ConceptNavPills ids={watchedPrereqs} allConcepts={allConcepts} />
        </div>
        <div>
          <Label>Next Concepts</Label>
          <Controller name="nextConcepts" control={control} render={({ field }) => (
            <Select classNamePrefix="rs" isMulti options={conceptOpts}
              value={field.value.map((id: string) => conceptOpts.find(o => o.value === id) ?? { value: id, label: id })}
              onChange={opts => field.onChange(opts.map((o: any) => o.value))}
              placeholder="Select next concepts…" noOptionsMessage={() => 'No concepts found'} />
          )} />
          <ConceptNavPills ids={watchedNextConcepts} allConcepts={allConcepts} />
        </div>
      </Section>

      {/* Lesson Plan */}
      <Section title={`Lesson Plan (${lpArray.fields.length} steps)`}>
        <div className="space-y-3">
          {lpArray.fields.map((field, i) => (
            <LessonStepEditor key={field.id} index={i} control={control} register={register}
              remove={lpArray.remove} resourceOpts={resourceOpts}
              allResources={allResources}
              watchResources={watch(`lessonPlan.${i}.resources`) ?? []}
            />
          ))}
          <button type="button"
            onClick={() => lpArray.append({ type: 'ido', instruction: '', resources: [] })}
            className="text-xs text-blue-600 hover:text-blue-800 border border-dashed border-blue-300 rounded-md px-3 py-1.5 w-full hover:bg-blue-50"
          >
            + Add Step
          </button>
        </div>
      </Section>

      {/* Practice / Mastery Questions — editable, concept-specific */}
      <Section title="Practice &amp; Mastery Questions">
        <div className="space-y-3">
          <div>
            <Label>Assigned practice tests (mastery questions)</Label>
            <Controller name="masteryQuestions" control={control} render={({ field }) => (
              <Select classNamePrefix="rs" isMulti
                options={allResources
                  .filter(r => r.type === 'practice-test')
                  .map(r => ({ value: r.id, label: r.title }))}
                value={field.value.map((id: string) => {
                  const r = allResources.find(r => r.id === id);
                  return { value: id, label: r?.title ?? id };
                })}
                onChange={opts => field.onChange(opts.map((o: any) => o.value))}
                placeholder="Assign practice tests to this concept…"
                noOptionsMessage={() => 'No practice-test resources found'}
              />
            )} />
            <p className="text-xs text-gray-400 mt-1">
              Only this concept's practice tests — not the topic's full list.
              Topic-level exercises are visible on the Topic page.
            </p>
          </div>
          {/* Preview / expand selected practice tests */}
          {watch('masteryQuestions').length > 0 && (
            <div className="space-y-2">
              {watch('masteryQuestions').map((ptId: string) => (
                <PracticeResourceCard key={ptId} resourceId={ptId} />
              ))}
            </div>
          )}
        </div>
      </Section>

      {/* Misconceptions */}
      <Section title={`Misconceptions (${miscArray.fields.length})`} defaultOpen={false}>
        <div className="space-y-2">
          {miscArray.fields.map((field, i) => (
            <div key={field.id} className="flex gap-2 items-start border border-gray-200 rounded-md p-2 bg-gray-50">
              <span className="text-xs text-gray-400 mt-1 w-4">{i + 1}</span>
              <div className="flex-1 space-y-1">
                <textarea {...register(`misconceptions.${i}.text`)} placeholder="Misconception text" rows={2}
                  className="w-full px-2 py-1 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-400" />
                <input {...register(`misconceptions.${i}.prereqConcept`)} placeholder="Prereq concept ID (optional)"
                  className="w-full px-2 py-1 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-400" />
              </div>
              <button type="button" onClick={() => miscArray.remove(i)} className="text-xs text-red-400 hover:text-red-600 mt-1">✕</button>
            </div>
          ))}
          <button type="button" onClick={() => miscArray.append({ text: '', prereqConcept: '' })}
            className="text-xs text-blue-600 hover:text-blue-800 border border-dashed border-blue-300 rounded-md px-3 py-1.5 w-full hover:bg-blue-50">
            + Add Misconception
          </button>
        </div>
      </Section>

      {/* Probing Tree */}
      <Section title="Probing Tree (JSON)" defaultOpen={false}>
        <textarea {...register('probingTreeJson')} rows={12} placeholder="null"
          className="w-full px-3 py-2 text-xs font-mono border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-400" />
        <p className="text-xs text-gray-400 mt-1">Invalid JSON will be saved as null.</p>
      </Section>
    </form>
  );
}
