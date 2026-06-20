import { useEffect, useMemo, useState } from "react";
import { supabase } from "./supabase";

const S = {
  inp:{ background:"#0f1117", border:"1px solid #2e3240", borderRadius:8, color:"#e2e8f0", padding:"9px 12px", width:"100%", fontSize:14, outline:"none" },
  btn:{ background:"#3b82f6", border:"none", color:"#fff", borderRadius:8, padding:"9px 14px", cursor:"pointer", fontWeight:900, fontSize:13 },
  btnGreen:{ background:"#16a34a", border:"none", color:"#fff", borderRadius:8, padding:"9px 14px", cursor:"pointer", fontWeight:900, fontSize:13 },
  btnGhost:{ background:"#1e2330", border:"1px solid #2e3240", color:"#94a3b8", borderRadius:8, padding:"9px 14px", cursor:"pointer", fontSize:13 },
  btnDanger:{ background:"#dc262622", border:"1px solid #dc2626", color:"#f87171", borderRadius:8, padding:"9px 14px", cursor:"pointer", fontSize:13 },
  card:{ background:"#13151c", border:"1px solid #1e2330", borderRadius:12, padding:16 },
};

const BACKUP_TABLES = ["domains", "creatives", "creative_folders", "fb_setups", "fb_setup_folders", "fb_accounts", "fb_farms", "fb_farm_folders", "fb_farm_accounts", "fb_launch_rows", "fb_launch_templates", "crm_tasks"];
const BULK_TYPES = {
  farms:{ label:"Фарми", table:"fb_farms" },
  setups:{ label:"Сетапи", table:"fb_setups" },
  tasks:{ label:"Задачі", table:"crm_tasks" },
  domains:{ label:"Домени", table:"domains" },
  creatives:{ label:"Креативи", table:"creatives" },
  launches:{ label:"Запуски", table:"fb_launch_rows" },
};
const RELEASE_ITEMS = [
  "Зробити backup перед оновленням",
  "Виконати SQL migration у Supabase",
  "Перевірити Vercel Environment Variables",
  "Redeploy Production",
  "Smoke-test: login/dashboard/creatives/farms/setups/tasks/launches",
  "Перевірити RLS: buyer не бачить чужі дані",
  "Записати короткий changelog",
];

const empty = [];
const safeDate = v => v ? new Date(v).toLocaleString("uk-UA") : "—";
const active = r => !r?.archived;
const isDone = t => ["done", "canceled"].includes(t?.status);
const isOverdue = t => active(t) && !isDone(t) && t?.due_at && new Date(t.due_at).getTime() < Date.now();
const rowName = r => r?.name || r?.title || r?.domain || r?.fb_account_id || r?.id || "—";
const mask = v => {
  const s = String(v || "");
  if (!s) return "—";
  if (s.length <= 12) return `${s.slice(0,3)}***`;
  return `${s.slice(0,7)}…${s.slice(-4)}`;
};
function unique(arr) { return [...new Set(arr.filter(Boolean))]; }
function toCsv(rows) {
  if (!rows.length) return "";
  const keys = unique(rows.flatMap(r => Object.keys(r || {})));
  const esc = v => `"${String(typeof v === "object" && v !== null ? JSON.stringify(v) : v ?? "").replaceAll('"', '""')}"`;
  return [keys.join(","), ...rows.map(r => keys.map(k => esc(r[k])).join(","))].join("\n");
}
function download(name, text, type="application/json") {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}
function countBy(rows, getKey) {
  const m = new Map();
  for (const r of rows) {
    const k = getKey(r);
    if (!k) continue;
    m.set(k, (m.get(k) || 0) + 1);
  }
  return [...m.entries()].filter(([,n]) => n > 1).sort((a,b)=>b[1]-a[1]);
}
function CheckRow({ level, label, text }) {
  const color = level === "ok" ? "#4ade80" : level === "warn" ? "#fbbf24" : "#f87171";
  const icon = level === "ok" ? "✅" : level === "warn" ? "⚠️" : "⛔";
  return <div style={{ display:"grid", gridTemplateColumns:"26px 1fr", gap:8, padding:"8px 0", borderTop:"1px solid #1a1d23" }}><span>{icon}</span><div><div style={{ color, fontWeight:900, fontSize:13 }}>{label}</div><div style={{ color:"#94a3b8", fontSize:12, marginTop:2 }}>{text}</div></div></div>;
}
function SectionTitle({ title, sub, right }) {
  return <div style={{ display:"flex", justifyContent:"space-between", gap:12, alignItems:"flex-start", marginBottom:12 }}><div><h3 style={{ color:"#e2e8f0", margin:"0 0 4px", fontSize:17, fontWeight:950 }}>{title}</h3>{sub && <div style={{ color:"#64748b", fontSize:12 }}>{sub}</div>}</div>{right}</div>;
}
function Pill({ children, color="#60a5fa" }) {
  return <span style={{ color, background:`${color}22`, border:`1px solid ${color}55`, borderRadius:999, padding:"2px 8px", fontSize:11, fontWeight:900, whiteSpace:"nowrap" }}>{children}</span>;
}

