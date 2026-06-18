import { useState, useEffect } from "react";
import { supabase } from "./supabase";
import DomainsTab from "./DomainsTab";
import CreativesTab from "./CreativesTab";
import StatsTab from "./StatsTab";
import FbAccountsTab from "./FbAccounts";
import TeamsTab from "./Teams";
import ProfileTab from "./Profile";

const S = {
  inp: { background:"#0f1117", border:"1px solid #2e3240", borderRadius:8, color:"#e2e8f0", padding:"8px 12px", width:"100%", fontSize:14, outline:"none" },
  btn: { background:"#3b82f6", border:"none", color:"#fff", borderRadius:8, padding:"9px 20px", cursor:"pointer", fontWeight:600, fontSize:14 },
  btnGhost: { background:"#1e2330", border:"1px solid #2e3240", color:"#94a3b8", borderRadius:8, padding:"9px 16px", cursor:"pointer", fontSize:13 },
};

const Badge = ({ s }) => {
  const COLORS = { admin:"#a78bfa", teamlead:"#fb923c", buyer:"#38bdf8" };
  const LABELS = { admin:"Адмін", teamlead:"Тім лід", buyer:"Байєр" };
  return <span style={{ background:`${COLORS[s]||"#38bdf8"}22`, color:COLORS[s]||"#38bdf8", border:`1px solid ${COLORS[s]||"#38bdf8"}44`, borderRadius:6, padding:"3px 10px", fontSize:11, fontWeight:700 }}>{LABELS[s]||"Байєр"}</span>;
};

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

const AuthPage = () => {
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");

  const submit = async () => {
    setMsg("");
    setLoading(true);
    try {
      const { error } = await (mode === "login"
        ? supabase.auth.signInWithPassword({ email, password })
        : supabase.auth.signUp({ email, password }));
      if (error) setMsg("❌ " + error.message);
      else setMsg("✅ " + (mode === "login" ? "Вхід успішний" : "Реєстрація успішна"));
    } catch (e) {
      setMsg("❌ Помилка: " + e.message);
    }
    setLoading(false);
  };

  return (
    <div style={{ minHeight:"100vh", background:"#0b0d14", display:"flex", alignItems:"center", justifyContent:"center" }}>
      <div style={{ width:"min(320px,90vw)", background:"#13151c", border:"1px solid #2e3240", borderRadius:14, padding:28 }}>
        <h2 style={{ textAlign:"center", color:"#e2e8f0", margin:0 }}>{mode === "login" ? "Увійти" : "Зареєструватись"}</h2>
        <div style={{ marginTop:24 }}>
          <input style={S.inp} type="email" placeholder="Email" value={email} onChange={e=>setEmail(e.target.value)} />
          <input style={{ ...S.inp, marginTop:12 }} type="password" placeholder="Пароль" value={password} onChange={e=>setPassword(e.target.value)} onKeyDown={e=>e.key==="Enter"&&submit()} />
          {msg && <div style={{ color:msg.startsWith("✅")?"#4ade80":"#f87171", fontSize:13, marginBottom:12, padding:"8px 12px", background:msg.startsWith("✅")?"#16a34a22":"#dc262622", borderRadius:8, marginTop:12 }}>{msg}</div>}
          <button onClick={submit} disabled={loading} style={{ ...S.btn, width:"100%", padding:"11px", opacity:loading?0.7:1, marginTop:12 }}>{loading?"Завантаження…":mode==="login"?"Увійти":"Зареєструватись"}</button>
          <button onClick={()=>setMode(mode==="login"?"register":"login")} style={{ ...S.btnGhost, width:"100%", marginTop:10 }}>{mode==="login"?"Зареєструватись":"Вже є аккаунт?"}</button>
        </div>
      </div>
    </div>
  );
};

