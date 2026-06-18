import { useState, useEffect, useMemo, useRef } from "react";
import FbAccountsTab from "./FbAccounts";
import TeamsTab from "./Teams";
import ProfileTab from "./Profile";
import { supabase } from "./supabase";

const S = {
  inp: { background:"#0f1117", border:"1px solid #2e3240", borderRadius:8, color:"#e2e8f0", padding:"8px 12px", width:"100%", fontSize:14, outline:"none" },
  btn: { background:"#3b82f6", border:"none", color:"#fff", borderRadius:8, padding:"9px 20px", cursor:"pointer", fontWeight:600, fontSize:14 },
  btnGhost: { background:"#1e2330", border:"1px solid #2e3240", color:"#94a3b8", borderRadius:8, padding:"9px 20px", cursor:"pointer", fontSize:14 },
  btnDanger: { background:"#dc2626", border:"none", color:"#fff", borderRadius:8, padding:"9px 20px", cursor:"pointer", fontWeight:600, fontSize:14 },
  card: { background:"#13151c", border:"1px solid #1e2330", borderRadius:12, padding:20 },
};

const BADGE_COLORS = {
  "активний":  { bg:"#16a34a22", color:"#4ade80", border:"#16a34a" },
  "на паузі":  { bg:"#ca8a0422", color:"#fbbf24", border:"#ca8a04" },
  "мертвий":   { bg:"#dc262622", color:"#f87171", border:"#dc2626" },
  "тест":      { bg:"#2563eb22", color:"#60a5fa", border:"#2563eb" },
  "живий":     { bg:"#16a34a22", color:"#4ade80", border:"#16a34a" },
  "забанений": { bg:"#dc262622", color:"#f87171", border:"#dc2626" },
  "на прогріві":{ bg:"#ca8a0422", color:"#fbbf24", border:"#ca8a04" },
  admin:        { bg:"#7c3aed22", color:"#a78bfa", border:"#7c3aed" },
  buyer:        { bg:"#0369a122", color:"#38bdf8", border:"#0369a1" },
  teamlead:     { bg:"#d9770622", color:"#fb923c", border:"#d97706" },
};

const Badge = ({ s }) => {
  const c = BADGE_COLORS[s] || BADGE_COLORS["тест"];
  return <span style={{ background:c.bg, color:c.color, border:`1px solid ${c.border}`, borderRadius:6, padding:"2px 10px", fontSize:12, fontWeight:600, whiteSpace:"nowrap" }}>{s}</span>;
};

const Field = ({ label, children }) => (
  <div style={{ marginBottom:14 }}>
    <label style={{ display:"block", color:"#64748b", fontSize:11, fontWeight:700, textTransform:"uppercase", letterSpacing:"0.07em", marginBottom:5 }}>{label}</label>
    {children}
  </div>
);

const Th = ({ children, onClick, dir }) => (
  <th onClick={onClick} style={{ padding:"10px 14px", textAlign:"left", color:"#64748b", fontSize:11, fontWeight:700, textTransform:"uppercase", letterSpacing:"0.07em", cursor:onClick?"pointer":"default", whiteSpace:"nowrap", userSelect:"none", borderBottom:"1px solid #1e2330", background:"#0f1117" }}>
    {children}{dir === "asc" ? " ▲" : dir === "desc" ? " ▼" : ""}
  </th>
);

const Td = ({ children, style }) => (
  <td style={{ padding:"10px 14px", color:"#cbd5e1", fontSize:13, borderBottom:"1px solid #1a1d23", ...style }}>{children}</td>
);

const Toast = ({ msg, type }) => msg ? (
  <div style={{ position:"fixed", bottom:24, right:24, background:type === "error" ? "#dc2626" : "#16a34a", color:"#fff", borderRadius:10, padding:"12px 20px", fontSize:14, fontWeight:600, zIndex:999, boxShadow:"0 4px 20px #0008" }}>{msg}</div>
) : null;