export default function TopControlTab({ user, isAdmin, canSeeAll, onNavigate }) {
  const [data, setData] = useState({});
  const [errors, setErrors] = useState([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState(null);
  const [setupId, setSetupId] = useState("");
  const [auditFilter, setAuditFilter] = useState({ entity:"", action:"", q:"" });
  const [notifyQ, setNotifyQ] = useState("");
  const [bulkType, setBulkType] = useState("farms");
  const [bulkPreset, setBulkPreset] = useState("issues");
  const [selectedIds, setSelectedIds] = useState([]);
  const [bulkBuyerId, setBulkBuyerId] = useState("");
  const [bulkTag, setBulkTag] = useState("");
  const [restoreRaw, setRestoreRaw] = useState("");
  const [restoreTable, setRestoreTable] = useState("crm_tasks");
  const [releaseChecks, setReleaseChecks] = useState(() => {
    try { return JSON.parse(localStorage.getItem("arbcrm_release_checklist") || "{}"); } catch { return {}; }
  });

  const show = (text, type="ok") => { setMsg({ text, type }); setTimeout(()=>setMsg(null), 4000); };
  const getRows = table => data[table] || empty;

  const fetchTable = async (table, opts={}) => {
    let q = supabase.from(table).select("*").limit(opts.limit || 5000);
    if (opts.order) q = q.order(opts.order, { ascending:false });
    const { data, error } = await q;
    if (error) {
      setErrors(prev => [...prev, `${table}: ${error.message}`]);
      return [];
    }
    return data || [];
  };

  const fetchAll = async () => {
    setLoading(true);
    setErrors([]);
    const tables = [...BACKUP_TABLES, "profiles", "crm_audit_logs", "crm_import_logs", "crm_release_migrations"];
    const result = {};
    await Promise.all(tables.map(async t => {
      result[t] = await fetchTable(t, { limit:t === "crm_audit_logs" ? 700 : 5000, order:t === "crm_audit_logs" ? "created_at" : undefined });
    }));
    setData(result);
    setLoading(false);
  };

  useEffect(() => { fetchAll(); }, []);
  useEffect(() => {
    if (!setupId && getRows("fb_setups").length) setSetupId(getRows("fb_setups").find(active)?.id || getRows("fb_setups")[0]?.id || "");
  }, [data, setupId]);
  useEffect(() => { try { localStorage.setItem("arbcrm_release_checklist", JSON.stringify(releaseChecks)); } catch {} }, [releaseChecks]);

  const profiles = getRows("profiles");
  const person = id => profiles.find(p => p.id === id)?.full_name || profiles.find(p => p.id === id)?.email || (id ? mask(id) : "—");

  const notifications = useMemo(() => {
    const out = [];
    getRows("fb_setups").filter(s => active(s) && s.proxy_status === "dead").forEach(s => out.push({ level:"critical", type:"setup", title:"Dead proxy у сетапі", text:rowName(s), meta:s.proxy_error || safeDate(s.proxy_checked_at), tab:"accounts" }));
    getRows("fb_farms").filter(f => active(f) && f.proxy_status === "dead").forEach(f => out.push({ level:"critical", type:"farm", title:"Dead proxy у фармі", text:rowName(f), meta:f.proxy_error || safeDate(f.proxy_checked_at), tab:"accounts" }));
    getRows("fb_setups").filter(s => active(s) && !s.proxy_host).forEach(s => out.push({ level:"warn", type:"setup", title:"Сетап без proxy", text:rowName(s), meta:person(s.buyer_id), tab:"accounts" }));
    getRows("fb_farms").filter(f => active(f) && !f.proxy_host).forEach(f => out.push({ level:"warn", type:"farm", title:"Фарм без proxy", text:rowName(f), meta:person(f.buyer_id), tab:"accounts" }));
    getRows("fb_farm_accounts").filter(a => a.status === "banned").forEach(a => out.push({ level:"critical", type:"account", title:"Бан кабінета у фармі", text:a.name || a.fb_account_id, meta:safeDate(a.checked_at), tab:"accounts" }));
    getRows("fb_accounts").filter(a => a.status === "забанений" || a.status === "banned").forEach(a => out.push({ level:"critical", type:"account", title:"Забанений FB акаунт", text:a.name || a.fb_account_id, meta:a.currency || "", tab:"accounts" }));
    getRows("fb_launch_rows").filter(r => active(r) && r.status === "error").forEach(r => out.push({ level:"critical", type:"launch", title:"Помилка запуску", text:r.error || r.notes || r.id, meta:safeDate(r.updated_at || r.created_at), tab:"launches" }));
    getRows("crm_tasks").filter(isOverdue).forEach(t => out.push({ level:"critical", type:"task", title:"Прострочена задача", text:t.title, meta:safeDate(t.due_at), tab:"tasks" }));
    getRows("creatives").filter(c => active(c) && !c.folder_id).forEach(c => out.push({ level:"warn", type:"creative", title:"Креатив без папки", text:rowName(c), meta:safeDate(c.created_at), tab:"creatives" }));
    const q = notifyQ.trim().toLowerCase();
    return out.filter(n => !q || [n.title,n.text,n.meta,n.type].join(" ").toLowerCase().includes(q));
  }, [data, notifyQ]);

  const dataQuality = useMemo(() => {
    const farms = getRows("fb_farms").filter(active);
    const setups = getRows("fb_setups").filter(active);
    const creatives = getRows("creatives").filter(active);
    const domains = getRows("domains").filter(active);
    const issues = [];
    for (const [v,n] of countBy([...farms, ...setups], r => r.proxy_host && r.proxy_port ? `${r.proxy_host}:${r.proxy_port}` : "").slice(0,8)) issues.push({ level:"warn", title:"Дублі proxy", text:`${mask(v)} · ${n} рази` });
    for (const [v,n] of countBy(setups, r => r.token).slice(0,8)) issues.push({ level:"critical", title:"Дублі setup token", text:`${mask(v)} · ${n} рази` });
    for (const [v,n] of countBy(farms, r => r.cookie_data ? String(r.cookie_data).slice(0,40) : "").slice(0,8)) issues.push({ level:"warn", title:"Схожі cookies у фармах", text:`${mask(v)} · ${n} рази` });
    const noBuyerFarms = farms.filter(f => !f.buyer_id).length;
    const noBuyerSetups = setups.filter(s => !s.buyer_id).length;
    const noProxy = [...farms, ...setups].filter(x => !x.proxy_host).length;
    const noToken = setups.filter(s => !s.token).length;
    const unsortedCreatives = creatives.filter(c => !c.folder_id).length;
    const badDomains = domains.filter(d => !d.domain || d.status === "мертвий").length;
    if (noBuyerFarms) issues.push({ level:"warn", title:"Фарми без buyer", text:`${noBuyerFarms} шт.` });
    if (noBuyerSetups) issues.push({ level:"warn", title:"Сетапи без buyer", text:`${noBuyerSetups} шт.` });
    if (noProxy) issues.push({ level:"critical", title:"Сутності без proxy", text:`${noProxy} шт.` });
    if (noToken) issues.push({ level:"critical", title:"Сетапи без token", text:`${noToken} шт.` });
    if (unsortedCreatives) issues.push({ level:"warn", title:"Креативи без папки", text:`${unsortedCreatives} шт.` });
    if (badDomains) issues.push({ level:"warn", title:"Проблемні домени", text:`${badDomains} шт.` });
    return issues;
  }, [data]);

  const preflight = useMemo(() => {
    const setup = getRows("fb_setups").find(s => s.id === setupId);
    if (!setup) return { status:"blocked", score:0, checks:[{ level:"critical", label:"Сетап не вибраний", text:"Вибери сетап для перевірки." }] };
    const accounts = getRows("fb_accounts").filter(a => a.setup_id === setup.id);
    const liveAccounts = accounts.filter(a => !["забанений", "banned"].includes(a.status));
    const launchRows = getRows("fb_launch_rows").filter(r => active(r) && r.setup_id === setup.id);
    const domains = getRows("domains").filter(active);
    const creatives = getRows("creatives").filter(active);
    const overdueTasks = getRows("crm_tasks").filter(t => isOverdue(t) && (t.entity_id === setup.id || (t.entity_type === "setup" && t.entity_id === setup.id)));
    const checks = [
      { level:setup.token ? "ok" : "critical", label:"Token", text:setup.token ? "Є token для API." : "Немає token — запуск неможливий." },
      { level:setup.proxy_host ? (setup.proxy_status === "dead" ? "critical" : "ok") : "critical", label:"Proxy", text:setup.proxy_host ? `${setup.proxy_type || "proxy"}://${mask(setup.proxy_host)}:${setup.proxy_port || ""} · ${setup.proxy_status || "не перевірено"}` : "Proxy не заданий." },
      { level:liveAccounts.length ? "ok" : accounts.length ? "critical" : "warn", label:"FB акаунти", text:accounts.length ? `Живих: ${liveAccounts.length} / ${accounts.length}` : "До сетапу не підтягнуті акаунти." },
      { level:creatives.length ? "ok" : "critical", label:"Креативи", text:creatives.length ? `Доступно ${creatives.length} активних креативів.` : "Немає активних креативів." },
      { level:domains.length ? "ok" : "critical", label:"Домени", text:domains.length ? `Доступно ${domains.length} доменів.` : "Немає активних доменів." },
      { level:launchRows.some(r => ["ready", "draft"].includes(r.status)) ? "ok" : "warn", label:"Рядки запуску", text:launchRows.length ? `Є ${launchRows.length} рядків для цього сетапу.` : "Немає підготовлених рядків запуску для сетапу." },
      { level:overdueTasks.length ? "warn" : "ok", label:"Задачі", text:overdueTasks.length ? `Є прострочені задачі: ${overdueTasks.length}` : "Прострочених задач по сетапу немає." },
    ];
    const critical = checks.filter(c => c.level === "critical").length;
    const warn = checks.filter(c => c.level === "warn").length;
    return { status:critical ? "blocked" : warn ? "warn" : "ready", score:Math.max(0, 100 - critical*25 - warn*8), checks, setup };
  }, [data, setupId]);

  const savedViews = useMemo(() => {
    const farms = getRows("fb_farms").filter(active);
    const setups = getRows("fb_setups").filter(active);
    const tasks = getRows("crm_tasks").filter(active);
    return [
      { id:"dead_proxy", label:"Dead proxy", tab:"dashboard", count:[...farms, ...setups].filter(x => x.proxy_status === "dead").length },
      { id:"no_proxy", label:"Без proxy", tab:"accounts", count:[...farms, ...setups].filter(x => !x.proxy_host).length },
      { id:"banned_accounts", label:"Бани", tab:"accounts", count:getRows("fb_farm_accounts").filter(a=>a.status === "banned").length + getRows("fb_accounts").filter(a=>a.status === "забанений" || a.status === "banned").length },
      { id:"overdue_tasks", label:"Прострочені задачі", tab:"tasks", count:tasks.filter(isOverdue).length },
      { id:"unsorted_creatives", label:"Креативи без папки", tab:"creatives", count:getRows("creatives").filter(c => active(c) && !c.folder_id).length },
      { id:"launch_errors", label:"Помилки запусків", tab:"launches", count:getRows("fb_launch_rows").filter(r => active(r) && r.status === "error").length },
    ];
  }, [data]);

  const auditRows = useMemo(() => {
    const q = auditFilter.q.trim().toLowerCase();
    return getRows("crm_audit_logs").filter(r => {
      if (auditFilter.entity && r.entity_type !== auditFilter.entity) return false;
      if (auditFilter.action && r.action !== auditFilter.action) return false;
      return !q || [r.entity_type, r.action, r.message, r.entity_id, person(r.user_id)].join(" ").toLowerCase().includes(q);
    }).slice(0,180);
  }, [data, auditFilter, profiles]);

  const bulkRows = useMemo(() => {
    const type = bulkType;
    const rows = getRows(BULK_TYPES[type].table).filter(active);
    if (bulkPreset === "all") return rows;
    if (type === "farms") return rows.filter(r => r.proxy_status === "dead" || !r.proxy_host || r.status === "banned" || r.status === "checking");
    if (type === "setups") return rows.filter(r => r.proxy_status === "dead" || !r.proxy_host || !r.token);
    if (type === "tasks") return rows.filter(r => !isDone(r) && (isOverdue(r) || r.priority === "urgent"));
    if (type === "domains") return rows.filter(r => !r.domain || r.status === "мертвий" || r.status === "на паузі");
    if (type === "creatives") return rows.filter(r => !r.folder_id || r.archived);
    if (type === "launches") return rows.filter(r => r.status === "error" || r.status === "draft");
    return rows;
  }, [data, bulkType, bulkPreset]);

  useEffect(() => { setSelectedIds(bulkRows.map(r => r.id).filter(Boolean)); }, [bulkType, bulkPreset, bulkRows.length]);

  const exportBackup = () => {
    const payload = { version:"arbcrm-top-backup-v1", exported_at:new Date().toISOString(), exported_by:user.id, tables:{} };
    BACKUP_TABLES.forEach(t => payload.tables[t] = getRows(t));
    download(`arbcrm-backup-${new Date().toISOString().slice(0,10)}.json`, JSON.stringify(payload, null, 2));
  };
  const exportSelected = (format="json") => {
    const rows = bulkRows.filter(r => selectedIds.includes(r.id));
    if (format === "csv") download(`${bulkType}-selected.csv`, toCsv(rows), "text/csv;charset=utf-8");
    else download(`${bulkType}-selected.json`, JSON.stringify(rows, null, 2));
  };
  const logImport = async (table, count, status, message="") => {
    try { await supabase.from("crm_import_logs").insert([{ user_id:user.id, table_name:table, rows_count:count, status, message }]); } catch {}
  };
  const restoreSelectedTable = async () => {
    if (!isAdmin) return show("Restore доступний тільки admin", "error");
    let parsed;
    try { parsed = JSON.parse(restoreRaw); } catch { show("JSON backup невалідний", "error"); return; }
    const rows = parsed?.tables?.[restoreTable] || parsed?.[restoreTable] || [];
    if (!Array.isArray(rows) || !rows.length) return show(`У backup немає рядків для ${restoreTable}`, "error");
    if (!confirm(`Restore ${rows.length} рядків у ${restoreTable}? Дані з таким id будуть оновлені.`)) return;
    const clean = rows.map(r => { const x = { ...r }; delete x.created_at; delete x.updated_at; return x; });
    const { error } = await supabase.from(restoreTable).upsert(clean, { onConflict:"id" });
    if (error) { await logImport(restoreTable, rows.length, "error", error.message); show("Restore error: " + error.message, "error"); return; }
    await logImport(restoreTable, rows.length, "success", "restore from JSON backup");
    show(`Restore завершено: ${rows.length} рядків`);
    setRestoreRaw("");
    fetchAll();
  };

  const bulkPatch = async (patch, label) => {
    if (!isAdmin) return show("Масові зміни доступні тільки admin", "error");
    const table = BULK_TYPES[bulkType].table;
    const ids = selectedIds.filter(Boolean);
    if (!ids.length) return show("Нічого не вибрано", "error");
    if (!confirm(`${label}: ${ids.length} елементів?`)) return;
    const { error } = await supabase.from(table).update(patch).in("id", ids);
    if (error) return show("Bulk error: " + error.message, "error");
    show(`${label}: ${ids.length}`);
    fetchAll();
  };
  const bulkAddTag = async () => {
    if (!isAdmin) return show("Тільки admin", "error");
    const tag = bulkTag.trim();
    if (!tag) return show("Вкажи тег", "error");
    if (!["farms", "setups", "creatives"].includes(bulkType)) return show("Теги підтримуються для farms/setups/creatives", "error");
    const table = BULK_TYPES[bulkType].table;
    const rows = bulkRows.filter(r => selectedIds.includes(r.id));
    for (const r of rows) await supabase.from(table).update({ tags:unique([...(Array.isArray(r.tags) ? r.tags : []), tag]) }).eq("id", r.id);
    show(`Тег додано: ${rows.length}`);
    setBulkTag("");
    fetchAll();
  };
  const bulkAssignBuyer = async () => {
    if (!["farms", "setups"].includes(bulkType)) return show("Buyer можна призначати тільки farms/setups", "error");
    if (!bulkBuyerId) return show("Вибери buyer", "error");
    await bulkPatch({ buyer_id:bulkBuyerId }, "Buyer призначено");
  };

  const openSavedView = v => {
    try { localStorage.setItem("arbcrm_saved_view_hint", JSON.stringify({ ...v, opened_at:new Date().toISOString() })); } catch {}
    if (onNavigate) onNavigate(v.tab);
  };

  const preflightColor = preflight.status === "ready" ? "#4ade80" : preflight.status === "warn" ? "#fbbf24" : "#f87171";

  return <div>
    {msg && <div style={{ position:"fixed", bottom:24, right:24, background:msg.type === "error" ? "#dc2626" : "#16a34a", color:"#fff", borderRadius:10, padding:"12px 18px", fontWeight:900, zIndex:999 }}>{msg.text}</div>}
    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:16, marginBottom:18 }}>
      <div><h2 style={{ color:"#e2e8f0", margin:"0 0 4px", fontSize:22, fontWeight:950 }}>🧭 TOP Control Center</h2><div style={{ color:"#64748b", fontSize:13 }}>Preflight, audit, notifications, backup/restore, saved views, bulk actions, data quality і release checklist в одному місці.</div></div>
      <button onClick={fetchAll} disabled={loading} style={{ ...S.btnGhost, opacity:loading ? 0.6 : 1 }}>{loading ? "Оновлюю…" : "↻ Оновити"}</button>
    </div>

    {errors.length > 0 && <div style={{ ...S.card, color:"#fbbf24", borderColor:"#854d0e", marginBottom:16 }}>Частина таблиць ще недоступна: {errors.slice(0,4).join(" · ")}{errors.length > 4 ? ` · +${errors.length-4}` : ""}</div>}

    <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(190px,1fr))", gap:12, marginBottom:18 }}>
      <div style={S.card}><div style={{ color:"#64748b", fontSize:11, fontWeight:900, textTransform:"uppercase" }}>Preflight</div><div style={{ color:preflightColor, fontSize:28, fontWeight:950 }}>{preflight.score}</div><div style={{ color:"#64748b", fontSize:12 }}>{preflight.status === "ready" ? "Готово" : preflight.status === "warn" ? "Є попередження" : "Не можна запускати"}</div></div>
      <div style={S.card}><div style={{ color:"#64748b", fontSize:11, fontWeight:900, textTransform:"uppercase" }}>Notifications</div><div style={{ color:"#f87171", fontSize:28, fontWeight:950 }}>{notifications.filter(n=>n.level === "critical").length}</div><div style={{ color:"#64748b", fontSize:12 }}>Критичних із {notifications.length}</div></div>
      <div style={S.card}><div style={{ color:"#64748b", fontSize:11, fontWeight:900, textTransform:"uppercase" }}>Data quality</div><div style={{ color:dataQuality.length ? "#fbbf24" : "#4ade80", fontSize:28, fontWeight:950 }}>{dataQuality.length}</div><div style={{ color:"#64748b", fontSize:12 }}>Проблем якості</div></div>
      <div style={S.card}><div style={{ color:"#64748b", fontSize:11, fontWeight:900, textTransform:"uppercase" }}>Audit</div><div style={{ color:"#60a5fa", fontSize:28, fontWeight:950 }}>{getRows("crm_audit_logs").length}</div><div style={{ color:"#64748b", fontSize:12 }}>Останніх подій</div></div>
      <div style={S.card}><div style={{ color:"#64748b", fontSize:11, fontWeight:900, textTransform:"uppercase" }}>Release</div><div style={{ color:"#a78bfa", fontSize:28, fontWeight:950 }}>{Object.values(releaseChecks).filter(Boolean).length}/{RELEASE_ITEMS.length}</div><div style={{ color:"#64748b", fontSize:12 }}>Checklist</div></div>
    </div>

    <div style={{ display:"grid", gridTemplateColumns:"minmax(360px,0.9fr) minmax(360px,1.1fr)", gap:16, marginBottom:16 }}>
      <div style={S.card}>
        <SectionTitle title="1. Preflight перед запуском" sub="Перевіряє сетап до заливу: token/proxy/accounts/creatives/domains/tasks." />
        <select style={{ ...S.inp, marginBottom:12 }} value={setupId} onChange={e=>setSetupId(e.target.value)}>
          <option value="">— вибери сетап —</option>
          {getRows("fb_setups").filter(active).map(s => <option key={s.id} value={s.id}>{s.name || s.id} · {person(s.buyer_id)}</option>)}
        </select>
        <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:10 }}><div style={{ color:preflightColor, fontSize:34, fontWeight:950 }}>{preflight.score}</div><Pill color={preflightColor}>{preflight.status === "ready" ? "ГОТОВО" : preflight.status === "warn" ? "ПОПЕРЕДЖЕННЯ" : "БЛОК"}</Pill></div>
        {preflight.checks.map((c,i)=><CheckRow key={i} {...c} />)}
      </div>

      <div style={S.card}>
        <SectionTitle title="6. Notification center" sub="Внутрішній центр проблем, які потребують уваги." right={<input style={{ ...S.inp, width:250 }} value={notifyQ} onChange={e=>setNotifyQ(e.target.value)} placeholder="Пошук notification…" />} />
        <div style={{ maxHeight:420, overflow:"auto" }}>
          {notifications.length === 0 ? <div style={{ color:"#4ade80", fontWeight:900, padding:12 }}>Активних notification немає.</div> : notifications.slice(0,80).map((n,i) => <div key={i} style={{ display:"grid", gridTemplateColumns:"1fr auto", gap:10, padding:"10px 0", borderTop:"1px solid #1a1d23" }}><div><div style={{ color:n.level === "critical" ? "#f87171" : "#fbbf24", fontWeight:900 }}>{n.title}</div><div style={{ color:"#94a3b8", fontSize:12, marginTop:2 }}>{n.text}</div></div><button onClick={()=>onNavigate?.(n.tab)} style={{ ...S.btnGhost, padding:"6px 9px" }}>Відкрити</button></div>)}
        </div>
      </div>
    </div>

    <div style={{ display:"grid", gridTemplateColumns:"minmax(360px,1fr) minmax(360px,1fr)", gap:16, marginBottom:16 }}>
      <div style={S.card}>
        <SectionTitle title="3. Audit UI" sub="Хто/що/коли змінив. Sensitive-поля маскуються SQL-тригером." />
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1.4fr", gap:8, marginBottom:10 }}>
          <select style={S.inp} value={auditFilter.entity} onChange={e=>setAuditFilter(p=>({...p, entity:e.target.value}))}><option value="">Всі entity</option>{unique(getRows("crm_audit_logs").map(r=>r.entity_type)).map(x=><option key={x}>{x}</option>)}</select>
          <select style={S.inp} value={auditFilter.action} onChange={e=>setAuditFilter(p=>({...p, action:e.target.value}))}><option value="">Всі actions</option>{unique(getRows("crm_audit_logs").map(r=>r.action)).map(x=><option key={x}>{x}</option>)}</select>
          <input style={S.inp} value={auditFilter.q} onChange={e=>setAuditFilter(p=>({...p, q:e.target.value}))} placeholder="Пошук audit…" />
        </div>
        <div style={{ maxHeight:390, overflow:"auto" }}>{auditRows.length === 0 ? <div style={{ color:"#64748b", padding:14 }}>Audit logs немає або SQL ще не виконаний.</div> : auditRows.map(r => <div key={r.id} style={{ padding:"9px 0", borderTop:"1px solid #1a1d23" }}><div style={{ display:"flex", gap:8, alignItems:"center", flexWrap:"wrap" }}><Pill>{r.entity_type}</Pill><Pill color={r.action === "delete" ? "#f87171" : r.action === "insert" ? "#4ade80" : "#fbbf24"}>{r.action}</Pill><span style={{ color:"#cbd5e1", fontWeight:800 }}>{r.message || r.entity_id}</span></div><div style={{ color:"#64748b", fontSize:11, marginTop:4 }}>{person(r.user_id)} · {safeDate(r.created_at)}</div></div>)}</div>
      </div>

      <div style={S.card}>
        <SectionTitle title="4. Saved views" sub="Швидкі системні views для щоденної роботи." />
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(160px,1fr))", gap:10 }}>{savedViews.map(v => <button key={v.id} onClick={()=>openSavedView(v)} style={{ ...S.card, textAlign:"left", cursor:"pointer" }}><div style={{ color:"#e2e8f0", fontWeight:950 }}>{v.label}</div><div style={{ color:v.count ? "#fbbf24" : "#4ade80", fontSize:24, fontWeight:950, marginTop:4 }}>{v.count}</div><div style={{ color:"#64748b", fontSize:12 }}>відкрити → {v.tab}</div></button>)}</div>
      </div>
    </div>

    <div style={{ display:"grid", gridTemplateColumns:"minmax(360px,1.15fr) minmax(360px,0.85fr)", gap:16, marginBottom:16 }}>
      <div style={S.card}>
        <SectionTitle title="5. Масові дії" sub="Архів, restore, buyer, tags, export по проблемних вибірках." />
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:8, marginBottom:10 }}>
          <select style={S.inp} value={bulkType} onChange={e=>setBulkType(e.target.value)}>{Object.entries(BULK_TYPES).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}</select>
          <select style={S.inp} value={bulkPreset} onChange={e=>setBulkPreset(e.target.value)}><option value="issues">Тільки проблемні</option><option value="all">Всі активні</option></select>
          <div style={{ color:"#94a3b8", display:"flex", alignItems:"center", fontWeight:900 }}>Вибрано: {selectedIds.length}/{bulkRows.length}</div>
        </div>
        <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginBottom:10 }}>
          <button onClick={()=>setSelectedIds(bulkRows.map(r=>r.id))} style={S.btnGhost}>Вибрати все</button>
          <button onClick={()=>setSelectedIds([])} style={S.btnGhost}>Очистити</button>
          <button onClick={()=>bulkPatch({ archived:true }, "В архів")} disabled={!isAdmin} style={S.btnDanger}>📦 Архів</button>
          <button onClick={()=>bulkPatch({ archived:false }, "Відновлено")} disabled={!isAdmin} style={S.btnGhost}>↩ Restore</button>
          {bulkType === "tasks" && <button onClick={()=>bulkPatch({ status:"done", completed_at:new Date().toISOString() }, "Задачі закрито")} disabled={!isAdmin} style={S.btnGreen}>✓ Done</button>}
          <button onClick={()=>exportSelected("json")} style={S.btnGhost}>JSON</button>
          <button onClick={()=>exportSelected("csv")} style={S.btnGhost}>CSV</button>
        </div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr auto 1fr auto", gap:8, marginBottom:10 }}>
          <select style={S.inp} value={bulkBuyerId} onChange={e=>setBulkBuyerId(e.target.value)}><option value="">— buyer —</option>{profiles.filter(p=>["buyer", "teamlead", "admin"].includes(p.role)).map(p=><option key={p.id} value={p.id}>{p.full_name || p.email || p.id}</option>)}</select>
          <button onClick={bulkAssignBuyer} disabled={!isAdmin} style={S.btnGhost}>Призначити</button>
          <input style={S.inp} value={bulkTag} onChange={e=>setBulkTag(e.target.value)} placeholder="tag" />
          <button onClick={bulkAddTag} disabled={!isAdmin} style={S.btnGhost}>+ tag</button>
        </div>
        <div style={{ maxHeight:260, overflow:"auto", borderTop:"1px solid #1a1d23" }}>{bulkRows.slice(0,120).map(r => <label key={r.id} style={{ display:"grid", gridTemplateColumns:"24px 1fr auto", gap:8, alignItems:"center", padding:"8px 0", borderBottom:"1px solid #1a1d23", color:"#cbd5e1", fontSize:13 }}><input type="checkbox" checked={selectedIds.includes(r.id)} onChange={e=>setSelectedIds(prev => e.target.checked ? unique([...prev, r.id]) : prev.filter(id=>id!==r.id))} /><span>{rowName(r)}</span><span style={{ color:"#64748b", fontSize:11 }}>{r.status || r.proxy_status || r.priority || ""}</span></label>)}</div>
      </div>

      <div style={S.card}>
        <SectionTitle title="8. Data quality rules" sub="Не блокує роботу, але показує, де накопичується хаос." />
        <div style={{ maxHeight:430, overflow:"auto" }}>{dataQuality.length === 0 ? <div style={{ color:"#4ade80", fontWeight:900, padding:12 }}>Критичних проблем якості не знайдено.</div> : dataQuality.map((i,idx)=><CheckRow key={idx} level={i.level === "critical" ? "critical" : "warn"} label={i.title} text={i.text} />)}</div>
      </div>
    </div>

    <div style={{ display:"grid", gridTemplateColumns:"minmax(360px,1fr) minmax(360px,1fr)", gap:16, marginBottom:16 }}>
      <div style={S.card}>
        <SectionTitle title="7. Backup / restore" sub="Admin може зняти повний JSON backup і відновити окрему таблицю." right={<button onClick={exportBackup} style={S.btn}>⬇ Full backup</button>} />
        <div style={{ color:"#fbbf24", fontSize:12, marginBottom:10 }}>Backup містить робочі дані CRM. Зберігай файл приватно.</div>
        <div style={{ display:"flex", gap:8, marginBottom:8 }}><select style={{ ...S.inp, maxWidth:260 }} value={restoreTable} onChange={e=>setRestoreTable(e.target.value)}>{BACKUP_TABLES.map(t=><option key={t}>{t}</option>)}</select><button onClick={restoreSelectedTable} disabled={!isAdmin} style={{ ...S.btnDanger, opacity:isAdmin?1:0.45 }}>Restore table</button></div>
        <textarea style={{ ...S.inp, minHeight:170, fontFamily:"monospace", resize:"vertical" }} value={restoreRaw} onChange={e=>setRestoreRaw(e.target.value)} placeholder='Встав JSON backup сюди. Restore робить upsert по id тільки для вибраної таблиці.' />
        <div style={{ color:"#64748b", fontSize:12, marginTop:8 }}>Імпорти логуються в <code>crm_import_logs</code>, якщо SQL migration виконаний.</div>
      </div>

      <div style={S.card}>
        <SectionTitle title="10. Release system" sub="Checklist перед кожним оновленням, щоб не ловити регресії." />
        {RELEASE_ITEMS.map((it,idx)=><label key={it} style={{ display:"grid", gridTemplateColumns:"24px 1fr", gap:8, padding:"8px 0", borderTop:"1px solid #1a1d23", color:releaseChecks[idx] ? "#4ade80" : "#cbd5e1", fontSize:13, fontWeight:releaseChecks[idx] ? 900 : 500 }}><input type="checkbox" checked={!!releaseChecks[idx]} onChange={e=>setReleaseChecks(p=>({...p, [idx]:e.target.checked}))} />{it}</label>)}
        <div style={{ display:"flex", gap:8, marginTop:12 }}><button onClick={()=>setReleaseChecks({})} style={S.btnGhost}>Скинути checklist</button><button onClick={()=>download(`release-checklist-${new Date().toISOString().slice(0,10)}.json`, JSON.stringify({ date:new Date().toISOString(), checks:releaseChecks }, null, 2))} style={S.btnGhost}>Export checklist</button></div>
      </div>
    </div>

    <div style={S.card}>
      <SectionTitle title="9. Performance polish" sub="Цей реліз додає SQL індекси, client-side ліміти, bulk-експорт і централізовані перевірки без зайвого навантаження на основні вкладки." />
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(140px,1fr))", gap:10 }}>{BACKUP_TABLES.map(t=><div key={t} style={{ background:"#0f1117", border:"1px solid #1e2330", borderRadius:10, padding:12 }}><div style={{ color:"#64748b", fontSize:11, fontWeight:900 }}>{t}</div><div style={{ color:"#e2e8f0", fontSize:20, fontWeight:950 }}>{getRows(t).length}</div></div>)}</div>
    </div>
  </div>;
}
