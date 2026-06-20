import { useEffect, useMemo, useState } from "react";
import { supabase } from "./supabase";
const S = { card:{ background:"#13151c", border:"1px solid #1e2330", borderRadius:12, padding:16 }, btnGhost:{ background:"#1e2330", border:"1px solid #2e3240", color:"#94a3b8", borderRadius:8, padding:"8px 12px", cursor:"pointer", fontSize:13 } };
const Th = ({ children }) => <th style={{ padding:"10px 12px", color:"#64748b", fontSize:11, fontWeight:900, textTransform:"uppercase", borderBottom:"1px solid #1e2330", textAlign:"left" }}>{children}</th>;
const Td = ({ children, style }) => <td style={{ padding:"10px 12px", color:"#cbd5e1", fontSize:13, borderBottom:"1px solid #1a1d23", ...style }}>{children}</td>;
const ROLE = { admin:"Адмін", teamlead:"Тімлід", buyer:"Байєр" };
export default function AccessTab({ user, isAdmin, canSeeAll }) {
  const [data, setData] = useState({ profiles:[], teams:[], members:[], setups:[], farms:[], tasks:[] });
  const fetchAll = async () => {
    const [p,t,m,s,f,ta] = await Promise.all([
      supabase.from("profiles").select("id, full_name, email, role, team_id"),
      supabase.from("teams").select("*"),
      supabase.from("team_members").select("*"),
      supabase.from("fb_setups").select("id,user_id,buyer_id,archived"),
      supabase.from("fb_farms").select("id,user_id,buyer_id,archived"),
      supabase.from("crm_tasks").select("id,user_id,assigned_to,status"),
    ]);
    setData({ profiles:p.data||[], teams:t.data||[], members:m.data||[], setups:s.data||[], farms:f.data||[], tasks:ta.data||[] });
  };
  useEffect(()=>{ fetchAll(); },[]);
  const rows = useMemo(() => data.profiles.map(p => {
    const team = data.teams.find(t => t.id === p.team_id || data.members.some(m => m.team_id === t.id && m.user_id === p.id));
    return { ...p, team:team?.name || "—", own_setups:data.setups.filter(s=>s.user_id===p.id && !s.archived).length, assigned_setups:data.setups.filter(s=>s.buyer_id===p.id && !s.archived).length, own_farms:data.farms.filter(f=>f.user_id===p.id && !f.archived).length, assigned_farms:data.farms.filter(f=>f.buyer_id===p.id && !f.archived).length, active_tasks:data.tasks.filter(t=>t.assigned_to===p.id && !["done","canceled"].includes(t.status)).length };
  }), [data]);
  return <div><div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:16 }}><div><h2 style={{ color:"#e2e8f0", margin:"0 0 4px", fontSize:22, fontWeight:900 }}>🔐 Ролі та доступи</h2><div style={{ color:"#64748b", fontSize:13 }}>Огляд хто що бачить. Зміна команд лишається у вкладці “Команди”.</div></div><button onClick={fetchAll} style={S.btnGhost}>↻ Оновити</button></div>
    <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))", gap:12, marginBottom:18 }}>
      <div style={S.card}><div style={{ color:"#a78bfa", fontWeight:900 }}>Admin</div><div style={{ color:"#94a3b8", fontSize:13, marginTop:6 }}>Бачить і редагує все: фарми, сетапи, CSV, команди, задачі.</div></div>
      <div style={S.card}><div style={{ color:"#fb923c", fontWeight:900 }}>Teamlead</div><div style={{ color:"#94a3b8", fontSize:13, marginTop:6 }}>Бачить свої команди і buyer-ів, переглядає аналітику та доступи.</div></div>
      <div style={S.card}><div style={{ color:"#38bdf8", fontWeight:900 }}>Buyer</div><div style={{ color:"#94a3b8", fontSize:13, marginTop:6 }}>Бачить свої/призначені сутності через RLS, працює із задачами.</div></div>
    </div>
    <div style={{ overflowX:"auto" }}><table style={{ width:"100%", borderCollapse:"collapse", background:"#13151c", borderRadius:10, overflow:"hidden" }}><thead><tr>{["User","Role","Team","Own setups","Assigned setups","Own farms","Assigned farms","Tasks"].map(h=><Th key={h}>{h}</Th>)}</tr></thead><tbody>{rows.map(r=><tr key={r.id}><Td>{r.full_name || r.email || r.id}</Td><Td style={{ color:r.role === "admin" ? "#a78bfa" : r.role === "teamlead" ? "#fb923c" : "#38bdf8", fontWeight:900 }}>{ROLE[r.role] || r.role}</Td><Td>{r.team}</Td><Td>{r.own_setups}</Td><Td>{r.assigned_setups}</Td><Td>{r.own_farms}</Td><Td>{r.assigned_farms}</Td><Td>{r.active_tasks}</Td></tr>)}</tbody></table></div>
  </div>;
}
