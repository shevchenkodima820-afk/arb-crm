import { useState, useEffect } from "react";
import { supabase } from "./supabase";

const S = {
  inp: { background:"#0f1117", border:"1px solid #2e3240", borderRadius:8, color:"#e2e8f0", padding:"8px 12px", width:"100%", fontSize:14, outline:"none" },
  btn: { background:"#3b82f6", border:"none", color:"#fff", borderRadius:8, padding:"9px 20px", cursor:"pointer", fontWeight:600, fontSize:14 },
  btnGhost: { background:"#1e2330", border:"1px solid #2e3240", color:"#94a3b8", borderRadius:8, padding:"9px 16px", cursor:"pointer", fontSize:13 },
  btnDanger: { background:"#dc262622", border:"1px solid #dc2626", color:"#f87171", borderRadius:8, padding:"6px 12px", cursor:"pointer", fontSize:12 },
  card: { background:"#13151c", border:"1px solid #1e2330", borderRadius:12, padding:20 },
};

const Field = ({ label, children }) => (
  <div style={{ marginBottom:14 }}>
    <label style={{ display:"block", color:"#64748b", fontSize:11, fontWeight:700, textTransform:"uppercase", letterSpacing:"0.07em", marginBottom:5 }}>{label}</label>
    {children}
  </div>
);

const Modal = ({ title, onClose, children }) => (
  <div style={{ position:"fixed", inset:0, background:"#000b", zIndex:100, display:"flex", alignItems:"center", justifyContent:"center" }}>
    <div style={{ background:"#1a1d23", border:"1px solid #2e3240", borderRadius:14, width:"min(560px,96vw)", maxHeight:"90vh", overflowY:"auto", padding:28 }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20 }}>
        <h3 style={{ margin:0, color:"#e2e8f0", fontSize:18, fontWeight:700 }}>{title}</h3>
        <button onClick={onClose} style={{ background:"none", border:"none", color:"#64748b", fontSize:24, cursor:"pointer" }}>×</button>
      </div>
      {children}
    </div>
  </div>
);

const ROLE_BADGE = {
  admin:    { color:"#a78bfa", bg:"#7c3aed22", label:"Адмін" },
  teamlead: { color:"#fb923c", bg:"#d9770622", label:"Тім лід" },
  buyer:    { color:"#38bdf8", bg:"#0369a122", label:"Байєр" },
};
const RoleBadge = ({ role }) => {
  const r = ROLE_BADGE[role] || ROLE_BADGE.buyer;
  return <span style={{ background:r.bg, color:r.color, border:`1px solid ${r.color}44`, borderRadius:6, padding:"2px 8px", fontSize:11, fontWeight:700 }}>{r.label}</span>;
};

