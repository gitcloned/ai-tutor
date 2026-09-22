import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from './api';

function perseusText(content: unknown): string {
  try {
    const c = content as any;
    return c?.question?.content ?? c?.content ?? '';
  } catch { return ''; }
}

function QuestionRow({ id }: { id: string }) {
  const [open, setOpen] = useState(false);
  const { data: q, isLoading } = useQuery({
    queryKey: ['question', id],
    queryFn: () => api.getQuestion(id),
    enabled: open,
  });
  const text = q ? perseusText(q.perseusContent) : '';

  return (
    <div className="border border-gray-100 rounded">
      <button type="button" onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-gray-50 text-xs"
      >
        <svg className={`w-3 h-3 text-gray-400 transition-transform ${open ? 'rotate-90' : ''}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
        <span className="font-mono text-gray-500 truncate">{id}</span>
        {q?.difficultyLevel && (
          <span className="inline-block px-1.5 py-0.5 text-xs rounded border bg-gray-100 text-gray-600 border-gray-200">
            {q.difficultyLevel}
          </span>
        )}
      </button>
      {open && (
        <div className="px-3 pb-3 space-y-2">
          {isLoading && <div className="text-xs text-gray-400">Loading...</div>}
          {text && (
            <div className="text-xs text-gray-700 whitespace-pre-wrap bg-gray-50 rounded p-2 border border-gray-100">
              {text.length > 600 ? text.slice(0, 600) + '…' : text}
            </div>
          )}
          {q && (
            <details className="text-xs">
              <summary className="text-gray-400 cursor-pointer hover:text-gray-600">Raw JSON</summary>
              <pre className="mt-1 overflow-x-auto text-xs text-gray-500 bg-gray-50 p-2 rounded border border-gray-100 max-h-48">
                {JSON.stringify(q.perseusContent, null, 2)}
              </pre>
            </details>
          )}
        </div>
      )}
    </div>
  );
}

export function PracticeResourceCard({ resourceId }: { resourceId: string }) {
  const [open, setOpen] = useState(false);
  const { data: res } = useQuery({
    queryKey: ['resource', resourceId],
    queryFn: () => api.getResource(resourceId),
  });

  const qCount = res?.questions?.length ?? 0;

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      <button type="button" onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-3 px-3 py-2 hover:bg-gray-50 text-left"
      >
        <svg className={`w-4 h-4 text-gray-400 transition-transform shrink-0 ${open ? 'rotate-90' : ''}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
        <div className="flex-1 min-w-0">
          <div className="font-medium text-sm text-gray-800 truncate">{res?.title ?? resourceId}</div>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="inline-block px-1.5 py-0.5 text-xs rounded border bg-purple-50 text-purple-700 border-purple-100">
              practice-test
            </span>
            <span className="text-xs text-gray-400">{qCount} question{qCount !== 1 ? 's' : ''}</span>
            <span className="text-xs text-gray-300 font-mono truncate">{resourceId}</span>
          </div>
        </div>
        {res?.url && (
          <a href={res.url} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()}
            className="text-xs px-2 py-1 bg-gray-50 border border-gray-200 rounded hover:bg-gray-100 text-gray-600 shrink-0"
          >
            Open ↗
          </a>
        )}
      </button>
      {open && qCount > 0 && (
        <div className="px-3 pb-3 space-y-1.5 border-t border-gray-100">
          <div className="text-xs text-gray-400 pt-2 mb-1">Questions</div>
          {res!.questions!.map(qId => <QuestionRow key={qId} id={qId} />)}
        </div>
      )}
      {open && qCount === 0 && (
        <div className="px-3 pb-3 border-t border-gray-100 text-xs text-gray-400 pt-2">No questions loaded</div>
      )}
    </div>
  );
}
