import { useState, useEffect } from "react";
import { supabase } from "./supabase";

const S = {
  inp: { background:"#0f1117", border:"1px solid #2e3240", borderRadius:8, color:"#e2e8f0", padding:"8px 12px", width:"100%", fontSize:14, outline:"none" },
  btn: { background:"#3b82f6", border:"none", color:"#fff", borderRadius:8, padding:"9px 20px", cursor:"pointer", fontWeight:600, fontSize:14 },
  btnGhost: { background:"#1e2330", border:"1px solid #2e3240", color:"#94a3b8", borderRadius:8, padding:"9px 20px", cursor:"pointer", fontSize:14 },
  btnGreen: { background:"#16a34a", border:"none", color:"#fff", borderRadius:8, padding:"9px 20px", cursor:"pointer", fontWeight:600, fontSize:14 },
  card: { background:"#13151c", border:"1px solid #1e2330", borderRadius:12, padding:20 },
};

const BADGE = {
  "живий":      { bg:"#16a34a22", color:"#4ade80", border:"#16a34a" },
  "забанений":  { bg:"#dc262622", color:"#f87171", border:"#dc2626" },
  "на прогріві":{ bg:"#ca8a0422", color:"#fbbf24", border:"#ca8a04" },
  "ACTIVE":     { bg:"#16a34a22", color:"#4ade80", border:"#16a34a" },
  "DISABLED":   { bg:"#dc262622", color:"#f87171", border:"#dc2626" },
  "IN_PROCESS": { bg:"#ca8a0422", color:"#fbbf24", border:"#ca8a04" },
};

const Badge = ({ s }) => {
  const c = BADGE[s] || BADGE["живий"];
  return <span style={{ background:c.bg, color:c.color, border:`1px solid ${c.border}`, borderRadius:6, padding:"2px 10px", fontSize:12, fontWeight:600 }}>{s}</span>;
};

const Field = ({ label, children }) => (
  <div style={{ marginBottom:14 }}>
    <label style={{ display:"block", color:"#64748b", fontSize:11, fontWeight:700, textTransform:"uppercase", letterSpacing:"0.07em", marginBottom:5 }}>{label}</label>
    {children}
  </div>
);

const Modal = ({ title, onClose, children }) => (
  <div style={{ position:"fixed", inset:0, background:"#000b", zIndex:100, display:"flex", alignItems:"center", justifyContent:"center" }}>
    <div style={{ background:"#1a1d23", border:"1px solid #2e3240", borderRadius:14, width:"min(580px,96vw)", maxHeight:"90vh", overflowY:"auto", padding:28 }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20 }}>
        <h3 style={{ margin:0, color:"#e2e8f0", fontSize:18, fontWeight:700 }}>{title}</h3>
        <button onClick={onClose} style={{ background:"none", border:"none", color:"#64748b", fontSize:24, cursor:"pointer" }}>×</button>
      </div>
      {children}
    </div>
  </div>
);

// Виклик FB API через наш Vercel проксі
async function callFbApi(token, endpoint, params, proxy) {
  const res = await fetch('/api/fb', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, endpoint, params, proxy })
  });
  return res.json();
}