export default function TeamsTab({ currentUserId, isAdmin }) {
  const [teams, setTeams] = useState([]);
  const [members, setMembers] = useState([]); // team_members
  const [profiles, setProfiles] = useState([]);
  const [modal, setModal] = useState(null);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState(null);
  const showToast = (msg, type="ok") => { setToast({msg,type}); setTimeout(()=>setToast(null),3000); };

  const fetchAll = async () => {
    setLoading(true);
    const [{ data: t }, { data: m }, { data: p }] = await Promise.all([
      supabase.from("teams").select("*").order("created_at"),
      supabase.from("team_members").select("*"),
      supabase.from("profiles").select("id, full_name, role, team_id"),
    ]);
    if (t) setTeams(t);
    if (m) setMembers(m);
    if (p) setProfiles(p);
    setLoading(false);
  };

  useEffect(() => { fetchAll(); }, []);

  const getTeamMembers = (teamId) => {
    const memberIds = members.filter(m => m.team_id === teamId).map(m => m.user_id);
    return profiles.filter(p => memberIds.includes(p.id));
  };

  const getTeamlead = (teamId) => {
    const t = teams.find(t => t.id === teamId);
    return profiles.find(p => p.id === t?.teamlead_id);
  };

  // Байєри без команди
  const unassigned = profiles.filter(p => {
    const inTeam = members.some(m => m.user_id === p.id);
    return !inTeam && p.role === "buyer";
  });

  const saveTeam = async (f) => {
    if (modal.mode === "add") {
      const { data, error } = await supabase.from("teams").insert([{ name: f.name, teamlead_id: f.teamlead_id||null, created_by: currentUserId }]).select().single();
      if (error) { showToast("❌ "+error.message,"error"); return; }
      // Додати тімліда в команду
      if (f.teamlead_id) {
        await supabase.from("team_members").upsert({ team_id: data.id, user_id: f.teamlead_id });
        await supabase.from("profiles").update({ team_id: data.id }).eq("id", f.teamlead_id);
      }
      showToast("Команду створено ✓");
    } else {
      await supabase.from("teams").update({ name: f.name, teamlead_id: f.teamlead_id||null }).eq("id", modal.data.id);
      showToast("Збережено ✓");
    }
    setModal(null);
    fetchAll();
  };

  const deleteTeam = async (id) => {
    if (!confirm("Видалити команду? Члени залишаться в системі.")) return;
    // Очистити team_id у профілях
    const memberIds = members.filter(m => m.team_id === id).map(m => m.user_id);
    for (const uid of memberIds) {
      await supabase.from("profiles").update({ team_id: null }).eq("id", uid);
    }
    await supabase.from("team_members").delete().eq("team_id", id);
    await supabase.from("teams").delete().eq("id", id);
    showToast("Команду видалено");
    fetchAll();
  };

  const addMember = async (teamId, userId) => {
    await supabase.from("team_members").upsert({ team_id: teamId, user_id: userId });
    await supabase.from("profiles").update({ team_id: teamId }).eq("id", userId);
    showToast("Додано ✓");
    fetchAll();
  };

  const removeMember = async (teamId, userId) => {
    await supabase.from("team_members").delete().match({ team_id: teamId, user_id: userId });
    await supabase.from("profiles").update({ team_id: null }).eq("id", userId);
    showToast("Видалено з команди");
    fetchAll();
  };

  const teamleads = profiles.filter(p => p.role === "teamlead");
  const buyers = profiles.filter(p => p.role === "buyer");

  return (
    <div>
      {toast && <div style={{ position:"fixed", bottom:24, right:24, background:toast.type==="error"?"#dc2626":"#16a34a", color:"#fff", borderRadius:10, padding:"12px 20px", fontSize:14, fontWeight:600, zIndex:999 }}>{toast.msg}</div>}

      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20 }}>
        <div>
          <h2 style={{ color:"#e2e8f0", margin:0, fontSize:18, fontWeight:800 }}>Команди</h2>
          <p style={{ color:"#64748b", fontSize:13, margin:"4px 0 0" }}>Керуйте командами, тімлідами і байєрами</p>
        </div>
        {isAdmin && <button onClick={()=>setModal({mode:"add",data:{}})} style={S.btn}>+ Нова команда</button>}
      </div>

      {/* Незадіяні байєри */}
      {unassigned.length > 0 && (
        <div style={{ ...S.card, marginBottom:16, border:"1px solid #ca8a0444" }}>
          <div style={{ color:"#fbbf24", fontWeight:700, fontSize:13, marginBottom:10 }}>⚠️ Байєри без команди ({unassigned.length})</div>
          <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
            {unassigned.map(p=>(
              <span key={p.id} style={{ background:"#1e2330", color:"#94a3b8", borderRadius:8, padding:"4px 12px", fontSize:13 }}>{p.full_name}</span>
            ))}
          </div>
        </div>
      )}

      {loading ? <div style={{ textAlign:"center",color:"#475569",padding:40 }}>Завантаження…</div> : (
        <div style={{ display:"grid", gap:16 }}>
          {teams.length===0 && <div style={{ ...S.card, textAlign:"center", color:"#475569", padding:40 }}>Немає команд — створіть першу</div>}
          {teams.map(team => {
            const teamMembers = getTeamMembers(team.id);
            const teamlead = getTeamlead(team.id);
            const teamBuyers = teamMembers.filter(m => m.role === "buyer");
            return (
              <div key={team.id} style={{ ...S.card }}>
                {/* Team header */}
                <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", marginBottom:16 }}>
                  <div>
                    <h3 style={{ color:"#e2e8f0", margin:0, fontSize:16, fontWeight:800 }}>{team.name}</h3>
                    <div style={{ color:"#64748b", fontSize:12, marginTop:4 }}>
                      {teamMembers.length} учасників · {teamBuyers.length} байєрів
                    </div>
                  </div>
                  {isAdmin && (
                    <div style={{ display:"flex", gap:8 }}>
                      <button onClick={()=>setModal({mode:"edit",data:team})} style={{ ...S.btnGhost, padding:"6px 12px" }}>✏️ Редагувати</button>
                      <button onClick={()=>deleteTeam(team.id)} style={S.btnDanger}>🗑 Видалити</button>
                    </div>
                  )}
                </div>

                {/* Тімлід */}
                <div style={{ marginBottom:16 }}>
                  <div style={{ color:"#64748b", fontSize:11, fontWeight:700, textTransform:"uppercase", letterSpacing:"0.07em", marginBottom:8 }}>Тім лід</div>
                  {teamlead ? (
                    <div style={{ display:"flex", alignItems:"center", gap:10, background:"#0f1117", borderRadius:8, padding:"10px 14px" }}>
                      <div style={{ width:32, height:32, borderRadius:"50%", background:"#d9770622", display:"flex", alignItems:"center", justifyContent:"center", color:"#fb923c", fontWeight:800, fontSize:14 }}>
                        {teamlead.full_name?.[0]?.toUpperCase()||"T"}
                      </div>
                      <div>
                        <div style={{ color:"#e2e8f0", fontWeight:600, fontSize:14 }}>{teamlead.full_name}</div>
                        <RoleBadge role="teamlead" />
                      </div>
                    </div>
                  ) : (
                    <div style={{ color:"#475569", fontSize:13, padding:"10px 14px", background:"#0f1117", borderRadius:8 }}>Не призначено</div>
                  )}
                </div>

                {/* Байєри */}
                <div>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8 }}>
                    <div style={{ color:"#64748b", fontSize:11, fontWeight:700, textTransform:"uppercase", letterSpacing:"0.07em" }}>Байєри</div>
                    {isAdmin && (
                      <select
                        style={{ ...S.inp, maxWidth:200, fontSize:12, padding:"4px 8px", cursor:"pointer" }}
                        value=""
                        onChange={e => { if(e.target.value) addMember(team.id, e.target.value); }}
                      >
                        <option value="">+ Додати байєра</option>
                        {buyers.filter(b => !teamMembers.find(m=>m.id===b.id)).map(b=>(
                          <option key={b.id} value={b.id}>{b.full_name}</option>
                        ))}
                      </select>
                    )}
                  </div>
                  {teamBuyers.length === 0 ? (
                    <div style={{ color:"#475569", fontSize:13, padding:"10px 14px", background:"#0f1117", borderRadius:8 }}>Немає байєрів</div>
                  ) : (
                    <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(200px, 1fr))", gap:8 }}>
                      {teamBuyers.map(buyer=>(
                        <div key={buyer.id} style={{ background:"#0f1117", borderRadius:8, padding:"10px 14px", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                          <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                            <div style={{ width:28, height:28, borderRadius:"50%", background:"#0369a122", display:"flex", alignItems:"center", justifyContent:"center", color:"#38bdf8", fontWeight:800, fontSize:12 }}>
                              {buyer.full_name?.[0]?.toUpperCase()||"B"}
                            </div>
                            <span style={{ color:"#e2e8f0", fontSize:13, fontWeight:500 }}>{buyer.full_name}</span>
                          </div>
                          {isAdmin && (
                            <button onClick={()=>removeMember(team.id, buyer.id)} style={{ background:"none", border:"none", color:"#475569", cursor:"pointer", fontSize:16, lineHeight:1 }} title="Видалити з команди">×</button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal */}
      {modal && (
        <Modal title={modal.mode==="add"?"Нова команда":"Редагувати команду"} onClose={()=>setModal(null)}>
          <TeamForm initial={modal.data} teamleads={teamleads} onSave={saveTeam} onClose={()=>setModal(null)} />
        </Modal>
      )}
    </div>
  );
}

const TeamForm = ({ initial={}, teamleads, onSave, onClose }) => {
  const [f, setF] = useState({ name: initial.name||"", teamlead_id: initial.teamlead_id||"" });
  const set = k => e => setF(p=>({...p,[k]:e.target.value}));
  return (
    <div>
      <Field label="Назва команди"><input style={S.inp} value={f.name} onChange={set("name")} placeholder="Команда Alpha" /></Field>
      <Field label="Тім лід">
        <select style={{ ...S.inp, cursor:"pointer" }} value={f.teamlead_id} onChange={set("teamlead_id")}>
          <option value="">— не призначено —</option>
          {teamleads.map(t=><option key={t.id} value={t.id}>{t.full_name}</option>)}
        </select>
      </Field>
      <div style={{ display:"flex", gap:10, justifyContent:"flex-end", marginTop:16 }}>
        <button onClick={onClose} style={S.btnGhost}>Скасувати</button>
        <button onClick={()=>onSave(f)} style={S.btn}>Зберегти</button>
      </div>
    </div>
  );
};