const Modal = ({ title, onClose, children }) => (
  <div style={{ position:"fixed", inset:0, background:"#000b", zIndex:100, display:"flex", alignItems:"center", justifyContent:"center" }}>
    <div style={{ background:"#1a1d23", border:"1px solid #2e3240", borderRadius:14, width:"min(640px,96vw)", maxHeight:"90vh", overflowY:"auto", padding:28 }}>
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
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");

  const submit = async () => {
    if (!email || !password) {
      setMsg("❌ Вкажіть email і пароль");
      return;
    }

    setLoading(true);
    setMsg("");
    try {
      if (mode === "login") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else {
        const { error } = await supabase.auth.signUp({ email, password, options: { data: { full_name: name } } });
        if (error) throw error;
        setMsg("✅ Реєстрація успішна. Якщо вхід не відбувся автоматично — увійдіть вручну.");
      }
    } catch (e) {
      setMsg("❌ " + e.message);
    }
    setLoading(false);
  };

  return (
    <div style={{ minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center", background:"#0b0d14" }}>
      <div style={{ ...S.card, width:"min(400px,94vw)", padding:36 }}>
        <div style={{ textAlign:"center", marginBottom:28 }}>
          <div style={{ fontSize:32, marginBottom:8 }}>📊</div>
          <h1 style={{ fontSize:24, fontWeight:800, background:"linear-gradient(90deg,#3b82f6,#a78bfa)", WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent" }}>ArbCRM</h1>
          <p style={{ color:"#64748b", fontSize:13, marginTop:6 }}>Система управління арбітражем</p>
        </div>

        <div style={{ display:"flex", background:"#0f1117", borderRadius:8, padding:3, marginBottom:20 }}>
          {[["login","Увійти"],["signup","Реєстрація"]].map(([m,l]) => (
            <button key={m} onClick={() => { setMode(m); setMsg(""); }} style={{ flex:1, padding:"8px", border:"none", borderRadius:6, cursor:"pointer", fontWeight:600, fontSize:13, background:mode === m ? "#1e2330" : "transparent", color:mode === m ? "#e2e8f0" : "#64748b" }}>{l}</button>
          ))}
        </div>

        {mode === "signup" && <Field label="Ім'я"><input style={S.inp} value={name} onChange={e=>setName(e.target.value)} placeholder="Ваше ім'я" /></Field>}
        <Field label="Email"><input style={S.inp} type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="email@example.com" /></Field>
        <Field label="Пароль"><input style={S.inp} type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="••••••••" onKeyDown={e=>e.key === "Enter" && submit()} /></Field>
        {msg && <div style={{ color:msg.startsWith("✅") ? "#4ade80" : "#f87171", fontSize:13, marginBottom:12, padding:"8px 12px", background:msg.startsWith("✅") ? "#16a34a22" : "#dc262622", borderRadius:8 }}>{msg}</div>}
        <button onClick={submit} disabled={loading} style={{ ...S.btn, width:"100%", padding:"11px", opacity:loading ? 0.7 : 1 }}>{loading ? "Завантаження…" : mode === "login" ? "Увійти" : "Зареєструватись"}</button>
      </div>
    </div>
  );
};

const EMPTY_D = { domain:"", pwa:"", offer:"", geo:"", status:"активний", buyer:"", launch_date:"", comment:"" };

const DomainForm = ({ initial = {}, onSave, onClose, loading }) => {
  const [f, setF] = useState({ ...EMPTY_D, ...initial });
  const set = k => e => setF(p => ({ ...p, [k]: e.target.value }));

  return (
    <div>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
        <Field label="Домен"><input style={S.inp} value={f.domain || ""} onChange={set("domain")} placeholder="example.com" /></Field>
        <Field label="ПВА назва"><input style={S.inp} value={f.pwa || ""} onChange={set("pwa")} placeholder="MyApp_UA" /></Field>
        <Field label="Оффер"><input style={S.inp} value={f.offer || ""} onChange={set("offer")} placeholder="1win…" /></Field>
        <Field label="ГЕО"><input style={S.inp} value={f.geo || ""} onChange={set("geo")} placeholder="UA, PL…" /></Field>
        <Field label="Статус"><select style={{ ...S.inp, cursor:"pointer" }} value={f.status || "активний"} onChange={set("status")}>{["активний","на паузі","мертвий"].map(s=><option key={s}>{s}</option>)}</select></Field>
        <Field label="Байєр"><input style={S.inp} value={f.buyer || ""} onChange={set("buyer")} placeholder="Ім'я" /></Field>
        <Field label="Дата запуску"><input style={S.inp} type="date" value={f.launch_date || ""} onChange={set("launch_date")} /></Field>
      </div>
      <Field label="Коментар"><textarea style={{ ...S.inp, height:72, resize:"vertical" }} value={f.comment || ""} onChange={set("comment")} /></Field>
      <div style={{ display:"flex", gap:10, justifyContent:"flex-end", marginTop:8 }}>
        <button onClick={onClose} style={S.btnGhost}>Скасувати</button>
        <button onClick={() => onSave(f)} disabled={loading} style={{ ...S.btn, opacity:loading ? 0.7 : 1 }}>{loading ? "…" : "Зберегти"}</button>
      </div>
    </div>
  );
};

const DomainsTab = ({ user, isAdmin }) => {
  const [rows, setRows] = useState([]);
  const [modal, setModal] = useState(null);
  const [filter, setFilter] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);
  const showToast = (msg, type="ok") => { setToast({ msg, type }); setTimeout(()=>setToast(null), 3000); };

  const fetchRows = async () => {
    setLoading(true);
    const { data, error } = await supabase.from("domains").select("*").order("created_at", { ascending:false });
    if (error) showToast("Помилка: " + error.message, "error");
    if (data) setRows(data);
    setLoading(false);
  };

  useEffect(() => { fetchRows(); }, []);

  const filtered = rows.filter(d => [d.domain,d.pwa,d.offer,d.geo,d.buyer,d.status].join(" ").toLowerCase().includes(filter.toLowerCase()));

  const handleSave = async (f) => {
    setSaving(true);
    const payload = { ...f };
    let error;

    if (modal.mode === "add") {
      delete payload.id;
      ({ error } = await supabase.from("domains").insert([{ ...payload, user_id:user.id }]));
    } else {
      ({ error } = await supabase.from("domains").update(payload).eq("id", f.id));
    }

    if (error) showToast("Помилка: " + error.message, "error");
    else {
      showToast(modal.mode === "add" ? "Домен додано ✓" : "Збережено ✓");
      setModal(null);
      await fetchRows();
    }
    setSaving(false);
  };

  const del = async (id) => {
    if (!confirm("Видалити домен?")) return;
    const { error } = await supabase.from("domains").delete().eq("id", id);
    if (error) showToast("Помилка: " + error.message, "error");
    else { showToast("Видалено"); fetchRows(); }
  };

  return (
    <div>
      <Toast msg={toast?.msg} type={toast?.type} />
      <div style={{ display:"flex", gap:12, marginBottom:16, alignItems:"center" }}>
        <input style={{ ...S.inp, maxWidth:280 }} placeholder="🔍 Пошук…" value={filter} onChange={e=>setFilter(e.target.value)} />
        <div style={{ flex:1 }} />
        <button onClick={()=>setModal({ mode:"add", data:{} })} style={S.btn}>+ Домен</button>
      </div>

      {loading ? <div style={{ textAlign:"center", color:"#475569", padding:40 }}>Завантаження…</div> : (
        <div style={{ overflowX:"auto" }}>
          <table style={{ width:"100%", borderCollapse:"collapse", background:"#13151c", borderRadius:10, overflow:"hidden" }}>
            <thead><tr><Th>Домен</Th><Th>ПВА</Th><Th>Оффер</Th><Th>ГЕО</Th><Th>Статус</Th><Th>Байєр</Th><Th>Запуск</Th><Th>Коментар</Th><Th></Th></tr></thead>
            <tbody>
              {filtered.length === 0 && <tr><td colSpan={9} style={{ padding:40, textAlign:"center", color:"#475569" }}>Немає записів</td></tr>}
              {filtered.map(d => (
                <tr key={d.id} onMouseEnter={e=>e.currentTarget.style.background="#1e2330"} onMouseLeave={e=>e.currentTarget.style.background=""}>
                  <Td><a href={`https://${d.domain}`} target="_blank" rel="noreferrer" style={{ color:"#60a5fa", textDecoration:"none" }}>{d.domain}</a></Td>
                  <Td>{d.pwa}</Td>
                  <Td>{d.offer}</Td>
                  <Td><span style={{ color:"#a78bfa", fontWeight:700 }}>{d.geo}</span></Td>
                  <Td><Badge s={d.status} /></Td>
                  <Td>{d.buyer}</Td>
                  <Td style={{ color:"#64748b", fontSize:12 }}>{d.launch_date}</Td>
                  <Td style={{ maxWidth:180, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", color:"#64748b" }}>{d.comment}</Td>
                  <Td>
                    <button onClick={()=>setModal({ mode:"edit", data:d })} style={{ background:"none", border:"none", color:"#60a5fa", cursor:"pointer" }}>✏️</button>
                    {isAdmin && <button onClick={()=>del(d.id)} style={{ background:"none", border:"none", color:"#f87171", cursor:"pointer" }}>🗑</button>}
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modal && <Modal title={modal.mode === "add" ? "Новий домен" : "Редагувати домен"} onClose={()=>setModal(null)}><DomainForm initial={modal.data} onSave={handleSave} onClose={()=>setModal(null)} loading={saving} /></Modal>}
    </div>
  );
};

const EMPTY_C = { name:"", preview_url:"", domain_id:"", status:"тест", buyer:"", spend:0, revenue:0, ctr:0, cr:0, installs:0, regy:0, ftd:0, added_date:"" };

const CreativeForm = ({ initial = {}, domains, onSave, onClose, loading, userId }) => {
  const [f, setF] = useState({ ...EMPTY_C, ...initial });
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const fileRef = useRef();
  const set = k => e => setF(p => ({ ...p, [k]: e.target.value }));

  const uploadFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setUploadError("");
    const ext = file.name.split(".").pop() || "bin";
    const path = `${userId}/${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("creatives").upload(path, file, { upsert:false });
    if (error) {
      setUploadError(error.message);
    } else {
      const { data } = supabase.storage.from("creatives").getPublicUrl(path);
      setF(p => ({ ...p, preview_url:data.publicUrl }));
    }
    setUploading(false);
  };

  return (
    <div>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
        <Field label="Назва / ID"><input style={S.inp} value={f.name || ""} onChange={set("name")} placeholder="creo_001" /></Field>
        <Field label="Байєр"><input style={S.inp} value={f.buyer || ""} onChange={set("buyer")} placeholder="Ім'я" /></Field>
        <Field label="Домен / ПВА"><select style={{ ...S.inp, cursor:"pointer" }} value={f.domain_id || ""} onChange={set("domain_id")}><option value="">— не прив'язаний —</option>{domains.map(d=><option key={d.id} value={d.id}>{d.domain} ({d.pwa})</option>)}</select></Field>
        <Field label="Статус"><select style={{ ...S.inp, cursor:"pointer" }} value={f.status || "тест"} onChange={set("status")}>{["тест","активний","мертвий"].map(s=><option key={s}>{s}</option>)}</select></Field>
        <Field label="Дата"><input style={S.inp} type="date" value={f.added_date || ""} onChange={set("added_date")} /></Field>
      </div>

      <Field label="Прев'ю">
        <div style={{ display:"flex", gap:10, alignItems:"center" }}>
          <input style={{ ...S.inp, flex:1 }} value={f.preview_url || ""} onChange={set("preview_url")} placeholder="URL або завантажте →" />
          <button onClick={()=>fileRef.current?.click()} disabled={uploading} style={{ ...S.btnGhost, whiteSpace:"nowrap", padding:"8px 14px" }}>{uploading ? "…" : "📎 Файл"}</button>
          <input ref={fileRef} type="file" accept="image/*,video/*" style={{ display:"none" }} onChange={uploadFile} />
        </div>
        {uploadError && <div style={{ color:"#f87171", fontSize:12, marginTop:6 }}>Помилка upload: {uploadError}</div>}
        {f.preview_url && <img src={f.preview_url} alt="" style={{ marginTop:8, height:80, borderRadius:8, objectFit:"cover" }} onError={e=>e.currentTarget.style.display="none"} />}
      </Field>

      <p style={{ color:"#60a5fa", fontSize:11, fontWeight:700, textTransform:"uppercase", letterSpacing:"0.07em", margin:"4px 0 10px" }}>📊 Метрики</p>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:12 }}>
        {[["spend","Витрати ($)"],["revenue","Дохід ($)"],["ctr","CTR (%)"],["cr","CR (%)"],["installs","Install"],["regy","Regy"],["ftd","FTD"]].map(([k,l])=>(
          <Field key={k} label={l}><input style={{ ...S.inp, textAlign:"right" }} type="number" value={f[k] ?? ""} onChange={set(k)} /></Field>
        ))}
      </div>

      <div style={{ display:"flex", gap:10, justifyContent:"flex-end", marginTop:16 }}>
        <button onClick={onClose} style={S.btnGhost}>Скасувати</button>
        <button onClick={()=>onSave(f)} disabled={loading || uploading} style={{ ...S.btn, opacity:(loading || uploading) ? 0.7 : 1 }}>{loading ? "…" : "Зберегти"}</button>
      </div>
    </div>
  );
};

const CreativesTab = ({ user, isAdmin, domains }) => {
  const [rows, setRows] = useState([]);
  const [modal, setModal] = useState(null);
  const [filter, setFilter] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [zoom, setZoom] = useState(null);
  const [toast, setToast] = useState(null);
  const showToast = (msg, type="ok") => { setToast({ msg, type }); setTimeout(()=>setToast(null), 3000); };

  const fetchRows = async () => {
    setLoading(true);
    const { data, error } = await supabase.from("creatives").select("*").order("created_at", { ascending:false });
    if (error) showToast("Помилка: " + error.message, "error");
    if (data) setRows(data);
    setLoading(false);
  };

  useEffect(() => { fetchRows(); }, []);

  const filtered = rows.filter(c => {
    const dm = domains.find(d => d.id === c.domain_id);
    return [c.name,c.buyer,c.status,dm?.domain || ""].join(" ").toLowerCase().includes(filter.toLowerCase());
  });

  const handleSave = async (f) => {
    setSaving(true);
    const payload = {
      ...f,
      user_id:user.id,
      spend:parseFloat(f.spend) || 0,
      revenue:parseFloat(f.revenue) || 0,
      ctr:parseFloat(f.ctr) || 0,
      cr:parseFloat(f.cr) || 0,
      installs:parseInt(f.installs, 10) || 0,
      regy:parseInt(f.regy, 10) || 0,
      ftd:parseInt(f.ftd, 10) || 0,
    };

    let error;
    if (modal.mode === "add") {
      delete payload.id;
      ({ error } = await supabase.from("creatives").insert([payload]));
    } else {
      ({ error } = await supabase.from("creatives").update(payload).eq("id", f.id));
    }

    if (error) showToast("Помилка: " + error.message, "error");
    else {
      showToast(modal.mode === "add" ? "Крео додано ✓" : "Збережено ✓");
      setModal(null);
      await fetchRows();
    }
    setSaving(false);
  };

  const del = async (id) => {
    if (!confirm("Видалити креатив?")) return;
    const { error } = await supabase.from("creatives").delete().eq("id", id);
    if (error) showToast("Помилка: " + error.message, "error");
    else { showToast("Видалено"); fetchRows(); }
  };

  return (
    <div>
      <Toast msg={toast?.msg} type={toast?.type} />
      <div style={{ display:"flex", gap:12, marginBottom:16, alignItems:"center" }}>
        <input style={{ ...S.inp, maxWidth:280 }} placeholder="🔍 Пошук…" value={filter} onChange={e=>setFilter(e.target.value)} />
        <div style={{ flex:1 }} />
        <button onClick={()=>setModal({ mode:"add", data:{} })} style={S.btn}>+ Крео</button>
      </div>

      {loading ? <div style={{ textAlign:"center", color:"#475569", padding:40 }}>Завантаження…</div> : (
        <div style={{ overflowX:"auto" }}>
          <table style={{ width:"100%", borderCollapse:"collapse", background:"#13151c", borderRadius:10, overflow:"hidden" }}>
            <thead><tr><Th>Прев'ю</Th><Th>Назва</Th><Th>Домен/ПВА</Th><Th>Статус</Th><Th>Байєр</Th><Th>Витрати</Th><Th>Дохід</Th><Th>ROI</Th><Th>CTR</Th><Th>CR</Th><Th>Install</Th><Th>Regy</Th><Th>FTD</Th><Th>Дата</Th><Th></Th></tr></thead>
            <tbody>
              {filtered.length === 0 && <tr><td colSpan={15} style={{ padding:40, textAlign:"center", color:"#475569" }}>Немає креативів</td></tr>}
              {filtered.map(c => {
                const roi = c.spend > 0 ? (((c.revenue - c.spend) / c.spend) * 100).toFixed(1) : null;
                const roiColor = roi === null ? "#64748b" : roi >= 0 ? "#4ade80" : "#f87171";
                const dm = domains.find(d => d.id === c.domain_id);
                return (
                  <tr key={c.id} onMouseEnter={e=>e.currentTarget.style.background="#1e2330"} onMouseLeave={e=>e.currentTarget.style.background=""}>
                    <Td>{c.preview_url ? <img src={c.preview_url} alt="" onClick={()=>setZoom(c.preview_url)} style={{ width:48, height:48, objectFit:"cover", borderRadius:6, cursor:"zoom-in", border:"1px solid #2e3240" }} onError={e=>e.currentTarget.style.display="none"} /> : <div style={{ width:48, height:48, background:"#1e2330", borderRadius:6, display:"flex", alignItems:"center", justifyContent:"center", color:"#475569", fontSize:20 }}>🖼</div>}</Td>
                    <Td style={{ fontWeight:600, color:"#e2e8f0" }}>{c.name}</Td>
                    <Td>{dm ? <div><div style={{ color:"#60a5fa", fontSize:12 }}>{dm.domain}</div><div style={{ color:"#64748b", fontSize:11 }}>{dm.pwa}</div></div> : <span style={{ color:"#475569" }}>—</span>}</Td>
                    <Td><Badge s={c.status} /></Td>
                    <Td>{c.buyer}</Td>
                    <Td style={{ color:"#f87171" }}>{c.spend ? `$${Number(c.spend).toFixed(0)}` : "—"}</Td>
                    <Td style={{ color:"#4ade80" }}>{c.revenue ? `$${Number(c.revenue).toFixed(0)}` : "—"}</Td>
                    <Td style={{ color:roiColor, fontWeight:700 }}>{roi !== null ? `${roi}%` : "—"}</Td>
                    <Td>{c.ctr ? `${c.ctr}%` : "—"}</Td>
                    <Td>{c.cr ? `${c.cr}%` : "—"}</Td>
                    <Td style={{ color:"#a78bfa" }}>{c.installs || "—"}</Td>
                    <Td style={{ color:"#a78bfa" }}>{c.regy || "—"}</Td>
                    <Td style={{ color:"#fbbf24", fontWeight:700 }}>{c.ftd || "—"}</Td>
                    <Td style={{ color:"#64748b", fontSize:11 }}>{c.added_date}</Td>
                    <Td>
                      <button onClick={()=>setModal({ mode:"edit", data:c })} style={{ background:"none", border:"none", color:"#60a5fa", cursor:"pointer" }}>✏️</button>
                      {isAdmin && <button onClick={()=>del(c.id)} style={{ background:"none", border:"none", color:"#f87171", cursor:"pointer" }}>🗑</button>}
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {zoom && <div onClick={()=>setZoom(null)} style={{ position:"fixed", inset:0, background:"#000c", zIndex:200, display:"flex", alignItems:"center", justifyContent:"center", cursor:"zoom-out" }}><img src={zoom} alt="" style={{ maxWidth:"90vw", maxHeight:"90vh", borderRadius:10 }} /></div>}
      {modal && <Modal title={modal.mode === "add" ? "Новий креатив" : "Редагувати креатив"} onClose={()=>setModal(null)}><CreativeForm initial={modal.data} domains={domains} onSave={handleSave} onClose={()=>setModal(null)} loading={saving} userId={user.id} /></Modal>}
    </div>
  );
};

const calcRoi = c => Number(c.spend) > 0 ? ((Number(c.revenue || 0) - Number(c.spend || 0)) / Number(c.spend || 1)) * 100 : null;

const StatsTab = ({ domains }) => {
  const [rows, setRows] = useState([]);
  const [filters, setFilters] = useState({ buyer:"", domain_id:"", status:"", dateFrom:"", dateTo:"" });
  const [sort, setSort] = useState({ key:"spend", dir:"desc" });
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState(null);
  const showToast = (msg, type="ok") => { setToast({ msg, type }); setTimeout(()=>setToast(null), 3000); };

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data, error } = await supabase.from("creatives").select("*");
      if (error) showToast("Помилка: " + error.message, "error");
      if (data) setRows(data);
      setLoading(false);
    })();
  }, []);

  const buyers = [...new Set(rows.map(c => c.buyer).filter(Boolean))];
  const setF = k => e => setFilters(p => ({ ...p, [k]:e.target.value }));

  const filtered = useMemo(() => rows.filter(c => {
    if (filters.buyer && c.buyer !== filters.buyer) return false;
    if (filters.domain_id && c.domain_id !== filters.domain_id) return false;
    if (filters.status && c.status !== filters.status) return false;
    if (filters.dateFrom && c.added_date < filters.dateFrom) return false;
    if (filters.dateTo && c.added_date > filters.dateTo) return false;
    return true;
  }), [rows, filters]);

  const sorted = useMemo(() => [...filtered].sort((a, b) => {
    const getValue = row => sort.key === "roi" ? (calcRoi(row) ?? -Infinity) : (parseFloat(row[sort.key]) || 0);
    const av = getValue(a);
    const bv = getValue(b);
    return sort.dir === "asc" ? av - bv : bv - av;
  }), [filtered, sort]);

  const totals = useMemo(() => filtered.reduce((acc, c) => ({
    spend:acc.spend + (parseFloat(c.spend) || 0),
    revenue:acc.revenue + (parseFloat(c.revenue) || 0),
    installs:acc.installs + (parseInt(c.installs, 10) || 0),
    regy:acc.regy + (parseInt(c.regy, 10) || 0),
    ftd:acc.ftd + (parseInt(c.ftd, 10) || 0),
  }), { spend:0, revenue:0, installs:0, regy:0, ftd:0 }), [filtered]);

  const totalRoi = totals.spend > 0 ? (((totals.revenue - totals.spend) / totals.spend) * 100).toFixed(1) : null;
  const tg = k => setSort(p => ({ key:k, dir:p.key === k && p.dir === "asc" ? "desc" : "asc" }));
  const sd = k => sort.key === k ? sort.dir : undefined;

  return (
    <div>
      <Toast msg={toast?.msg} type={toast?.type} />
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(130px,1fr))", gap:12, marginBottom:20 }}>
        {[["Витрати",`$${totals.spend.toFixed(0)}`,"#f87171"],["Дохід",`$${totals.revenue.toFixed(0)}`,"#4ade80"],["ROI",totalRoi ? `${totalRoi}%` : "—", !totalRoi ? "#64748b" : totalRoi >= 0 ? "#4ade80" : "#f87171"],["Install",totals.installs,"#a78bfa"],["Regy",totals.regy,"#a78bfa"],["FTD",totals.ftd,"#fbbf24"],["Крео",filtered.length,"#60a5fa"]].map(([l,v,c])=>(
          <div key={l} style={S.card}><div style={{ color:"#64748b", fontSize:11, fontWeight:700, textTransform:"uppercase", letterSpacing:"0.07em" }}>{l}</div><div style={{ color:c, fontSize:22, fontWeight:800, marginTop:4 }}>{v}</div></div>
        ))}
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(160px,1fr))", gap:10, marginBottom:16 }}>
        <select style={{ ...S.inp, cursor:"pointer" }} value={filters.buyer} onChange={setF("buyer")}><option value="">Всі байєри</option>{buyers.map(b=><option key={b}>{b}</option>)}</select>
        <select style={{ ...S.inp, cursor:"pointer" }} value={filters.domain_id} onChange={setF("domain_id")}><option value="">Всі домени</option>{domains.map(d=><option key={d.id} value={d.id}>{d.domain}</option>)}</select>
        <select style={{ ...S.inp, cursor:"pointer" }} value={filters.status} onChange={setF("status")}><option value="">Всі статуси</option>{["тест","активний","мертвий"].map(s=><option key={s}>{s}</option>)}</select>
        <input style={S.inp} type="date" value={filters.dateFrom} onChange={setF("dateFrom")} />
        <input style={S.inp} type="date" value={filters.dateTo} onChange={setF("dateTo")} />
        <button onClick={()=>setFilters({ buyer:"", domain_id:"", status:"", dateFrom:"", dateTo:"" })} style={S.btnGhost}>✕ Скинути</button>
      </div>

      {loading ? <div style={{ textAlign:"center", color:"#475569", padding:40 }}>Завантаження…</div> : (
        <div style={{ overflowX:"auto" }}>
          <table style={{ width:"100%", borderCollapse:"collapse", background:"#13151c", borderRadius:10, overflow:"hidden" }}>
            <thead><tr><Th>Назва</Th><Th>Домен</Th><Th>Статус</Th><Th>Байєр</Th><Th onClick={()=>tg("spend")} dir={sd("spend")}>Витрати</Th><Th onClick={()=>tg("revenue")} dir={sd("revenue")}>Дохід</Th><Th onClick={()=>tg("roi")} dir={sd("roi")}>ROI</Th><Th onClick={()=>tg("ctr")} dir={sd("ctr")}>CTR</Th><Th onClick={()=>tg("cr")} dir={sd("cr")}>CR</Th><Th onClick={()=>tg("installs")} dir={sd("installs")}>Install</Th><Th onClick={()=>tg("regy")} dir={sd("regy")}>Regy</Th><Th onClick={()=>tg("ftd")} dir={sd("ftd")}>FTD</Th></tr></thead>
            <tbody>
              {sorted.length === 0 && <tr><td colSpan={12} style={{ padding:40, textAlign:"center", color:"#475569" }}>Немає даних</td></tr>}
              {sorted.map(c => {
                const roi = calcRoi(c);
                const roiLabel = roi === null ? null : roi.toFixed(1);
                const roiColor = roi === null ? "#64748b" : roi >= 0 ? "#4ade80" : "#f87171";
                const dm = domains.find(d => d.id === c.domain_id);
                return (
                  <tr key={c.id} onMouseEnter={e=>e.currentTarget.style.background="#1e2330"} onMouseLeave={e=>e.currentTarget.style.background=""}>
                    <Td style={{ fontWeight:600 }}>{c.name}</Td>
                    <Td style={{ color:"#60a5fa", fontSize:12 }}>{dm?.domain || "—"}</Td>
                    <Td><Badge s={c.status} /></Td>
                    <Td>{c.buyer}</Td>
                    <Td style={{ color:"#f87171" }}>{c.spend ? `$${Number(c.spend).toFixed(0)}` : "—"}</Td>
                    <Td style={{ color:"#4ade80" }}>{c.revenue ? `$${Number(c.revenue).toFixed(0)}` : "—"}</Td>
                    <Td style={{ color:roiColor, fontWeight:700 }}>{roiLabel !== null ? `${roiLabel}%` : "—"}</Td>
                    <Td>{c.ctr ? `${c.ctr}%` : "—"}</Td>
                    <Td>{c.cr ? `${c.cr}%` : "—"}</Td>
                    <Td style={{ color:"#a78bfa" }}>{c.installs || "—"}</Td>
                    <Td style={{ color:"#a78bfa" }}>{c.regy || "—"}</Td>
                    <Td style={{ color:"#fbbf24", fontWeight:700 }}>{c.ftd || "—"}</Td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default function App() {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [tab, setTab] = useState("domains");
  const [profileOpen, setProfileOpen] = useState(false);
  const [domains, setDomains] = useState([]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setAuthLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => setSession(nextSession));
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) {
      setProfile(null);
      setDomains([]);
      return;
    }

    supabase.from("profiles").select("*, teams(id, name)").eq("id", session.user.id).single().then(({ data }) => {
      if (data) setProfile(data);
    });
    supabase.from("domains").select("*").order("created_at", { ascending:false }).then(({ data }) => {
      if (data) setDomains(data);
    });
  }, [session, tab]);

  if (authLoading) return <div style={{ minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center", background:"#0b0d14", color:"#64748b" }}>Завантаження…</div>;
  if (!session) return <AuthPage />;

  const user = session.user;
  const isAdmin = profile?.role === "admin";
  const isTeamLead = profile?.role === "teamlead";
  const canSeeAll = isAdmin || isTeamLead;
  const userName = profile?.full_name || user.email;

  const TABS = [
    { id:"domains", label:"🌐 Домени / ПВА" },
    { id:"creatives", label:"🎨 Креативи" },
    { id:"stats", label:"📊 Статистика" },
    { id:"accounts", label:"📱 FB Акаунти" },
    ...((isAdmin || isTeamLead) ? [{ id:"team", label:"👥 Команди" }] : []),
  ];

  return (
    <div style={{ minHeight:"100vh", background:"#0b0d14" }}>
      <div style={{ borderBottom:"1px solid #1e2330", background:"#0f1117", padding:"0 24px", display:"flex", alignItems:"center", flexWrap:"wrap" }}>
        <div style={{ padding:"16px 0", marginRight:32 }}>
          <span style={{ fontWeight:800, fontSize:18, background:"linear-gradient(90deg,#3b82f6,#a78bfa)", WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent" }}>ArbCRM</span>
        </div>

        {TABS.map(t => (
          <button key={t.id} onClick={()=>setTab(t.id)} style={{ background:"none", border:"none", color:tab === t.id ? "#e2e8f0" : "#64748b", padding:"18px 14px", cursor:"pointer", fontSize:14, fontWeight:tab === t.id ? 700 : 400, borderBottom:tab === t.id ? "2px solid #3b82f6" : "2px solid transparent", marginBottom:-1 }}>{t.label}</button>
        ))}

        <div style={{ flex:1 }} />
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          <Badge s={profile?.role || "buyer"} />
          {profile?.avatar_url
            ? <img src={profile.avatar_url} alt="" style={{ width:28, height:28, borderRadius:"50%", objectFit:"cover", border:"1px solid #2e3240" }} onError={e=>e.currentTarget.style.display="none"} />
            : <div style={{ width:28, height:28, borderRadius:"50%", background:"#1e2330", display:"flex", alignItems:"center", justifyContent:"center", color:"#60a5fa", fontSize:11, fontWeight:800 }}>{userName?.[0]?.toUpperCase()}</div>
          }
          <span onClick={()=>setProfileOpen(true)} style={{ color:"#94a3b8", fontSize:13, cursor:"pointer" }}>{userName}</span>
          <button onClick={()=>supabase.auth.signOut()} style={{ ...S.btnGhost, padding:"6px 14px", fontSize:13 }}>Вийти</button>
        </div>
      </div>

      <div style={{ padding:24, maxWidth:1600, margin:"0 auto" }}>
        {tab === "domains" && <DomainsTab user={user} isAdmin={isAdmin} />}
        {tab === "creatives" && <CreativesTab user={user} isAdmin={isAdmin} domains={domains} />}
        {tab === "stats" && <StatsTab domains={domains} />}
        {tab === "accounts" && <FbAccountsTab user={user} isAdmin={isAdmin} canSeeAll={canSeeAll} />}
        {tab === "team" && (isAdmin || isTeamLead) && <TeamsTab currentUserId={user.id} isAdmin={isAdmin} />}
      </div>

      {profileOpen && (
        <div style={{ position:"fixed", inset:0, zIndex:200, display:"flex" }}>
          <div onClick={()=>setProfileOpen(false)} style={{ flex:1, background:"#000a" }} />
          <div style={{ width:"min(480px,100vw)", background:"#0b0d14", borderLeft:"1px solid #1e2330", overflowY:"auto", display:"flex", flexDirection:"column" }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"20px 24px", borderBottom:"1px solid #1e2330", background:"#0f1117" }}>
              <span style={{ color:"#e2e8f0", fontWeight:800, fontSize:16 }}>⚙️ Профіль</span>
              <button onClick={()=>setProfileOpen(false)} style={{ background:"none", border:"none", color:"#64748b", fontSize:24, cursor:"pointer", lineHeight:1 }}>×</button>
            </div>
            <div style={{ padding:24, flex:1 }}>
              <ProfileTab user={user} profile={profile} onProfileUpdate={p => setProfile(p)} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
