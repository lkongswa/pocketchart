import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  X,
  ListTodo,
  FileText,
  ExternalLink,
  Plus,
  Trash2,
  GripVertical,
  Check,
  Link2,
} from 'lucide-react';
import type { DashboardTodo, QuickLink } from '../../shared/types';

type WidgetTab = 'tasks' | 'scratchpad' | 'links';

const POSITION_KEY = 'floatingWidgetPosition';
const DEFAULT_POS = { x: -1, y: -1 }; // -1 signals "use default"

export default function FloatingWidget() {
  // Hide on calendar page — the calendar has its own integrated sidebar
  const [currentHash, setCurrentHash] = useState(window.location.hash);

  useEffect(() => {
    const handleHashChange = () => {
      const newHash = window.location.hash;
      setCurrentHash(newHash);
      // Auto-close popup when navigating to calendar
      if (newHash.startsWith('#/calendar')) {
        setOpen(false);
      }
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const isCalendarPage = currentHash.startsWith('#/calendar');

  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<WidgetTab>('tasks');
  const [position, setPosition] = useState(() => {
    try {
      const saved = localStorage.getItem(POSITION_KEY);
      return saved ? JSON.parse(saved) : DEFAULT_POS;
    } catch {
      return DEFAULT_POS;
    }
  });
  const dragging = useRef(false);
  const dragOffset = useRef({ x: 0, y: 0 });
  const iconRef = useRef<HTMLButtonElement>(null);
  const didDrag = useRef(false);

  // ─── Tasks tab state ───
  const [todos, setTodos] = useState<DashboardTodo[]>([]);
  const [newTodoText, setNewTodoText] = useState('');

  // ─── Scratchpad tab state ───
  const [scratchpadContent, setScratchpadContent] = useState('');
  const [scratchpadSaving, setScratchpadSaving] = useState(false);
  const scratchpadTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ─── Links tab state ───
  const [links, setLinks] = useState<QuickLink[]>([]);
  const [newLinkTitle, setNewLinkTitle] = useState('');
  const [newLinkUrl, setNewLinkUrl] = useState('');

  // ─── Load data when tab changes / widget opens ───
  useEffect(() => {
    if (!open) return;
    if (activeTab === 'tasks') loadTodos();
    if (activeTab === 'scratchpad') loadScratchpad();
    if (activeTab === 'links') loadLinks();
  }, [open, activeTab]);

  // ─── Tasks ───
  const loadTodos = async () => {
    const result = await window.api.dashboardTodos.list();
    setTodos(result);
  };

  const addTodo = async () => {
    const text = newTodoText.trim();
    if (!text) return;
    await window.api.dashboardTodos.create(text);
    setNewTodoText('');
    await loadTodos();
  };

  const toggleTodo = async (todo: DashboardTodo) => {
    await window.api.dashboardTodos.update(todo.id, { completed: todo.completed ? 0 : 1 });
    await loadTodos();
  };

  const deleteTodo = async (id: number) => {
    await window.api.dashboardTodos.delete(id);
    await loadTodos();
  };

  // ─── Scratchpad ───
  const loadScratchpad = async () => {
    const note = await window.api.scratchpad.get();
    setScratchpadContent(note?.content || '');
  };

  const handleScratchpadChange = (val: string) => {
    setScratchpadContent(val);
    setScratchpadSaving(true);
    if (scratchpadTimer.current) clearTimeout(scratchpadTimer.current);
    scratchpadTimer.current = setTimeout(async () => {
      await window.api.scratchpad.save(val);
      setScratchpadSaving(false);
    }, 500);
  };

  // ─── Links ───
  const loadLinks = async () => {
    const result = await window.api.quickLinks.list();
    setLinks(result);
  };

  const addLink = async () => {
    const title = newLinkTitle.trim();
    let url = newLinkUrl.trim();
    if (!url) return;
    if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
    await window.api.quickLinks.create({ title: title || url, url });
    setNewLinkTitle('');
    setNewLinkUrl('');
    await loadLinks();
  };

  const deleteLink = async (id: number) => {
    await window.api.quickLinks.delete(id);
    await loadLinks();
  };

  const openLink = (url: string) => {
    window.api.shell.openExternal(url);
  };

  // ─── Dragging ───
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    dragging.current = true;
    didDrag.current = false;
    const rect = iconRef.current?.getBoundingClientRect();
    if (rect) {
      dragOffset.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    }
    e.preventDefault();
  }, []);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!dragging.current) return;
      didDrag.current = true;
      const newX = e.clientX - dragOffset.current.x;
      const newY = e.clientY - dragOffset.current.y;
      setPosition({ x: newX, y: newY });
    };

    const handleMouseUp = () => {
      if (dragging.current) {
        dragging.current = false;
        setPosition((pos: { x: number; y: number }) => {
          localStorage.setItem(POSITION_KEY, JSON.stringify(pos));
          return pos;
        });
      }
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  const handleIconClick = () => {
    if (didDrag.current) return; // Don't toggle if we just dragged
    setOpen((prev) => !prev);
  };

  // Hide entirely on calendar page (sidebar replaces the widget there)
  if (isCalendarPage) return null;

  // Resolve position: if default (-1), use bottom-right
  const resolvedPos = position.x < 0 || position.y < 0
    ? { right: 24, bottom: 24, left: 'auto' as const, top: 'auto' as const }
    : { left: position.x, top: position.y, right: 'auto' as const, bottom: 'auto' as const };

  const tabs: { key: WidgetTab; label: string; icon: React.ReactNode }[] = [
    { key: 'tasks', label: 'Tasks', icon: <ListTodo size={13} /> },
    { key: 'scratchpad', label: 'Pad', icon: <FileText size={13} /> },
    { key: 'links', label: 'Links', icon: <Link2 size={13} /> },
  ];

  return (
    <>
      {/* Floating Icon */}
      <button
        ref={iconRef}
        className="fixed z-40 w-10 h-10 rounded-full bg-teal-500 hover:bg-teal-600 text-white shadow-lg flex items-center justify-center transition-colors select-none"
        style={{
          ...resolvedPos,
          cursor: dragging.current ? 'grabbing' : 'grab',
        }}
        onMouseDown={handleMouseDown}
        onClick={handleIconClick}
        title="Quick Tools"
      >
        <ListTodo size={18} />
      </button>

      {/* Popup */}
      {open && (
        <div
          className="fixed z-40 bg-white rounded-xl shadow-2xl border border-[var(--color-border)] flex flex-col overflow-hidden"
          style={{
            width: 320,
            height: 400,
            ...(position.x < 0 || position.y < 0
              ? { right: 72, bottom: 24 }
              : { left: Math.min(position.x + 48, window.innerWidth - 340), top: Math.max(position.y - 360, 8) }),
          }}
        >
          {/* Header */}
          <div className="flex items-center gap-1 px-3 py-2 border-b border-[var(--color-border)] bg-gray-50/80">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                className={`flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  activeTab === tab.key
                    ? 'bg-teal-500 text-white'
                    : 'text-[var(--color-text-secondary)] hover:bg-gray-100'
                }`}
                onClick={() => setActiveTab(tab.key)}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
            <div className="flex-1" />
            <button
              className="p-1 rounded hover:bg-gray-200 transition-colors"
              onClick={() => setOpen(false)}
            >
              <X size={14} className="text-[var(--color-text-secondary)]" />
            </button>
          </div>

          {/* Tab content */}
          <div className="flex-1 overflow-y-auto">
            {activeTab === 'tasks' && (
              <div className="flex flex-col h-full">
                {/* Add form */}
                <div className="flex gap-1 px-3 py-2 border-b border-[var(--color-border)]">
                  <input
                    type="text"
                    className="flex-1 text-xs border border-[var(--color-border)] rounded px-2 py-1.5 focus:outline-none focus:border-teal-400"
                    placeholder="Add a task..."
                    value={newTodoText}
                    onChange={(e) => setNewTodoText(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && addTodo()}
                  />
                  <button
                    className="px-2 py-1 bg-teal-500 text-white rounded text-xs hover:bg-teal-600 transition-colors"
                    onClick={addTodo}
                  >
                    <Plus size={14} />
                  </button>
                </div>
                {/* Todo list */}
                <div className="flex-1 overflow-y-auto px-2 py-1 space-y-0.5">
                  {todos.length === 0 ? (
                    <div className="text-center text-[var(--color-text-secondary)] text-xs py-8">
                      No tasks yet.
                    </div>
                  ) : (
                    todos.map((todo) => (
                      <div
                        key={todo.id}
                        className="group flex items-center gap-1.5 px-2 py-1.5 rounded hover:bg-gray-50 transition-colors"
                      >
                        <button
                          className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 transition-colors ${
                            todo.completed
                              ? 'bg-teal-500 border-teal-500 text-white'
                              : 'border-gray-300 hover:border-teal-400'
                          }`}
                          onClick={() => toggleTodo(todo)}
                        >
                          {todo.completed ? <Check size={10} /> : null}
                        </button>
                        <span
                          className={`flex-1 text-xs leading-tight truncate ${
                            todo.completed
                              ? 'line-through text-[var(--color-text-secondary)]'
                              : 'text-[var(--color-text)]'
                          }`}
                        >
                          {todo.text}
                        </span>
                        <button
                          className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-red-50 text-red-400 hover:text-red-500 transition-all"
                          onClick={() => deleteTodo(todo.id)}
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            {activeTab === 'scratchpad' && (
              <div className="flex flex-col h-full">
                <div className="flex items-center justify-end px-3 py-1 text-[10px] text-[var(--color-text-secondary)]">
                  {scratchpadSaving ? 'Saving...' : 'Saved'}
                </div>
                <textarea
                  className="flex-1 w-full px-3 pb-3 text-xs text-[var(--color-text)] resize-none focus:outline-none leading-relaxed"
                  placeholder="Quick notes, reminders, anything..."
                  value={scratchpadContent}
                  onChange={(e) => handleScratchpadChange(e.target.value)}
                />
              </div>
            )}

            {activeTab === 'links' && (
              <div className="flex flex-col h-full">
                {/* Add form */}
                <div className="px-3 py-2 border-b border-[var(--color-border)] space-y-1">
                  <input
                    type="text"
                    className="w-full text-xs border border-[var(--color-border)] rounded px-2 py-1.5 focus:outline-none focus:border-teal-400"
                    placeholder="Title (optional)"
                    value={newLinkTitle}
                    onChange={(e) => setNewLinkTitle(e.target.value)}
                  />
                  <div className="flex gap-1">
                    <input
                      type="text"
                      className="flex-1 text-xs border border-[var(--color-border)] rounded px-2 py-1.5 focus:outline-none focus:border-teal-400"
                      placeholder="https://..."
                      value={newLinkUrl}
                      onChange={(e) => setNewLinkUrl(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && addLink()}
                    />
                    <button
                      className="px-2 py-1 bg-teal-500 text-white rounded text-xs hover:bg-teal-600 transition-colors"
                      onClick={addLink}
                    >
                      <Plus size={14} />
                    </button>
                  </div>
                </div>
                {/* Links list */}
                <div className="flex-1 overflow-y-auto px-2 py-1 space-y-0.5">
                  {links.length === 0 ? (
                    <div className="text-center text-[var(--color-text-secondary)] text-xs py-8">
                      No saved links.
                    </div>
                  ) : (
                    links.map((link) => (
                      <div
                        key={link.id}
                        className="group flex items-center gap-1.5 px-2 py-1.5 rounded hover:bg-gray-50 transition-colors"
                      >
                        <ExternalLink size={12} className="text-teal-500 flex-shrink-0" />
                        <button
                          className="flex-1 text-left text-xs text-[var(--color-text)] truncate hover:text-teal-600 transition-colors"
                          onClick={() => openLink(link.url)}
                          title={link.url}
                        >
                          {link.title || link.url}
                        </button>
                        <button
                          className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-red-50 text-red-400 hover:text-red-500 transition-all"
                          onClick={() => deleteLink(link.id)}
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
