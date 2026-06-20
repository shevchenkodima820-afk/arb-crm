import { useEffect, useMemo, useState } from "react";
import { supabase } from "./supabase";

const S = {
  inp: { background:"#0f1117", border:"1px solid #2e3240", borderRadius:6, color:"#e2e8f0", padding:"7px 9px", width:"100%", fontSize:12, outline:"none" },
  btn: { background:"#3b82f6", border:"none", color:"#fff", borderRadius:8, padding:"9px 16px", cursor:"pointer", fontWeight:700, fontSize:13 },
  btnGhost: { background:"#1e2330", border:"1px solid #2e3240", color:"#94a3b8", borderRadius:8, padding:"9px 16px", cursor:"pointer", fontSize:13 },
  btnGreen: { background:"#16a34a", border:"none", color:"#fff", borderRadius:8, padding:"9px 16px", cursor:"pointer", fontWeight:700, fontSize:13 },
  btnDanger: { background:"#dc262622", border:"1px solid #dc2626", color:"#f87171", borderRadius:8, padding:"8px 12px", cursor:"pointer", fontSize:13 },
  card: { background:"#13151c", border:"1px solid #1e2330", borderRadius:12, padding:16 },
};

const STATUS = {
  draft: { label:"Підготовка", bg:"#64748b22", color:"#94a3b8" },
  ready: { label:"Готовий", bg:"#2563eb22", color:"#60a5fa" },
  launching: { label:"Запускається", bg:"#ca8a0422", color:"#fbbf24" },
  launched: { label:"Запущено", bg:"#16a34a22", color:"#4ade80" },
  error: { label:"Помилка", bg:"#dc262622", color:"#f87171" },
};

const DEFAULT_ROW = {
  status:"draft",
  launch_date:"",
  launch_time:"00:00",
  schedule_mode:"midnight_account",
  setup_id:"",
  fb_account_id:"",
  page_id:"",
  pixel_id:"",
  currency:"",
  budget_type:"daily",
  daily_budget:"10",
  strategy:"LOWEST_COST_WITHOUT_CAP",
  attribution:"7-1-1",
  geo:"UA",
  target_languages:"",
  white_languages:"off",
  gender:"all",
  age_min:"18",
  age_max:"65",
  adv_audience:false,
  placements:"auto",
  device_os:"all",
  creative_id:"",
  unique_creative:false,
  prolong:false,
  catalog:false,
  comments:"allowed",
  campaign_objective:"OUTCOME_TRAFFIC",
  special_categories:"NONE",
  message:"",
  headline:"",
  description:"",
  cta:"LEARN_MORE",
  display_url:"",
  adv_plus:false,
  domain_id:"",
  link_url:"",
  sub:"",
  tracker_project:"",
  campaign_name:"auto",
  adset_name:"auto",
  ad_name:"[[creative.name]]",
  fb_campaign_id:"",
  fb_adset_id:"",
  fb_creative_id:"",
  fb_ad_id:"",
  notes:"",
  error:"",
};

const scheduleOptions = [
  ["now", "Зразу"],
  ["at_time", "Дата/час"],
  ["midnight_account", "00:00 каб."],
];

const objectiveOptions = [
  "OUTCOME_TRAFFIC",
  "OUTCOME_SALES",
  "OUTCOME_LEADS",
  "OUTCOME_ENGAGEMENT",
  "OUTCOME_APP_PROMOTION",
];

const ctaOptions = ["LEARN_MORE", "SIGN_UP", "DOWNLOAD", "SHOP_NOW", "CONTACT_US", "APPLY_NOW", "SUBSCRIBE"];
const strategyOptions = ["LOWEST_COST_WITHOUT_CAP", "LOWEST_COST_WITH_BID_CAP", "COST_CAP"];

const cellBase = {
  padding:6,
  borderBottom:"1px solid #1e2330",
  borderRight:"1px solid #1e2330",
  verticalAlign:"middle",
  minWidth:120,
};
const headBase = {
  padding:"9px 8px",
  borderBottom:"1px solid #1e2330",
  borderRight:"1px solid #1e2330",
  color:"#94a3b8",
  background:"#0f1117",
  fontSize:11,
  fontWeight:800,
  textAlign:"left",
  whiteSpace:"nowrap",
};

