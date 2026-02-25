import { useState, useMemo, useEffect, useRef } from "react";

const PRIORITIES = [
  { key: "critical", label: "Critical", color: "#FF2D55", bg: "#FF2D5515" },
  { key: "urgent",   label: "Urgent",   color: "#FF6B00", bg: "#FF6B0015" },
  { key: "high",     label: "High",     color: "#FFD60A", bg: "#FFD60A15" },
  { key: "normal",   label: "Normal",   color: "#30D158", bg: "#30D15815" },
  { key: "low",      label: "Low",      color: "#636366", bg: "#63636615" },
];

const INITIAL_TASKS = [
  { id: 1, title: "Design system architecture", priority: "critical", done: false, dependsOn: [], blocks: [], dueDate: new Date().toISOString().split("T")[0], notes: "" },
  { id: 2, title: "Set up CI/CD pipeline",      priority: "high",     done: false, dependsOn: [1], blocks: [], dueDate: new Date().toISOString().split("T")[0], notes: "" },
  { id: 3, title: "Write unit tests",            priority: "urgent",   done: false, dependsOn: [2], blocks: [], dueDate: new Date(Date.now() + 2 * 86400000).toISOString().split("T")[0], notes: "" },
  { id: 4, title: "Code review session",         priority: "normal",   done: false, dependsOn: [], blocks: [], dueDate: new Date(Date.now() + 3 * 86400000).toISOString().split("T")[0], notes: "" },
  { id: 5, title: "Update documentation",        priority: "low",      done: false, dependsOn: [1], blocks: [], dueDate: new Date(Date.now() + 5 * 86400000).toISOString().split("T")[0], notes: "" },
  { id: 6, title: "Fix login bug (overdue!)",    priority: "urgent",   done: false, dependsOn: [], blocks: [], dueDate: new Date(Date.now() - 2 * 86400000).toISOString().split("T")[0], notes: "Reported by QA team" },
];

function getPriorityObj(key) { return PRIORITIES.find(p => p.key === key) || PRIORITIES[3]; }
function getToday()    { return new Date().toISOString().split("T")[0]; }
function getTomorrow() { const d = new Date(); d.setDate(d.getDate() + 1); return d.toISOString().split("T")[0]; }
function getWeekEnd()  { const d = new Date(); d.setDate(d.getDate() + 7); return d.toISOString().split("T")[0]; }
function isBacklog(task, today) { return !task.done && task.dueDate < today; }

function canComplete(task, allTasks) {
  if (!task.dependsOn || task.dependsOn.length === 0) return true;
  return task.dependsOn.every(depId => { const dep = allTasks.find(t => t.id === depId); return dep && dep.done; });
}

// ── CSV helpers ──────────────────────────────────────────────────────────────
function tasksToCSV(tasks) {
  const header = ["id","title","priority","done","dueDate","notes","dependsOn","blocks"];
  const escape = (val) => `"${String(val ?? "").replace(/"/g, '""')}"`;
  const rows = tasks.map(t => [
    t.id, escape(t.title), t.priority, t.done,
    t.dueDate, escape(t.notes || ""),
    escape((t.dependsOn || []).join(";")),
    escape((t.blocks || []).join(";")),
  ].join(","));
  return [header.join(","), ...rows].join("\n");
}

function csvToTasks(csvText) {
  const lines = csvText.trim().split("\n");
  if (lines.length < 2) throw new Error("Empty CSV");
  const parseRow = (line) => {
    const result = []; let cur = ""; let inQuote = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') { if (inQuote && line[i+1] === '"') { cur += '"'; i++; } else { inQuote = !inQuote; } }
      else if (ch === ',' && !inQuote) { result.push(cur); cur = ""; }
      else cur += ch;
    }
    result.push(cur);
    return result;
  };
  const headers = parseRow(lines[0]);
  return lines.slice(1).map(line => {
    const vals = parseRow(line);
    const get = (key) => vals[headers.indexOf(key)] ?? "";
    const id = parseInt(get("id"));
    if (isNaN(id)) return null;
    return {
      id,
      title:     get("title"),
      priority:  get("priority") || "normal",
      done:      get("done") === "true",
      dueDate:   get("dueDate") || getToday(),
      notes:     get("notes"),
      dependsOn: get("dependsOn") ? get("dependsOn").split(";").map(Number).filter(Boolean) : [],
      blocks:    get("blocks")    ? get("blocks").split(";").map(Number).filter(Boolean)    : [],
    };
  }).filter(Boolean);
}

