import { useState, useMemo, useEffect, useRef } from "react";

// ── Theme definitions ─────────────────────────────────────────────────────────
const THEMES = {
  dark: {
    bg: "#0A0A0F", surface: "#13131A", surface2: "#0A0A0F",
    border: "#1C1C26", border2: "#2a2a35",
    text: "#EBEBF0", textMuted: "#636366", textSub: "#9999AA",
    pill: "#13131A", inputBg: "#0A0A0F",
    backlogBg: "#140A0A", modalBg: "#000000AA",
    scrollThumb: "#2a2a35",
  },
  light: {
    bg: "#F2F2F7", surface: "#FFFFFF", surface2: "#F2F2F7",
    border: "#E5E5EA", border2: "#D1D1D6",
    text: "#1C1C1E", textMuted: "#8E8E93", textSub: "#636366",
    pill: "#FFFFFF", inputBg: "#F2F2F7",
    backlogBg: "#FFF0F0", modalBg: "#00000066",
    scrollThumb: "#C7C7CC",
  },
};

const PRIORITIES = [
  { key: "critical", label: "Critical", color: "#FF2D55", bg: "#FF2D5515" },
  { key: "urgent",   label: "Urgent",   color: "#FF6B00", bg: "#FF6B0015" },
  { key: "high",     label: "High",     color: "#F59E0B", bg: "#F59E0B15" },
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

const DEFAULT_SETTINGS = {
  theme: "dark",
  hideCompletedInAll: false,
  showDueDateWarning: true,
  defaultPriority: "normal",
  sortOrder: "date-asc", // date-asc | date-desc | priority
};

function getPriorityObj(key) { return PRIORITIES.find(p => p.key === key) || PRIORITIES[3]; }
function getToday()    { return new Date().toISOString().split("T")[0]; }
function getTomorrow() { const d = new Date(); d.setDate(d.getDate() + 1); return d.toISOString().split("T")[0]; }
function getWeekEnd()  { const d = new Date(); d.setDate(d.getDate() + 7); return d.toISOString().split("T")[0]; }
function isBacklog(task, today) { return !task.done && task.dueDate < today; }
function canComplete(task, allTasks) {
  if (!task.dependsOn || task.dependsOn.length === 0) return true;
  return task.dependsOn.every(depId => { const dep = allTasks.find(t => t.id === depId); return dep && dep.done; });
}

// ── CSV helpers ───────────────────────────────────────────────────────────────
function tasksToCSV(tasks) {
  const header = ["id","title","priority","done","dueDate","notes","dependsOn","blocks"];
  const esc = v => `"${String(v ?? "").replace(/"/g,'""')}"`;
  const rows = tasks.map(t => [t.id, esc(t.title), t.priority, t.done, t.dueDate, esc(t.notes||""), esc((t.dependsOn||[]).join(";")), esc((t.blocks||[]).join(";"))].join(","));
  return [header.join(","), ...rows].join("\n");
}
function csvToTasks(csvText) {
  const lines = csvText.trim().split("\n");
  if (lines.length < 2) throw new Error("Empty CSV");
  const parseRow = line => {
    const result=[]; let cur=""; let inQ=false;
    for (let i=0;i<line.length;i++){const ch=line[i];if(ch==='"'){if(inQ&&line[i+1]==='"'){cur+='"';i++;}else inQ=!inQ;}else if(ch===','&&!inQ){result.push(cur);cur="";}else cur+=ch;}
    result.push(cur); return result;
  };
  const headers = parseRow(lines[0]);
  return lines.slice(1).map(line => {
    const vals = parseRow(line); const get = k => vals[headers.indexOf(k)]??"";
    const id = parseInt(get("id")); if(isNaN(id)) return null;
    return { id, title:get("title"), priority:get("priority")||"normal", done:get("done")==="true", dueDate:get("dueDate")||getToday(), notes:get("notes"), dependsOn:get("dependsOn")?get("dependsOn").split(";").map(Number).filter(Boolean):[], blocks:get("blocks")?get("blocks").split(";").map(Number).filter(Boolean):[] };
  }).filter(Boolean);
}

// ── Collapsible Section ───────────────────────────────────────────────────────
function CollapsibleSection({ label, sublabel, labelColor, count, children, T }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ marginBottom: 16 }}>
      <button onClick={() => setOpen(o => !o)} style={{
        width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
        background: "transparent", border: `1px solid ${T.border2}`, borderRadius: open ? "12px 12px 0 0" : 12,
        padding: "10px 14px", cursor: "pointer", fontFamily: "inherit",
        borderBottom: open ? "none" : `1px solid ${T.border2}`,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ color: labelColor, fontSize: 11, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", fontFamily: "'DM Mono', monospace" }}>{label}</span>
          {count > 0 && <span style={{ background: labelColor + "25", color: labelColor, fontSize: 10, fontWeight: 700, padding: "1px 7px", borderRadius: 8, fontFamily: "'DM Mono', monospace" }}>{count}</span>}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {sublabel && <span style={{ color: T.textMuted, fontSize: 11 }}>{sublabel}</span>}
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={T.textMuted} strokeWidth="2.5" strokeLinecap="round" style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}>
            <polyline points="6 9 12 15 18 9"/>
          </svg>
        </div>
      </button>
      {open && (
        <div style={{ border: `1px solid ${T.border2}`, borderTop: "none", borderRadius: "0 0 12px 12px", padding: "10px 10px 10px" }}>
          {sublabel && <div style={{ color: T.textMuted, fontSize: 11, marginBottom: 8, paddingLeft: 2 }}>{sublabel}</div>}
          {children}
        </div>
      )}
    </div>
  );
}