function StatusBadge({ status }) {
  const s = STATUS[status] || STATUS.draft;
  return <span style={{ background:s.bg, color:s.color, borderRadius:7, padding:"4px 8px", fontSize:11, fontWeight:800, whiteSpace:"nowrap" }}>{s.label}</span>;
}

function emptyRows(count, userId) {
  return Array.from({ length:count }, () => ({
    ...DEFAULT_ROW,
    user_id:userId,
    _localId:crypto.randomUUID(),
    _selected:false,
    _dirty:true,
  }));
}

function normalizeAccountId(id) {
  if (!id) return "";
  const raw = String(id).trim();
  return raw.startsWith("act_") ? raw : `act_${raw}`;
}

function optionLabel(value, fallback = "—") {
  return value || fallback;
}

function renderTemplate(template, ctx) {
  if (!template || template === "auto") return "";
  return String(template).replace(/\[\[\s*([a-zA-Z0-9_.-]+)\s*\]\]/g, (_m, key) => {
    const parts = key.split(".");
    let cur = ctx;
    for (const p of parts) cur = cur?.[p];
    return cur ?? "";
  });
}

async function getSessionToken() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error("Немає активної сесії");
  return session.access_token;
}

async function callFbApi(token, endpoint, params, proxy) {
  const accessToken = await getSessionToken();
  const res = await fetch("/api/fb", {
    method:"POST",
    headers:{ "Content-Type":"application/json", Authorization:`Bearer ${accessToken}` },
    body:JSON.stringify({ token, endpoint, params, proxy }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || data?.error || `FB proxy error ${res.status}`);
  return data;
}

async function launchCampaign(payload) {
  const accessToken = await getSessionToken();
  const res = await fetch("/api/fb-launch-campaign", {
    method:"POST",
    headers:{ "Content-Type":"application/json", Authorization:`Bearer ${accessToken}` },
    body:JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || data?.error || `Launch error ${res.status}`);
  return data;
}

function proxyFromSetup(setup) {
  return setup?.proxy_host ? {
    type:setup.proxy_type,
    host:setup.proxy_host,
    port:setup.proxy_port,
    user:setup.proxy_user,
    pass:setup.proxy_pass,
  } : null;
}

function getDomainUrl(row, domains) {
  if (row.link_url) return row.link_url;
  const domain = domains.find(d => d.id === row.domain_id);
  if (!domain?.domain) return "";
  return domain.domain.startsWith("http") ? domain.domain : `https://${domain.domain}`;
}

function rowToDb(row, userId) {
  const out = {};
  for (const [key, value] of Object.entries(row)) {
    if (key.startsWith("_")) continue;
    out[key] = value === undefined ? null : value;
  }
  out.user_id = row.user_id || userId;
  return out;
}

function buildLaunchPayload(row, { setups, domains, creatives }) {
  const setup = setups.find(s => s.id === row.setup_id);
  const creative = creatives.find(c => c.id === row.creative_id);
  const domain = domains.find(d => d.id === row.domain_id);
  if (!setup) throw new Error("Не вибрано сетап");
  if (!row.fb_account_id) throw new Error("Не вибрано рекламний кабінет");
  if (!row.page_id) throw new Error("Не вказано fan page");

  const linkUrl = getDomainUrl(row, domains);
  if (!linkUrl) throw new Error("Не вказано посилання або домен");
  if (!row.message) throw new Error("Не заповнений текст");
  if (!row.headline) throw new Error("Не заповнений заголовок");
  if (row.budget_type !== "daily") throw new Error("Поки підтримується тільки daily budget");

  const now = new Date();
  const ctx = {
    date:now.toISOString().slice(0, 10),
    time:now.toTimeString().slice(0, 5),
    geo:row.geo,
    account:{ id:row.fb_account_id },
    setup:{ name:setup.name },
    creative:{ name:creative?.name || "creative" },
    domain:{ name:domain?.domain || "domain" },
  };

  const campaignName = renderTemplate(row.campaign_name, ctx) || `${ctx.setup.name} ${ctx.geo} ${ctx.date}`;
  const adsetName = renderTemplate(row.adset_name, ctx) || `${campaignName} / ${row.geo}`;
  const adName = renderTemplate(row.ad_name, ctx) || `${creative?.name || campaignName}`;

  let schedule = { mode:row.schedule_mode || "midnight_account" };
  if (row.schedule_mode === "at_time") {
    if (!row.launch_date) throw new Error("Для запуску на конкретний час вкажіть дату");
    const localValue = `${row.launch_date}T${row.launch_time || "00:00"}`;
    const dt = new Date(localValue);
    if (Number.isNaN(dt.getTime())) throw new Error("Невалідна дата/час запуску");
    schedule.start_time = dt.toISOString();
  }

  return {
    token:setup.token,
    setup_id:setup.id,
    proxy:proxyFromSetup(setup),
    account_id:normalizeAccountId(row.fb_account_id),
    page_id:row.page_id,
    pixel_id:row.pixel_id || null,
    campaign_name:campaignName,
    adset_name:adsetName,
    ad_name:adName,
    objective:row.campaign_objective || "OUTCOME_TRAFFIC",
    daily_budget:Number(row.daily_budget || 0),
    geo:row.geo || "UA",
    age_min:Number(row.age_min || 18),
    age_max:Number(row.age_max || 65),
    link_url:linkUrl,
    image_url:row.creative_url || creative?.preview_url || null,
    message:row.message,
    headline:row.headline,
    description:row.description || null,
    cta:row.cta || "LEARN_MORE",
    bid_strategy:row.strategy || "LOWEST_COST_WITHOUT_CAP",
    schedule,
  };
}

export default function LaunchesTab({ user, isAdmin, canSeeAll }) {
  const [mode, setMode] = useState("prep");
  const [rows, setRows] = useState([]);
  const [setups, setSetups] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [domains, setDomains] = useState([]);
  const [creatives, setCreatives] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [lookup, setLookup] = useState({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [launching, setLaunching] = useState(false);
  const [addCount, setAddCount] = useState(10);
  const [showIds, setShowIds] = useState(false);
  const [toast, setToast] = useState(null);

  const showToast = (msg, type = "ok") => { setToast({ msg, type }); setTimeout(() => setToast(null), 3500); };

  const fetchAll = async () => {
    setLoading(true);
    const [{ data:r, error:re }, { data:s }, { data:a }, { data:d }, { data:c }, tpl] = await Promise.all([
      supabase.from("fb_launch_rows").select("*").order("created_at", { ascending:false }),
      supabase.from("fb_setups").select("*").order("created_at", { ascending:false }),
      supabase.from("fb_accounts").select("*").order("created_at", { ascending:false }),
      supabase.from("domains").select("*").order("created_at", { ascending:false }),
      supabase.from("creatives").select("*").order("created_at", { ascending:false }),
      supabase.from("fb_launch_templates").select("*").order("created_at", { ascending:false }),
    ]);

    if (re) showToast("Таблиця запусків не готова: виконайте SQL migration", "error");
    setRows((r || []).map(row => ({ ...DEFAULT_ROW, ...row, _localId:row.id || crypto.randomUUID(), _selected:false, _dirty:false })));
    setSetups(s || []);
    setAccounts(a || []);
    setDomains(d || []);
    setCreatives(c || []);
    if (!tpl.error) setTemplates(tpl.data || []);
    setLoading(false);
  };

  useEffect(() => { fetchAll(); }, []);

  const visibleRows = useMemo(() => rows.filter(row => !row.archived && (mode === "launched" ? row.status === "launched" : row.status !== "launched")), [rows, mode]);
  const selectedRows = rows.filter(r => r._selected && (mode === "launched" ? r.status === "launched" : r.status !== "launched"));

  const templateFromRow = (row) => {
    const payload = rowToDb(row, user.id);
    ["id", "user_id", "status", "fb_campaign_id", "fb_adset_id", "fb_creative_id", "fb_ad_id", "error", "created_at", "updated_at"].forEach(k => delete payload[k]);
    return payload;
  };

  const saveTemplate = async () => {
    const source = selectedRows[0] || visibleRows[0];
    if (!source) { showToast("Немає рядка для шаблону", "error"); return; }
    const name = prompt("Назва шаблону запуску", `Template ${templates.length + 1}`);
    if (!name?.trim()) return;
    const { error } = await supabase.from("fb_launch_templates").insert([{ user_id:user.id, name:name.trim(), data:templateFromRow(source) }]);
    if (error) { showToast("Помилка шаблону: " + error.message, "error"); return; }
    showToast("Шаблон збережено");
    await fetchAll();
  };

  const applyTemplate = () => {
    const template = templates.find(t => t.id === selectedTemplateId);
    if (!template) { showToast("Вибери шаблон", "error"); return; }
    if (!selectedRows.length) { showToast("Вибери рядки, куди застосувати шаблон", "error"); return; }
    const data = template.data || {};
    const ids = new Set(selectedRows.map(r => r._localId));
    setRows(prev => prev.map(row => ids.has(row._localId) ? {
      ...row,
      ...data,
      id:row.id,
      user_id:row.user_id || user.id,
      status:row.status,
      fb_campaign_id:row.fb_campaign_id,
      fb_adset_id:row.fb_adset_id,
      fb_creative_id:row.fb_creative_id,
      fb_ad_id:row.fb_ad_id,
      error:row.error,
      _localId:row._localId,
      _selected:row._selected,
      _dirty:true,
    } : row));
    showToast(`Шаблон застосовано до ${selectedRows.length} рядків`);
  };

  const deleteTemplate = async () => {
    if (!selectedTemplateId) return;
    const template = templates.find(t => t.id === selectedTemplateId);
    if (!confirm(`Видалити шаблон "${template?.name || selectedTemplateId}"?`)) return;
    const { error } = await supabase.from("fb_launch_templates").delete().eq("id", selectedTemplateId);
    if (error) { showToast("Помилка видалення шаблону: " + error.message, "error"); return; }
    setSelectedTemplateId("");
    showToast("Шаблон видалено");
    await fetchAll();
  };

  const updateRow = (localId, key, value) => {
    setRows(prev => prev.map(row => row._localId === localId ? { ...row, [key]:value, _dirty:true } : row));
  };

  const patchRow = (localId, patch) => {
    setRows(prev => prev.map(row => row._localId === localId ? { ...row, ...patch, _dirty:true } : row));
  };

  const addRows = () => {
    setRows(prev => [...emptyRows(Number(addCount) || 1, user.id), ...prev]);
  };

  const removeSelected = async () => {
    const toRemove = selectedRows;
    if (!toRemove.length) return;
    if (!confirm(`Перенести ${toRemove.length} рядків запуску в архів?`)) return;
    const ids = toRemove.map(r => r.id).filter(Boolean);
    if (ids.length) {
      const { error } = await supabase.from("fb_launch_rows").update({ archived:true }).in("id", ids);
      if (error) { showToast("Помилка архівації: " + error.message + ". Виконай TOP CRM SQL migration.", "error"); return; }
    }
    setRows(prev => prev.map(r => toRemove.some(x => x._localId === r._localId) ? { ...r, archived:true } : r));
  };

  const saveRows = async () => {
    setSaving(true);
    try {
      const dirty = rows.filter(r => r._dirty);
      for (const row of dirty) {
        const payload = rowToDb(row, user.id);
        if (row.id) {
          const { error } = await supabase.from("fb_launch_rows").update(payload).eq("id", row.id);
          if (error) throw error;
        } else {
          delete payload.id;
          const { data, error } = await supabase.from("fb_launch_rows").insert([payload]).select().single();
          if (error) throw error;
          row.id = data.id;
        }
        row._dirty = false;
      }
      setRows(prev => prev.map(r => ({ ...r, _dirty:false })));
      showToast(`Збережено ${dirty.length} рядків`);
      await fetchAll();
    } catch (e) {
      showToast("Помилка збереження: " + e.message, "error");
    }
    setSaving(false);
  };

  const loadLookup = async (setupId) => {
    const setup = setups.find(s => s.id === setupId);
    if (!setup) return;
    if (lookup[setupId]?.loaded || lookup[setupId]?.loading) return;
    setLookup(prev => ({ ...prev, [setupId]:{ loading:true, accounts:[], pages:[], pixels:[] } }));
    try {
      const proxy = proxyFromSetup(setup);
      const [adAccounts, pages, pixels] = await Promise.all([
        callFbApi(setup.token, "me/adaccounts", { fields:"id,name,account_status,currency,timezone_name", limit:"100" }, proxy),
        callFbApi(setup.token, "me/accounts", { fields:"id,name,fan_count,followers_count", limit:"100" }, proxy),
        callFbApi(setup.token, "me/adaccounts", { fields:"id,name,adspixels{id,name,last_fired_time}", limit:"50" }, proxy),
      ]);
      const allPixels = [];
      (pixels.data || []).forEach(acc => (acc.adspixels?.data || []).forEach(px => {
        if (!allPixels.some(p => p.id === px.id)) allPixels.push(px);
      }));
      setLookup(prev => ({ ...prev, [setupId]:{ loaded:true, loading:false, accounts:adAccounts.data || [], pages:pages.data || [], pixels:allPixels } }));
      showToast("FB довідники підтягнуто");
    } catch (e) {
      setLookup(prev => ({ ...prev, [setupId]:{ loaded:false, loading:false, error:e.message, accounts:[], pages:[], pixels:[] } }));
      showToast("FB lookup error: " + e.message, "error");
    }
  };

  const launchRows = async (targets) => {
    const launchTargets = targets.filter(r => r.status !== "launched");
    if (!launchTargets.length) return;
    if (!confirm(`Запустити ${launchTargets.length} рядків?`)) return;
    await saveRows();
    setLaunching(true);

    for (const row of launchTargets) {
      patchRow(row._localId, { status:"launching", error:"" });
      try {
        const payload = buildLaunchPayload(row, { setups, domains, creatives });
        const result = await launchCampaign(payload);
        const patch = {
          status:"launched",
          fb_campaign_id:result.campaign_id,
          fb_adset_id:result.adset_id,
          fb_creative_id:result.creative_id,
          fb_ad_id:result.ad_id,
          error:"",
        };
        patchRow(row._localId, patch);
        if (row.id) await supabase.from("fb_launch_rows").update(patch).eq("id", row.id);
      } catch (e) {
        const patch = { status:"error", error:e.message };
        patchRow(row._localId, patch);
        if (row.id) await supabase.from("fb_launch_rows").update(patch).eq("id", row.id);
      }
    }

    setLaunching(false);
    showToast("Запуск завершено. Перевір статуси рядків.");
    await fetchAll();
  };

  const launchSelected = () => launchRows(selectedRows);
  const launchReady = () => launchRows(rows.filter(r => r.status === "ready" || r._selected));

  const setSelectedAllVisible = (checked) => {
    const ids = new Set(visibleRows.map(r => r._localId));
    setRows(prev => prev.map(r => ids.has(r._localId) ? { ...r, _selected:checked } : r));
  };

  const getSetupAccounts = (row) => {
    const live = lookup[row.setup_id]?.accounts || [];
    const fromDb = accounts.filter(a => !row.setup_id || a.setup_id === row.setup_id).map(a => ({ id:a.fb_account_id, name:a.name, currency:a.currency }));
    const merged = [...live, ...fromDb];
    const seen = new Set();
    return merged.filter(a => {
      const id = a.id || a.fb_account_id;
      if (!id || seen.has(id)) return false;
      seen.add(id);
      return true;
    });
  };

  const renderInput = (row, key, props = {}) => (
    <input style={S.inp} value={row[key] || ""} onChange={e=>updateRow(row._localId, key, e.target.value)} {...props} />
  );
  const renderCheck = (row, key) => (
    <input type="checkbox" checked={!!row[key]} onChange={e=>updateRow(row._localId, key, e.target.checked)} />
  );
  const renderSelect = (row, key, options, props = {}) => (
    <select style={{ ...S.inp, cursor:"pointer" }} value={row[key] || ""} onChange={e=>updateRow(row._localId, key, e.target.value)} {...props}>
      {options.map(opt => Array.isArray(opt) ? <option key={opt[0]} value={opt[0]}>{opt[1]}</option> : <option key={opt} value={opt}>{opt}</option>)}
    </select>
  );

  const columns = [
    { key:"select", title:<input type="checkbox" checked={visibleRows.length > 0 && visibleRows.every(r => r._selected)} onChange={e=>setSelectedAllVisible(e.target.checked)} />, width:42, render:row => <input type="checkbox" checked={!!row._selected} onChange={e=>patchRow(row._localId, { _selected:e.target.checked })} /> },
    { key:"date", title:"Дата", width:135, render:row => renderInput(row, "launch_date", { type:"date" }) },
    { key:"time", title:"Час", width:90, render:row => renderInput(row, "launch_time", { type:"time" }) },
    { key:"schedule", title:"Розклад", width:130, render:row => renderSelect(row, "schedule_mode", scheduleOptions) },
    { key:"status", title:"Статус", width:120, render:row => <StatusBadge status={row.status} /> },
    { key:"setup", title:"Сетап", width:210, render:row => (
      <div style={{ display:"flex", gap:6 }}>
        <select style={{ ...S.inp, cursor:"pointer" }} value={row.setup_id || ""} onChange={e=>{ updateRow(row._localId, "setup_id", e.target.value); if (e.target.value) loadLookup(e.target.value); }}>
          <option value="">— сетап —</option>
          {setups.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <button onClick={()=>loadLookup(row.setup_id)} disabled={!row.setup_id || lookup[row.setup_id]?.loading} style={{ ...S.btnGhost, padding:"6px 8px" }}>{lookup[row.setup_id]?.loading ? "…" : "↻"}</button>
      </div>
    ) },
    { key:"account", title:"Рекл. акаунт", width:230, render:row => {
      const opts = getSetupAccounts(row);
      return <select style={{ ...S.inp, cursor:"pointer" }} value={row.fb_account_id || ""} onChange={e=>{
        const acc = opts.find(a => (a.id || a.fb_account_id) === e.target.value);
        patchRow(row._localId, { fb_account_id:e.target.value, currency:acc?.currency || row.currency });
      }}><option value="">— кабінет —</option>{opts.map(a => <option key={a.id || a.fb_account_id} value={a.id || a.fb_account_id}>{a.name || a.id} · {a.id || a.fb_account_id}</option>)}</select>;
    } },
    { key:"page", title:"Фан-сторінка", width:210, render:row => {
      const pages = lookup[row.setup_id]?.pages || [];
      return pages.length ? renderSelect(row, "page_id", [["", "— fan page —"], ...pages.map(p => [p.id, `${p.name} · ${p.id}`])]) : renderInput(row, "page_id", { placeholder:"Page ID" });
    } },
    { key:"currency", title:"Валюта", width:90, render:row => renderInput(row, "currency", { placeholder:"USD" }) },
    { key:"pixel", title:"Піксель", width:210, render:row => {
      const pixels = lookup[row.setup_id]?.pixels || [];
      return pixels.length ? renderSelect(row, "pixel_id", [["", "— pixel —"], ...pixels.map(p => [p.id, `${p.name || "Pixel"} · ${p.id}`])]) : renderInput(row, "pixel_id", { placeholder:"Pixel ID" });
    } },
    { key:"budgetType", title:"Тип бюджету", width:110, render:row => renderSelect(row, "budget_type", [["daily", "Daily"]]) },
    { key:"budget", title:"Бюджет", width:100, render:row => renderInput(row, "daily_budget", { type:"number", min:"1", step:"0.01" }) },
    { key:"strategy", title:"Стратегія", width:190, render:row => renderSelect(row, "strategy", strategyOptions) },
    { key:"attr", title:"Атрибуція", width:100, render:row => renderInput(row, "attribution") },
    { key:"geo", title:"GEO", width:100, render:row => renderInput(row, "geo", { placeholder:"UA,PL" }) },
    { key:"languages", title:"Цільові мови", width:130, render:row => renderInput(row, "target_languages", { placeholder:"Вимк." }) },
    { key:"whiteLanguages", title:"Білі мови", width:110, render:row => renderSelect(row, "white_languages", [["off", "Вимк."], ["on", "Увімк."]]) },
    { key:"gender", title:"Стать", width:95, render:row => renderSelect(row, "gender", [["all", "Усі"], ["male", "Ч"], ["female", "Ж"]]) },
    { key:"ageMin", title:"Вік від", width:85, render:row => renderInput(row, "age_min", { type:"number" }) },
    { key:"ageMax", title:"Вік до", width:85, render:row => renderInput(row, "age_max", { type:"number" }) },
    { key:"advAudience", title:"Adv. Audience", width:110, render:row => renderCheck(row, "adv_audience") },
    { key:"placements", title:"Плейсменти", width:150, render:row => renderSelect(row, "placements", [["auto", "Автоматично"], ["manual", "Manual"]]) },
    { key:"device", title:"ОС і пристрої", width:160, render:row => renderSelect(row, "device_os", [["all", "Усі пристрої"], ["ios", "iOS"], ["android", "Android"]]) },
    { key:"creative", title:"Креативи", width:220, render:row => renderSelect(row, "creative_id", [["", "Обрати..."], ...creatives.map(c => [c.id, c.name || c.id])]) },
    { key:"unique", title:"Унік.", width:80, render:row => renderCheck(row, "unique_creative") },
    { key:"prolong", title:"Прол.", width:70, render:row => renderCheck(row, "prolong") },
    { key:"catalog", title:"Каталог", width:80, render:row => renderCheck(row, "catalog") },
    { key:"comments", title:"Коментарі", width:120, render:row => renderSelect(row, "comments", [["allowed", "Дозволено"], ["disabled", "Вимк."]]) },
    { key:"objective", title:"Ціль кампанії", width:180, render:row => renderSelect(row, "campaign_objective", objectiveOptions) },
    { key:"special", title:"Special Categories", width:160, render:row => renderSelect(row, "special_categories", [["NONE", "Не застосовно"]]) },
    { key:"message", title:"Текст", width:220, render:row => <textarea style={{ ...S.inp, height:38, resize:"vertical" }} value={row.message || ""} onChange={e=>updateRow(row._localId, "message", e.target.value)} /> },
    { key:"headline", title:"Заголовок", width:180, render:row => renderInput(row, "headline") },
    { key:"desc", title:"Опис", width:160, render:row => renderInput(row, "description") },
    { key:"cta", title:"CTA", width:130, render:row => renderSelect(row, "cta", ctaOptions) },
    { key:"display", title:"Display URL", width:150, render:row => renderInput(row, "display_url") },
    { key:"advplus", title:"Adv+", width:75, render:row => renderCheck(row, "adv_plus") },
    { key:"domain", title:"Домен", width:190, render:row => renderSelect(row, "domain_id", [["", "— домен —"], ...domains.map(d => [d.id, d.domain])]) },
    { key:"link", title:"Посилання", width:220, render:row => renderInput(row, "link_url", { placeholder:"або вибери домен" }) },
    { key:"sub", title:"Sub", width:140, render:row => renderInput(row, "sub") },
    { key:"tracker", title:"Проєкт трекера", width:150, render:row => renderInput(row, "tracker_project") },
    { key:"campaignName", title:"Назва кампанії", width:230, render:row => renderInput(row, "campaign_name", { placeholder:"auto" }) },
    { key:"adsetName", title:"Назва адсету", width:210, render:row => renderInput(row, "adset_name", { placeholder:"auto" }) },
    { key:"adName", title:"Назва оголошення", width:230, render:row => renderInput(row, "ad_name", { placeholder:"[[creative.name]]" }) },
    ...(showIds ? [
      { key:"fbCampaign", title:"Campaign ID", width:150, render:row => <code style={{ color:"#94a3b8", fontSize:11 }}>{row.fb_campaign_id || ""}</code> },
      { key:"fbAdset", title:"AdSet ID", width:150, render:row => <code style={{ color:"#94a3b8", fontSize:11 }}>{row.fb_adset_id || ""}</code> },
      { key:"fbAd", title:"Ad ID", width:150, render:row => <code style={{ color:"#94a3b8", fontSize:11 }}>{row.fb_ad_id || ""}</code> },
    ] : [
      { key:"fbid", title:"FB ID", width:150, render:row => <code style={{ color:"#94a3b8", fontSize:11 }}>{row.fb_ad_id || row.fb_campaign_id || ""}</code> },
    ]),
    { key:"notes", title:"Нотатки", width:190, render:row => row.error ? <div title={row.error} style={{ color:"#f87171", fontSize:11, maxWidth:180, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{row.error}</div> : renderInput(row, "notes") },
  ];

  return (
    <div>
      {toast && <div style={{ position:"fixed", bottom:24, right:24, background:toast.type === "error" ? "#dc2626" : "#16a34a", color:"#fff", borderRadius:10, padding:"12px 20px", fontSize:14, fontWeight:700, zIndex:999 }}>{toast.msg}</div>}

      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:16, gap:16 }}>
        <div>
          <h2 style={{ color:"#e2e8f0", margin:"0 0 4px", fontSize:22, fontWeight:900, display:"flex", alignItems:"center", gap:10 }}>Запуски <span style={{ background:"#ca8a0422", color:"#fbbf24", border:"1px solid #ca8a0455", borderRadius:999, padding:"3px 9px", fontSize:11, fontWeight:900, letterSpacing:"0.04em" }}>BETA · ADMIN ONLY</span></h2>
          <div style={{ color:"#64748b", fontSize:13 }}>Підготовка та масовий запуск рекламних кампаній</div>
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:10, flexWrap:"wrap", justifyContent:"flex-end" }}>
          <label style={{ color:"#94a3b8", fontSize:13, display:"flex", alignItems:"center", gap:6 }}><input type="checkbox" checked={showIds} onChange={e=>setShowIds(e.target.checked)} /> ID</label>
          <div style={{ display:"flex", background:"#111827", borderRadius:10, padding:3, border:"1px solid #1e2330" }}>
            <button onClick={()=>setMode("launched")} style={{ ...S.btnGhost, border:"none", background:mode === "launched" ? "#1e2330" : "transparent", color:mode === "launched" ? "#e2e8f0" : "#64748b" }}>Запущені</button>
            <button onClick={()=>setMode("prep")} style={{ ...S.btnGhost, border:"none", background:mode === "prep" ? "#1e2330" : "transparent", color:mode === "prep" ? "#e2e8f0" : "#64748b" }}>Підготовка</button>
          </div>
        </div>
      </div>

      <div style={{ ...S.card, marginBottom:14 }}>
        <div style={{ display:"flex", gap:10, alignItems:"center", flexWrap:"wrap" }}>
          <button onClick={addRows} style={S.btnGhost}>Додати</button>
          <input style={{ ...S.inp, width:70 }} type="number" min="1" max="100" value={addCount} onChange={e=>setAddCount(e.target.value)} />
          <span style={{ color:"#94a3b8", fontSize:13 }}>рядків</span>
          <select style={{ ...S.inp, width:220, cursor:"pointer" }} value={selectedTemplateId} onChange={e=>setSelectedTemplateId(e.target.value)}>
            <option value="">— шаблон запуску —</option>
            {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <button onClick={applyTemplate} disabled={!selectedTemplateId || !selectedRows.length} style={{ ...S.btnGhost, opacity:selectedTemplateId && selectedRows.length ? 1 : 0.45 }}>↙ Застосувати</button>
          <button onClick={saveTemplate} style={S.btnGhost}>☆ Зберегти шаблон</button>
          <button onClick={deleteTemplate} disabled={!selectedTemplateId} style={{ ...S.btnGhost, color:"#f87171", opacity:selectedTemplateId ? 1 : 0.45 }}>🗑 Шаблон</button>
          <div style={{ flex:1 }} />
          <button onClick={removeSelected} disabled={!selectedRows.length} style={{ ...S.btnDanger, opacity:selectedRows.length ? 1 : 0.45 }}>📦 Архів вибраних</button>
          <button onClick={saveRows} disabled={saving} style={{ ...S.btn, opacity:saving ? 0.7 : 1 }}>{saving ? "Зберігаю…" : "💾 Зберегти"}</button>
          <button onClick={launchSelected} disabled={launching || !selectedRows.length} style={{ ...S.btnGreen, opacity:launching || !selectedRows.length ? 0.55 : 1 }}>{launching ? "Запускаю…" : "🚀 Запустити вибрані"}</button>
          <button onClick={launchReady} disabled={launching} style={{ ...S.btnGhost, opacity:launching ? 0.6 : 1 }}>🚀 Запустити готові</button>
        </div>
      </div>

      {loading ? <div style={{ color:"#64748b", padding:40, textAlign:"center" }}>Завантаження…</div> : (
        <div style={{ background:"#13151c", border:"1px solid #1e2330", borderRadius:12, overflow:"hidden" }}>
          <div style={{ overflow:"auto", maxHeight:"calc(100vh - 260px)" }}>
            <table style={{ borderCollapse:"separate", borderSpacing:0, minWidth:4200, width:"100%" }}>
              <thead style={{ position:"sticky", top:0, zIndex:2 }}>
                <tr>{columns.map(col => <th key={col.key} style={{ ...headBase, minWidth:col.width, width:col.width }}>{col.title}</th>)}</tr>
              </thead>
              <tbody>
                {visibleRows.length === 0 && <tr><td colSpan={columns.length} style={{ color:"#64748b", padding:40, textAlign:"center" }}>Немає рядків. Натисни “Додати”.</td></tr>}
                {visibleRows.map((row, idx) => (
                  <tr key={row._localId} style={{ background:idx % 2 ? "#11141b" : "#13151c" }}>
                    {columns.map(col => <td key={col.key} style={{ ...cellBase, minWidth:col.width, width:col.width }}>{col.render(row)}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div style={{ color:"#64748b", fontSize:12, marginTop:12 }}>
        Шаблони назв: <code>[[creative.name]]</code>, <code>[[date]]</code>, <code>[[geo]]</code>, <code>[[account.id]]</code>, <code>[[setup.name]]</code>, <code>[[domain.name]]</code>.
      </div>
    </div>
  );
}
