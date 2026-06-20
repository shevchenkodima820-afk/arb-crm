import { useEffect, useMemo, useState } from "react";
import { supabase } from "./supabase";

const S = {
  inp:{ background:"#0f1117", border:"1px solid #2e3240", borderRadius:8, color:"#e2e8f0", padding:"9px 12px", width:"100%", fontSize:14, outline:"none" },
  btn:{ background:"#3b82f6", border:"none", color:"#fff", borderRadius:8, padding:"9px 14px", cursor:"pointer", fontWeight:800, fontSize:13 },
  btnGhost:{ background:"#1e2330", border:"1px solid #2e3240", color:"#94a3b8", borderRadius:8, padding:"9px 14px", cursor:"pointer", fontSize:13 },
  btnDanger:{ background:"#dc262622", border:"1px solid #dc2626", color:"#f87171", borderRadius:8, padding:"9px 14px", cursor:"pointer", fontSize:13 },
  card:{ background:"#13151c", border:"1px solid #1e2330", borderRadius:12, padding:16 },
};

const STATUS = {
  open:{ label:"відкрита", color:"#60a5fa" },
  in_progress:{ label:"в роботі", color:"#fbbf24" },
  done:{ label:"закрита", color:"#4ade80" },
  canceled:{ label:"скасована", color:"#64748b" },
};
const PRIORITY = {
  low:{ label:"низький", color:"#94a3b8" },
  medium:{ label:"середній", color:"#60a5fa" },
  high:{ label:"високий", color:"#fbbf24" },
  urgent:{ label:"терміново", color:"#f87171" },
};
const ENTITY = {
  general:"Загальна",
  setup:"Сетап",
  farm:"Фарм",
  creative:"Креатив",
  launch:"Запуск",
  domain:"Домен",
};
const DEFAULT_FILTER = { status:"active", priority:"", assignee:"", q:"" };

const Field = ({ label, children }) => <div style={{ marginBottom:12 }}><label style={{ display:"block", color:"#64748b", fontSize:11, fontWeight:900, textTransform:"uppercase", letterSpacing:"0.07em", marginBottom:5 }}>{label}</label>{children}</div>;
const Modal = ({ title, onClose, children }) => <div style={{ position:"fixed", inset:0, background:"#000b", zIndex:100, display:"flex", alignItems:"center", justifyContent:"center" }}><div style={{ background:"#1a1d23", border:"1px solid #2e3240", borderRadius:14, width:"min(680px,96vw)", maxHeight:"90vh", overflowY:"auto", padding:24 }}><div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:18 }}><h3 style={{ margin:0, color:"#e2e8f0" }}>{title}</h3><button onClick={onClose} style={{ background:"none", border:"none", color:"#64748b", fontSize:24, cursor:"pointer" }}>×</button></div>{children}</div></div>;

