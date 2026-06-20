import { useEffect, useMemo, useState } from "react";
import { supabase } from "./supabase";

const S = {
  inp: { background:"#0f1117", border:"1px solid #2e3240", borderRadius:8, color:"#e2e8f0", padding:"9px 12px", width:"100%", fontSize:14, outline:"none" },
  btnGhost: { background:"#1e2330", border:"1px solid #2e3240", color:"#94a3b8", borderRadius:8, padding:"8px 12px", cursor:"pointer", fontSize:13 },
  card: { background:"#13151c", border:"1px solid #1e2330", borderRadius:12, padding:18 },
};

const empty = [];
const money = v => `$${(Number(v) || 0).toFixed(0)}`;
const safeDate = v => v ? new Date(v).toLocaleString("uk-UA") : "—";

function MetricCard({ label, value, color="#60a5fa", sub }) {
  return (
    <div style={S.card}>
      <div style={{ color:"#64748b", fontSize:11, fontWeight:900, textTransform:"uppercase", letterSpacing:"0.07em" }}>{label}</div>
      <div style={{ color, fontSize:26, fontWeight:900, marginTop:6 }}>{value}</div>
      {sub && <div style={{ color:"#64748b", fontSize:12, marginTop:5 }}>{sub}</div>}
    </div>
  );
}

function AlertRow({ level="warn", title, text, meta }) {
  const color = level === "critical" ? "#f87171" : level === "ok" ? "#4ade80" : "#fbbf24";
  const icon = level === "critical" ? "🔴" : level === "ok" ? "🟢" : "🟡";
  return (
    <div style={{ display:"grid", gridTemplateColumns:"28px 1fr auto", gap:10, alignItems:"start", padding:"12px 14px", borderTop:"1px solid #1a1d23" }}>
      <span>{icon}</span>
      <div>
        <div style={{ color, fontWeight:900, fontSize:13 }}>{title}</div>
        <div style={{ color:"#94a3b8", fontSize:12, marginTop:3 }}>{text}</div>
      </div>
      <div style={{ color:"#64748b", fontSize:11, whiteSpace:"nowrap" }}>{meta}</div>
    </div>
  );
}

