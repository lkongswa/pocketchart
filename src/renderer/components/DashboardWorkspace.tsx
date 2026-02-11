import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  StickyNote,
  ListTodo,
  Search,
  Plus,
  X,
  Check,
  GripVertical,
} from 'lucide-react';
import type { DashboardNote, DashboardTodo } from '../../shared/types';

// ── Scratchpad Panel ──

function ScratchpadPanel({ searchQuery }: { searchQuery: string }) {
  const [content, setContent] = useState('');
  const [saved, setSaved] = useState(true);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadedRef = useRef(false);

  // Load on mount
  useEffect(() => {
    window.api.scratchpad.get().then((note: DashboardNote | null) => {
      if (note) setContent(note.content);
      loadedRef.current = true;
    });
  }, []);

  // Debounced auto-save
  const save = useCallback((text: string) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setSaved(false);
    timerRef.current = setTimeout(() => {
      window.api.scratchpad.save(text).then(() => setSaved(true));
    }, 500);
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setContent(val);
    if (loadedRef.current) save(val);
  };

  const hasMatch = searchQuery && content.toLowerCase().includes(searchQuery.toLowerCase());

  return (
    <div className="card flex flex-col h-full">
      <div className="flex items-center gap-2 px-5 py-4 border-b border-[var(--color-border)]">
        <StickyNote size={18} className="text-teal-500" />
        <h2 className="section-title mb-0 flex-1">Scratchpad</h2>
        <span
          className={`text-[10px] font-medium transition-opacity duration-300 ${
            saved ? 'text-emerald-500 opacity-100' : 'text-amber-500 opacity-100'
          }`}
        >
          {saved ? 'Saved' : 'Saving...'}
        </span>
      </div>
      <div className="flex-1 p-4 flex flex-col gap-2">
        {hasMatch && (
          <div className="px-3 py-1.5 rounded bg-amber-50 border border-amber-200 text-xs text-amber-700">
            Scratchpad contains "<span className="font-semibold">{searchQuery}</span>"
          </div>
        )}
        <textarea
          className="flex-1 w-full resize-none bg-transparent text-sm text-[var(--color-text)] placeholder:text-[var(--color-text-secondary)] outline-none"
          placeholder="Quick notes, reminders, admin tasks..."
          value={content}
          onChange={handleChange}
          style={{ minHeight: '200px' }}
        />
      </div>
    </div>
  );
}

// ── Todo Panel ──