function toLocalValue(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = n => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function person(profiles, id) { return profiles.find(p => p.id === id)?.full_name || (id ? `${String(id).slice(0,8)}…` : "—"); }
function overdue(task) { return task.due_at && !["done", "canceled"].includes(task.status) && new Date(task.due_at).getTime() < Date.now(); }
function dueSoon(task) { const t = task.due_at ? new Date(task.due_at).getTime() : 0; return t && !overdue(task) && !["done", "canceled"].includes(task.status) && t < Date.now() + 24*60*60*1000; }

function TaskForm({ initial={}, profiles=[], user, onSave, onClose }) {
  const [f, setF] = useState({ title:"", description:"", status:"open", priority:"medium", assigned_to:"", entity_type:"general", entity_id:"", ...initial, due_at:toLocalValue(initial.due_at) });
  const set = k => e => setF(p => ({ ...p, [k]:e.target.value }));
  const submit = () => {
    if (!f.title.trim()) return;
    onSave({ ...f, title:f.title.trim(), assigned_to:f.assigned_to || null, entity_id:f.entity_id || null, due_at:f.due_at ? new Date(f.due_at).toISOString() : null, user_id:initial.user_id || user.id });
  };
  return <div>
    <Field label="Назва"><input style={S.inp} value={f.title} onChange={set("title")} placeholder="Напр. замінити proxy на фармі" /></Field>
    <Field label="Опис"><textarea style={{ ...S.inp, minHeight:90, resize:"vertical" }} value={f.description || ""} onChange={set("description")} placeholder="Деталі задачі" /></Field>
    <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
      <Field label="Статус"><select style={{ ...S.inp, cursor:"pointer" }} value={f.status} onChange={set("status")}>{Object.entries(STATUS).map(([k,v]) => <option key={k} value={k}>{v.label}</option>)}</select></Field>
      <Field label="Пріоритет"><select style={{ ...S.inp, cursor:"pointer" }} value={f.priority} onChange={set("priority")}>{Object.entries(PRIORITY).map(([k,v]) => <option key={k} value={k}>{v.label}</option>)}</select></Field>
      <Field label="Виконавець"><select style={{ ...S.inp, cursor:"pointer" }} value={f.assigned_to || ""} onChange={set("assigned_to")}><option value="">— без виконавця —</option>{profiles.map(p => <option key={p.id} value={p.id}>{p.full_name || p.id} · {p.role}</option>)}</select></Field>
      <Field label="Дедлайн"><input style={S.inp} type="datetime-local" value={f.due_at || ""} onChange={set("due_at")} /></Field>
      <Field label="Тип обʼєкта"><select style={{ ...S.inp, cursor:"pointer" }} value={f.entity_type || "general"} onChange={set("entity_type")}>{Object.entries(ENTITY).map(([k,v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
      <Field label="ID обʼєкта optional"><input style={S.inp} value={f.entity_id || ""} onChange={set("entity_id")} placeholder="uuid / fb id / назва" /></Field>
    </div>
    <div style={{ display:"flex", justifyContent:"flex-end", gap:10, marginTop:10 }}><button onClick={onClose} style={S.btnGhost}>Скасувати</button><button onClick={submit} style={S.btn}>Зберегти</button></div>
  </div>;
}

export default function TasksTab({ user, isAdmin, canSeeAll }) {
  const [tasks, setTasks] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [modal, setModal] = useState(null);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState(() => {
    try { return { ...DEFAULT_FILTER, ...(JSON.parse(localStorage.getItem("arbcrm_tasks_filter") || "{}")) }; } catch { return DEFAULT_FILTER; }
  });
  const [toast, setToast] = useState(null);
  const showToast = (msg, type="ok") => { setToast({ msg, type }); setTimeout(()=>setToast(null), 3000); };

  const fetchAll = async () => {
    setLoading(true);
    const [{ data:t, error:te }, { data:p }] = await Promise.all([
      supabase.from("crm_tasks").select("*").order("due_at", { ascending:true, nullsFirst:false }).order("created_at", { ascending:false }),
      supabase.from("profiles").select("id, full_name, role").order("full_name"),
    ]);
    if (te) showToast("Таблиця задач не готова: виконай SQL migration", "error");
    setTasks(t || []);
    setProfiles(p || []);
    setLoading(false);
  };
  useEffect(() => { fetchAll(); }, []);
  useEffect(() => { try { localStorage.setItem("arbcrm_tasks_filter", JSON.stringify(filter)); } catch {} }, [filter]);

  const filtered = useMemo(() => tasks.filter(t => {
    if (filter.status === "active" && ["done", "canceled"].includes(t.status)) return false;
    if (filter.status && filter.status !== "active" && t.status !== filter.status) return false;
    if (filter.priority && t.priority !== filter.priority) return false;
    if (filter.assignee && t.assigned_to !== filter.assignee) return false;
    const text = [t.title, t.description, t.entity_type, t.entity_id, person(profiles, t.assigned_to)].join(" ").toLowerCase();
    return !filter.q.trim() || text.includes(filter.q.trim().toLowerCase());
  }), [tasks, filter, profiles]);

  const stats = {
    active:tasks.filter(t => !["done", "canceled"].includes(t.status)).length,
    overdue:tasks.filter(overdue).length,
    soon:tasks.filter(dueSoon).length,
    done:tasks.filter(t => t.status === "done").length,
  };

  const saveTask = async (payload) => {
    const id = modal?.data?.id;
    const req = id ? supabase.from("crm_tasks").update(payload).eq("id", id) : supabase.from("crm_tasks").insert([payload]);
    const { error } = await req;
    if (error) { showToast("Помилка: " + error.message, "error"); return; }
    showToast(id ? "Задачу оновлено" : "Задачу створено");
    setModal(null); fetchAll();
  };
  const markDone = async (task) => {
    const { error } = await supabase.from("crm_tasks").update({ status:"done", completed_at:new Date().toISOString() }).eq("id", task.id);
    if (error) showToast("Помилка: " + error.message, "error"); else { showToast("Задачу закрито"); fetchAll(); }
  };
  const del = async (task) => {
    if (!confirm(`Видалити задачу "${task.title}"?`)) return;
    const { error } = await supabase.from("crm_tasks").delete().eq("id", task.id);
    if (error) showToast("Помилка: " + error.message, "error"); else { showToast("Видалено"); fetchAll(); }
  };

  return <div>
    {toast && <div style={{ position:"fixed", bottom:24, right:24, background:toast.type === "error" ? "#dc2626" : "#16a34a", color:"#fff", borderRadius:10, padding:"12px 18px", fontWeight:800, zIndex:999 }}>{toast.msg}</div>}
    <div style={{ display:"flex", justifyContent:"space-between", gap:14, alignItems:"flex-start", marginBottom:16 }}>
      <div><h2 style={{ color:"#e2e8f0", margin:"0 0 4px", fontSize:22, fontWeight:900 }}>✅ Задачі та нагадування</h2><div style={{ color:"#64748b", fontSize:13 }}>Контроль проблемних фармів, proxy, запусків і внутрішніх задач.</div></div>
      <button onClick={()=>setModal({ mode:"add", data:{} })} style={S.btn}>+ Задача</button>
    </div>

    <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(140px,1fr))", gap:12, marginBottom:16 }}>
      {[["Активні",stats.active,"#60a5fa"],["Прострочені",stats.overdue,"#f87171"],["До 24 год",stats.soon,"#fbbf24"],["Закриті",stats.done,"#4ade80"]].map(([l,v,c]) => <div key={l} style={S.card}><div style={{ color:"#64748b", fontSize:11, fontWeight:900, textTransform:"uppercase" }}>{l}</div><div style={{ color:c, fontSize:24, fontWeight:900 }}>{v}</div></div>)}
    </div>

    <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(160px,1fr))", gap:10, marginBottom:16 }}>
      <input style={S.inp} value={filter.q} onChange={e=>setFilter(p=>({...p,q:e.target.value}))} placeholder="Пошук задачі…" />
      <select style={{ ...S.inp, cursor:"pointer" }} value={filter.status} onChange={e=>setFilter(p=>({...p,status:e.target.value}))}><option value="active">Активні</option>{Object.entries(STATUS).map(([k,v]) => <option key={k} value={k}>{v.label}</option>)}<option value="">Всі</option></select>
      <select style={{ ...S.inp, cursor:"pointer" }} value={filter.priority} onChange={e=>setFilter(p=>({...p,priority:e.target.value}))}><option value="">Всі пріоритети</option>{Object.entries(PRIORITY).map(([k,v]) => <option key={k} value={k}>{v.label}</option>)}</select>
      <select style={{ ...S.inp, cursor:"pointer" }} value={filter.assignee} onChange={e=>setFilter(p=>({...p,assignee:e.target.value}))}><option value="">Всі виконавці</option>{profiles.map(p => <option key={p.id} value={p.id}>{p.full_name || p.id}</option>)}</select>
      <button onClick={()=>setFilter(DEFAULT_FILTER)} style={S.btnGhost}>Скинути</button>
    </div>

    {loading ? <div style={{ color:"#64748b", padding:40, textAlign:"center" }}>Завантаження…</div> : <div style={{ display:"grid", gap:10 }}>
      {filtered.length === 0 && <div style={{ ...S.card, color:"#64748b", textAlign:"center", padding:40 }}>Задач немає</div>}
      {filtered.map(task => {
        const st = STATUS[task.status] || STATUS.open;
        const pr = PRIORITY[task.priority] || PRIORITY.medium;
        const isOverdue = overdue(task);
        return <div key={task.id} style={{ ...S.card, borderColor:isOverdue ? "#7f1d1d" : dueSoon(task) ? "#854d0e" : "#1e2330" }}>
          <div style={{ display:"grid", gridTemplateColumns:"1fr auto", gap:12 }}>
            <div>
              <div style={{ display:"flex", alignItems:"center", gap:8, flexWrap:"wrap" }}>
                <span style={{ color:"#e2e8f0", fontWeight:900, fontSize:15 }}>{task.title}</span>
                <span style={{ color:st.color, background:`${st.color}22`, border:`1px solid ${st.color}55`, borderRadius:999, padding:"2px 8px", fontSize:11, fontWeight:900 }}>{st.label}</span>
                <span style={{ color:pr.color, background:`${pr.color}22`, border:`1px solid ${pr.color}55`, borderRadius:999, padding:"2px 8px", fontSize:11, fontWeight:900 }}>{pr.label}</span>
                {isOverdue && <span style={{ color:"#fecaca", background:"#7f1d1d66", borderRadius:999, padding:"2px 8px", fontSize:11, fontWeight:900 }}>прострочено</span>}
              </div>
              {task.description && <div style={{ color:"#94a3b8", fontSize:13, marginTop:7 }}>{task.description}</div>}
              <div style={{ color:"#64748b", fontSize:12, marginTop:8, display:"flex", gap:12, flexWrap:"wrap" }}><span>👤 {person(profiles, task.assigned_to)}</span><span>🧩 {ENTITY[task.entity_type] || task.entity_type}</span>{task.entity_id && <span>🔗 {task.entity_id}</span>}<span>⏰ {task.due_at ? new Date(task.due_at).toLocaleString("uk-UA") : "без дедлайну"}</span></div>
            </div>
            <div style={{ display:"flex", gap:8, alignItems:"start" }}>
              {task.status !== "done" && <button onClick={()=>markDone(task)} style={{ ...S.btnGhost, color:"#4ade80" }}>✓</button>}
              <button onClick={()=>setModal({ mode:"edit", data:task })} style={S.btnGhost}>✏️</button>
              {(isAdmin || task.user_id === user.id) && <button onClick={()=>del(task)} style={S.btnDanger}>🗑</button>}
            </div>
          </div>
        </div>;
      })}
    </div>}

    {modal && <Modal title={modal.mode === "edit" ? "Редагувати задачу" : "Нова задача"} onClose={()=>setModal(null)}><TaskForm initial={modal.data} profiles={profiles} user={user} onSave={saveTask} onClose={()=>setModal(null)} /></Modal>}
  </div>;
}