export default function App() {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [tab, setTab] = useState("domains");
  const [domains, setDomains] = useState([]);

  useEffect(()=>{
    supabase.auth.getSession().then(({ data: { session } })=>{ setSession(session); setAuthLoading(false); });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e,s)=>setSession(s));
    return ()=>subscription.unsubscribe();
  },[]);

  useEffect(()=>{
    if (!session) return;
    supabase.from("profiles").select("*, teams(id, name)").eq("id",session.user.id).single().then(({ data })=>{ if(data) setProfile(data); });
    supabase.from("domains").select("*").order("created_at",{ascending:false}).then(({ data })=>{ if(data) setDomains(data); });
  },[session, tab]);

  if (authLoading) return <div style={{ minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",background:"#0b0d14",color:"#64748b" }}>Завантаження…</div>;
  if (!session) return <AuthPage />;

  const user = session.user;
  const isAdmin = profile?.role === "admin";
  const isTeamLead = profile?.role === "teamlead";
  const canSeeAll = isAdmin || isTeamLead;
  const userName = profile?.full_name || user.email;

  const TABS = [
    { id:"domains",   label:"🌐 Домени / ПВА" },
    { id:"creatives", label:"🎨 Креативи" },
    { id:"stats",     label:"📊 Статистика" },
    { id:"accounts",  label:"📱 FB Акаунти" },
    ...((isAdmin || isTeamLead) ? [{ id:"team", label:"👥 Команди" }] : []),
    { id:"profile",   label:"⚙️ Профіль" },
  ];

  return (
    <div style={{ minHeight:"100vh", background:"#0b0d14" }}>
      <div style={{ borderBottom:"1px solid #1e2330", background:"#0f1117", padding:"0 24px", display:"flex", alignItems:"center", flexWrap:"wrap" }}>
        <div style={{ padding:"16px 0", marginRight:32 }}>
          <span style={{ fontWeight:800, fontSize:18, background:"linear-gradient(90deg,#3b82f6,#a78bfa)", WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent" }}>ArbCRM</span>
        </div>
        {TABS.map(t=>(
          <button key={t.id} onClick={()=>setTab(t.id)} style={{ background:"none", border:"none", color:tab===t.id?"#e2e8f0":"#64748b", padding:"18px 14px", cursor:"pointer", fontSize:14, fontWeight:tab===t.id?700:400, borderBottom:tab===t.id?"2px solid #3b82f6":"2px solid transparent", marginBottom:-1 }}>{t.label}</button>
        ))}
        <div style={{ flex:1 }} />
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          <Badge s={profile?.role||"buyer"} />
          {profile?.avatar_url
            ? <img src={profile.avatar_url} alt="" style={{ width:28,height:28,borderRadius:"50%",objectFit:"cover",border:"1px solid #2e3240" }} onError={e=>e.target.style.display="none"} />
            : <div style={{ width:28,height:28,borderRadius:"50%",background:"#1e2330",display:"flex",alignItems:"center",justifyContent:"center",color:"#60a5fa",fontSize:11,fontWeight:800 }}>{userName?.[0]?.toUpperCase()}</div>
          }
          <span style={{ color:"#94a3b8", fontSize:13 }}>{userName}</span>
          <button onClick={()=>supabase.auth.signOut()} style={{ ...S.btnGhost, padding:"6px 14px", fontSize:13 }}>Вийти</button>
        </div>
      </div>

      <div style={{ padding:24, maxWidth:1600, margin:"0 auto" }}>
        {tab==="domains"   && <DomainsTab   user={user} isAdmin={isAdmin} canSeeAll={canSeeAll} />}
        {tab==="creatives" && <CreativesTab user={user} isAdmin={isAdmin} canSeeAll={canSeeAll} domains={domains} />}
        {tab==="stats"     && <StatsTab     domains={domains} />}
        {tab==="accounts"  && <FbAccountsTab user={user} isAdmin={isAdmin} canSeeAll={canSeeAll} />}
        {tab==="team"      && (isAdmin || isTeamLead) && <TeamsTab currentUserId={user.id} isAdmin={isAdmin} />}
        {tab==="profile"   && <ProfileTab user={user} profile={profile} onProfileUpdate={setProfile} />}
      </div>
    </div>
  );
}

const DomainsTab = ({ user, isAdmin, canSeeAll }) => {
  const [domains, setDomains] = useState([]);
  const [modal, setModal] = useState(null);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [filterBuyer, setFilterBuyer] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [buyers, setBuyers] = useState([]);

  useEffect(() => {
    (async () => {
      const { data: d } = await supabase.from("domains").select("*").order("created_at", { ascending: false });
      if (d) setDomains(d);
      const { data: p } = await supabase.from("profiles").select("full_name");
      if (p) setBuyers(p);
    })();
  }, []);

  const filtered = domains.filter((d) => {
    const own = canSeeAll || d.user_id === user.id;
    const search_match = d.domain.toLowerCase().includes(search.toLowerCase());
    const buyer_match = !filterBuyer || d.buyer === filterBuyer;
    const status_match = !filterStatus || d.status === filterStatus;
    return own && search_match && buyer_match && status_match;
  });

  const handleSave = async (f) => {
    setSaving(true);
    const payload = { ...f, user_id: user.id };
    if (modal.mode === "add") {
      await supabase.from("domains").insert([payload]);
    } else {
      await supabase.from("domains").update(payload).eq("id", modal.data.id);
    }
    setModal(null);
    setSaving(false);
    const { data } = await supabase.from("domains").select("*");
    if (data) setDomains(data);
  };

  const deleteDomain = async (id) => {
    if (!confirm("Видалити?")) return;
    await supabase.from("domains").delete().eq("id", id);
    setDomains(domains.filter((d) => d.id !== id));
  };

  return (
    <div>
      <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
        <input style={S.inp} placeholder="🔍 Пошук домена" value={search} onChange={(e) => setSearch(e.target.value)} />
        <select style={{ ...S.inp, maxWidth: 150, cursor: "pointer" }} value={filterBuyer} onChange={(e) => setFilterBuyer(e.target.value)}>
          <option value="">Всі байєри</option>
          {buyers.map((b) => (<option key={b.full_name} value={b.full_name}>{b.full_name}</option>))}
        </select>
        <select style={{ ...S.inp, maxWidth: 150, cursor: "pointer" }} value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
          <option value="">Всі статуси</option>
          {["активний", "на паузі", "мертвий"].map((s) => (<option key={s} value={s}>{s}</option>))}
        </select>
        <button onClick={() => setModal({ mode: "add", data: {} })} style={S.btn}>+ Додати</button>
      </div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "#1a1d23", borderBottom: "1px solid #2e3240" }}>
              {["Domain", "PWA", "Offer", "Geo", "Status", "Buyer", "Launch", "Comment", ""].map((h) => (
                <th key={h} style={{ padding: "10px 14px", color: "#64748b", fontSize: 12, fontWeight: 700, textAlign: "left" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((d) => (
              <tr key={d.id} style={{ borderBottom: "1px solid #1a1d23" }} onMouseEnter={(e) => (e.currentTarget.style.background = "#13151c")} onMouseLeave={(e) => (e.currentTarget.style.background = "")}>
                <td style={{ padding: "10px 14px", color: "#e2e8f0", fontSize: 13 }}>{d.domain}</td>
                <td style={{ padding: "10px 14px", color: "#94a3b8", fontSize: 12 }}>{d.pwa}</td>
                <td style={{ padding: "10px 14px", color: "#94a3b8", fontSize: 12 }}>{d.offer}</td>
                <td style={{ padding: "10px 14px", color: "#94a3b8", fontSize: 12 }}>{d.geo}</td>
                <td style={{ padding: "10px 14px", fontSize: 12 }}>
                  <span style={{ background: d.status === "активний" ? "#16a34a22" : d.status === "на паузі" ? "#ea580c22" : "#dc262622", color: d.status === "активний" ? "#4ade80" : d.status === "на паузі" ? "#fb923c" : "#f87171", borderRadius: 4, padding: "2px 8px" }}>{d.status}</span>
                </td>
                <td style={{ padding: "10px 14px", color: "#94a3b8", fontSize: 12 }}>{d.buyer}</td>
                <td style={{ padding: "10px 14px", color: "#94a3b8", fontSize: 12 }}>{d.launch_date}</td>
                <td style={{ padding: "10px 14px", color: "#64748b", fontSize: 11 }}>{d.comment}</td>
                <td style={{ padding: "10px 14px", textAlign: "right" }}>
                  {(isAdmin || d.user_id === user.id) && (
                    <>
                      <button onClick={() => setModal({ mode: "edit", data: d })} style={{ ...S.btnGhost, padding: "4px 8px", fontSize: 12 }}>✏️</button>
                      <button onClick={() => deleteDomain(d.id)} style={{ ...S.btnGhost, padding: "4px 8px", fontSize: 12, color: "#f87171", marginLeft: 4 }}>🗑</button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {modal && <Modal title={modal.mode === "add" ? "Новий домен" : "Редагувати"} onClose={() => setModal(null)}><DomainForm initial={modal.data} onSave={handleSave} onClose={() => setModal(null)} loading={saving} /></Modal>}
    </div>
  );
};

const DomainForm = ({ initial={}, onSave, onClose, loading }) => {
  const [f, setF] = useState({ domain:"", pwa:"", offer:"", geo:"", status:"активний", buyer:"", launch_date:"", comment:"", ...initial });
  const set = k => e => setF(p=>({...p,[k]:e.target.value}));
  return (
    <div>
      <input style={S.inp} value={f.domain} onChange={set("domain")} placeholder="Domain" />
      <input style={{ ...S.inp, marginTop:12 }} value={f.pwa} onChange={set("pwa")} placeholder="PWA" />
      <input style={{ ...S.inp, marginTop:12 }} value={f.offer} onChange={set("offer")} placeholder="Offer" />
      <input style={{ ...S.inp, marginTop:12 }} value={f.geo} onChange={set("geo")} placeholder="Geo" />
      <select style={{ ...S.inp, marginTop:12, cursor:"pointer" }} value={f.status} onChange={set("status")}>
        {["активний", "на паузі", "мертвий"].map(s=><option key={s}>{s}</option>)}
      </select>
      <input style={{ ...S.inp, marginTop:12 }} value={f.buyer} onChange={set("buyer")} placeholder="Buyer" />
      <input style={{ ...S.inp, marginTop:12 }} type="date" value={f.launch_date} onChange={set("launch_date")} />
      <input style={{ ...S.inp, marginTop:12 }} value={f.comment} onChange={set("comment")} placeholder="Comment" />
      <div style={{ display:"flex", gap:10, justifyContent:"flex-end", marginTop:16 }}>
        <button onClick={onClose} style={S.btnGhost}>Скасувати</button>
        <button onClick={()=>onSave(f)} disabled={loading} style={{ ...S.btn, opacity:loading?0.7:1 }}>{loading?"Збереження…":"Зберегти"}</button>
      </div>
    </div>
  );
};

const CreativesTab = ({ user, isAdmin, canSeeAll, domains }) => {
  const [creatives, setCreatives] = useState([]);
  const [modal, setModal] = useState(null);
  const [saving, setSaving] = useState(false);
  const [zoom, setZoom] = useState(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("creatives").select("*").order("created_at", { ascending: false });
      if (data) setCreatives(data);
    })();
  }, []);

  const filtered = creatives.filter(c => canSeeAll || c.user_id === user.id);

  const handleSave = async (f) => {
    setSaving(true);
    const payload = { ...f, user_id: user.id };
    if (modal.mode === "add") {
      await supabase.from("creatives").insert([payload]);
    } else {
      await supabase.from("creatives").update(payload).eq("id", modal.data.id);
    }
    setModal(null);
    setSaving(false);
    const { data } = await supabase.from("creatives").select("*");
    if (data) setCreatives(data);
  };

  const deleteCreative = async (id) => {
    if (!confirm("Видалити?")) return;
    await supabase.from("creatives").delete().eq("id", id);
    setCreatives(creatives.filter(c => c.id !== id));
  };

  return (
    <div>
      <button onClick={() => setModal({ mode: "add", data: {} })} style={S.btn}>+ Додати креатив</button>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(200px, 1fr))", gap:16, marginTop:16 }}>
        {filtered.map(c => (
          <div key={c.id} style={{ background:"#13151c", borderRadius:10, overflow:"hidden", border:"1px solid #2e3240" }}>
            <div style={{ width:"100%", aspectRatio:"1", background:"#0f1117", display:"flex", alignItems:"center", justifyContent:"center", cursor:c.preview_url?"pointer":"default" }} onClick={() => c.preview_url && setZoom(c.preview_url)}>
              {c.preview_url ? <img src={c.preview_url} alt="" style={{ width:"100%", height:"100%", objectFit:"cover" }} onError={e=>e.target.style.display="none"} /> : <span style={{ color:"#475569" }}>No preview</span>}
            </div>
            <div style={{ padding:12 }}>
              <div style={{ color:"#e2e8f0", fontWeight:600, fontSize:13, marginBottom:4 }}>{c.name}</div>
              <div style={{ color:"#64748b", fontSize:11, marginBottom:8 }}>ROI: {c.revenue && c.spend ? ((c.revenue-c.spend)/c.spend*100).toFixed(1)+"%" : "—"}</div>
              <div style={{ display:"flex", gap:6 }}>
                <button onClick={() => setModal({ mode: "edit", data: c })} style={{ ...S.btnGhost, padding:"4px 8px", fontSize:11, flex:1 }}>✏️</button>
                <button onClick={() => deleteCreative(c.id)} style={{ ...S.btnGhost, padding:"4px 8px", fontSize:11, flex:1, color:"#f87171" }}>🗑</button>
              </div>
            </div>
          </div>
        ))}
      </div>
      {zoom && <div onClick={() => setZoom(null)} style={{ position:"fixed", inset:0, background:"#000c", zIndex:200, display:"flex", alignItems:"center", justifyContent:"center", cursor:"zoom-out" }}><img src={zoom} alt="" style={{ maxWidth:"90vw", maxHeight:"90vh", borderRadius:10 }} /></div>}
      {modal && <Modal title={modal.mode === "add" ? "Новий креатив" : "Редагувати"} onClose={() => setModal(null)}><CreativeForm initial={modal.data} domains={domains} onSave={handleSave} onClose={() => setModal(null)} loading={saving} userId={user.id} /></Modal>}
    </div>
  );
};

const CreativeForm = ({ initial={}, domains, onSave, onClose, loading, userId }) => {
  const [f, setF] = useState({ name:"", preview_url:"", domain_id:"", status:"тест", buyer:"", spend:0, revenue:0, ctr:0, cr:0, installs:0, regy:0, ftd:0, added_date:"", ...initial });
  const [uploading, setUploading] = useState(false);
  const set = k => e => setF(p=>({...p,[k]:k.includes("spend")||k.includes("revenue")||k.includes("ctr")||k.includes("cr")||k.includes("install")||k.includes("regy")||k.includes("ftd")?{...p,[k]:parseFloat(e.target.value)||0}:{...p,[k]:e.target.value}}));
  
  const uploadFile = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    const path = `creatives/${userId}/${Date.now()}_${file.name}`;
    const { error } = await supabase.storage.from("creatives").upload(path, file);
    if (!error) {
      const { data } = supabase.storage.from("creatives").getPublicUrl(path);
      setF(p=>({...p,preview_url:data.publicUrl}));
    }
    setUploading(false);
  };

  return (
    <div>
      <input style={S.inp} value={f.name} onChange={set("name")} placeholder="Назва" />
      <div style={{ marginTop:12 }}>
        <label style={{ color:"#64748b", fontSize:12, display:"block", marginBottom:6 }}>Превю</label>
        <div style={{ display:"flex", gap:10 }}>
          <input style={{ ...S.inp, flex:1 }} value={f.preview_url} onChange={set("preview_url")} placeholder="URL або завантажте" />
          <input type="file" accept="image/*" onChange={uploadFile} style={{ cursor:"pointer" }} />
        </div>
        {uploading && <div style={{ color:"#60a5fa", fontSize:11, marginTop:4 }}>Завантаження...</div>}
      </div>
      <select style={{ ...S.inp, marginTop:12, cursor:"pointer" }} value={f.domain_id} onChange={set("domain_id")}>
        <option value="">Виберіть домен</option>
        {domains.map(d=><option key={d.id} value={d.id}>{d.domain}</option>)}
      </select>
      <select style={{ ...S.inp, marginTop:12, cursor:"pointer" }} value={f.status} onChange={set("status")}>
        {["тест", "активний", "мертвий"].map(s=><option key={s}>{s}</option>)}
      </select>
      <input style={{ ...S.inp, marginTop:12 }} value={f.buyer} onChange={set("buyer")} placeholder="Buyer" />
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginTop:12 }}>
        <input style={S.inp} type="number" value={f.spend} onChange={set("spend")} placeholder="Spend" />
        <input style={S.inp} type="number" value={f.revenue} onChange={set("revenue")} placeholder="Revenue" />
        <input style={S.inp} type="number" value={f.ctr} onChange={set("ctr")} placeholder="CTR" />
        <input style={S.inp} type="number" value={f.cr} onChange={set("cr")} placeholder="CR" />
        <input style={S.inp} type="number" value={f.installs} onChange={set("installs")} placeholder="Installs" />
        <input style={S.inp} type="number" value={f.regy} onChange={set("regy")} placeholder="Regy" />
        <input style={S.inp} type="number" value={f.ftd} onChange={set("ftd")} placeholder="FTD" />
        <input style={S.inp} type="date" value={f.added_date} onChange={set("added_date")} />
      </div>
      <div style={{ display:"flex", gap:10, justifyContent:"flex-end", marginTop:16 }}>
        <button onClick={onClose} style={S.btnGhost}>Скасувати</button>
        <button onClick={()=>onSave(f)} disabled={loading} style={{ ...S.btn, opacity:loading?0.7:1 }}>{loading?"Збереження…":"Зберегти"}</button>
      </div>
    </div>
  );
};

const StatsTab = ({ domains }) => {
  const [rows, setRows] = useState([]);
  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("creatives").select("*");
      if (data) setRows(data);
    })();
  }, []);
  
  const stats = {
    total: domains.length,
    alive: domains.filter(d=>d.status==="активний").length,
    spend: rows.reduce((s,r)=>s+(parseFloat(r.spend)||0),0),
  };

  return (
    <div>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(150px, 1fr))", gap:12, marginBottom:20 }}>
        {[["Домени", stats.total, "#60a5fa"], ["Живих", stats.alive, "#4ade80"], ["Спенд", `$${stats.spend.toFixed(0)}`, "#a78bfa"]].map(([l,v,c])=>(
          <div key={l} style={{ background:"#13151c", border:"1px solid #2e3240", borderRadius:10, padding:16 }}>
            <div style={{ color:"#64748b", fontSize:11, fontWeight:700, textTransform:"uppercase" }}>{l}</div>
            <div style={{ color:c, fontSize:22, fontWeight:800, marginTop:4 }}>{v}</div>
          </div>
        ))}
      </div>
    </div>
  );
};
