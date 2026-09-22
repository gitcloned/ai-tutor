import { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from './api';
import type { StrandNode, UnitNode, TopicStub } from './types';

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg className={`w-3 h-3 transition-transform ${open ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
    </svg>
  );
}

function TopicTree({ topic, depth }: { topic: TopicStub; depth: number }) {
  const [open, setOpen] = useState(true);
  const pl = `pl-${4 + depth * 3}`;
  return (
    <div>
      <div
        className={`flex items-center gap-1 py-1 px-2 ${pl} cursor-pointer hover:bg-gray-100 text-gray-600 font-medium`}
        onClick={() => setOpen(v => !v)}
      >
        <ChevronIcon open={open} />
        <NavLink
          to={`/topics/${topic.id}`}
          onClick={e => e.stopPropagation()}
          className={({ isActive }) =>
            `flex-1 truncate hover:text-blue-600 ${isActive ? 'text-blue-600' : ''}`
          }
        >
          {topic.title}
        </NavLink>
        <span className="text-xs text-gray-400 ml-auto">{topic.concepts.length}</span>
      </div>
      {open && (
        <div>
          {topic.concepts.map(c => (
            <NavLink
              key={c.id}
              to={`/concepts/${c.id}`}
              className={({ isActive }) =>
                `block py-0.5 px-2 pl-12 truncate hover:bg-blue-50 hover:text-blue-700 ${
                  isActive ? 'bg-blue-50 text-blue-700 font-medium border-r-2 border-blue-500' : 'text-gray-600'
                }`
              }
            >
              {c.title}
            </NavLink>
          ))}
        </div>
      )}
    </div>
  );
}

function UnitTree({ unit }: { unit: UnitNode }) {
  const [open, setOpen] = useState(true);
  return (
    <div>
      <div
        className="flex items-center gap-1 py-1 px-2 pl-4 cursor-pointer hover:bg-gray-100 text-gray-700 font-semibold text-xs uppercase tracking-wide"
        onClick={() => setOpen(v => !v)}
      >
        <ChevronIcon open={open} />
        <span className="truncate">{unit.title}</span>
      </div>
      {open && unit.topics.map(t => (
        <TopicTree key={t.id} topic={t} depth={1} />
      ))}
    </div>
  );
}

function StrandTree({ strand }: { strand: StrandNode }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="mb-2">
      <div
        className="flex items-center gap-1 py-1.5 px-2 cursor-pointer bg-gray-100 hover:bg-gray-200 text-gray-800 font-bold text-xs uppercase tracking-wider"
        onClick={() => setOpen(v => !v)}
      >
        <ChevronIcon open={open} />
        <span className="truncate">{strand.title}</span>
      </div>
      {open && strand.units.map(u => <UnitTree key={u.id} unit={u} />)}
    </div>
  );
}

export default function Sidebar() {
  const [q, setQ] = useState('');
  const navigate = useNavigate();
  const { data, isLoading, error } = useQuery({
    queryKey: ['hierarchy'],
    queryFn: api.hierarchy,
  });

  // Quick-search all concepts across hierarchy
  const allConcepts = data?.flatMap(s => s.units.flatMap(u => u.topics.flatMap(t => t.concepts))) ?? [];
  const filtered = q.trim()
    ? allConcepts.filter(c => c.title.toLowerCase().includes(q.toLowerCase()))
    : null;

  return (
    <aside className="w-72 border-r border-gray-200 bg-white flex flex-col h-screen shrink-0">
      <div className="px-3 py-3 border-b border-gray-200 shrink-0">
        <div className="text-xs font-bold text-blue-600 uppercase tracking-widest mb-2">Prodigy CMS</div>
        <input
          type="search"
          placeholder="Search concepts..."
          value={q}
          onChange={e => setQ(e.target.value)}
          className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-400 bg-gray-50"
        />
      </div>
      <nav className="flex-1 overflow-y-auto py-1 text-xs">
        {isLoading && <div className="px-4 py-3 text-gray-400">Loading...</div>}
        {error    && <div className="px-4 py-3 text-red-500">Error loading hierarchy</div>}

        {filtered ? (
          <div>
            {filtered.length === 0
              ? <div className="px-4 py-3 text-gray-400">No results</div>
              : filtered.map(c => (
                  <button
                    key={c.id}
                    onClick={() => { setQ(''); navigate(`/concepts/${c.id}`); }}
                    className="block w-full text-left px-4 py-1.5 hover:bg-blue-50 hover:text-blue-700 truncate text-gray-700"
                  >
                    {c.title}
                  </button>
                ))
            }
          </div>
        ) : (
          data?.map(s => <StrandTree key={s.id} strand={s} />)
        )}
      </nav>
    </aside>
  );
}