export default function DashboardTab({ user, isAdmin, canSeeAll }) {
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState("");
  const [data, setData] = useState({
    domains:empty,
    creatives:empty,
    setups:empty,
    accounts:empty,
    farms:empty,
    farmAccounts:empty,
    launches:empty,
    audit:empty,
  });
  const [errors, setErrors] = useState([]);

  const fetchSafe = async (table, query) => {
    const res = await query;
    if (res.error) {
      setErrors(prev => [...prev, `${table}: ${res.error.message}`]);
      return [];
    }
    return res.data || [];
  };

  const fetchAll = async () => {
    setLoading(true);
    setErrors([]);
    const [domains, creatives, setups, accounts, farms, farmAccounts, launches, audit] = await Promise.all([
      fetchSafe("domains", supabase.from("domains").select("*").order("created_at", { ascending:false })),
      fetchSafe("creatives", supabase.from("creatives").select("*").order("created_at", { ascending:false })),
      fetchSafe("fb_setups", supabase.from("fb_setups").select("*").order("created_at", { ascending:false })),
      fetchSafe("fb_accounts", supabase.from("fb_accounts").select("*")),
      fetchSafe("fb_farms", supabase.from("fb_farms").select("*").order("created_at", { ascending:false })),
      fetchSafe("fb_farm_accounts", supabase.from("fb_farm_accounts").select("*").order("checked_at", { ascending:false })),
      fetchSafe("fb_launch_rows", supabase.from("fb_launch_rows").select("*").order("created_at", { ascending:false })),
      fetchSafe("crm_audit_logs", supabase.from("crm_audit_logs").select("*").order("created_at", { ascending:false }).limit(30)),
    ]);
    setData({ domains, creatives, setups, accounts, farms, farmAccounts, launches, audit });
    setLoading(false);
  };

  useEffect(() => { fetchAll(); }, []);

  const metrics = useMemo(() => {
    const activeSetups = data.setups.filter(s => !s.archived);
    const activeFarms = data.farms.filter(f => !f.archived);
    const deadProxy = [...activeSetups, ...activeFarms].filter(x => x.proxy_status === "dead").length;
    const noProxy = [...activeSetups, ...activeFarms].filter(x => !x.proxy_host).length;
    const bannedFarmAccounts = data.farmAccounts.filter(a => a.status === "banned").length;
    const bannedAccounts = data.accounts.filter(a => a.status === "забанений").length;
    const todaySpend = data.accounts.reduce((s,a)=>s+(parseFloat(a.today_spend)||0),0);
    return {
      domains:data.domains.length,
      creatives:data.creatives.filter(c => !c.archived).length,
      setups:activeSetups.length,
      farms:activeFarms.length,
      deadProxy,
      noProxy,
      bannedFarmAccounts,
      bannedAccounts,
      launchesDraft:data.launches.filter(r => r.status === "draft" || r.status === "ready").length,
      launchesError:data.launches.filter(r => r.status === "error").length,
      todaySpend,
    };
  }, [data]);

  const alerts = useMemo(() => {
    const out = [];
    data.setups.filter(s => !s.archived && s.proxy_status === "dead").forEach(s => out.push({ level:"critical", title:"Dead proxy у сетапі", text:s.name || s.id, meta:s.proxy_error || safeDate(s.proxy_checked_at) }));
    data.farms.filter(f => !f.archived && f.proxy_status === "dead").forEach(f => out.push({ level:"critical", title:"Dead proxy у фармі", text:f.name || f.id, meta:f.proxy_error || safeDate(f.proxy_checked_at) }));
    data.farms.filter(f => !f.archived && ["banned", "issue", "checking"].includes(f.status)).forEach(f => out.push({ level:f.status === "banned" ? "critical" : "warn", title:"Статус фарму потребує уваги", text:`${f.name || f.id} · ${f.status}${f.check_error ? ` · ${f.check_error}` : ""}`, meta:safeDate(f.last_check_at) }));
    data.farmAccounts.filter(a => a.status === "banned").slice(0,20).forEach(a => out.push({ level:"critical", title:"Бан кабінета у фармі", text:`${a.name || a.fb_account_id} · ${a.fb_account_id}`, meta:safeDate(a.checked_at) }));
    data.accounts.filter(a => a.status === "забанений").slice(0,20).forEach(a => out.push({ level:"critical", title:"Бан FB акаунта", text:`${a.name || a.fb_account_id} · ${a.fb_account_id}`, meta:a.currency || "" }));
    data.launches.filter(r => r.status === "error").slice(0,20).forEach(r => out.push({ level:"critical", title:"Помилка запуску", text:r.error || r.notes || r.id, meta:safeDate(r.updated_at || r.created_at) }));
    data.setups.filter(s => !s.archived && !s.proxy_host).slice(0,12).forEach(s => out.push({ level:"warn", title:"Сетап без proxy", text:s.name || s.id, meta:"додай proxy" }));
    data.farms.filter(f => !f.archived && !f.proxy_host).slice(0,12).forEach(f => out.push({ level:"warn", title:"Фарм без proxy", text:f.name || f.id, meta:"додай proxy" }));
    return out.filter(a => [a.title, a.text, a.meta].join(" ").toLowerCase().includes(q.trim().toLowerCase()));
  }, [data, q]);

  return (
    <div>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:16, marginBottom:18 }}>
        <div>
          <h2 style={{ color:"#e2e8f0", margin:"0 0 4px", fontSize:22, fontWeight:900 }}>🏠 Огляд CRM</h2>
          <div style={{ color:"#64748b", fontSize:13 }}>Живий стан доменів, креативів, FB акаунтів, фармів, проксі та запусків.</div>
        </div>
        <button onClick={fetchAll} disabled={loading} style={{ ...S.btnGhost, opacity:loading ? 0.65 : 1 }}>{loading ? "Оновлюю…" : "↻ Оновити"}</button>
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(150px,1fr))", gap:12, marginBottom:18 }}>
        <MetricCard label="Домени" value={metrics.domains} />
        <MetricCard label="Креативи" value={metrics.creatives} color="#a78bfa" />
        <MetricCard label="Сетапи" value={metrics.setups} color="#60a5fa" />
        <MetricCard label="Фарми" value={metrics.farms} color="#4ade80" />
        <MetricCard label="Dead proxy" value={metrics.deadProxy} color="#f87171" sub={`Без proxy: ${metrics.noProxy}`} />
        <MetricCard label="Бани" value={metrics.bannedAccounts + metrics.bannedFarmAccounts} color="#fb7185" sub={`Фарми: ${metrics.bannedFarmAccounts} · FB: ${metrics.bannedAccounts}`} />
        <MetricCard label="Спенд сьогодні" value={money(metrics.todaySpend)} color="#fbbf24" />
        <MetricCard label="Запуски" value={metrics.launchesDraft} color="#38bdf8" sub={`Помилок: ${metrics.launchesError}`} />
      </div>

      {errors.length > 0 && (
        <div style={{ ...S.card, borderColor:"#854d0e", marginBottom:18, color:"#fbbf24", fontSize:12 }}>
          Частина таблиць ще не готова або недоступна: {errors.slice(0,3).join(" · ")}{errors.length > 3 ? ` · +${errors.length - 3}` : ""}
        </div>
      )}

      <div style={{ display:"grid", gridTemplateColumns:"minmax(0,1.35fr) minmax(320px,0.65fr)", gap:16 }}>
        <div style={{ ...S.card, padding:0, overflow:"hidden" }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"14px 16px", borderBottom:"1px solid #1e2330" }}>
            <div>
              <div style={{ color:"#e2e8f0", fontWeight:900 }}>Алерти</div>
              <div style={{ color:"#64748b", fontSize:12 }}>Показує проблеми, які треба перевірити першими.</div>
            </div>
            <input style={{ ...S.inp, maxWidth:300 }} value={q} onChange={e=>setQ(e.target.value)} placeholder="Пошук алерта…" />
          </div>
          {alerts.length === 0 ? <div style={{ padding:28, color:"#4ade80", fontWeight:800 }}>Критичних алертів не знайдено.</div> : alerts.slice(0,60).map((a,idx)=><AlertRow key={`${a.title}-${idx}`} {...a} />)}
        </div>

        <div style={{ ...S.card, padding:0, overflow:"hidden" }}>
          <div style={{ padding:"14px 16px", borderBottom:"1px solid #1e2330" }}>
            <div style={{ color:"#e2e8f0", fontWeight:900 }}>Останні дії</div>
            <div style={{ color:"#64748b", fontSize:12 }}>Аудит по CRM.</div>
          </div>
          {(data.audit || []).length === 0 ? <div style={{ padding:20, color:"#64748b" }}>Поки немає логів.</div> : data.audit.slice(0,14).map(log => (
            <div key={log.id} style={{ padding:"11px 14px", borderTop:"1px solid #1a1d23" }}>
              <div style={{ color:"#cbd5e1", fontSize:13, fontWeight:800 }}>{log.message || log.action}</div>
              <div style={{ color:"#64748b", fontSize:11, marginTop:3 }}>{log.entity_type} · {safeDate(log.created_at)}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