// ── Reusable checkbox list ────────────────────────────────────────────────────
function CheckboxList({ tasks, checked, onToggle, accentColor, accentBg }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {tasks.map(t => {
        const p = getPriorityObj(t.priority);
        const isChecked = checked.includes(t.id);
        return (
          <button key={t.id} onClick={() => onToggle(t.id)} style={{
            display: "flex", alignItems: "center", gap: 10, padding: "10px 12px",
            borderRadius: 10, background: isChecked ? accentBg : "#0A0A0F",
            border: `1px solid ${isChecked ? accentColor + "40" : "#2a2a35"}`,
            textAlign: "left", cursor: "pointer", fontFamily: "inherit",
          }}>
            <div style={{
              width: 18, height: 18, borderRadius: 5, flexShrink: 0,
              border: `2px solid ${isChecked ? accentColor : "#2a2a35"}`,
              background: isChecked ? accentColor : "transparent",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              {isChecked && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>}
            </div>
            <span style={{ color: "#EBEBF0", fontSize: 13, flex: 1 }}>{t.title}</span>
            <span style={{ color: p.color, fontSize: 10, background: p.bg, padding: "2px 6px", borderRadius: 5, fontFamily: "'DM Mono', monospace" }}>{p.label}</span>
          </button>
        );
      })}
    </div>
  );
}

// ── Main App ──────────────────────────────────────────────────────────────────
export default function App() {
  const [tasks, setTasks] = useState(() => {
    try { const s = localStorage.getItem("taskflow_tasks"); return s ? JSON.parse(s) : INITIAL_TASKS; }
    catch { return INITIAL_TASKS; }
  });
  const [nextId, setNextId] = useState(() => {
    try { const s = localStorage.getItem("taskflow_nextid"); return s ? JSON.parse(s) : 7; }
    catch { return 7; }
  });
  const [view, setView] = useState(() => {
    try { return localStorage.getItem("taskflow_view") || "today"; } catch { return "today"; }
  });
  const [showForm, setShowForm]           = useState(false);
  const [editTask, setEditTask]           = useState(null);
  const [selectedTask, setSelectedTask]   = useState(null);
  const [showCSV, setShowCSV]             = useState(false);
  const [importError, setImportError]     = useState("");
  const [importSuccess, setImportSuccess] = useState("");
  const [form, setForm] = useState({ title: "", priority: "normal", dueDate: getToday(), dependsOn: [], blocks: [], notes: "" });
  const fileInputRef = useRef(null);

  useEffect(() => { try { localStorage.setItem("taskflow_tasks",  JSON.stringify(tasks));  } catch {} }, [tasks]);
  useEffect(() => { try { localStorage.setItem("taskflow_nextid", JSON.stringify(nextId)); } catch {} }, [nextId]);
  useEffect(() => { try { localStorage.setItem("taskflow_view",   view);                  } catch {} }, [view]);

  const today    = getToday();
  const tomorrow = getTomorrow();
  const weekEnd  = getWeekEnd();

  const backlogTasks = useMemo(() => tasks.filter(t => isBacklog(t, today)), [tasks, today]);

  const filteredTasks = useMemo(() => {
    if (view === "today") {
      // Backlog (undone, overdue) first, then today's undone, then all done at bottom
      const backlog      = backlogTasks.filter(t => !t.done);
      const todayPending = tasks.filter(t => t.dueDate === today && !t.done);
      const done         = tasks.filter(t => (t.dueDate === today || isBacklog(t, today)) && t.done);
      return [...backlog, ...todayPending, ...done];
    }
    if (view === "tomorrow") return tasks.filter(t => t.dueDate === tomorrow);
    if (view === "week") {
      const po = { critical: 0, urgent: 1, high: 2, normal: 3, low: 4 };
      return tasks.filter(t => t.dueDate >= today && t.dueDate <= weekEnd && po[t.priority] <= 2);
    }
    return tasks;
  }, [tasks, view, today, tomorrow, weekEnd, backlogTasks]);

  const sortedTasks = useMemo(() => {
    if (view === "today") return filteredTasks; // preserve backlog-first order
    const order = { critical: 0, urgent: 1, high: 2, normal: 3, low: 4 };
    return [...filteredTasks].sort((a, b) => order[a.priority] - order[b.priority] || (a.done ? 1 : -1));
  }, [filteredTasks, view]);

  const stats = useMemo(() => ({
    total:   tasks.length,
    done:    tasks.filter(t => t.done).length,
    backlog: backlogTasks.filter(t => !t.done).length,
  }), [tasks, backlogTasks]);

  function openNew() {
    setEditTask(null);
    setForm({ title: "", priority: "normal", dueDate: today, dependsOn: [], blocks: [], notes: "" });
    setShowForm(true);
  }
  function openEdit(task) {
    setEditTask(task);
    setForm({ title: task.title, priority: task.priority, dueDate: task.dueDate, dependsOn: task.dependsOn || [], blocks: task.blocks || [], notes: task.notes || "" });
    setShowForm(true); setSelectedTask(null);
  }

  function saveForm() {
    if (!form.title.trim()) return;
    if (editTask) {
      setTasks(ts => {
        let u = ts.map(t => t.id === editTask.id ? { ...t, ...form } : t);
        u = u.map(t => {
          if (t.id === editTask.id) return t;
          if (form.blocks.includes(t.id)) return { ...t, dependsOn: t.dependsOn.includes(editTask.id) ? t.dependsOn : [...t.dependsOn, editTask.id] };
          return { ...t, dependsOn: (t.dependsOn || []).filter(d => d !== editTask.id) };
        });
        return u;
      });
    } else {
      const newId = nextId;
      setTasks(ts => {
        let u = [...ts, { id: newId, ...form, done: false }];
        u = u.map(t => {
          if (t.id === newId) return t;
          if (form.blocks.includes(t.id)) return { ...t, dependsOn: (t.dependsOn || []).includes(newId) ? t.dependsOn : [...(t.dependsOn || []), newId] };
          return t;
        });
        return u;
      });
      setNextId(n => n + 1);
    }
    setShowForm(false);
  }

  function toggleDone(id) {
    setTasks(ts => ts.map(t => {
      if (t.id !== id) return t;
      if (!t.done && !canComplete(t, ts)) return t;
      return { ...t, done: !t.done };
    }));
  }
  function deleteTask(id) {
    setTasks(ts => ts.filter(t => t.id !== id).map(t => ({
      ...t,
      dependsOn: (t.dependsOn || []).filter(d => d !== id),
      blocks:    (t.blocks    || []).filter(d => d !== id),
    })));
    setSelectedTask(null);
  }
  function toggleDep(id)    { setForm(f => ({ ...f, dependsOn: f.dependsOn.includes(id) ? f.dependsOn.filter(d => d !== id) : [...f.dependsOn, id] })); }
  function toggleBlocks(id) { setForm(f => ({ ...f, blocks:    f.blocks.includes(id)    ? f.blocks.filter(d => d !== id)    : [...f.blocks, id]    })); }

  function handleExport() {
    const csv  = tasksToCSV(tasks);
    const blob = new Blob([csv], { type: "text/csv" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url; a.download = `taskflow_${today}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  function handleImportFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const imported = csvToTasks(ev.target.result);
        if (!imported.length) { setImportError("No valid tasks found in file."); return; }
        const maxId = Math.max(...imported.map(t => t.id), nextId - 1);
        setTasks(imported);
        setNextId(maxId + 1);
        setImportError("");
        setImportSuccess(`✓ Imported ${imported.length} tasks successfully!`);
        setTimeout(() => setImportSuccess(""), 3000);
      } catch { setImportError("Failed to parse CSV. Make sure it was exported from TaskFlow."); }
    };
    reader.readAsText(file);
    e.target.value = "";
  }

  const taskById    = id => tasks.find(t => t.id === id);
  const otherTasks  = tasks.filter(t => !editTask || t.id !== editTask.id);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ fontFamily: "'DM Sans', 'Segoe UI', sans-serif", background: "#0A0A0F", minHeight: "100vh", display: "flex", justifyContent: "center" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&family=DM+Mono:wght@400;500&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::-webkit-scrollbar { width: 4px; } ::-webkit-scrollbar-track { background: transparent; } ::-webkit-scrollbar-thumb { background: #2a2a35; border-radius: 4px; }
        .task-card { transition: transform 0.15s; } .task-card:active { transform: scale(0.98); }
        .btn-tap { transition: opacity 0.1s, transform 0.1s; } .btn-tap:active { opacity: 0.7; transform: scale(0.96); }
        .pill-btn { cursor: pointer; border: none; font-family: inherit; transition: all 0.15s; } .pill-btn:active { transform: scale(0.94); }
        .slide-up { animation: slideUp 0.25s cubic-bezier(0.34,1.2,0.64,1); }
        @keyframes slideUp { from { transform: translateY(30px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        .fade-in { animation: fadeIn 0.2s ease; }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes pulse { 0%,100% { opacity:1; } 50% { opacity:0.45; } }
        select, input, textarea { -webkit-appearance: none; appearance: none; }
        input[type=checkbox], input[type=file] { display: none; }
      `}</style>

      <div style={{ width: "100%", maxWidth: 430, display: "flex", flexDirection: "column", minHeight: "100vh" }}>

        {/* ── Header ── */}
        <div style={{ padding: "52px 24px 20px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
            <div>
              <div style={{ color: "#636366", fontSize: 12, letterSpacing: 2, textTransform: "uppercase", marginBottom: 4, fontFamily: "'DM Mono', monospace" }}>
                {new Date().toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}
              </div>
              <h1 style={{ color: "#FFFFFF", fontSize: 28, fontWeight: 700, letterSpacing: -0.5 }}>TaskFlow</h1>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn-tap" onClick={() => setShowCSV(true)} title="Export / Import" style={{
                background: "#13131A", border: "1px solid #2a2a35", borderRadius: 14, width: 44, height: 44,
                display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer",
              }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#636366" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
                </svg>
              </button>
              <button className="btn-tap" onClick={openNew} style={{
                background: "linear-gradient(135deg, #6E5BFF, #B44DFF)", border: "none", borderRadius: 14,
                width: 44, height: 44, display: "flex", alignItems: "center", justifyContent: "center",
                cursor: "pointer", boxShadow: "0 4px 20px #6E5BFF40",
              }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round">
                  <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                </svg>
              </button>
            </div>
          </div>

          {/* Stats */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 20 }}>
            {[
              { label: "Total",   value: stats.total,   color: "#6E5BFF", alert: false },
              { label: "Done",    value: stats.done,    color: "#30D158", alert: false },
              { label: "Backlog", value: stats.backlog, color: "#FF2D55", alert: stats.backlog > 0 },
            ].map(s => (
              <div key={s.label} style={{ background: "#13131A", borderRadius: 14, padding: "12px 14px", border: `1px solid ${s.alert ? "#FF2D5530" : "#1C1C26"}` }}>
                <div style={{ color: s.color, fontSize: 22, fontWeight: 700, lineHeight: 1, animation: s.alert ? "pulse 2s infinite" : "none" }}>{s.value}</div>
                <div style={{ color: "#636366", fontSize: 11, marginTop: 4, fontFamily: "'DM Mono', monospace" }}>{s.label}</div>
              </div>
            ))}
          </div>

          {/* Backlog warning banner (visible on non-today tabs) */}
          {stats.backlog > 0 && view !== "today" && (
            <div style={{ background: "#FF2D5510", border: "1px solid #FF2D5530", borderRadius: 12, padding: "10px 14px", marginBottom: 16, display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }} onClick={() => setView("today")}>
              <span style={{ fontSize: 16 }}>⚠️</span>
              <span style={{ color: "#FF2D55", fontSize: 13 }}>
                <strong>{stats.backlog} overdue task{stats.backlog > 1 ? "s" : ""}</strong> — tap to view in Today
              </span>
            </div>
          )}

          {/* Tabs 2×2 */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
            {[
              { key: "today",    label: "Today",        badge: stats.backlog },
              { key: "tomorrow", label: "Tomorrow",     badge: 0 },
              { key: "week",     label: "This Week ⭐", badge: 0 },
              { key: "all",      label: "All Tasks",    badge: 0 },
            ].map(tab => (
              <button key={tab.key} className="pill-btn" onClick={() => setView(tab.key)} style={{
                padding: "9px 0", borderRadius: 12, fontSize: 12, fontWeight: 500, position: "relative",
                background: view === tab.key ? "linear-gradient(135deg, #6E5BFF, #B44DFF)" : "#13131A",
                color: view === tab.key ? "#fff" : "#636366",
                border: `1px solid ${view === tab.key ? "transparent" : "#1C1C26"}`,
                boxShadow: view === tab.key ? "0 2px 12px #6E5BFF30" : "none",
              }}>
                {tab.label}
                {tab.badge > 0 && (
                  <span style={{ position: "absolute", top: -5, right: 6, background: "#FF2D55", color: "white", fontSize: 9, fontWeight: 700, borderRadius: 8, padding: "1px 5px", fontFamily: "'DM Mono', monospace", animation: "pulse 2s infinite" }}>
                    {tab.badge}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* ── Task List ── */}
        <div style={{ flex: 1, padding: "0 16px 100px", overflowY: "auto" }}>
          {sortedTasks.length === 0 ? (
            <div style={{ textAlign: "center", padding: "60px 20px", color: "#636366" }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>✦</div>
              <div style={{ fontSize: 15 }}>No tasks here</div>
              <div style={{ fontSize: 12, marginTop: 4 }}>Tap + to add one</div>
            </div>
          ) : (
            <>
              {view === "today" && stats.backlog > 0 && (
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10, marginTop: 4 }}>
                  <div style={{ flex: 1, height: 1, background: "#FF2D5530" }} />
                  <span style={{ color: "#FF2D55", fontSize: 10, fontFamily: "'DM Mono', monospace", letterSpacing: 1 }}>⚠ BACKLOG — OVERDUE</span>
                  <div style={{ flex: 1, height: 1, background: "#FF2D5530" }} />
                </div>
              )}

              {sortedTasks.map((task, idx) => {
                const p       = getPriorityObj(task.priority);
                const canDo   = canComplete(task, tasks);
                const deps    = (task.dependsOn || []).map(taskById).filter(Boolean);
                const backlog = isBacklog(task, today);
                const prev    = sortedTasks[idx - 1];
                const showTodayDivider = view === "today" && idx > 0 && prev && isBacklog(prev, today) && !isBacklog(task, today) && !task.done;

                return (
                  <div key={task.id}>
                    {showTodayDivider && (
                      <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "10px 0" }}>
                        <div style={{ flex: 1, height: 1, background: "#2a2a35" }} />
                        <span style={{ color: "#636366", fontSize: 10, fontFamily: "'DM Mono', monospace", letterSpacing: 1 }}>TODAY</span>
                        <div style={{ flex: 1, height: 1, background: "#2a2a35" }} />
                      </div>
                    )}

                    <div className="task-card" onClick={() => setSelectedTask(task)} style={{
                      background: backlog && !task.done ? "#140A0A" : "#13131A",
                      borderRadius: 18, padding: "14px 16px", marginBottom: 10,
                      border: `1px solid ${task.done ? "#1C1C26" : backlog ? "#FF2D5535" : p.bg.replace("15","30")}`,
                      cursor: "pointer", position: "relative", overflow: "hidden",
                    }}>
                      {!task.done && <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 3, background: backlog ? "#FF2D55" : p.color, borderRadius: "3px 0 0 3px" }} />}
                      <div style={{ display: "flex", alignItems: "flex-start", gap: 12, paddingLeft: 6 }}>
                        <button className="btn-tap" onClick={e => { e.stopPropagation(); toggleDone(task.id); }} style={{
                          width: 26, height: 26, borderRadius: "50%", flexShrink: 0, marginTop: 1,
                          border: `2px solid ${task.done ? p.color : canDo ? (backlog ? "#FF2D55" : p.color + "80") : "#2a2a35"}`,
                          background: task.done ? p.color : "transparent",
                          cursor: canDo || task.done ? "pointer" : "not-allowed",
                          display: "flex", alignItems: "center", justifyContent: "center",
                        }}>
                          {task.done && <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>}
                        </button>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                            <span style={{ color: task.done ? "#636366" : "#EBEBF0", fontSize: 15, fontWeight: 500, textDecoration: task.done ? "line-through" : "none", flex: 1 }}>{task.title}</span>
                            {backlog && !task.done && (
                              <span style={{ background: "#FF2D5520", color: "#FF2D55", fontSize: 10, fontWeight: 700, padding: "3px 7px", borderRadius: 6, fontFamily: "'DM Mono', monospace", animation: "pulse 2s infinite" }}>BACKLOG</span>
                            )}
                            <span style={{ background: p.bg, color: p.color, fontSize: 10, fontWeight: 600, padding: "3px 7px", borderRadius: 6, letterSpacing: 0.5, fontFamily: "'DM Mono', monospace", textTransform: "uppercase" }}>{p.label}</span>
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6, flexWrap: "wrap" }}>
                            <span style={{ color: backlog && !task.done ? "#FF2D55" : "#636366", fontSize: 11, fontFamily: "'DM Mono', monospace" }}>
                              {task.dueDate === today ? "Today" : task.dueDate === tomorrow ? "Tomorrow" : task.dueDate}
                              {backlog && !task.done && " ⚠ Overdue"}
                            </span>
                            {deps.length > 0 && (
                              <span style={{ color: canDo ? "#30D158" : "#FF6B00", fontSize: 10, background: canDo ? "#30D15815" : "#FF6B0015", padding: "2px 7px", borderRadius: 5, fontFamily: "'DM Mono', monospace" }}>
                                {canDo ? "✓ deps clear" : `⊙ ${deps.filter(d => !d.done).length} blocking`}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </>
          )}
        </div>

        {/* ── Task Detail Modal ── */}
        {selectedTask && (() => {
          const task = tasks.find(t => t.id === selectedTask.id) || selectedTask;
          const p = getPriorityObj(task.priority);
          const deps = (task.dependsOn || []).map(taskById).filter(Boolean);
          const canDo = canComplete(task, tasks);
          const dependents = tasks.filter(t => (t.dependsOn || []).includes(task.id));
          const backlog = isBacklog(task, today);
          return (
            <div className="fade-in" onClick={() => setSelectedTask(null)} style={{ position: "fixed", inset: 0, background: "#000000AA", zIndex: 50, display: "flex", alignItems: "flex-end" }}>
              <div className="slide-up" onClick={e => e.stopPropagation()} style={{ background: "#13131A", borderRadius: "24px 24px 0 0", width: "100%", maxWidth: 430, margin: "0 auto", padding: "24px 24px 48px", border: "1px solid #1C1C26" }}>
                <div style={{ width: 40, height: 4, background: "#2a2a35", borderRadius: 2, margin: "0 auto 20px" }} />
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
                  <span style={{ background: p.bg, color: p.color, fontSize: 10, fontWeight: 600, padding: "3px 8px", borderRadius: 6, fontFamily: "'DM Mono', monospace", textTransform: "uppercase" }}>{p.label}</span>
                  {backlog && !task.done && <span style={{ background: "#FF2D5520", color: "#FF2D55", fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 6, fontFamily: "'DM Mono', monospace" }}>BACKLOG</span>}
                </div>
                <h2 style={{ color: "#EBEBF0", fontSize: 20, fontWeight: 600, marginBottom: 16, lineHeight: 1.3 }}>{task.title}</h2>

                <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
                  <div style={{ background: "#0A0A0F", borderRadius: 10, padding: "8px 12px", flex: 1, border: `1px solid ${backlog && !task.done ? "#FF2D5530" : "#1C1C26"}` }}>
                    <div style={{ color: "#636366", fontSize: 10, marginBottom: 3, fontFamily: "'DM Mono', monospace" }}>DUE DATE</div>
                    <div style={{ color: backlog && !task.done ? "#FF2D55" : "#EBEBF0", fontSize: 13 }}>
                      {task.dueDate === today ? "Today" : task.dueDate === tomorrow ? "Tomorrow" : task.dueDate}{backlog && !task.done ? " ⚠" : ""}
                    </div>
                  </div>
                  <div style={{ background: "#0A0A0F", borderRadius: 10, padding: "8px 12px", flex: 1, border: "1px solid #1C1C26" }}>
                    <div style={{ color: "#636366", fontSize: 10, marginBottom: 3, fontFamily: "'DM Mono', monospace" }}>STATUS</div>
                    <div style={{ color: task.done ? "#30D158" : backlog ? "#FF2D55" : canDo ? "#FFD60A" : "#FF6B00", fontSize: 13 }}>
                      {task.done ? "Completed" : backlog ? "Overdue" : canDo ? "Ready" : "Blocked"}
                    </div>
                  </div>
                </div>

                {task.notes && (
                  <div style={{ background: "#0A0A0F", borderRadius: 10, padding: "10px 12px", marginBottom: 16, border: "1px solid #1C1C26" }}>
                    <div style={{ color: "#636366", fontSize: 10, marginBottom: 4, fontFamily: "'DM Mono', monospace" }}>NOTES</div>
                    <div style={{ color: "#EBEBF0", fontSize: 13, lineHeight: 1.5 }}>{task.notes}</div>
                  </div>
                )}
                {deps.length > 0 && (
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ color: "#636366", fontSize: 10, marginBottom: 8, fontFamily: "'DM Mono', monospace", letterSpacing: 1 }}>DEPENDS ON</div>
                    {deps.map(d => (
                      <div key={d.id} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                        <div style={{ width: 8, height: 8, borderRadius: "50%", background: d.done ? "#30D158" : "#FF6B00" }} />
                        <span style={{ color: d.done ? "#636366" : "#EBEBF0", fontSize: 13, textDecoration: d.done ? "line-through" : "none" }}>{d.title}</span>
                      </div>
                    ))}
                  </div>
                )}
                {dependents.length > 0 && (
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ color: "#636366", fontSize: 10, marginBottom: 8, fontFamily: "'DM Mono', monospace", letterSpacing: 1 }}>IT BLOCKS</div>
                    {dependents.map(d => (
                      <div key={d.id} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                        <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#FF6B00" }} />
                        <span style={{ color: "#EBEBF0", fontSize: 13 }}>{d.title}</span>
                      </div>
                    ))}
                  </div>
                )}
                <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
                  {!task.done && (
                    <button className="btn-tap" onClick={() => toggleDone(task.id)} disabled={!canDo} style={{
                      flex: 2, padding: "14px", borderRadius: 14, border: "none",
                      background: canDo ? "linear-gradient(135deg, #30D158, #25A244)" : "#1C1C26",
                      color: canDo ? "white" : "#636366", fontWeight: 600, fontSize: 15,
                      cursor: canDo ? "pointer" : "not-allowed", fontFamily: "'DM Sans', sans-serif",
                    }}>{canDo ? "✓ Mark Complete" : "⊙ Blocked"}</button>
                  )}
                  <button className="btn-tap" onClick={() => openEdit(task)} style={{ flex: 1, padding: "14px", borderRadius: 14, border: "1px solid #2a2a35", background: "transparent", color: "#EBEBF0", fontWeight: 500, fontSize: 15, cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>Edit</button>
                  <button className="btn-tap" onClick={() => deleteTask(task.id)} style={{ width: 50, padding: "14px", borderRadius: 14, border: "1px solid #FF2D5530", background: "#FF2D5510", color: "#FF2D55", fontSize: 15, cursor: "pointer" }}>🗑</button>
                </div>
              </div>
            </div>
          );
        })()}

        {/* ── Add/Edit Form Modal ── */}
        {showForm && (
          <div className="fade-in" onClick={() => setShowForm(false)} style={{ position: "fixed", inset: 0, background: "#000000AA", zIndex: 50, display: "flex", alignItems: "flex-end" }}>
            <div className="slide-up" onClick={e => e.stopPropagation()} style={{ background: "#13131A", borderRadius: "24px 24px 0 0", width: "100%", maxWidth: 430, margin: "0 auto", padding: "24px 24px 48px", border: "1px solid #1C1C26", maxHeight: "88vh", overflowY: "auto" }}>
              <div style={{ width: 40, height: 4, background: "#2a2a35", borderRadius: 2, margin: "0 auto 20px" }} />
              <h2 style={{ color: "#EBEBF0", fontSize: 18, fontWeight: 600, marginBottom: 20 }}>{editTask ? "Edit Task" : "New Task"}</h2>

              <div style={{ marginBottom: 16 }}>
                <label style={{ color: "#636366", fontSize: 11, letterSpacing: 1, textTransform: "uppercase", display: "block", marginBottom: 8, fontFamily: "'DM Mono', monospace" }}>Title *</label>
                <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="What needs to be done?" style={{ width: "100%", background: "#0A0A0F", border: "1px solid #2a2a35", borderRadius: 12, padding: "12px 14px", color: "#EBEBF0", fontSize: 15, outline: "none", fontFamily: "'DM Sans', sans-serif" }} />
              </div>

              <div style={{ marginBottom: 16 }}>
                <label style={{ color: "#636366", fontSize: 11, letterSpacing: 1, textTransform: "uppercase", display: "block", marginBottom: 8, fontFamily: "'DM Mono', monospace" }}>Priority</label>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {PRIORITIES.map(p => (
                    <button key={p.key} className="pill-btn" onClick={() => setForm(f => ({ ...f, priority: p.key }))} style={{ padding: "7px 14px", borderRadius: 10, fontSize: 12, fontWeight: 500, background: form.priority === p.key ? p.bg : "#0A0A0F", color: form.priority === p.key ? p.color : "#636366", border: `1px solid ${form.priority === p.key ? p.color + "60" : "#2a2a35"}` }}>{p.label}</button>
                  ))}
                </div>
              </div>

              <div style={{ marginBottom: 16 }}>
                <label style={{ color: "#636366", fontSize: 11, letterSpacing: 1, textTransform: "uppercase", display: "block", marginBottom: 8, fontFamily: "'DM Mono', monospace" }}>Due Date</label>
                <input type="date" value={form.dueDate} onChange={e => setForm(f => ({ ...f, dueDate: e.target.value }))} style={{ width: "100%", background: "#0A0A0F", border: "1px solid #2a2a35", borderRadius: 12, padding: "12px 14px", color: "#EBEBF0", fontSize: 15, outline: "none", fontFamily: "'DM Mono', monospace", colorScheme: "dark" }} />
              </div>

              {otherTasks.length > 0 && (
                <>
                  <div style={{ marginBottom: 16 }}>
                    <label style={{ color: "#6E5BFF", fontSize: 11, letterSpacing: 1, textTransform: "uppercase", display: "block", marginBottom: 4, fontFamily: "'DM Mono', monospace" }}>Depends On</label>
                    <div style={{ color: "#636366", fontSize: 11, marginBottom: 8 }}>This task can't start until these are done</div>
                    <CheckboxList tasks={otherTasks} checked={form.dependsOn} onToggle={toggleDep} accentColor="#6E5BFF" accentBg="#6E5BFF15" />
                  </div>
                  <div style={{ marginBottom: 16 }}>
                    <label style={{ color: "#FF6B00", fontSize: 11, letterSpacing: 1, textTransform: "uppercase", display: "block", marginBottom: 4, fontFamily: "'DM Mono', monospace" }}>It Blocks</label>
                    <div style={{ color: "#636366", fontSize: 11, marginBottom: 8 }}>Tasks that can't start until THIS task is done</div>
                    <CheckboxList tasks={otherTasks} checked={form.blocks} onToggle={toggleBlocks} accentColor="#FF6B00" accentBg="#FF6B0015" />
                  </div>
                </>
              )}

              <div style={{ marginBottom: 24 }}>
                <label style={{ color: "#636366", fontSize: 11, letterSpacing: 1, textTransform: "uppercase", display: "block", marginBottom: 8, fontFamily: "'DM Mono', monospace" }}>Notes</label>
                <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Optional notes..." rows={3} style={{ width: "100%", background: "#0A0A0F", border: "1px solid #2a2a35", borderRadius: 12, padding: "12px 14px", color: "#EBEBF0", fontSize: 14, outline: "none", resize: "none", fontFamily: "'DM Sans', sans-serif", lineHeight: 1.5 }} />
              </div>

              <div style={{ display: "flex", gap: 10 }}>
                <button className="btn-tap" onClick={() => setShowForm(false)} style={{ flex: 1, padding: "14px", borderRadius: 14, border: "1px solid #2a2a35", background: "transparent", color: "#636366", fontWeight: 500, fontSize: 15, cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>Cancel</button>
                <button className="btn-tap" onClick={saveForm} style={{ flex: 2, padding: "14px", borderRadius: 14, border: "none", background: form.title.trim() ? "linear-gradient(135deg, #6E5BFF, #B44DFF)" : "#2a2a35", color: form.title.trim() ? "white" : "#636366", fontWeight: 600, fontSize: 15, cursor: "pointer", fontFamily: "'DM Sans', sans-serif", boxShadow: form.title.trim() ? "0 4px 20px #6E5BFF30" : "none" }}>
                  {editTask ? "Save Changes" : "Create Task"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── CSV Export / Import Modal ── */}
        {showCSV && (
          <div className="fade-in" onClick={() => { setShowCSV(false); setImportError(""); setImportSuccess(""); }} style={{ position: "fixed", inset: 0, background: "#000000AA", zIndex: 50, display: "flex", alignItems: "flex-end" }}>
            <div className="slide-up" onClick={e => e.stopPropagation()} style={{ background: "#13131A", borderRadius: "24px 24px 0 0", width: "100%", maxWidth: 430, margin: "0 auto", padding: "24px 24px 48px", border: "1px solid #1C1C26" }}>
              <div style={{ width: 40, height: 4, background: "#2a2a35", borderRadius: 2, margin: "0 auto 20px" }} />
              <h2 style={{ color: "#EBEBF0", fontSize: 18, fontWeight: 600, marginBottom: 6 }}>Export / Import</h2>
              <p style={{ color: "#636366", fontSize: 13, marginBottom: 24, lineHeight: 1.5 }}>Back up your tasks as a CSV, or restore from a previously exported file.</p>

              {importError && <div style={{ background: "#FF2D5515", border: "1px solid #FF2D5530", borderRadius: 12, padding: "10px 14px", marginBottom: 16, color: "#FF2D55", fontSize: 13 }}>⚠ {importError}</div>}
              {importSuccess && <div style={{ background: "#30D15815", border: "1px solid #30D15830", borderRadius: 12, padding: "10px 14px", marginBottom: 16, color: "#30D158", fontSize: 13 }}>{importSuccess}</div>}

              {/* Export card */}
              <div style={{ background: "#0A0A0F", borderRadius: 16, padding: "16px", marginBottom: 12, border: "1px solid #1C1C26" }}>
                <div style={{ color: "#EBEBF0", fontSize: 14, fontWeight: 600, marginBottom: 4 }}>📤 Export Tasks</div>
                <div style={{ color: "#636366", fontSize: 12, marginBottom: 14, lineHeight: 1.5 }}>
                  Download all <strong style={{ color: "#EBEBF0" }}>{tasks.length} tasks</strong> as a <code style={{ background: "#1C1C26", padding: "1px 6px", borderRadius: 4, color: "#B44DFF", fontSize: 11 }}>.csv</code> file. Opens in Excel or Google Sheets too.
                </div>
                <button className="btn-tap" onClick={handleExport} style={{ width: "100%", padding: "12px", borderRadius: 12, border: "none", background: "linear-gradient(135deg, #6E5BFF, #B44DFF)", color: "white", fontWeight: 600, fontSize: 14, cursor: "pointer", fontFamily: "'DM Sans', sans-serif", boxShadow: "0 4px 16px #6E5BFF30" }}>
                  Download CSV
                </button>
              </div>

              {/* Import card */}
              <div style={{ background: "#0A0A0F", borderRadius: 16, padding: "16px", marginBottom: 20, border: "1px solid #1C1C26" }}>
                <div style={{ color: "#EBEBF0", fontSize: 14, fontWeight: 600, marginBottom: 4 }}>📥 Import Tasks</div>
                <div style={{ color: "#636366", fontSize: 12, marginBottom: 8, lineHeight: 1.5 }}>Replace all current tasks with tasks from a CSV file.</div>
                <div style={{ background: "#FF6B0015", border: "1px solid #FF6B0030", borderRadius: 8, padding: "8px 12px", marginBottom: 14, color: "#FF6B00", fontSize: 11 }}>
                  ⚠ This will replace ALL current tasks. Export first to back them up!
                </div>
                <input ref={fileInputRef} type="file" accept=".csv" onChange={handleImportFile} />
                <button className="btn-tap" onClick={() => fileInputRef.current?.click()} style={{ width: "100%", padding: "12px", borderRadius: 12, border: "1px solid #2a2a35", background: "transparent", color: "#EBEBF0", fontWeight: 600, fontSize: 14, cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>
                  Choose CSV File
                </button>
              </div>

              <button className="btn-tap" onClick={() => { setShowCSV(false); setImportError(""); setImportSuccess(""); }} style={{ width: "100%", padding: "14px", borderRadius: 14, border: "1px solid #2a2a35", background: "transparent", color: "#636366", fontWeight: 500, fontSize: 15, cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>
                Close
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