// ── Checkbox list ─────────────────────────────────────────────────────────────
function CheckboxList({ tasks, checked, onToggle, accentColor, accentBg, T, warnings }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {tasks.map(t => {
        const p = getPriorityObj(t.priority);
        const isChecked = checked.includes(t.id);
        const warn = warnings && warnings[t.id];
        return (
          <div key={t.id}>
            <button onClick={() => onToggle(t.id)} style={{
              width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "10px 12px",
              borderRadius: warn ? "10px 10px 0 0" : 10,
              background: isChecked ? accentBg : T.inputBg,
              border: `1px solid ${warn ? "#FF2D5560" : isChecked ? accentColor + "40" : T.border2}`,
              borderBottom: warn ? "none" : undefined,
              textAlign: "left", cursor: "pointer", fontFamily: "inherit",
            }}>
              <div style={{ width: 18, height: 18, borderRadius: 5, flexShrink: 0, border: `2px solid ${isChecked ? accentColor : T.border2}`, background: isChecked ? accentColor : "transparent", display: "flex", alignItems: "center", justifyContent: "center" }}>
                {isChecked && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>}
              </div>
              <span style={{ color: T.text, fontSize: 13, flex: 1 }}>{t.title}</span>
              <span style={{ color: T.textMuted, fontSize: 10, fontFamily: "'DM Mono', monospace", marginRight: 4 }}>{t.dueDate}</span>
              <span style={{ color: p.color, fontSize: 10, background: p.bg, padding: "2px 6px", borderRadius: 5, fontFamily: "'DM Mono', monospace" }}>{p.label}</span>
            </button>
            {warn && (
              <div style={{ background: "#FF2D5510", border: `1px solid #FF2D5530`, borderTop: "none", borderRadius: "0 0 8px 8px", padding: "5px 12px", color: "#FF2D55", fontSize: 11 }}>
                ⚠ {warn}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Main App ──────────────────────────────────────────────────────────────────
export default function App() {
  const [tasks, setTasks] = useState(() => { try { const s = localStorage.getItem("taskflow_tasks"); return s ? JSON.parse(s) : INITIAL_TASKS; } catch { return INITIAL_TASKS; } });
  const [nextId, setNextId] = useState(() => { try { const s = localStorage.getItem("taskflow_nextid"); return s ? JSON.parse(s) : 7; } catch { return 7; } });
  const [view, setView] = useState(() => { try { return localStorage.getItem("taskflow_view") || "today"; } catch { return "today"; } });
  const [settings, setSettings] = useState(() => { try { const s = localStorage.getItem("taskflow_settings"); return s ? { ...DEFAULT_SETTINGS, ...JSON.parse(s) } : DEFAULT_SETTINGS; } catch { return DEFAULT_SETTINGS; } });

  const [showForm, setShowForm]           = useState(false);
  const [editTask, setEditTask]           = useState(null);
  const [selectedTask, setSelectedTask]   = useState(null);
  const [showCSV, setShowCSV]             = useState(false);
  const [showSettings, setShowSettings]   = useState(false);
  const [importError, setImportError]     = useState("");
  const [importSuccess, setImportSuccess] = useState("");
  const [form, setForm] = useState({ title: "", priority: "normal", dueDate: getToday(), dependsOn: [], blocks: [], notes: "" });
  const fileInputRef = useRef(null);

  useEffect(() => { try { localStorage.setItem("taskflow_tasks",    JSON.stringify(tasks));    } catch {} }, [tasks]);
  useEffect(() => { try { localStorage.setItem("taskflow_nextid",   JSON.stringify(nextId));   } catch {} }, [nextId]);
  useEffect(() => { try { localStorage.setItem("taskflow_view",     view);                     } catch {} }, [view]);
  useEffect(() => { try { localStorage.setItem("taskflow_settings", JSON.stringify(settings)); } catch {} }, [settings]);

  const T = THEMES[settings.theme] || THEMES.dark;
  const isDark = settings.theme === "dark";

  const today    = getToday();
  const tomorrow = getTomorrow();
  const weekEnd  = getWeekEnd();

  const backlogTasks = useMemo(() => tasks.filter(t => isBacklog(t, today)), [tasks, today]);

  // Sort helper
  function sortTaskList(list) {
    return [...list].sort((a, b) => {
      if (settings.sortOrder === "priority") {
        const po = { critical:0, urgent:1, high:2, normal:3, low:4 };
        return po[a.priority] - po[b.priority] || a.dueDate.localeCompare(b.dueDate);
      }
      if (settings.sortOrder === "date-desc") return b.dueDate.localeCompare(a.dueDate);
      return a.dueDate.localeCompare(b.dueDate); // date-asc default
    });
  }

  const filteredTasks = useMemo(() => {
    if (view === "today") {
      const backlog      = backlogTasks.filter(t => !t.done);
      const todayPending = tasks.filter(t => t.dueDate === today && !t.done);
      const done         = tasks.filter(t => (t.dueDate === today || isBacklog(t, today)) && t.done);
      return [...sortTaskList(backlog), ...sortTaskList(todayPending), ...done];
    }
    if (view === "tomorrow") return sortTaskList(tasks.filter(t => t.dueDate === tomorrow));
    if (view === "week") {
      const po = { critical:0, urgent:1, high:2, normal:3, low:4 };
      return sortTaskList(tasks.filter(t => t.dueDate >= today && t.dueDate <= weekEnd && po[t.priority] <= 2));
    }
    // All tasks
    let all = [...tasks];
    if (settings.hideCompletedInAll) all = all.filter(t => !t.done);
    return sortTaskList(all);
  }, [tasks, view, today, tomorrow, weekEnd, backlogTasks, settings.hideCompletedInAll, settings.sortOrder]);

  const stats = useMemo(() => ({
    total:    tasks.length,
    pending:  tasks.filter(t => !t.done).length,
    critical: tasks.filter(t => !t.done && t.priority === "critical").length,
    backlog:  backlogTasks.filter(t => !t.done).length,
  }), [tasks, backlogTasks]);

  function openNew() {
    setEditTask(null);
    setForm({ title: "", priority: settings.defaultPriority || "normal", dueDate: today, dependsOn: [], blocks: [], notes: "" });
    setShowForm(true);
  }
  function openEdit(task) {
    setEditTask(task);
    setForm({ title: task.title, priority: task.priority, dueDate: task.dueDate, dependsOn: task.dependsOn||[], blocks: task.blocks||[], notes: task.notes||"" });
    setShowForm(true); setSelectedTask(null);
  }

  // ── Date validation warnings for blocking relationships ───────────────────
  const depWarnings = useMemo(() => {
    if (!settings.showDueDateWarning || !form.dueDate) return {};
    const w = {};
    form.dependsOn.forEach(depId => {
      const dep = tasks.find(t => t.id === depId);
      if (dep && dep.dueDate > form.dueDate) {
        w[depId] = `Due ${dep.dueDate} — after this task's due date!`;
      }
    });
    return w;
  }, [form.dependsOn, form.dueDate, tasks, settings.showDueDateWarning]);

  const blockWarnings = useMemo(() => {
    if (!settings.showDueDateWarning || !form.dueDate) return {};
    const w = {};
    form.blocks.forEach(blockId => {
      const blocked = tasks.find(t => t.id === blockId);
      if (blocked && blocked.dueDate < form.dueDate) {
        w[blockId] = `Due ${blocked.dueDate} — before this task's due date!`;
      }
    });
    return w;
  }, [form.blocks, form.dueDate, tasks, settings.showDueDateWarning]);

  function saveForm() {
    if (!form.title.trim()) return;
    if (editTask) {
      setTasks(ts => {
        let u = ts.map(t => t.id === editTask.id ? { ...t, ...form } : t);
        u = u.map(t => {
          if (t.id === editTask.id) return t;
          if (form.blocks.includes(t.id)) return { ...t, dependsOn: (t.dependsOn||[]).includes(editTask.id) ? t.dependsOn : [...(t.dependsOn||[]), editTask.id] };
          return { ...t, dependsOn: (t.dependsOn||[]).filter(d => d !== editTask.id) };
        });
        return u;
      });
    } else {
      const newId = nextId;
      setTasks(ts => {
        let u = [...ts, { id: newId, ...form, done: false }];
        u = u.map(t => {
          if (t.id === newId) return t;
          if (form.blocks.includes(t.id)) return { ...t, dependsOn: (t.dependsOn||[]).includes(newId) ? t.dependsOn : [...(t.dependsOn||[]), newId] };
          return t;
        });
        return u;
      });
      setNextId(n => n + 1);
    }
    setShowForm(false);
  }

  function toggleDone(id) {
    setTasks(ts => ts.map(t => { if (t.id!==id) return t; if (!t.done&&!canComplete(t,ts)) return t; return {...t,done:!t.done}; }));
  }
  function deleteTask(id) {
    setTasks(ts => ts.filter(t => t.id!==id).map(t => ({ ...t, dependsOn:(t.dependsOn||[]).filter(d=>d!==id), blocks:(t.blocks||[]).filter(d=>d!==id) })));
    setSelectedTask(null);
  }
  function toggleDep(id)    { setForm(f => ({ ...f, dependsOn: f.dependsOn.includes(id) ? f.dependsOn.filter(d=>d!==id) : [...f.dependsOn,id] })); }
  function toggleBlocks(id) { setForm(f => ({ ...f, blocks:    f.blocks.includes(id)    ? f.blocks.filter(d=>d!==id)    : [...f.blocks,id]    })); }
  function updateSetting(key, val) { setSettings(s => ({ ...s, [key]: val })); }

  function handleExport() {
    const csv=tasksToCSV(tasks); const blob=new Blob([csv],{type:"text/csv"}); const url=URL.createObjectURL(blob);
    const a=document.createElement("a"); a.href=url; a.download=`taskflow_${today}.csv`; a.click(); URL.revokeObjectURL(url);
  }
  function handleImportFile(e) {
    const file=e.target.files[0]; if(!file) return;
    const reader=new FileReader();
    reader.onload=(ev)=>{ try { const imported=csvToTasks(ev.target.result); if(!imported.length){setImportError("No valid tasks found.");return;} const maxId=Math.max(...imported.map(t=>t.id),nextId-1); setTasks(imported); setNextId(maxId+1); setImportError(""); setImportSuccess(`✓ Imported ${imported.length} tasks!`); setTimeout(()=>setImportSuccess(""),3000); } catch{ setImportError("Failed to parse CSV. Use a TaskFlow export file."); }};
    reader.readAsText(file); e.target.value="";
  }

  const taskById   = id => tasks.find(t => t.id === id);
  const otherTasks = tasks.filter(t => !editTask || t.id !== editTask.id);

  // ── Shared style helpers ──────────────────────────────────────────────────
  const modalSheet = { background: T.surface, borderRadius: "24px 24px 0 0", width: "100%", maxWidth: 430, margin: "0 auto", padding: "24px 24px 48px", border: `1px solid ${T.border}` };
  const dragPill   = { width: 40, height: 4, background: T.border2, borderRadius: 2, margin: "0 auto 20px" };
  const labelStyle = (color) => ({ color: color||T.textMuted, fontSize: 11, letterSpacing: 1, textTransform: "uppercase", display: "block", marginBottom: 8, fontFamily: "'DM Mono', monospace" });
  const inputStyle = { width: "100%", background: T.inputBg, border: `1px solid ${T.border2}`, borderRadius: 12, padding: "12px 14px", color: T.text, fontSize: 15, outline: "none", fontFamily: "'DM Sans', sans-serif" };
  const sectionCard = { background: T.inputBg, borderRadius: 16, padding: 16, marginBottom: 12, border: `1px solid ${T.border}` };

  return (
    <div style={{ fontFamily: "'DM Sans','Segoe UI',sans-serif", background: T.bg, minHeight: "100vh", display: "flex", justifyContent: "center" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&family=DM+Mono:wght@400;500&display=swap');
        * { box-sizing:border-box; margin:0; padding:0; }
        ::-webkit-scrollbar{width:4px} ::-webkit-scrollbar-track{background:transparent} ::-webkit-scrollbar-thumb{background:${T.scrollThumb};border-radius:4px}
        .task-card{transition:transform 0.15s} .task-card:active{transform:scale(0.98)}
        .btn-tap{transition:opacity 0.1s,transform 0.1s} .btn-tap:active{opacity:0.7;transform:scale(0.96)}
        .pill-btn{cursor:pointer;border:none;font-family:inherit;transition:all 0.15s} .pill-btn:active{transform:scale(0.94)}
        .slide-up{animation:slideUp 0.25s cubic-bezier(0.34,1.2,0.64,1)}
        @keyframes slideUp{from{transform:translateY(30px);opacity:0}to{transform:translateY(0);opacity:1}}
        .fade-in{animation:fadeIn 0.2s ease}
        @keyframes fadeIn{from{opacity:0}to{opacity:1}}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:0.45}}
        select,input,textarea{-webkit-appearance:none;appearance:none}
        input[type=checkbox],input[type=file]{display:none}
        .toggle-track{transition:background 0.2s}
      `}</style>

      <div style={{ width: "100%", maxWidth: 430, display: "flex", flexDirection: "column", minHeight: "100vh" }}>

        {/* ── Header ── */}
        <div style={{ padding: "52px 24px 20px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
            <div>
              <div style={{ color: T.textMuted, fontSize: 12, letterSpacing: 2, textTransform: "uppercase", marginBottom: 4, fontFamily: "'DM Mono',monospace" }}>
                {new Date().toLocaleDateString("en-US", { weekday:"long", month:"short", day:"numeric" })}
              </div>
              <h1 style={{ color: T.text, fontSize: 28, fontWeight: 700, letterSpacing: -0.5 }}>TaskFlow</h1>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              {/* Settings */}
              <button className="btn-tap" onClick={() => setShowSettings(true)} title="Settings" style={{ background: T.surface, border: `1px solid ${T.border2}`, borderRadius: 14, width: 44, height: 44, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={T.textMuted} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
                </svg>
              </button>
              {/* CSV */}
              <button className="btn-tap" onClick={() => setShowCSV(true)} title="Export/Import" style={{ background: T.surface, border: `1px solid ${T.border2}`, borderRadius: 14, width: 44, height: 44, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={T.textMuted} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
                </svg>
              </button>
              {/* Add */}
              <button className="btn-tap" onClick={openNew} style={{ background: "linear-gradient(135deg,#6E5BFF,#B44DFF)", border: "none", borderRadius: 14, width: 44, height: 44, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", boxShadow: "0 4px 20px #6E5BFF40" }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              </button>
            </div>
          </div>

          {/* Stats */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 20 }}>
            {[
              { label:"Pending",  value:stats.pending,  color:"#6E5BFF", alert:false },
              { label:"Critical", value:stats.critical, color:"#FF2D55", alert:stats.critical>0 },
              { label:"Backlog",  value:stats.backlog,  color:"#FF6B00", alert:stats.backlog>0 },
            ].map(s => (
              <div key={s.label} style={{ background: T.surface, borderRadius: 14, padding: "12px 14px", border: `1px solid ${s.alert?"#FF2D5530":T.border}` }}>
                <div style={{ color: s.color, fontSize: 22, fontWeight: 700, lineHeight: 1, animation: s.alert?"pulse 2s infinite":"none" }}>{s.value}</div>
                <div style={{ color: T.textMuted, fontSize: 11, marginTop: 4, fontFamily: "'DM Mono',monospace" }}>{s.label}</div>
              </div>
            ))}
          </div>

          {/* Backlog banner */}
          {stats.backlog > 0 && view !== "today" && (
            <div onClick={() => setView("today")} style={{ background: "#FF2D5510", border: "1px solid #FF2D5530", borderRadius: 12, padding: "10px 14px", marginBottom: 16, display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
              <span style={{ fontSize: 16 }}>⚠️</span>
              <span style={{ color: "#FF2D55", fontSize: 13 }}><strong>{stats.backlog} overdue task{stats.backlog>1?"s":""}</strong> — tap to view</span>
            </div>
          )}

          {/* Tabs 2×2 */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
            {[
              { key:"today",    label:"Today",        badge:stats.backlog },
              { key:"tomorrow", label:"Tomorrow",     badge:0 },
              { key:"week",     label:"This Week ⭐", badge:0 },
              { key:"all",      label:"All Tasks",    badge:0 },
            ].map(tab => (
              <button key={tab.key} className="pill-btn" onClick={() => setView(tab.key)} style={{ padding: "9px 0", borderRadius: 12, fontSize: 12, fontWeight: 500, position: "relative", background: view===tab.key?"linear-gradient(135deg,#6E5BFF,#B44DFF)":T.surface, color: view===tab.key?"#fff":T.textMuted, border: `1px solid ${view===tab.key?"transparent":T.border}`, boxShadow: view===tab.key?"0 2px 12px #6E5BFF30":"none" }}>
                {tab.label}
                {tab.badge>0 && <span style={{ position:"absolute", top:-5, right:6, background:"#FF2D55", color:"white", fontSize:9, fontWeight:700, borderRadius:8, padding:"1px 5px", fontFamily:"'DM Mono',monospace", animation:"pulse 2s infinite" }}>{tab.badge}</span>}
              </button>
            ))}
          </div>
        </div>

        {/* ── Task List ── */}
        <div style={{ flex: 1, padding: "0 16px 20px", overflowY: "auto" }}>
          {filteredTasks.length === 0 ? (
            <div style={{ textAlign: "center", padding: "60px 20px", color: T.textMuted }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>✨</div>
              <div style={{ fontSize: 15 }}>No tasks here</div>
              <div style={{ fontSize: 12, marginTop: 4 }}>Tap + to add one</div>
            </div>
          ) : (
            <>
              {view === "today" && stats.backlog > 0 && (
                <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:10, marginTop:4 }}>
                  <div style={{ flex:1, height:1, background:"#FF2D5530" }}/><span style={{ color:"#FF2D55", fontSize:10, fontFamily:"'DM Mono',monospace", letterSpacing:1 }}>⚠ BACKLOG — OVERDUE</span><div style={{ flex:1, height:1, background:"#FF2D5530" }}/>
                </div>
              )}
              {filteredTasks.map((task, idx) => {
                const p       = getPriorityObj(task.priority);
                const canDo   = canComplete(task, tasks);
                const deps    = (task.dependsOn||[]).map(taskById).filter(Boolean);
                const blocked = tasks.filter(t => (t.dependsOn||[]).includes(task.id)); // tasks this task blocks
                const backlog = isBacklog(task, today);
                const prev    = filteredTasks[idx-1];
                const showTodayDivider = view==="today" && idx>0 && prev && isBacklog(prev,today) && !isBacklog(task,today) && !task.done;
                return (
                  <div key={task.id}>
                    {showTodayDivider && (
                      <div style={{ display:"flex", alignItems:"center", gap:10, margin:"10px 0" }}>
                        <div style={{ flex:1, height:1, background:T.border2 }}/><span style={{ color:T.textMuted, fontSize:10, fontFamily:"'DM Mono',monospace", letterSpacing:1 }}>TODAY</span><div style={{ flex:1, height:1, background:T.border2 }}/>
                      </div>
                    )}
                    <div className="task-card" onClick={() => setSelectedTask(task)} style={{ background: backlog&&!task.done ? T.backlogBg : T.surface, borderRadius:18, padding:"14px 16px", marginBottom:10, border:`1px solid ${task.done?T.border:backlog?"#FF2D5535":p.bg.replace("15","30")}`, cursor:"pointer", position:"relative", overflow:"hidden" }}>
                      {!task.done && <div style={{ position:"absolute", left:0, top:0, bottom:0, width:3, background:backlog?"#FF2D55":p.color, borderRadius:"3px 0 0 3px" }}/>}
                      <div style={{ display:"flex", alignItems:"flex-start", gap:12, paddingLeft:6 }}>
                        <button className="btn-tap" onClick={e=>{e.stopPropagation();toggleDone(task.id);}} style={{ width:26, height:26, borderRadius:"50%", flexShrink:0, marginTop:1, border:`2px solid ${task.done?p.color:canDo?(backlog?"#FF2D55":p.color+"80"):"#2a2a35"}`, background:task.done?p.color:"transparent", cursor:canDo||task.done?"pointer":"not-allowed", display:"flex", alignItems:"center", justifyContent:"center" }}>
                          {task.done && <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>}
                        </button>
                        <div style={{ flex:1, minWidth:0 }}>
                          <div style={{ display:"flex", alignItems:"center", gap:6, flexWrap:"wrap" }}>
                            <span style={{ color:task.done?T.textMuted:T.text, fontSize:15, fontWeight:500, textDecoration:task.done?"line-through":"none", flex:1 }}>{task.title}</span>
                            {backlog&&!task.done && <span style={{ background:"#FF2D5520", color:"#FF2D55", fontSize:10, fontWeight:700, padding:"3px 7px", borderRadius:6, fontFamily:"'DM Mono',monospace", animation:"pulse 2s infinite" }}>BACKLOG</span>}
                            <span style={{ background:p.bg, color:p.color, fontSize:10, fontWeight:600, padding:"3px 7px", borderRadius:6, letterSpacing:0.5, fontFamily:"'DM Mono',monospace", textTransform:"uppercase" }}>{p.label}</span>
                          </div>
                          <div style={{ display:"flex", alignItems:"center", gap:6, marginTop:6, flexWrap:"wrap" }}>
                            <span style={{ color:backlog&&!task.done?"#FF2D55":T.textMuted, fontSize:11, fontFamily:"'DM Mono',monospace" }}>
                              {task.dueDate===today?"Today":task.dueDate===tomorrow?"Tomorrow":task.dueDate}{backlog&&!task.done?" ⚠ Overdue":""}
                            </span>
                            {deps.length>0 && <span style={{ color:"#6E5BFF", fontSize:10, background:"#6E5BFF15", padding:"2px 7px", borderRadius:5, fontFamily:"'DM Mono',monospace" }}>⊙ {deps.length} Dependenc{deps.length>1?"ies":"y"}</span>}
                            {blocked.length>0 && !task.done && <span style={{ color:"#FF6B00", fontSize:10, background:"#FF6B0015", padding:"2px 7px", borderRadius:5, fontFamily:"'DM Mono',monospace" }}>⊙ {blocked.length} Blocking</span>}

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

        {/* ── Footer ── */}
        <div style={{ padding: "16px 24px", borderTop: `1px solid ${T.border}`, background: T.surface, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ width: 28, height: 28, borderRadius: 8, background: "linear-gradient(135deg,#6E5BFF,#B44DFF)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
            </div>
            <span style={{ color: T.text, fontSize: 13, fontWeight: 600 }}>TaskFlow</span>
          </div>
          <span style={{ color: T.textMuted, fontSize: 11, fontFamily: "'DM Mono',monospace" }}>
            {stats.pending} pending
          </span>
          <a href="https://skdutta.in" target="_blank" rel="noopener noreferrer" style={{ color: T.textMuted, fontSize: 11, textDecoration: "none", fontFamily: "'DM Mono',monospace" }}>
            skdutta.in
          </a>
        </div>

        {/* ── Task Detail Modal ── */}
        {selectedTask && (() => {
          const task = tasks.find(t=>t.id===selectedTask.id)||selectedTask;
          const p = getPriorityObj(task.priority);
          const deps = (task.dependsOn||[]).map(taskById).filter(Boolean);
          const canDo = canComplete(task,tasks);
          const dependents = tasks.filter(t=>(t.dependsOn||[]).includes(task.id));
          const backlog = isBacklog(task,today);
          return (
            <div className="fade-in" onClick={()=>setSelectedTask(null)} style={{ position:"fixed", inset:0, background:T.modalBg, zIndex:50, display:"flex", alignItems:"flex-end" }}>
              <div className="slide-up" onClick={e=>e.stopPropagation()} style={modalSheet}>
                <div style={dragPill}/>
                <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginBottom:10 }}>
                  <span style={{ background:p.bg, color:p.color, fontSize:10, fontWeight:600, padding:"3px 8px", borderRadius:6, fontFamily:"'DM Mono',monospace", textTransform:"uppercase" }}>{p.label}</span>
                  {backlog&&!task.done && <span style={{ background:"#FF2D5520", color:"#FF2D55", fontSize:10, fontWeight:700, padding:"3px 8px", borderRadius:6, fontFamily:"'DM Mono',monospace" }}>BACKLOG</span>}
                  {deps.length>0 && <span style={{ background:"#6E5BFF15", color:"#6E5BFF", fontSize:10, fontWeight:600, padding:"3px 8px", borderRadius:6, fontFamily:"'DM Mono',monospace" }}>⊙ {deps.length} Dependenc{deps.length>1?"ies":"y"}</span>}
                  {dependents.length>0 && <span style={{ background:"#FF6B0015", color:"#FF6B00", fontSize:10, fontWeight:600, padding:"3px 8px", borderRadius:6, fontFamily:"'DM Mono',monospace" }}>⊙ {dependents.length} Blocking</span>}
                </div>
                <h2 style={{ color:T.text, fontSize:20, fontWeight:600, marginBottom:16, lineHeight:1.3 }}>{task.title}</h2>
                <div style={{ display:"flex", gap:8, marginBottom:16 }}>
                  <div style={{ background:T.inputBg, borderRadius:10, padding:"8px 12px", flex:1, border:`1px solid ${backlog&&!task.done?"#FF2D5530":T.border}` }}>
                    <div style={labelStyle()}>Due Date</div>
                    <div style={{ color:backlog&&!task.done?"#FF2D55":T.text, fontSize:13 }}>{task.dueDate===today?"Today":task.dueDate===tomorrow?"Tomorrow":task.dueDate}{backlog&&!task.done?" ⚠":""}</div>
                  </div>
                  <div style={{ background:T.inputBg, borderRadius:10, padding:"8px 12px", flex:1, border:`1px solid ${T.border}` }}>
                    <div style={labelStyle()}>Status</div>
                    <div style={{ color:task.done?"#30D158":backlog?"#FF2D55":canDo?"#F59E0B":"#FF6B00", fontSize:13 }}>{task.done?"Completed":backlog?"Overdue":canDo?"Ready":"Blocked"}</div>
                  </div>
                </div>
                {task.notes && <div style={{ background:T.inputBg, borderRadius:10, padding:"10px 12px", marginBottom:16, border:`1px solid ${T.border}` }}><div style={labelStyle()}>Notes</div><div style={{ color:T.text, fontSize:13, lineHeight:1.5 }}>{task.notes}</div></div>}
                {deps.length>0 && (
                  <div style={{ marginBottom:16 }}>
                    <div style={labelStyle("#6E5BFF")}>Depends On</div>
                    {deps.map(d=>(
                      <div key={d.id} style={{ display:"flex", alignItems:"center", gap:8, marginBottom:6 }}>
                        <div style={{ width:8, height:8, borderRadius:"50%", background:d.done?"#30D158":"#FF6B00" }}/>
                        <span style={{ color:d.done?T.textMuted:T.text, fontSize:13, textDecoration:d.done?"line-through":"none", flex:1 }}>{d.title}</span>
                        <span style={{ color:T.textMuted, fontSize:11, fontFamily:"'DM Mono',monospace" }}>{d.dueDate}</span>
                      </div>
                    ))}
                  </div>
                )}
                {dependents.length>0 && (
                  <div style={{ marginBottom:16 }}>
                    <div style={labelStyle("#FF6B00")}>It Blocks</div>
                    {dependents.map(d=>(
                      <div key={d.id} style={{ display:"flex", alignItems:"center", gap:8, marginBottom:6 }}>
                        <div style={{ width:8, height:8, borderRadius:"50%", background:"#FF6B00" }}/>
                        <span style={{ color:T.text, fontSize:13, flex:1 }}>{d.title}</span>
                        <span style={{ color:T.textMuted, fontSize:11, fontFamily:"'DM Mono',monospace" }}>{d.dueDate}</span>
                      </div>
                    ))}
                  </div>
                )}
                <div style={{ display:"flex", gap:10, marginTop:8 }}>
                  {!task.done && <button className="btn-tap" onClick={()=>toggleDone(task.id)} disabled={!canDo} style={{ flex:2, padding:"14px", borderRadius:14, border:"none", background:canDo?"linear-gradient(135deg,#30D158,#25A244)":"#1C1C26", color:canDo?"white":T.textMuted, fontWeight:600, fontSize:15, cursor:canDo?"pointer":"not-allowed", fontFamily:"'DM Sans',sans-serif" }}>{canDo?"✓ Mark Complete":"⊙ Blocked"}</button>}
                  <button className="btn-tap" onClick={()=>openEdit(task)} style={{ flex:1, padding:"14px", borderRadius:14, border:`1px solid ${T.border2}`, background:"transparent", color:T.text, fontWeight:500, fontSize:15, cursor:"pointer", fontFamily:"'DM Sans',sans-serif" }}>Edit</button>
                  <button className="btn-tap" onClick={()=>deleteTask(task.id)} style={{ width:50, padding:"14px", borderRadius:14, border:"1px solid #FF2D5530", background:"#FF2D5510", color:"#FF2D55", fontSize:15, cursor:"pointer" }}>🗑</button>
                </div>
              </div>
            </div>
          );
        })()}

        {/* ── Add/Edit Form Modal ── */}
        {showForm && (
          <div className="fade-in" onClick={()=>setShowForm(false)} style={{ position:"fixed", inset:0, background:T.modalBg, zIndex:50, display:"flex", alignItems:"flex-end" }}>
            <div className="slide-up" onClick={e=>e.stopPropagation()} style={{ ...modalSheet, maxHeight:"90vh", overflowY:"auto" }}>
              <div style={dragPill}/>
              <h2 style={{ color:T.text, fontSize:18, fontWeight:600, marginBottom:20 }}>{editTask?"Edit Task":"New Task"}</h2>

              <div style={{ marginBottom:16 }}>
                <label style={labelStyle()}>Title *</label>
                <input value={form.title} onChange={e=>setForm(f=>({...f,title:e.target.value}))} placeholder="What needs to be done?" style={inputStyle}/>
              </div>

              <div style={{ marginBottom:16 }}>
                <label style={labelStyle()}>Priority</label>
                <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
                  {PRIORITIES.map(p=>(
                    <button key={p.key} className="pill-btn" onClick={()=>setForm(f=>({...f,priority:p.key}))} style={{ padding:"7px 14px", borderRadius:10, fontSize:12, fontWeight:500, background:form.priority===p.key?p.bg:T.inputBg, color:form.priority===p.key?p.color:T.textMuted, border:`1px solid ${form.priority===p.key?p.color+"60":T.border2}` }}>{p.label}</button>
                  ))}
                </div>
              </div>

              <div style={{ marginBottom:16 }}>
                <label style={labelStyle()}>Due Date</label>
                <input type="date" value={form.dueDate} onChange={e=>setForm(f=>({...f,dueDate:e.target.value}))} style={{ ...inputStyle, fontFamily:"'DM Mono',monospace", colorScheme:isDark?"dark":"light" }}/>
              </div>

              {otherTasks.length > 0 && (
                <>
                  <CollapsibleSection label="Depends On" labelColor="#6E5BFF" count={form.dependsOn.length} sublabel="This task can't start until these are done" T={T}>
                    <CheckboxList tasks={otherTasks} checked={form.dependsOn} onToggle={toggleDep} accentColor="#6E5BFF" accentBg="#6E5BFF15" T={T} warnings={depWarnings}/>
                  </CollapsibleSection>
                  <CollapsibleSection label="It Blocks" labelColor="#FF6B00" count={form.blocks.length} sublabel="Tasks that can't start until THIS task is done" T={T}>
                    <CheckboxList tasks={otherTasks} checked={form.blocks} onToggle={toggleBlocks} accentColor="#FF6B00" accentBg="#FF6B0015" T={T} warnings={blockWarnings}/>
                  </CollapsibleSection>
                </>
              )}

              <div style={{ marginBottom:24 }}>
                <label style={labelStyle()}>Notes</label>
                <textarea value={form.notes} onChange={e=>setForm(f=>({...f,notes:e.target.value}))} placeholder="Optional notes..." rows={3} style={{ ...inputStyle, resize:"none", lineHeight:1.5, fontSize:14 }}/>
              </div>

              <div style={{ display:"flex", gap:10 }}>
                <button className="btn-tap" onClick={()=>setShowForm(false)} style={{ flex:1, padding:"14px", borderRadius:14, border:`1px solid ${T.border2}`, background:"transparent", color:T.textMuted, fontWeight:500, fontSize:15, cursor:"pointer", fontFamily:"'DM Sans',sans-serif" }}>Cancel</button>
                <button className="btn-tap" onClick={saveForm} style={{ flex:2, padding:"14px", borderRadius:14, border:"none", background:form.title.trim()?"linear-gradient(135deg,#6E5BFF,#B44DFF)":T.border2, color:form.title.trim()?"white":T.textMuted, fontWeight:600, fontSize:15, cursor:"pointer", fontFamily:"'DM Sans',sans-serif", boxShadow:form.title.trim()?"0 4px 20px #6E5BFF30":"none" }}>
                  {editTask?"Save Changes":"Create Task"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Settings Modal ── */}
        {showSettings && (
          <div className="fade-in" onClick={()=>setShowSettings(false)} style={{ position:"fixed", inset:0, background:T.modalBg, zIndex:50, display:"flex", alignItems:"flex-end" }}>
            <div className="slide-up" onClick={e=>e.stopPropagation()} style={{ ...modalSheet, maxHeight:"90vh", overflowY:"auto" }}>
              <div style={dragPill}/>
              <h2 style={{ color:T.text, fontSize:18, fontWeight:600, marginBottom:6 }}>⚙ Settings</h2>
              <p style={{ color:T.textMuted, fontSize:13, marginBottom:24 }}>Customize your TaskFlow experience</p>

              {/* Theme */}
              <div style={sectionCard}>
                <div style={{ color:T.text, fontSize:14, fontWeight:600, marginBottom:4 }}>🎨 Theme</div>
                <div style={{ color:T.textMuted, fontSize:12, marginBottom:12 }}>Switch between dark and light mode</div>
                <div style={{ display:"flex", gap:10 }}>
                  {["dark","light"].map(th=>(
                    <button key={th} className="pill-btn" onClick={()=>updateSetting("theme",th)} style={{ flex:1, padding:"10px", borderRadius:12, fontSize:13, fontWeight:500, background:settings.theme===th?"linear-gradient(135deg,#6E5BFF,#B44DFF)":T.inputBg, color:settings.theme===th?"white":T.textMuted, border:`1px solid ${settings.theme===th?"transparent":T.border2}`, textTransform:"capitalize" }}>
                      {th==="dark"?"🌙 Dark":"☀️ Light"}
                    </button>
                  ))}
                </div>
              </div>

              {/* Hide completed in All Tasks */}
              <div style={sectionCard}>
                <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                  <div>
                    <div style={{ color:T.text, fontSize:14, fontWeight:600, marginBottom:2 }}>👁 Hide Completed Tasks</div>
                    <div style={{ color:T.textMuted, fontSize:12 }}>In "All Tasks" tab only</div>
                  </div>
                  <button className="toggle-track" onClick={()=>updateSetting("hideCompletedInAll",!settings.hideCompletedInAll)} style={{ width:48, height:28, borderRadius:14, border:"none", cursor:"pointer", background:settings.hideCompletedInAll?"#6E5BFF":"#2a2a35", padding:3, display:"flex", alignItems:"center", justifyContent:settings.hideCompletedInAll?"flex-end":"flex-start" }}>
                    <div style={{ width:22, height:22, borderRadius:11, background:"white", boxShadow:"0 1px 4px #0004" }}/>
                  </button>
                </div>
              </div>

              {/* Sort Order */}
              <div style={sectionCard}>
                <div style={{ color:T.text, fontSize:14, fontWeight:600, marginBottom:4 }}>🔃 Sort Order</div>
                <div style={{ color:T.textMuted, fontSize:12, marginBottom:12 }}>How tasks are ordered in each view</div>
                <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                  {[
                    { key:"date-asc",  label:"📅 Date — Earliest first" },
                    { key:"date-desc", label:"📅 Date — Latest first" },
                    { key:"priority",  label:"🔴 Priority — Critical first" },
                  ].map(opt=>(
                    <button key={opt.key} className="pill-btn" onClick={()=>updateSetting("sortOrder",opt.key)} style={{ padding:"10px 14px", borderRadius:10, fontSize:13, textAlign:"left", background:settings.sortOrder===opt.key?"#6E5BFF20":T.inputBg, color:settings.sortOrder===opt.key?"#6E5BFF":T.text, border:`1px solid ${settings.sortOrder===opt.key?"#6E5BFF50":T.border2}`, fontWeight:settings.sortOrder===opt.key?600:400 }}>
                      {opt.label}
                      {settings.sortOrder===opt.key && <span style={{ float:"right", color:"#6E5BFF" }}>✓</span>}
                    </button>
                  ))}
                </div>
              </div>

              {/* Due Date Warnings */}
              <div style={sectionCard}>
                <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                  <div>
                    <div style={{ color:T.text, fontSize:14, fontWeight:600, marginBottom:2 }}>⚠️ Date Conflict Warnings</div>
                    <div style={{ color:T.textMuted, fontSize:12 }}>Warn when blocking task dates conflict</div>
                  </div>
                  <button className="toggle-track" onClick={()=>updateSetting("showDueDateWarning",!settings.showDueDateWarning)} style={{ width:48, height:28, borderRadius:14, border:"none", cursor:"pointer", background:settings.showDueDateWarning?"#6E5BFF":"#2a2a35", padding:3, display:"flex", alignItems:"center", justifyContent:settings.showDueDateWarning?"flex-end":"flex-start" }}>
                    <div style={{ width:22, height:22, borderRadius:11, background:"white", boxShadow:"0 1px 4px #0004" }}/>
                  </button>
                </div>
              </div>

              {/* Default Priority */}
              <div style={sectionCard}>
                <div style={{ color:T.text, fontSize:14, fontWeight:600, marginBottom:4 }}>⚡ Default Priority</div>
                <div style={{ color:T.textMuted, fontSize:12, marginBottom:12 }}>Pre-selected when creating a new task</div>
                <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
                  {PRIORITIES.map(p=>(
                    <button key={p.key} className="pill-btn" onClick={()=>updateSetting("defaultPriority",p.key)} style={{ padding:"6px 12px", borderRadius:8, fontSize:11, fontWeight:500, background:settings.defaultPriority===p.key?p.bg:T.inputBg, color:settings.defaultPriority===p.key?p.color:T.textMuted, border:`1px solid ${settings.defaultPriority===p.key?p.color+"60":T.border2}` }}>{p.label}</button>
                  ))}
                </div>
              </div>

              {/* App info */}
              <div style={{ textAlign:"center", padding:"8px 0 4px", color:T.textMuted, fontSize:11, fontFamily:"'DM Mono',monospace" }}>
                TaskFlow v1.0 · skdutta.in
              </div>

              <button className="btn-tap" onClick={()=>setShowSettings(false)} style={{ width:"100%", padding:"14px", borderRadius:14, border:`1px solid ${T.border2}`, background:"transparent", color:T.textMuted, fontWeight:500, fontSize:15, cursor:"pointer", fontFamily:"'DM Sans',sans-serif", marginTop:12 }}>
                Close
              </button>
            </div>
          </div>
        )}

        {/* ── CSV Modal ── */}
        {showCSV && (
          <div className="fade-in" onClick={()=>{setShowCSV(false);setImportError("");setImportSuccess("");}} style={{ position:"fixed", inset:0, background:T.modalBg, zIndex:50, display:"flex", alignItems:"flex-end" }}>
            <div className="slide-up" onClick={e=>e.stopPropagation()} style={modalSheet}>
              <div style={dragPill}/>
              <h2 style={{ color:T.text, fontSize:18, fontWeight:600, marginBottom:6 }}>Export / Import</h2>
              <p style={{ color:T.textMuted, fontSize:13, marginBottom:24, lineHeight:1.5 }}>Back up your tasks as a CSV, or restore from a previously exported file.</p>
              {importError && <div style={{ background:"#FF2D5515", border:"1px solid #FF2D5530", borderRadius:12, padding:"10px 14px", marginBottom:16, color:"#FF2D55", fontSize:13 }}>⚠ {importError}</div>}
              {importSuccess && <div style={{ background:"#30D15815", border:"1px solid #30D15830", borderRadius:12, padding:"10px 14px", marginBottom:16, color:"#30D158", fontSize:13 }}>{importSuccess}</div>}
              <div style={sectionCard}>
                <div style={{ color:T.text, fontSize:14, fontWeight:600, marginBottom:4 }}>📤 Export Tasks</div>
                <div style={{ color:T.textMuted, fontSize:12, marginBottom:14, lineHeight:1.5 }}>Download all <strong style={{ color:T.text }}>{tasks.length} tasks</strong> as a <code style={{ background:T.border, padding:"1px 6px", borderRadius:4, color:"#B44DFF", fontSize:11 }}>.csv</code> file.</div>
                <button className="btn-tap" onClick={handleExport} style={{ width:"100%", padding:"12px", borderRadius:12, border:"none", background:"linear-gradient(135deg,#6E5BFF,#B44DFF)", color:"white", fontWeight:600, fontSize:14, cursor:"pointer", fontFamily:"'DM Sans',sans-serif", boxShadow:"0 4px 16px #6E5BFF30" }}>Download CSV</button>
              </div>
              <div style={sectionCard}>
                <div style={{ color:T.text, fontSize:14, fontWeight:600, marginBottom:4 }}>📥 Import Tasks</div>
                <div style={{ color:T.textMuted, fontSize:12, marginBottom:8, lineHeight:1.5 }}>Replace all current tasks from a CSV file.</div>
                <div style={{ background:"#FF6B0015", border:"1px solid #FF6B0030", borderRadius:8, padding:"8px 12px", marginBottom:14, color:"#FF6B00", fontSize:11 }}>⚠ This will replace ALL current tasks. Export first!</div>
                <input ref={fileInputRef} type="file" accept=".csv" onChange={handleImportFile}/>
                <button className="btn-tap" onClick={()=>fileInputRef.current?.click()} style={{ width:"100%", padding:"12px", borderRadius:12, border:`1px solid ${T.border2}`, background:"transparent", color:T.text, fontWeight:600, fontSize:14, cursor:"pointer", fontFamily:"'DM Sans',sans-serif" }}>Choose CSV File</button>
              </div>
              <button className="btn-tap" onClick={()=>{setShowCSV(false);setImportError("");setImportSuccess("");}} style={{ width:"100%", padding:"14px", borderRadius:14, border:`1px solid ${T.border2}`, background:"transparent", color:T.textMuted, fontWeight:500, fontSize:15, cursor:"pointer", fontFamily:"'DM Sans',sans-serif" }}>Close</button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