// Форма додавання сетапу (токен + проксі)
const SetupForm = ({ initial={}, buyers, onSave, onClose, loading }) => {
  const [f, setF] = useState({
    name: "", token: "", buyer_id: "",
    proxy_type: "http", proxy_host: "", proxy_port: "",
    proxy_user: "", proxy_pass: "",
    ...initial
  });
  const set = k => e => setF(p => ({ ...p, [k]: e.target.value }));

  return (
    <div>
      <Field label="Назва сетапу"><input style={S.inp} value={f.name} onChange={set("name")} placeholder="Мій фарм #1" /></Field>
      <Field label="Байєр">
        <select style={{ ...S.inp, cursor:"pointer" }} value={f.buyer_id} onChange={set("buyer_id")}>
          <option value="">— виберіть байєра —</option>
          {buyers.map(b => <option key={b.id} value={b.id}>{b.full_name}</option>)}
        </select>
      </Field>

      <Field label="Facebook Access Token (EAAxxxxxxx)">
        <input style={S.inp} value={f.token} onChange={set("token")} placeholder="EAAxxxxxxxxxxxxxxxxx" />
        <div style={{ color:"#475569", fontSize:11, marginTop:4 }}>
          Отримати: <a href="https://developers.facebook.com/tools/explorer/" target="_blank" rel="noreferrer" style={{ color:"#60a5fa" }}>Facebook Graph API Explorer</a>
        </div>
      </Field>

      <p style={{ color:"#60a5fa", fontSize:11, fontWeight:700, textTransform:"uppercase", letterSpacing:"0.07em", margin:"4px 0 12px" }}>🔒 Проксі (необов'язково)</p>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
        <Field label="Тип проксі">
          <select style={{ ...S.inp, cursor:"pointer" }} value={f.proxy_type} onChange={set("proxy_type")}>
            {["http","https","socks5"].map(t => <option key={t}>{t}</option>)}
          </select>
        </Field>
        <Field label="Порт"><input style={S.inp} value={f.proxy_port} onChange={set("proxy_port")} placeholder="8080" /></Field>
        <Field label="Host / IP"><input style={S.inp} value={f.proxy_host} onChange={set("proxy_host")} placeholder="123.123.123.123" /></Field>
        <Field label="Логін (якщо є)"><input style={S.inp} value={f.proxy_user} onChange={set("proxy_user")} placeholder="user" /></Field>
        <Field label="Пароль (якщо є)"><input style={{ ...S.inp, gridColumn:"1/-1" }} value={f.proxy_pass} onChange={set("proxy_pass")} placeholder="password" /></Field>
      </div>

      <div style={{ display:"flex", gap:10, justifyContent:"flex-end", marginTop:16 }}>
        <button onClick={onClose} style={S.btnGhost}>Скасувати</button>
        <button onClick={() => onSave(f)} disabled={loading} style={{ ...S.btn, opacity:loading?0.7:1 }}>{loading?"Збереження…":"Зберегти сетап"}</button>
      </div>
    </div>
  );
};

export default function FbAccountsTab({ user, isAdmin, canSeeAll }) {
  const [setups, setSetups] = useState([]);   // токени/сетапи
  const [accounts, setAccounts] = useState([]); // підтягнуті FB акаунти
  const [buyers, setBuyers] = useState([]);
  const [modal, setModal] = useState(null);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(null); // id сетапу який синкається
  const [toast, setToast] = useState(null);
  const [filter, setFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [expandedSetup, setExpandedSetup] = useState(null);

  const showToast = (msg, type="ok") => { setToast({msg,type}); setTimeout(()=>setToast(null),3500); };

  const fetchAll = async () => {
    setLoading(true);
    const [{ data: s }, { data: a }, { data: p }] = await Promise.all([
      supabase.from("fb_setups").select("*").order("created_at", {ascending:false}),
      supabase.from("fb_accounts").select("*").order("created_at", {ascending:false}),
      supabase.from("profiles").select("id, full_name, role"),
    ]);
    if (s) setSetups(s);
    if (a) setAccounts(a);
    if (p) setBuyers(p);
    setLoading(false);
  };

  useEffect(() => { fetchAll(); }, []);

  // Синхронізація акаунтів через FB API
  const syncSetup = async (setup) => {
    setSyncing(setup.id);
    try {
      const proxy = setup.proxy_host ? {
        type: setup.proxy_type, host: setup.proxy_host, port: setup.proxy_port,
        user: setup.proxy_user, pass: setup.proxy_pass
      } : null;

      // 1. Отримати всі рекламні акаунти
      const adAccounts = await callFbApi(setup.token, "me/adaccounts", {
        fields: "id,name,account_status,balance,spend_cap,currency,amount_spent,timezone_name",
        limit: "100"
      }, proxy);

      if (adAccounts.error) throw new Error(adAccounts.error.message);

      const fbData = adAccounts.data || [];

      // 2. Для кожного акаунту підтягнути статистику за сьогодні
      const enriched = await Promise.all(fbData.map(async (acc) => {
        try {
          const insights = await callFbApi(setup.token, `${acc.id}/insights`, {
            fields: "spend,impressions,clicks,ctr,cpc",
            date_preset: "today"
          }, proxy);
          const stat = insights.data?.[0] || {};
          return { ...acc, today_spend: stat.spend||"0", impressions: stat.impressions||"0", clicks: stat.clicks||"0", ctr: stat.ctr||"0" };
        } catch { return acc; }
      }));

      // 3. Зберегти в Supabase
      for (const acc of enriched) {
        const statusMap = { 1:"живий", 2:"забанений", 3:"на прогріві", 7:"на прогріві", 8:"на прогріві", 9:"на прогріві", 100:"на прогріві", 101:"на прогріві", 201:"забанений" };
        await supabase.from("fb_accounts").upsert({
          fb_account_id: acc.id,
          setup_id: setup.id,
          user_id: user.id,
          buyer_id: setup.buyer_id,
          name: acc.name,
          status: statusMap[acc.account_status] || "живий",
          balance: (parseFloat(acc.balance)||0) / 100,
          spend_limit: (parseFloat(acc.spend_cap)||0) / 100,
          today_spend: parseFloat(acc.today_spend)||0,
          impressions: parseInt(acc.impressions)||0,
          clicks: parseInt(acc.clicks)||0,
          ctr: parseFloat(acc.ctr)||0,
          currency: acc.currency||"USD",
        }, { onConflict: "fb_account_id" });
      }

      showToast(`✅ Синхронізовано ${enriched.length} акаунтів`);
      await fetchAll();
    } catch (e) {
      showToast("❌ " + e.message, "error");
    }
    setSyncing(null);
  };

  const saveSetup = async (f) => {
    const payload = {
      name: f.name, token: f.token, buyer_id: f.buyer_id||null,
      proxy_type: f.proxy_type, proxy_host: f.proxy_host, proxy_port: f.proxy_port,
      proxy_user: f.proxy_user, proxy_pass: f.proxy_pass,
      user_id: user.id
    };
    if (modal.mode === "add") {
      const { error } = await supabase.from("fb_setups").insert([payload]);
      if (error) { showToast("❌ " + error.message, "error"); return; }
      showToast("Сетап додано ✓");
    } else {
      await supabase.from("fb_setups").update(payload).eq("id", modal.data.id);
      showToast("Збережено ✓");
    }
    setModal(null);
    fetchAll();
  };

  const delSetup = async (id) => {
    if (!confirm("Видалити сетап і всі його акаунти?")) return;
    await supabase.from("fb_accounts").delete().eq("setup_id", id);
    await supabase.from("fb_setups").delete().eq("id", id);
    showToast("Видалено");
    fetchAll();
  };

  const getBuyer = id => buyers.find(b => b.id === id);

  const filteredAccounts = accounts.filter(a => {
    const text = [a.name, a.fb_account_id, getBuyer(a.buyer_id)?.full_name||""].join(" ").toLowerCase();
    if (filter && !text.includes(filter.toLowerCase())) return false;
    if (statusFilter && a.status !== statusFilter) return false;
    return true;
  });

  const stats = {
    total: accounts.length,
    alive: accounts.filter(a=>a.status==="живий").length,
    warm:  accounts.filter(a=>a.status==="на прогріві").length,
    banned:accounts.filter(a=>a.status==="забанений").length,
    spend: accounts.reduce((s,a)=>s+(parseFloat(a.today_spend)||0),0),
  };

  return (
    <div>
      {toast && <div style={{ position:"fixed", bottom:24, right:24, background:toast.type==="error"?"#dc2626":"#16a34a", color:"#fff", borderRadius:10, padding:"12px 20px", fontSize:14, fontWeight:600, zIndex:999 }}>{toast.msg}</div>}

      {/* Stats */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(130px,1fr))", gap:12, marginBottom:20 }}>
        {[["Всього",stats.total,"#60a5fa"],["Живих",stats.alive,"#4ade80"],["На прогріві",stats.warm,"#fbbf24"],["Забанених",stats.banned,"#f87171"],["Витрати сьогодні",`$${stats.spend.toFixed(0)}}`,"#a78bfa"]].map(([l,v,c])=>(
          <div key={l} style={S.card}><div style={{ color:"#64748b",fontSize:11,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.07em" }}>{l}</div><div style={{ color:c,fontSize:22,fontWeight:800,marginTop:4 }}>{v}</div></div>
        ))}
      </div>

      {/* Сетапи (токени) */}
      <div style={{ marginBottom:20 }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
          <h3 style={{ color:"#e2e8f0", fontSize:15, fontWeight:700, margin:0 }}>🔑 Сетапи / Токени</h3>
          {(isAdmin || canSeeAll) && <button onClick={()=>setModal({mode:"add",data:{}})} style={S.btn}>+ Додати сетап</button>}
        </div>
        <div style={{ display:"grid", gap:10 }}>
          {setups.length === 0 && <div style={{ ...S.card, textAlign:"center", color:"#475569", padding:24 }}>Немає сетапів — додайте перший токен</div>}
          {setups.map(s => (
            <div key={s.id} style={{ ...S.card, display:"flex", alignItems:"center", gap:16, flexWrap:"wrap" }}>
              <div style={{ flex:1 }}>
                <div style={{ color:"#e2e8f0", fontWeight:700, fontSize:14 }}>{s.name}</div>
                <div style={{ color:"#64748b", fontSize:12, marginTop:3 }}>
                  {s.proxy_host ? `🔒 ${s.proxy_type}://${s.proxy_host}:${s.proxy_port}` : "⚠️ Без проксі"}
                  {" · "}
                  {getBuyer(s.buyer_id)?.full_name || "не призначений"}
                  {" · "}
                  <span style={{ color:"#334155", fontFamily:"monospace" }}>{s.token?.slice(0,20)}…</span>
                </div>
              </div>
              <div style={{ display:"flex", gap:8 }}>
                <button
                  onClick={() => syncSetup(s)}
                  disabled={!!syncing}
                  style={{ ...S.btnGreen, padding:"7px 16px", fontSize:13, opacity:syncing===s.id?0.7:1 }}
                >
                  {syncing===s.id ? "⏳ Синк…" : "🔄 Синхронізувати"}
                </button>
                {isAdmin && <>
                  <button onClick={()=>setModal({mode:"edit",data:s})} style={{ ...S.btnGhost, padding:"7px 12px" }}>✏️</button>
                  <button onClick={()=>delSetup(s.id)} style={{ ...S.btnGhost, padding:"7px 12px", color:"#f87171" }}>🗑</button>
                </>}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Акаунти */}
      <div>
        <div style={{ display:"flex", gap:12, marginBottom:12, alignItems:"center", flexWrap:"wrap" }}>
          <h3 style={{ color:"#e2e8f0", fontSize:15, fontWeight:700, margin:0 }}>📱 Рекламні акаунти</h3>
          <input style={{ ...S.inp, maxWidth:220 }} placeholder="🔍 Пошук…" value={filter} onChange={e=>setFilter(e.target.value)} />
          <select style={{ ...S.inp, maxWidth:160, cursor:"pointer" }} value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}>
            <option value="">Всі статуси</option>
            {["живий","на прогріві","забанений"].map(s=><option key={s}>{s}</option>)}
          </select>
        </div>

        {loading ? <div style={{ textAlign:"center",color:"#475569",padding:40 }}>Завантаження…</div> : (
          <div style={{ overflowX:"auto" }}>
            <table style={{ width:"100%", borderCollapse:"collapse", background:"#13151c", borderRadius:10, overflow:"hidden" }}>
              <thead>
                <tr style={{ background:"#0f1117" }}>
                  {["Account ID","Назва","Статус","Байєр","Баланс","Ліміт","Витрати сьогодні","Покази","Кліки","CTR","Валюта","Часовий пояс"].map(h=>(
                    <th key={h} style={{ padding:"10px 14px", textAlign:"left", color:"#64748b", fontSize:11, fontWeight:700, textTransform:"uppercase", letterSpacing:"0.07em", borderBottom:"1px solid #1e2330", whiteSpace:"nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredAccounts.length===0 && <tr><td colSpan={11} style={{ padding:40,textAlign:"center",color:"#475569" }}>Немає акаунтів — натисніть "Синхронізувати" на сетапі</td></tr>}
                {filteredAccounts.map(a=>(
                  <tr key={a.id} onMouseEnter={e=>e.currentTarget.style.background="#1e2330"} onMouseLeave={e=>e.currentTarget.style.background=""}>
                    <td style={{ padding:"10px 14px", color:"#60a5fa", fontSize:12, fontFamily:"monospace", borderBottom:"1px solid #1a1d23" }}>{a.fb_account_id}</td>
                    <td style={{ padding:"10px 14px", color:"#e2e8f0", fontWeight:600, fontSize:13, borderBottom:"1px solid #1a1d23" }}>{a.name||"—"}</td>
                    <td style={{ padding:"10px 14px", borderBottom:"1px solid #1a1d23" }}><Badge s={a.status} /></td>
                    <td style={{ padding:"10px 14px", color:"#cbd5e1", fontSize:13, borderBottom:"1px solid #1a1d23" }}>{getBuyer(a.buyer_id)?.full_name||"—"}</td>
                    <td style={{ padding:"10px 14px", color:"#4ade80", fontWeight:600, fontSize:13, borderBottom:"1px solid #1a1d23" }}>{a.balance?`$${Number(a.balance).toFixed(0)}`:"—"}</td>
                    <td style={{ padding:"10px 14px", color:"#a78bfa", fontSize:13, borderBottom:"1px solid #1a1d23" }}>{a.spend_limit?`$${Number(a.spend_limit).toFixed(0)}`:"—"}</td>
                    <td style={{ padding:"10px 14px", color:"#f87171", fontWeight:700, fontSize:13, borderBottom:"1px solid #1a1d23" }}>{a.today_spend?`$${Number(a.today_spend).toFixed(2)}`:"—"}</td>
                    <td style={{ padding:"10px 14px", color:"#94a3b8", fontSize:13, borderBottom:"1px solid #1a1d23" }}>{a.impressions?Number(a.impressions).toLocaleString():"—"}</td>
                    <td style={{ padding:"10px 14px", color:"#94a3b8", fontSize:13, borderBottom:"1px solid #1a1d23" }}>{a.clicks?Number(a.clicks).toLocaleString():"—"}</td>
                    <td style={{ padding:"10px 14px", color:"#fbbf24", fontSize:13, borderBottom:"1px solid #1a1d23" }}>{a.ctr?`${Number(a.ctr).toFixed(2)}%`:"—"}</td>
                    <td style={{ padding:"10px 14px", color:"#64748b", fontSize:12, borderBottom:"1px solid #1a1d23" }}>{a.currency||"USD"}</td>
                    <td style={{ padding:"10px 14px", color:"#64748b", fontSize:11, borderBottom:"1px solid #1a1d23", whiteSpace:"nowrap" }}>{a.timezone||"—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modal && (
        <Modal title={modal.mode==="add"?"Додати сетап":"Редагувати сетап"} onClose={()=>setModal(null)}>
          <SetupForm initial={modal.data} buyers={buyers} onSave={saveSetup} onClose={()=>setModal(null)} loading={false} />
        </Modal>
      )}
    </div>
  );
}
