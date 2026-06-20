import { useEffect, useMemo, useState } from "react";
import { supabase } from "./supabase";

const S = {
  inp:{ background:"#0f1117", border:"1px solid #2e3240", borderRadius:8, color:"#e2e8f0", padding:"9px 12px", width:"100%", fontSize:14, outline:"none" },
  btnGhost:{ background:"#1e2330", border:"1px solid #2e3240", color:"#94a3b8", borderRadius:8, padding:"8px 12px", cursor:"pointer", fontSize:13 },
  card:{ background:"#13151c", border:"1px solid #1e2330", borderRadius:12, padding:16 },
};
const money = v => `$${(Number(v)||0).toFixed(0)}`;
const num = v => Number(v) || 0;
function dl(name, rows) {
  if (!rows.length) return;
  const keys = Object.keys(rows[0]);
  const esc = v => `"${String(v ?? "").replaceAll('"', '""')}"`;
  const csv = [keys.join(","), ...rows.map(r => keys.map(k => esc(r[k])).join(","))].join("\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([csv], { type:"text/csv;charset=utf-8" }));
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}
const Th = ({ children }) => <th style={{ padding:"10px 12px", color:"#64748b", fontSize:11, fontWeight:900, textTransform:"uppercase", borderBottom:"1px solid #1e2330", textAlign:"left", whiteSpace:"nowrap" }}>{children}</th>;
const Td = ({ children, style }) => <td style={{ padding:"10px 12px", color:"#cbd5e1", fontSize:13, borderBottom:"1px solid #1a1d23", ...style }}>{children}</td>;

export default function AnalyticsTab({ user, isAdmin, canSeeAll }) {
  const [data, setData] = useState({ profiles:[], teams:[], setupFolders:[], farmFolders:[], setups:[], accounts:[], farms:[], farmAccounts:[], creatives:[], launches:[], tasks:[] });
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState("");
  const [errors, setErrors] = useState([]);
  const safe = async (name, query) => { const r = await query; if (r.error) { setErrors(p => [...p, `${name}: ${r.error.message}`]); return []; } return r.data || []; };
  const fetchAll = async () => {
    setLoading(true); setErrors([]);
    const [profiles, teams, setupFolders, farmFolders, setups, accounts, farms, farmAccounts, creatives, launches, tasks] = await Promise.all([
      safe("profiles", supabase.from("profiles").select("id, full_name, role, team_id")),
      safe("teams", supabase.from("teams").select("*")),
      safe("setupFolders", supabase.from("fb_setup_folders").select("*")),
      safe("farmFolders", supabase.from("fb_farm_folders").select("*")),
      safe("setups", supabase.from("fb_setups").select("*")),
      safe("accounts", supabase.from("fb_accounts").select("*")),
      safe("farms", supabase.from("fb_farms").select("*")),
      safe("farmAccounts", supabase.from("fb_farm_accounts").select("*")),
      safe("creatives", supabase.from("creatives").select("*")),
      safe("launches", supabase.from("fb_launch_rows").select("*")),
      safe("tasks", supabase.from("crm_tasks").select("*")),
    ]);
    setData({ profiles, teams, setupFolders, farmFolders, setups, accounts, farms, farmAccounts, creatives, launches, tasks }); setLoading(false);
  };
  useEffect(() => { fetchAll(); }, []);
  const buyerName = id => data.profiles.find(p => p.id === id)?.full_name || "Без buyer";
  const buyerRows = useMemo(() => {
    const ids = new Set([...data.setups.map(x=>x.buyer_id), ...data.farms.map(x=>x.buyer_id), ...data.tasks.map(x=>x.assigned_to)].filter(Boolean));
    data.profiles.filter(p => p.role === "buyer").forEach(p => ids.add(p.id));
    return [...ids].map(id => {
      const setups = data.setups.filter(s => s.buyer_id === id && !s.archived);
      const farms = data.farms.filter(f => f.buyer_id === id && !f.archived);
      const setupIds = new Set(setups.map(s => s.id));
      const farmIds = new Set(farms.map(f => f.id));
      const accounts = data.accounts.filter(a => setupIds.has(a.setup_id));
      const farmAccs = data.farmAccounts.filter(a => farmIds.has(a.farm_id));
      const launches = data.launches.filter(r => r.user_id === id || setupIds.has(r.setup_id));
      const tasks = data.tasks.filter(t => t.assigned_to === id && !["done","canceled"].includes(t.status));
      const deadProxy = [...setups, ...farms].filter(x => x.proxy_status === "dead").length;
      return { buyer:buyerName(id), setups:setups.length, farms:farms.length, fb_accounts:accounts.length, alive:accounts.filter(a=>a.status === "живий").length, banned:accounts.filter(a=>a.status === "забанений").length, farm_banned:farmAccs.filter(a=>a.status === "banned").length, dead_proxy:deadProxy, spend:num(accounts.reduce((s,a)=>s+num(a.today_spend),0)), launches:launches.length, launch_errors:launches.filter(l=>l.status === "error").length, active_tasks:tasks.length };
    }).filter(r => !q || r.buyer.toLowerCase().includes(q.toLowerCase()));
  }, [data, q]);
  const agentRows = useMemo(() => {
    const setupAgent = data.setupFolders.map(folder => {
      const setups = data.setups.filter(s => s.folder_id === folder.id && !s.archived);
      const ids = new Set(setups.map(s=>s.id));
      const accs = data.accounts.filter(a => ids.has(a.setup_id));
      return { type:"сетапи", agent:folder.name, items:setups.length, ready:setups.filter(s=>s.proxy_status === "ok").length, dead_proxy:setups.filter(s=>s.proxy_status === "dead").length, banned:accs.filter(a=>a.status === "забанений").length, spend:num(accs.reduce((s,a)=>s+num(a.today_spend),0)) };
    });
    const farmAgent = data.farmFolders.map(folder => {
      const farms = data.farms.filter(f => f.folder_id === folder.id && !f.archived);
      const ids = new Set(farms.map(f=>f.id));
      const accs = data.farmAccounts.filter(a => ids.has(a.farm_id));
      return { type:"фарми", agent:folder.name, items:farms.length, ready:farms.filter(f=>f.status === "ready").length, dead_proxy:farms.filter(f=>f.proxy_status === "dead").length, banned:accs.filter(a=>a.status === "banned").length, spend:0 };
    });
    return [...setupAgent, ...farmAgent].filter(r => !q || r.agent.toLowerCase().includes(q.toLowerCase()));
  }, [data, q]);
  const totals = { spend:buyerRows.reduce((s,r)=>s+r.spend,0), banned:buyerRows.reduce((s,r)=>s+r.banned+r.farm_banned,0), dead:buyerRows.reduce((s,r)=>s+r.dead_proxy,0), tasks:buyerRows.reduce((s,r)=>s+r.active_tasks,0) };
  return <div>
    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:12, marginBottom:16 }}><div><h2 style={{ color:"#e2e8f0", margin:"0 0 4px", fontSize:22, fontWeight:900 }}>📈 Аналітика buyer / agent</h2><div style={{ color:"#64748b", fontSize:13 }}>Зведення по байєрах, папках-агентах, банах, proxy, задачах і запусках.</div></div><button onClick={fetchAll} style={S.btnGhost}>↻ Оновити</button></div>
    <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(140px,1fr))", gap:12, marginBottom:16 }}>{[["Спенд",money(totals.spend),"#fbbf24"],["Бани",totals.banned,"#f87171"],["Dead proxy",totals.dead,"#fb7185"],["Активні задачі",totals.tasks,"#60a5fa"]].map(([l,v,c]) => <div key={l} style={S.card}><div style={{ color:"#64748b", fontSize:11, fontWeight:900, textTransform:"uppercase" }}>{l}</div><div style={{ color:c, fontSize:24, fontWeight:900 }}>{v}</div></div>)}</div>
    {errors.length > 0 && <div style={{ ...S.card, color:"#fbbf24", borderColor:"#854d0e", marginBottom:14 }}>Частина таблиць недоступна: {errors.slice(0,3).join(" · ")}</div>}
    <div style={{ display:"flex", gap:10, marginBottom:14, flexWrap:"wrap" }}><input style={{ ...S.inp, maxWidth:320 }} value={q} onChange={e=>setQ(e.target.value)} placeholder="Пошук buyer / agent" /><button onClick={()=>dl("buyers-analytics.csv", buyerRows)} style={S.btnGhost}>⬇️ Buyers CSV</button><button onClick={()=>dl("agents-analytics.csv", agentRows)} style={S.btnGhost}>⬇️ Agents CSV</button></div>
    {loading ? <div style={{ color:"#64748b", padding:40, textAlign:"center" }}>Завантаження…</div> : <>
      <h3 style={{ color:"#e2e8f0" }}>Buyer performance</h3><div style={{ overflowX:"auto", marginBottom:24 }}><table style={{ width:"100%", borderCollapse:"collapse", background:"#13151c", borderRadius:10, overflow:"hidden" }}><thead><tr>{["Buyer","Setups","Farms","FB acc","Alive","Ban FB","Ban farm","Dead proxy","Spend","Launches","Errors","Tasks"].map(h=><Th key={h}>{h}</Th>)}</tr></thead><tbody>{buyerRows.map(r=><tr key={r.buyer}><Td>{r.buyer}</Td><Td>{r.setups}</Td><Td>{r.farms}</Td><Td>{r.fb_accounts}</Td><Td style={{ color:"#4ade80" }}>{r.alive}</Td><Td style={{ color:"#f87171" }}>{r.banned}</Td><Td style={{ color:"#fb7185" }}>{r.farm_banned}</Td><Td style={{ color:r.dead_proxy?"#f87171":"#64748b" }}>{r.dead_proxy}</Td><Td style={{ color:"#fbbf24" }}>{money(r.spend)}</Td><Td>{r.launches}</Td><Td style={{ color:r.launch_errors?"#f87171":"#64748b" }}>{r.launch_errors}</Td><Td>{r.active_tasks}</Td></tr>)}</tbody></table></div>
      <h3 style={{ color:"#e2e8f0" }}>Agent folders</h3><div style={{ overflowX:"auto" }}><table style={{ width:"100%", borderCollapse:"collapse", background:"#13151c", borderRadius:10, overflow:"hidden" }}><thead><tr>{["Type","Agent","Items","Ready/OK","Dead proxy","Bans","Spend"].map(h=><Th key={h}>{h}</Th>)}</tr></thead><tbody>{agentRows.map((r,i)=><tr key={`${r.type}-${r.agent}-${i}`}><Td>{r.type}</Td><Td>{r.agent}</Td><Td>{r.items}</Td><Td style={{ color:"#4ade80" }}>{r.ready}</Td><Td style={{ color:r.dead_proxy?"#f87171":"#64748b" }}>{r.dead_proxy}</Td><Td style={{ color:r.banned?"#f87171":"#64748b" }}>{r.banned}</Td><Td style={{ color:"#fbbf24" }}>{money(r.spend)}</Td></tr>)}</tbody></table></div>
    </>}
  </div>;
}
