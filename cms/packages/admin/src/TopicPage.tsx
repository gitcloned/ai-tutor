import { useEffect, useState } from 'react';
import { useParams, NavLink } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from './api';
import type { Topic } from './types';
import { PracticeResourceCard } from './PracticeResourceCard';

interface FormValues {
  title: string;
  description: string;
  order: string;
}

export default function TopicPage() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  const { data: topic, isLoading, error } = useQuery({
    queryKey: ['topic', id],
    queryFn: () => api.getTopic(id!),
    enabled: !!id,
  });

  // Sidebar already fetched hierarchy, get concepts from there
  const hierarchy = qc.getQueryData<any[]>(['hierarchy']);
  const topicConcepts = hierarchy
    ?.flatMap((s: any) => s.units.flatMap((u: any) => u.topics))
    ?.find((t: any) => t.id === id)?.concepts ?? [];

  const mutation = useMutation({
    mutationFn: (body: Partial<Topic>) => api.patchTopic(id!, body),
    onSuccess: updated => {
      qc.setQueryData(['topic', id], updated);
      setSaveMsg('Saved');
      setTimeout(() => setSaveMsg(null), 2000);
    },
    onError: (e: Error) => setSaveMsg(`Error: ${e.message}`),
  });

  const { register, reset, handleSubmit } = useForm<FormValues>({
    defaultValues: { title: '', description: '', order: '1' },
  });

  useEffect(() => {
    if (topic) reset({
      title:       topic.title ?? '',
      description: topic.description ?? '',
      order:       String(topic.order ?? 1),
    });
  }, [topic, reset]);

  if (isLoading) return <div className="p-8 text-gray-400">Loading...</div>;
  if (error)     return <div className="p-8 text-red-500">Error loading topic</div>;
  if (!topic)    return null;

  const onSubmit = (v: FormValues) =>
    mutation.mutate({ title: v.title, description: v.description || null, order: parseInt(v.order) || 1 });

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="max-w-3xl mx-auto px-6 py-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="text-xs text-gray-400 mb-0.5 font-mono">{topic.id}</div>
          <h1 className="text-lg font-bold text-gray-800">{topic.title}</h1>
          <div className="text-xs text-gray-400 mt-0.5">Topic · source: {topic.source}</div>
        </div>
        <div className="flex items-center gap-3">
          {saveMsg && (
            <span className={`text-xs px-2 py-1 rounded ${saveMsg.startsWith('Error') ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-600'}`}>
              {saveMsg}
            </span>
          )}
          <button
            type="submit"
            disabled={mutation.isPending}
            className="px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-md hover:bg-blue-700 disabled:opacity-50"
          >
            {mutation.isPending ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>

      {/* Fields */}
      <div className="border border-gray-200 rounded-lg overflow-hidden mb-4">
        <div className="px-4 py-2.5 bg-gray-50 font-semibold text-gray-700 text-sm">Details</div>
        <div className="p-4 space-y-4 bg-white">
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Title</label>
            <input {...register('title')} className="w-full px-3 py-1.5 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-blue-400" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Description</label>
            <textarea {...register('description')} rows={3}
              className="w-full px-3 py-1.5 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-blue-400" />
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Order</label>
              <input {...register('order')} type="number" min={1}
                className="w-full px-3 py-1.5 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-blue-400" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">kaSlug</label>
              <input value={topic.kaSlug ?? ''} readOnly
                className="w-full px-3 py-1.5 border border-gray-200 rounded-md text-sm bg-gray-50 text-gray-400" />
            </div>
          </div>
        </div>
      </div>

      {/* Practice Tests — topic-level pool; assign to specific concepts via their Mastery Questions field */}
      <div className="border border-gray-200 rounded-lg overflow-hidden mb-4">
        <div className="px-4 py-2.5 bg-gray-50 font-semibold text-gray-700 text-sm flex items-center justify-between">
          <span>Topic Practice Tests ({topic.practiceTests?.length ?? 0})</span>
          <span className="text-xs font-normal text-gray-400">Assign to specific concepts via the concept's Mastery Questions field</span>
        </div>
        <div className="p-4 bg-white space-y-2">
          {topic.practiceTests?.length
            ? topic.practiceTests.map((id: string) => (
                <PracticeResourceCard key={id} resourceId={id} />
              ))
            : <span className="text-xs text-gray-400">None</span>
          }
        </div>
      </div>

      {/* Concepts list */}
      <div className="border border-gray-200 rounded-lg overflow-hidden mb-4">
        <div className="px-4 py-2.5 bg-gray-50 font-semibold text-gray-700 text-sm">
          Concepts ({topicConcepts.length})
        </div>
        <div className="divide-y divide-gray-100">
          {topicConcepts.map((c: any) => (
            <NavLink
              key={c.id}
              to={`/concepts/${c.id}`}
              className="flex items-center px-4 py-2 hover:bg-blue-50 hover:text-blue-700 text-sm text-gray-700"
            >
              <span className="text-gray-400 text-xs mr-3 w-4">{c.order ?? '—'}</span>
              <span>{c.title}</span>
              <div className="ml-auto flex gap-1">
                {(c.supportedPhases ?? []).map((p: string) => (
                  <span key={p} className="text-xs px-1.5 py-0.5 bg-blue-50 text-blue-600 rounded border border-blue-100">{p}</span>
                ))}
              </div>
              <svg className="w-4 h-4 text-gray-300 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </NavLink>
          ))}
        </div>
      </div>
    </form>
  );
}