function TodoPanel({ searchQuery }: { searchQuery: string }) {
  const [todos, setTodos] = useState<DashboardTodo[]>([]);
  const [newText, setNewText] = useState('');
  const [dragId, setDragId] = useState<number | null>(null);

  const loadTodos = useCallback(() => {
    window.api.dashboardTodos.list().then(setTodos);
  }, []);

  useEffect(() => { loadTodos(); }, [loadTodos]);

  const addTodo = async () => {
    const text = newText.trim();
    if (!text) return;
    await window.api.dashboardTodos.create(text);
    setNewText('');
    loadTodos();
  };

  const toggleComplete = async (todo: DashboardTodo) => {
    await window.api.dashboardTodos.update(todo.id, { completed: todo.completed ? 0 : 1 });
    loadTodos();
  };

  const deleteTodo = async (id: number) => {
    await window.api.dashboardTodos.delete(id);
    loadTodos();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') { e.preventDefault(); addTodo(); }
  };

  // Drag & drop reorder
  const handleDragStart = (e: React.DragEvent, id: number) => {
    setDragId(id);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = async (e: React.DragEvent, targetId: number) => {
    e.preventDefault();
    if (dragId === null || dragId === targetId) return;
    // Swap positions
    const items = [...todos];
    const fromIdx = items.findIndex((t) => t.id === dragId);
    const toIdx = items.findIndex((t) => t.id === targetId);
    if (fromIdx === -1 || toIdx === -1) return;
    const [moved] = items.splice(fromIdx, 1);
    items.splice(toIdx, 0, moved);
    const reorderPayload = items.map((t, i) => ({ id: t.id, position: i }));
    await window.api.dashboardTodos.reorder(reorderPayload);
    setDragId(null);
    loadTodos();
  };

  // Filter by search
  const filtered = searchQuery
    ? todos.filter((t) => t.text.toLowerCase().includes(searchQuery.toLowerCase()))
    : todos;

  const highlightMatch = (text: string) => {
    if (!searchQuery) return text;
    const idx = text.toLowerCase().indexOf(searchQuery.toLowerCase());
    if (idx === -1) return text;
    return (
      <>
        {text.slice(0, idx)}
        <mark className="bg-amber-200 rounded px-0.5">{text.slice(idx, idx + searchQuery.length)}</mark>
        {text.slice(idx + searchQuery.length)}
      </>
    );
  };

  return (
    <div className="card flex flex-col h-full">
      <div className="flex items-center gap-2 px-5 py-4 border-b border-[var(--color-border)]">
        <ListTodo size={18} className="text-teal-500" />
        <h2 className="section-title mb-0 flex-1">Tasks</h2>
        <span className="text-[10px] text-[var(--color-text-secondary)]">
          {todos.filter((t) => !t.completed).length} remaining
        </span>
      </div>
      <div className="flex-1 p-4 flex flex-col gap-2 overflow-hidden">
        {/* Add input */}
        <div className="flex items-center gap-2">
          <input
            type="text"
            className="input flex-1 text-sm"
            placeholder="Add a task..."
            value={newText}
            onChange={(e) => setNewText(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          <button
            type="button"
            className="btn-primary px-2 py-1.5 text-xs"
            onClick={addTodo}
            disabled={!newText.trim()}
          >
            <Plus size={14} />
          </button>
        </div>

        {/* Todo list */}
        <div className="flex-1 overflow-y-auto space-y-0.5 mt-1" style={{ minHeight: '160px' }}>
          {filtered.length === 0 && (
            <div className="text-center text-[var(--color-text-secondary)] text-sm py-8">
              {searchQuery ? 'No matching tasks.' : 'No tasks yet. Add one above!'}
            </div>
          )}
          {filtered.map((todo) => (
            <div
              key={todo.id}
              className={`group flex items-center gap-2 px-2 py-1.5 rounded hover:bg-gray-50 transition-colors ${
                dragId === todo.id ? 'opacity-50' : ''
              }`}
              draggable
              onDragStart={(e) => handleDragStart(e, todo.id)}
              onDragOver={handleDragOver}
              onDrop={(e) => handleDrop(e, todo.id)}
            >
              {/* Drag handle */}
              <GripVertical
                size={12}
                className="shrink-0 text-[var(--color-text-secondary)] opacity-0 group-hover:opacity-60 cursor-grab"
              />
              {/* Checkbox */}
              <button
                type="button"
                className={`shrink-0 w-4 h-4 rounded border flex items-center justify-center transition-colors ${
                  todo.completed
                    ? 'bg-emerald-500 border-emerald-500 text-white'
                    : 'border-gray-300 hover:border-teal-400'
                }`}
                onClick={() => toggleComplete(todo)}
              >
                {todo.completed ? <Check size={10} /> : null}
              </button>
              {/* Text */}
              <span
                className={`flex-1 text-sm leading-tight ${
                  todo.completed
                    ? 'line-through text-[var(--color-text-secondary)]'
                    : 'text-[var(--color-text)]'
                }`}
              >
                {highlightMatch(todo.text)}
              </span>
              {/* Delete */}
              <button
                type="button"
                className="shrink-0 opacity-0 group-hover:opacity-100 text-[var(--color-text-secondary)] hover:text-red-500 transition-all"
                onClick={() => deleteTodo(todo.id)}
              >
                <X size={14} />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Main Workspace ──

export default function DashboardWorkspace() {
  const [searchQuery, setSearchQuery] = useState('');

  return (
    <div className="mt-6">
      {/* Search bar */}
      <div className="relative mb-4">
        <Search
          size={16}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-secondary)]"
        />
        <input
          type="text"
          className="input w-full pl-9 text-sm"
          placeholder="Search scratchpad & tasks..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
        {searchQuery && (
          <button
            type="button"
            className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--color-text-secondary)] hover:text-[var(--color-text)]"
            onClick={() => setSearchQuery('')}
          >
            <X size={14} />
          </button>
        )}
      </div>

      {/* Two-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ScratchpadPanel searchQuery={searchQuery} />
        <TodoPanel searchQuery={searchQuery} />
      </div>
    </div>
  );
}
