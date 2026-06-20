import { useEffect, useState } from "react";
import { supabase } from "./supabase";

const S = { inp:{ background:"#0f1117", border:"1px solid #2e3240", borderRadius:8, color:"#e2e8f0", padding:"9px 12px", width:"100%", fontSize:14, outline:"none" }, btn:{ background:"#3b82f6", border:"none", color:"#fff", borderRadius:8, padding:"9px 14px", cursor:"pointer", fontWeight:800, fontSize:13 }, btnGhost:{ background:"#1e2330", border:"1px solid #2e3240", color:"#94a3b8", borderRadius:8, padding:"9px 14px", cursor:"pointer", fontSize:13 }, card:{ background:"#13151c", border:"1px solid #1e2330", borderRadius:12, padding:16 } };
const TABLES = ["fb_farms", "fb_farm_accounts", "fb_setups", "fb_accounts", "creatives", "domains", "fb_launch_rows", "crm_tasks"];
const IMPORT_TABLES = ["fb_farms", "fb_setups", "fb_farm_accounts", "fb_accounts", "crm_tasks"];
function toCsv(rows) { if (!rows.length) return ""; const keys = Object.keys(rows[0]); const esc = v => `"${String(typeof v === "object" && v !== null ? JSON.stringify(v) : v ?? "").replaceAll('"', '""')}"`; return [keys.join(","), ...rows.map(r => keys.map(k => esc(r[k])).join(","))].join("\n"); }
function download(name, text) { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([text], { type:"text/csv;charset=utf-8" })); a.download = name; a.click(); URL.revokeObjectURL(a.href); }
function parseCsv(text) { const rows=[]; let row=[], cur="", q=false; for(let i=0;i<text.length;i++){ const c=text[i], n=text[i+1]; if(c==='"'&&q&&n==='"'){cur+='"';i++;} else if(c==='"'){q=!q;} else if(c===','&&!q){row.push(cur);cur="";} else if((c==='\n'||c==='\r')&&!q){ if(c==='\r'&&n==='\n') i++; row.push(cur); if(row.some(x=>x.trim())) rows.push(row); row=[]; cur="";} else cur+=c;} row.push(cur); if(row.some(x=>x.trim())) rows.push(row); if(rows.length<2) return []; const header=rows[0].map(h=>h.trim()); return rows.slice(1).map(r=>Object.fromEntries(header.map((h,i)=>[h,r[i] ?? ""]))); }
function cleanValue(v) { if (v === "" || v === "null" || v === "NULL") return null; if (v === "true") return true; if (v === "false") return false; const t=String(v||"").trim(); if ((t.startsWith("{") && t.endsWith("}")) || (t.startsWith("[") && t.endsWith("]"))) { try { return JSON.parse(t); } catch {} } return v; }
export default function CsvToolsTab({ user, isAdmin }) {
  const [data, setData] = useState({});
  const [table, setTable] = useState("fb_farms");
  const [raw, setRaw] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");
  const fetchAll = async () => { setLoading(true); const next={}; for (const t of TABLES) { const { data } = await supabase.from(t).select("*").limit(5000); next[t]=data||[]; } setData(next); setLoading(false); };
  useEffect(()=>{ fetchAll(); },[]);
  const exportTable = (t) => download(`${t}.csv`, toCsv(data[t] || []));
  const exportAll = () => TABLES.forEach(t => { if ((data[t]||[]).length) exportTable(t); });
  const importRows = async () => {
    if (!isAdmin) { setMsg("Імпорт доступний тільки адміну"); return; }
    const rows = parseCsv(raw).map(r => { const out={}; for (const [k,v] of Object.entries(r)) { const cleaned = cleanValue(v); if (!k || ["created_at","updated_at"].includes(k)) continue; if (k === "id" && !cleaned) continue; out[k]=cleaned; } if (!out.user_id) out.user_id=user.id; return out; });
    if (!rows.length) { setMsg("CSV порожній або без header"); return; }
    const { error } = await supabase.from(table).insert(rows);
    if (error) setMsg("Помилка: " + error.message); else { setMsg(`Імпортовано ${rows.length} рядків у ${table}`); setRaw(""); fetchAll(); }
  };
  return <div>
    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:12, marginBottom:16 }}><div><h2 style={{ color:"#e2e8f0", margin:"0 0 4px", fontSize:22, fontWeight:900 }}>↕️ CSV import / export</h2><div style={{ color:"#64748b", fontSize:13 }}>Експорт видимих тобі даних. Імпорт — тільки admin.</div></div><button onClick={fetchAll} style={S.btnGhost}>↻ Оновити</button></div>
    {msg && <div style={{ ...S.card, color:msg.startsWith("Помилка") ? "#f87171" : "#4ade80", marginBottom:14 }}>{msg}</div>}
    <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))", gap:12, marginBottom:18 }}>{TABLES.map(t => <div key={t} style={S.card}><div style={{ color:"#e2e8f0", fontWeight:900 }}>{t}</div><div style={{ color:"#64748b", fontSize:12, margin:"5px 0 10px" }}>{(data[t]||[]).length} рядків</div><button onClick={()=>exportTable(t)} disabled={!(data[t]||[]).length} style={{ ...S.btnGhost, opacity:(data[t]||[]).length?1:0.45 }}>⬇️ Export CSV</button></div>)}</div>
    <div style={{ ...S.card, marginBottom:14 }}><div style={{ color:"#e2e8f0", fontWeight:900, marginBottom:8 }}>Admin import</div><div style={{ color:"#64748b", fontSize:12, marginBottom:12 }}>CSV має мати перший рядок з назвами колонок. Для фармів мінімум: <code>name,cookie_data,proxy_host,proxy_port</code>. Для сетапів: <code>name,token,proxy_host,proxy_port</code>.</div><div style={{ display:"flex", gap:10, marginBottom:10, flexWrap:"wrap" }}><select style={{ ...S.inp, maxWidth:260 }} value={table} onChange={e=>setTable(e.target.value)}>{IMPORT_TABLES.map(t=><option key={t}>{t}</option>)}</select><button onClick={importRows} disabled={!isAdmin} style={{ ...S.btn, opacity:isAdmin?1:0.45 }}>⬆️ Import</button><button onClick={exportAll} style={S.btnGhost}>⬇️ Export all</button></div><textarea style={{ ...S.inp, minHeight:220, resize:"vertical", fontFamily:"monospace" }} value={raw} onChange={e=>setRaw(e.target.value)} placeholder="name,cookie_data,proxy_host,proxy_port\nFarm 1,....,1.2.3.4,1234" /></div>
    {loading && <div style={{ color:"#64748b" }}>Завантаження…</div>}
  </div>;
}
