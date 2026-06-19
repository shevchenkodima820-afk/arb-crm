import { useState, useEffect } from "react";
import { supabase } from "./supabase";

const S = {
  inp: { background:"#0f1117", border:"1px solid #2e3240", borderRadius:8, color:"#e2e8f0", padding:"8px 12px", width:"100%", fontSize:14, outline:"none" },
  btn: { background:"#3b82f6", border:"none", color:"#fff", borderRadius:8, padding:"9px 20px", cursor:"pointer", fontWeight:600, fontSize:14 },
  btnGhost: { background:"#1e2330", border:"1px solid #2e3240", color:"#94a3b8", borderRadius:8, padding:"9px 20px", cursor:"pointer", fontSize:14 },
  btnGreen: { background:"#16a34a", border:"none", color:"#fff", borderRadius:8, padding:"9px 16px", cursor:"pointer", fontWeight:600, fontSize:13 },
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
    <div style={{ background:"#1a1d23", border:"1px solid #2e3240", borderRadius:14, width:"min(580px,96vw)", maxHeight:"90vh", overflowY:"auto", padding:28 }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20 }}>
        <h3 style={{ margin:0, color:"#e2e8f0", fontSize:18, fontWeight:700 }}>{title}</h3>
        <button onClick={onClose} style={{ background:"none", border:"none", color:"#64748b", fontSize:24, cursor:"pointer" }}>×</button>
      </div>
      {children}
    </div>
  </div>
);

async function callFbApi(token, endpoint, params, proxy) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error("Немає активної сесії");

  const res = await fetch('/api/fb', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({ token, endpoint, params, proxy })
  });

  const data = await res.json();
  if (!res.ok) {
    const message = data?.error?.message || data?.error || `FB proxy error ${res.status}`;
    throw new Error(message);
  }
  return data;
}


async function launchFbCampaign(payload) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error("Немає активної сесії");

  const res = await fetch('/api/fb-launch-campaign', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify(payload),
  });

  const data = await res.json();
  if (!res.ok) {
    const message = data?.error?.message || data?.error || `Launch error ${res.status}`;
    throw new Error(message);
  }
  return data;
}

const toLocalDatetimeValue = (date = new Date(Date.now() + 60 * 60 * 1000)) => {
  const pad = n => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

const LaunchCampaignModal = ({ setup, data, proxy, onClose, onDone }) => {
  const firstAccount = data?.accounts?.[0]?.id || "";
  const firstPage = data?.pages?.[0]?.id || "";
  const firstPixel = data?.pixels?.[0]?.id || "";
  const [form, setForm] = useState({
    account_id: firstAccount,
    page_id: firstPage,
    pixel_id: firstPixel,
    campaign_name: `${setup.name} ${new Date().toLocaleDateString("uk-UA")}`,
    daily_budget: "10",
    geo: "UA",
    age_min: "18",
    age_max: "65",
    link_url: "",
    image_url: "",
    message: "",
    headline: "",
    description: "",
    cta: "LEARN_MORE",
    schedule_mode: "now",
    start_time: toLocalDatetimeValue(),
  });
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  const set = key => e => setForm(prev => ({ ...prev, [key]: e.target.value }));

  const submit = async () => {
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const payload = {
        token: setup.token,
        setup_id: setup.id,
        proxy,
        account_id: form.account_id,
        page_id: form.page_id,
        pixel_id: form.pixel_id || null,
        campaign_name: form.campaign_name,
        daily_budget: Number(form.daily_budget),
        geo: form.geo,
        age_min: Number(form.age_min),
        age_max: Number(form.age_max),
        link_url: form.link_url,
        image_url: form.image_url || null,
        message: form.message,
        headline: form.headline,
        description: form.description || null,
        cta: form.cta,
        schedule: {
          mode: form.schedule_mode,
          start_time: form.schedule_mode === "at_time" ? new Date(form.start_time).toISOString() : undefined,
        },
      };
      const launchResult = await launchFbCampaign(payload);
      setResult(launchResult);
      if (onDone) onDone(launchResult);
    } catch (e) {
      setError(e.message);
    }
    setLoading(false);
  };

  return (
    <Modal title="🚀 Залив кампанії" onClose={onClose}>
      <div>
        <div style={{ background:"#0f1117", border:"1px solid #1e2330", borderRadius:10, padding:12, marginBottom:14, color:"#94a3b8", fontSize:12 }}>
          Кампанія, ad set і ad створюються зі статусом <b style={{ color:"#4ade80" }}>ACTIVE</b>. Якщо вибраний майбутній час — старт задається через <code>adset.start_time</code>.
        </div>

        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
          <Field label="Кабінет">
            <select style={{ ...S.inp, cursor:"pointer" }} value={form.account_id} onChange={set("account_id")}>
              {(data?.accounts || []).map(acc => <option key={acc.id} value={acc.id}>{acc.name} · {acc.id}</option>)}
            </select>
          </Field>
          <Field label="Fan Page">
            <select style={{ ...S.inp, cursor:"pointer" }} value={form.page_id} onChange={set("page_id")}>
              {(data?.pages || []).map(page => <option key={page.id} value={page.id}>{page.name} · {page.id}</option>)}
            </select>
          </Field>
          <Field label="Pixel optional">
            <select style={{ ...S.inp, cursor:"pointer" }} value={form.pixel_id} onChange={set("pixel_id")}>
              <option value="">— без pixel —</option>
              {(data?.pixels || []).map(px => <option key={px.id} value={px.id}>{px.name || "Pixel"} · {px.id}</option>)}
            </select>
          </Field>
          <Field label="Назва кампанії"><input style={S.inp} value={form.campaign_name} onChange={set("campaign_name")} /></Field>
          <Field label="Денний бюджет $"><input style={S.inp} type="number" min="1" step="0.01" value={form.daily_budget} onChange={set("daily_budget")} /></Field>
          <Field label="GEO країни"><input style={S.inp} value={form.geo} onChange={set("geo")} placeholder="UA або UA,PL" /></Field>
          <Field label="Вік від"><input style={S.inp} type="number" min="13" max="65" value={form.age_min} onChange={set("age_min")} /></Field>
          <Field label="Вік до"><input style={S.inp} type="number" min="13" max="65" value={form.age_max} onChange={set("age_max")} /></Field>
        </div>

        <Field label="URL ленду / PWA"><input style={S.inp} value={form.link_url} onChange={set("link_url")} placeholder="https://example.com" /></Field>
        <Field label="Image URL optional"><input style={S.inp} value={form.image_url} onChange={set("image_url")} placeholder="https://.../image.jpg" /></Field>
        <Field label="Primary Text"><textarea style={{ ...S.inp, minHeight:78, resize:"vertical" }} value={form.message} onChange={set("message")} placeholder="Текст оголошення" /></Field>
        <Field label="Headline"><input style={S.inp} value={form.headline} onChange={set("headline")} placeholder="Заголовок" /></Field>
        <Field label="Description optional"><input style={S.inp} value={form.description} onChange={set("description")} placeholder="Опис" /></Field>

        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
          <Field label="CTA">
            <select style={{ ...S.inp, cursor:"pointer" }} value={form.cta} onChange={set("cta")}>
              {[
                "LEARN_MORE", "SIGN_UP", "DOWNLOAD", "SHOP_NOW", "CONTACT_US", "APPLY_NOW", "SUBSCRIBE"
              ].map(cta => <option key={cta}>{cta}</option>)}
            </select>
          </Field>
          <Field label="Старт">
            <select style={{ ...S.inp, cursor:"pointer" }} value={form.schedule_mode} onChange={set("schedule_mode")}>
              <option value="now">Зразу відкрут</option>
              <option value="at_time">На конкретний час</option>
              <option value="midnight_account">В 00:00 по кабінету</option>
            </select>
          </Field>
        </div>

        {form.schedule_mode === "at_time" && (
          <Field label="Конкретний час">
            <input style={S.inp} type="datetime-local" value={form.start_time} onChange={set("start_time")} />
          </Field>
        )}

        {error && <div style={{ background:"#dc262622", color:"#f87171", border:"1px solid #dc262644", borderRadius:8, padding:"10px 12px", fontSize:13, marginBottom:12 }}>{error}</div>}

        {result && (
          <div style={{ background:"#16a34a22", color:"#4ade80", border:"1px solid #16a34a55", borderRadius:8, padding:"10px 12px", fontSize:13, marginBottom:12 }}>
            <div style={{ fontWeight:700, marginBottom:4 }}>Створено ✓</div>
            <div>Campaign: <code>{result.campaign_id}</code></div>
            <div>AdSet: <code>{result.adset_id}</code></div>
            <div>Creative: <code>{result.creative_id}</code></div>
            <div>Ad: <code>{result.ad_id}</code></div>
            {result.scheduled_start_time && <div>Start: <code>{result.scheduled_start_time}</code>{result.timezone ? ` (${result.timezone})` : ""}</div>}
          </div>
        )}

        <div style={{ display:"flex", justifyContent:"flex-end", gap:10 }}>
          <button onClick={onClose} style={S.btnGhost}>Закрити</button>
          <button onClick={submit} disabled={loading || !form.account_id || !form.page_id || !form.link_url || !form.message || !form.headline} style={{ ...S.btnGreen, opacity:loading ? 0.7 : 1 }}>
            {loading ? "Створюю…" : form.schedule_mode === "now" ? "🚀 Запустити зараз" : "🕒 Запланувати"}
          </button>
        </div>
      </div>
    </Modal>
  );
};

const STATUS_MAP = { 1:"живий", 2:"забанений", 3:"на прогріві", 7:"на прогріві", 8:"на прогріві", 9:"на прогріві", 100:"на прогріві", 101:"на прогріві", 201:"забанений" };
const STATUS_COLOR = { "живий":"#4ade80", "забанений":"#f87171", "на прогріві":"#fbbf24" };

const StatusDot = ({ status }) => (
  <span style={{ display:"inline-block", width:8, height:8, borderRadius:"50%", background:STATUS_COLOR[status]||"#64748b", marginRight:6, flexShrink:0 }} />
);

// ─── SETUP FORM ───────────────────────────────────────────────────────────
const SetupForm = ({ initial={}, buyers, setupFolders=[], onSave, onClose }) => {
  const [f, setF] = useState({
    name:"", token:"", buyer_id:"", folder_id:"",
    proxy_type:"socks5", proxy_host:"", proxy_port:"",
    proxy_user:"", proxy_pass:"",
    ...initial
  });
  const set = k => e => setF(p=>({...p,[k]:e.target.value}));
  return (
    <div>
      <Field label="Назва сетапу"><input style={S.inp} value={f.name} onChange={set("name")} placeholder="Мій фарм #1" /></Field>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
        <Field label="Байєр">
          <select style={{ ...S.inp, cursor:"pointer" }} value={f.buyer_id || ""} onChange={set("buyer_id")}>
            <option value="">— виберіть байєра —</option>
            {buyers.map(b=><option key={b.id} value={b.id}>{b.full_name}</option>)}
          </select>
        </Field>
        <Field label="Папка">
          <select style={{ ...S.inp, cursor:"pointer" }} value={f.folder_id || ""} onChange={set("folder_id")}>
            <option value="">Без папки</option>
            {setupFolders.map(folder=><option key={folder.id} value={folder.id}>📁 {folder.name}</option>)}
          </select>
        </Field>
      </div>
      <Field label="Facebook Access Token">
        <input style={S.inp} value={f.token} onChange={set("token")} placeholder="EAAxxxxxxxxxxxxxxxxx" />
        <div style={{ color:"#475569", fontSize:11, marginTop:4 }}>
          <a href="https://developers.facebook.com/tools/explorer/" target="_blank" rel="noreferrer" style={{ color:"#60a5fa" }}>Facebook Graph API Explorer →</a>
        </div>
      </Field>
      <p style={{ color:"#60a5fa", fontSize:11, fontWeight:700, textTransform:"uppercase", letterSpacing:"0.07em", margin:"4px 0 12px" }}>🔒 Проксі</p>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
        <Field label="Тип">
          <select style={{ ...S.inp, cursor:"pointer" }} value={f.proxy_type} onChange={set("proxy_type")}>
            {["http","https","socks5"].map(t=><option key={t}>{t}</option>)}
          </select>
        </Field>
        <Field label="Порт"><input style={S.inp} value={f.proxy_port} onChange={set("proxy_port")} placeholder="21502" /></Field>
        <Field label="Host / IP"><input style={S.inp} value={f.proxy_host} onChange={set("proxy_host")} placeholder="proxy.example.com" /></Field>
        <Field label="Логін"><input style={S.inp} value={f.proxy_user} onChange={set("proxy_user")} placeholder="user" /></Field>
        <Field label="Пароль" style={{ gridColumn:"1/-1" }}><input style={S.inp} value={f.proxy_pass} onChange={set("proxy_pass")} placeholder="password" /></Field>
      </div>
      <div style={{ display:"flex", gap:10, justifyContent:"flex-end", marginTop:16 }}>
        <button onClick={onClose} style={S.btnGhost}>Скасувати</button>
        <button onClick={()=>onSave(f)} style={S.btn}>Зберегти</button>
      </div>
    </div>
  );
};

// ─── SETUP CARD (розкривається) ───────────────────────────────────────────
const SetupCard = ({ setup, buyers, setupFolders, isAdmin, onEdit, onDelete, onRefresh }) => {
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null); // { accounts, pages, pixels }
  const [syncing, setSyncing] = useState(false);
  const [toast, setToast] = useState(null);
  const [launchOpen, setLaunchOpen] = useState(false);

  const showToast = (msg, type="ok") => { setToast({msg,type}); setTimeout(()=>setToast(null),3000); };

  const proxy = setup.proxy_host ? {
    type: setup.proxy_type, host: setup.proxy_host, port: setup.proxy_port,
    user: setup.proxy_user, pass: setup.proxy_pass
  } : null;

  const loadData = async () => {
    if (data) { setExpanded(true); return; }
    setLoading(true);
    setExpanded(true);
    try {
      const [adAccounts, pages, pixels] = await Promise.all([
        callFbApi(setup.token, "me/adaccounts", {
          fields: "id,name,account_status,balance,spend_cap,amount_spent,currency,timezone_name",
          limit: "100"
        }, proxy),
        callFbApi(setup.token, "me/accounts", {
          fields: "id,name,fan_count,followers_count",
          limit: "100"
        }, proxy),
        callFbApi(setup.token, "me/adaccounts", {
          fields: "id,name,adspixels{id,name,last_fired_time}",
          limit: "50"
        }, proxy),
      ]);

      // Підтягнути витрати сьогодні для кожного акаунту
      const accsWithStats = await Promise.all((adAccounts.data||[]).map(async acc => {
        try {
          const insights = await callFbApi(setup.token, `${acc.id}/insights`, {
            fields: "spend,impressions,clicks",
            date_preset: "today"
          }, proxy);
          const s = insights.data?.[0] || {};
          return { ...acc, today_spend: s.spend||"0", impressions: s.impressions||"0", clicks: s.clicks||"0" };
        } catch { return { ...acc, today_spend:"0", impressions:"0", clicks:"0" }; }
      }));

      // Зібрати всі пікселі
      const allPixels = [];
      (pixels.data||[]).forEach(acc => {
        (acc.adspixels?.data||[]).forEach(px => {
          if (!allPixels.find(p=>p.id===px.id)) allPixels.push(px);
        });
      });

      setData({ accounts: accsWithStats, pages: pages.data||[], pixels: allPixels });
    } catch(e) {
      showToast("❌ " + e.message, "error");
      setExpanded(false);
    }
    setLoading(false);
  };

  const syncToDb = async () => {
    if (!data) return;
    setSyncing(true);
    for (const acc of data.accounts) {
      await supabase.from("fb_accounts").upsert({
        fb_account_id: acc.id,
        setup_id: setup.id,
        user_id: setup.user_id,
        buyer_id: setup.buyer_id,
        name: acc.name,
        status: STATUS_MAP[acc.account_status]||"живий",
        balance: (parseFloat(acc.amount_spent)||0) / 100,
        spend_limit: (parseFloat(acc.spend_cap)||0) / 100,
        today_spend: parseFloat(acc.today_spend)||0,
        impressions: parseInt(acc.impressions)||0,
        clicks: parseInt(acc.clicks)||0,
        currency: acc.currency||"USD",
        timezone: acc.timezone_name||"",
      }, { onConflict: "fb_account_id" });
    }
    showToast(`✅ Збережено ${data.accounts.length} акаунтів`);
    setSyncing(false);
    if (onRefresh) onRefresh();
  };

  const buyer = buyers.find(b=>b.id===setup.buyer_id);
  const folder = setupFolders.find(f=>f.id===setup.folder_id);
  const totalSpend = data?.accounts.reduce((s,a)=>s+(parseFloat(a.today_spend)||0),0)||0;

  return (
    <div style={{ border:"1px solid #1e2330", borderRadius:12, overflow:"hidden", marginBottom:10 }}>
      {toast && <div style={{ position:"fixed", bottom:24, right:24, background:toast.type==="error"?"#dc2626":"#16a34a", color:"#fff", borderRadius:10, padding:"12px 20px", fontSize:14, fontWeight:600, zIndex:999 }}>{toast.msg}</div>}

      {/* Header */}
      <div
        onClick={loadData}
        style={{ background:"#13151c", padding:"14px 20px", display:"flex", alignItems:"center", gap:12, cursor:"pointer", userSelect:"none" }}
        onMouseEnter={e=>e.currentTarget.style.background="#1a1d23"}
        onMouseLeave={e=>e.currentTarget.style.background="#13151c"}
      >
        <span style={{ color:"#64748b", fontSize:14, transition:"transform 0.2s", display:"inline-block", transform:expanded?"rotate(90deg)":"rotate(0deg)" }}>▶</span>
        <div style={{ flex:1 }}>
          <div style={{ color:"#e2e8f0", fontWeight:700, fontSize:15 }}>{setup.name}</div>
          <div style={{ color:"#64748b", fontSize:12, marginTop:2 }}>
            <span>📁 {folder?.name || "Без папки"}</span>
            {" · "}
            {setup.proxy_host ? `🔒 ${setup.proxy_type}://${setup.proxy_host}:${setup.proxy_port}` : "⚠️ Без проксі"}
            {" · "}
            <span style={{ color:"#60a5fa" }}>{buyer?.full_name||"не призначений"}</span>
            {" · "}
            <span style={{ color:"#334155", fontFamily:"monospace" }}>{setup.token?.slice(0,16)}…</span>
          </div>
        </div>
        {data && <span style={{ color:"#fbbf24", fontWeight:700, fontSize:14 }}>${totalSpend.toFixed(2)} сьогодні</span>}
        <div style={{ display:"flex", gap:8 }} onClick={e=>e.stopPropagation()}>
          <button onClick={()=>{ loadData(); }} style={{ ...S.btnGreen, padding:"6px 12px" }} title="Оновити">🔄</button>
          {data && <button onClick={()=>setLaunchOpen(true)} style={{ ...S.btnGreen, padding:"6px 12px", fontSize:12 }}>🚀 Залив</button>}
          {data && <button onClick={syncToDb} disabled={syncing} style={{ ...S.btn, padding:"6px 12px", fontSize:12, opacity:syncing?0.7:1 }}>{syncing?"…":"💾 Зберегти"}</button>}
          {isAdmin && <>
            <button onClick={onEdit} style={{ ...S.btnGhost, padding:"6px 10px" }}>✏️</button>
            <button onClick={onDelete} style={{ ...S.btnGhost, padding:"6px 10px", color:"#f87171" }}>🗑</button>
          </>}
        </div>
      </div>

      {launchOpen && data && (
        <LaunchCampaignModal
          setup={setup}
          data={data}
          proxy={proxy}
          onClose={()=>setLaunchOpen(false)}
          onDone={()=>showToast("Кампанію створено ✓")}
        />
      )}

      {/* Expanded content */}
      {expanded && (
        <div style={{ background:"#0f1117", padding:16 }}>
          {loading ? (
            <div style={{ textAlign:"center", color:"#475569", padding:32 }}>⏳ Завантаження з Facebook…</div>
          ) : data ? (
            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(300px, 1fr))", gap:16 }}>

              {/* Рекламні кабінети */}
              <div style={{ background:"#13151c", borderRadius:10, overflow:"hidden" }}>
                <div style={{ padding:"12px 16px", borderBottom:"1px solid #1e2330", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                  <span style={{ color:"#e2e8f0", fontWeight:700, fontSize:13 }}>📊 Рекламні кабінети</span>
                  <span style={{ background:"#1e2330", color:"#60a5fa", borderRadius:20, padding:"2px 10px", fontSize:12, fontWeight:700 }}>{data.accounts.length}</span>
                </div>
                <table style={{ width:"100%", borderCollapse:"collapse" }}>
                  <thead>
                    <tr style={{ background:"#0f1117" }}>
                      <th style={{ padding:"8px 12px", textAlign:"left", color:"#64748b", fontSize:11, fontWeight:700, textTransform:"uppercase" }}>ID / Назва</th>
                      <th style={{ padding:"8px 12px", textAlign:"right", color:"#64748b", fontSize:11, fontWeight:700, textTransform:"uppercase" }}>Залишок</th>
                      <th style={{ padding:"8px 12px", textAlign:"right", color:"#64748b", fontSize:11, fontWeight:700, textTransform:"uppercase" }}>Сьогодні</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.accounts.map(acc => {
                      const spent = (parseFloat(acc.amount_spent)||0)/100;
                      const limit = (parseFloat(acc.spend_cap)||0)/100;
                      const remaining = limit - spent;
                      const status = STATUS_MAP[acc.account_status]||"живий";
                      return (
                        <tr key={acc.id} onMouseEnter={e=>e.currentTarget.style.background="#1a1d23"} onMouseLeave={e=>e.currentTarget.style.background=""}>
                          <td style={{ padding:"8px 12px", borderBottom:"1px solid #1a1d23" }}>
                            <div style={{ display:"flex", alignItems:"center" }}>
                              <StatusDot status={status} />
                              <div>
                                <div style={{ color:"#e2e8f0", fontSize:13, fontWeight:600 }}>{acc.name}</div>
                                <div style={{ color:"#475569", fontSize:11, fontFamily:"monospace" }}>{acc.id}</div>
                              </div>
                            </div>
                          </td>
                          <td style={{ padding:"8px 12px", textAlign:"right", borderBottom:"1px solid #1a1d23" }}>
                            <div style={{ color:"#4ade80", fontWeight:700, fontSize:13 }}>${remaining.toFixed(2)}</div>
                            <div style={{ color:"#475569", fontSize:11 }}>/${limit.toFixed(2)}</div>
                          </td>
                          <td style={{ padding:"8px 12px", textAlign:"right", borderBottom:"1px solid #1a1d23" }}>
                            <div style={{ color: parseFloat(acc.today_spend)>0?"#f87171":"#475569", fontWeight:700, fontSize:13 }}>
                              {parseFloat(acc.today_spend)>0?`$${parseFloat(acc.today_spend).toFixed(2)}`:"—"}
                            </div>
                            <div style={{ color:"#475569", fontSize:11 }}>{parseInt(acc.clicks)||0} кліків</div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Фан-сторінки */}
              <div style={{ background:"#13151c", borderRadius:10, overflow:"hidden" }}>
                <div style={{ padding:"12px 16px", borderBottom:"1px solid #1e2330", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                  <span style={{ color:"#e2e8f0", fontWeight:700, fontSize:13 }}>📄 Фан-сторінки</span>
                  <span style={{ background:"#1e2330", color:"#60a5fa", borderRadius:20, padding:"2px 10px", fontSize:12, fontWeight:700 }}>{data.pages.length}</span>
                </div>
                {data.pages.length === 0 ? (
                  <div style={{ padding:24, textAlign:"center", color:"#475569", fontSize:13 }}>Немає сторінок</div>
                ) : (
                  <table style={{ width:"100%", borderCollapse:"collapse" }}>
                    <thead>
                      <tr style={{ background:"#0f1117" }}>
                        <th style={{ padding:"8px 12px", textAlign:"left", color:"#64748b", fontSize:11, fontWeight:700, textTransform:"uppercase" }}>Назва</th>
                        <th style={{ padding:"8px 12px", textAlign:"right", color:"#64748b", fontSize:11, fontWeight:700, textTransform:"uppercase" }}>Підписники</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.pages.map(page => (
                        <tr key={page.id} onMouseEnter={e=>e.currentTarget.style.background="#1a1d23"} onMouseLeave={e=>e.currentTarget.style.background=""}>
                          <td style={{ padding:"8px 12px", borderBottom:"1px solid #1a1d23" }}>
                            <div style={{ color:"#e2e8f0", fontSize:13, fontWeight:600 }}>{page.name}</div>
                            <div style={{ color:"#475569", fontSize:11, fontFamily:"monospace" }}>{page.id}</div>
                          </td>
                          <td style={{ padding:"8px 12px", textAlign:"right", borderBottom:"1px solid #1a1d23", color:"#a78bfa", fontWeight:600 }}>
                            {page.followers_count ? Number(page.followers_count).toLocaleString() : page.fan_count ? Number(page.fan_count).toLocaleString() : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              {/* Пікселі */}
              <div style={{ background:"#13151c", borderRadius:10, overflow:"hidden" }}>
                <div style={{ padding:"12px 16px", borderBottom:"1px solid #1e2330", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                  <span style={{ color:"#e2e8f0", fontWeight:700, fontSize:13 }}>🎯 Пікселі</span>
                  <span style={{ background:"#1e2330", color:"#60a5fa", borderRadius:20, padding:"2px 10px", fontSize:12, fontWeight:700 }}>{data.pixels.length}</span>
                </div>
                {data.pixels.length === 0 ? (
                  <div style={{ padding:24, textAlign:"center", color:"#475569", fontSize:13 }}>Немає пікселів</div>
                ) : (
                  <table style={{ width:"100%", borderCollapse:"collapse" }}>
                    <thead>
                      <tr style={{ background:"#0f1117" }}>
                        <th style={{ padding:"8px 12px", textAlign:"left", color:"#64748b", fontSize:11, fontWeight:700, textTransform:"uppercase" }}>Піксель</th>
                        <th style={{ padding:"8px 12px", textAlign:"right", color:"#64748b", fontSize:11, fontWeight:700, textTransform:"uppercase" }}>Остання подія</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.pixels.map(px => (
                        <tr key={px.id} onMouseEnter={e=>e.currentTarget.style.background="#1a1d23"} onMouseLeave={e=>e.currentTarget.style.background=""}>
                          <td style={{ padding:"8px 12px", borderBottom:"1px solid #1a1d23" }}>
                            <div style={{ color:"#e2e8f0", fontSize:13, fontWeight:600 }}>{px.name||"Без назви"}</div>
                            <div style={{ color:"#475569", fontSize:11, fontFamily:"monospace" }}>{px.id}</div>
                          </td>
                          <td style={{ padding:"8px 12px", textAlign:"right", borderBottom:"1px solid #1a1d23", color:"#64748b", fontSize:12 }}>
                            {px.last_fired_time ? new Date(px.last_fired_time).toLocaleDateString("uk-UA") : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

            </div>
          ) : null}
        </div>
      )}
    </div>
  );
};


const FARM_STATUS = {
  new: "новий",
  checking: "на чеку",
  ready: "готовий",
  warming: "прогрів",
  banned: "бан",
  issue: "проблема",
};
const FARM_STATUS_COLOR = {
  new: "#60a5fa",
  checking: "#fbbf24",
  ready: "#4ade80",
  warming: "#fbbf24",
  banned: "#f87171",
  issue: "#fb7185",
};
const FARM_ACCOUNT_STATUS = {
  alive: "живий",
  checking: "чек",
  warming: "прогрів",
  banned: "бан",
  unknown: "невідомо",
};
const FARM_ACCOUNT_COLOR = {
  alive: "#4ade80",
  checking: "#fbbf24",
  warming: "#fbbf24",
  banned: "#f87171",
  unknown: "#64748b",
};

const FARM_FOLDER_ALL = "__all";
const FARM_FOLDER_NONE = "__none";
const farmFolderName = (folderId, farmFolders=[]) => farmFolders.find(f => f.id === folderId)?.name || "Без папки";
const SETUP_FOLDER_ALL = "__all_setups";
const SETUP_FOLDER_NONE = "__none_setups";

const emptyFarm = {
  name:"",
  buyer_id:"",
  folder_id:"",
  cookie_data:"",
  access_token:"",
  status:"new",
  proxy_type:"socks5",
  proxy_host:"",
  proxy_port:"",
  proxy_user:"",
  proxy_pass:"",
  notes:"",
};

function maskSecret(value = "") {
  const v = String(value || "").trim();
  if (!v) return "—";
  if (v.length <= 18) return "••••••";
  return `${v.slice(0, 10)}…${v.slice(-6)} · ${v.length} симв.`;
}

function proxyLabel(row) {
  if (!row?.proxy_host) return "Без проксі";
  const auth = row.proxy_user ? `${row.proxy_user}:***@` : "";
  return `${row.proxy_type || "socks5"}://${auth}${row.proxy_host}${row.proxy_port ? `:${row.proxy_port}` : ""}`;
}

function farmProxy(row) {
  if (!row?.proxy_host) return null;
  return {
    type: row.proxy_type || "socks5",
    host: row.proxy_host,
    port: row.proxy_port,
    user: row.proxy_user,
    pass: row.proxy_pass,
  };
}

function parseProxyString(raw = "") {
  const value = String(raw || "").trim();
  if (!value) return {};

  try {
    if (value.includes("://")) {
      const url = new URL(value);
      return {
        proxy_type: url.protocol.replace(":", "") || "socks5",
        proxy_host: url.hostname || "",
        proxy_port: url.port || "",
        proxy_user: decodeURIComponent(url.username || ""),
        proxy_pass: decodeURIComponent(url.password || ""),
      };
    }
  } catch {}

  const parts = value.split(":").map(p => p.trim());
  if (parts.length >= 4) {
    return { proxy_host:parts[0], proxy_port:parts[1], proxy_user:parts[2], proxy_pass:parts.slice(3).join(":"), proxy_type:"socks5" };
  }
  if (parts.length === 2) {
    return { proxy_host:parts[0], proxy_port:parts[1], proxy_type:"socks5" };
  }
  return { proxy_host:value, proxy_type:"socks5" };
}

function mapFbAdAccountStatus(accountStatus) {
  const code = Number(accountStatus);
  if (code === 1) return "alive";
  if ([2, 101, 201].includes(code)) return "banned";
  if ([3, 7, 8, 9, 100].includes(code)) return "warming";
  return "unknown";
}

const FarmForm = ({ initial={}, buyers, farmFolders=[], onSave, onClose }) => {
  const editing = Boolean(initial.id);
  const [f, setF] = useState({
    ...emptyFarm,
    ...initial,
    cookie_data: editing ? "" : (initial.cookie_data || ""),
    access_token: editing ? "" : (initial.access_token || ""),
  });
  const set = k => e => setF(p=>({...p,[k]:e.target.value}));
  const applyProxyRaw = () => {
    const parsed = parseProxyString(f.proxy_raw);
    setF(p => ({ ...p, ...parsed }));
  };

  return (
    <div>
      <div style={{ background:"#0f1117", border:"1px solid #1e2330", borderRadius:10, padding:12, color:"#94a3b8", fontSize:12, marginBottom:14 }}>
        Cookie зберігається як обліковий запис у CRM. Авточек кабінетів працює тільки через офіційний Meta access token, якщо ти його додаси.
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
        <Field label="Назва фарму"><input style={S.inp} value={f.name} onChange={set("name")} placeholder="DS-A2-Setup1-1" /></Field>
        <Field label="Байєр">
          <select style={{ ...S.inp, cursor:"pointer" }} value={f.buyer_id || ""} onChange={set("buyer_id")}>
            <option value="">— не призначено —</option>
            {buyers.map(b=><option key={b.id} value={b.id}>{b.full_name}</option>)}
          </select>
        </Field>
        <Field label="Папка">
          <select style={{ ...S.inp, cursor:"pointer" }} value={f.folder_id || ""} onChange={set("folder_id")}>
            <option value="">Без папки</option>
            {farmFolders.map(folder=><option key={folder.id} value={folder.id}>📁 {folder.name}</option>)}
          </select>
        </Field>
        <Field label="Статус">
          <select style={{ ...S.inp, cursor:"pointer" }} value={f.status || "new"} onChange={set("status")}>
            {Object.entries(FARM_STATUS).map(([key,label]) => <option key={key} value={key}>{label}</option>)}
          </select>
        </Field>
        <Field label="Швидкий proxy paste">
          <div style={{ display:"flex", gap:8 }}>
            <input style={S.inp} value={f.proxy_raw || ""} onChange={set("proxy_raw")} placeholder="socks5://user:pass@host:port" />
            <button type="button" onClick={applyProxyRaw} style={{ ...S.btnGhost, padding:"8px 10px" }}>OK</button>
          </div>
        </Field>
      </div>

      <Field label={editing ? "Cookie / JSON cookie optional" : "Cookie / JSON cookie"}>
        <textarea
          style={{ ...S.inp, minHeight:110, resize:"vertical", fontFamily:"monospace", fontSize:12 }}
          value={f.cookie_data || ""}
          onChange={set("cookie_data")}
          placeholder={editing ? "Залиш пустим, якщо cookie не змінюється" : "Встав cookie рядок або JSON cookies"}
        />
      </Field>

      <Field label={editing ? "Meta Access Token optional для авточеку" : "Meta Access Token optional для авточеку"}>
        <input
          style={S.inp}
          value={f.access_token || ""}
          onChange={set("access_token")}
          placeholder={editing ? "Залиш пустим, якщо token не змінюється" : "EAA..."}
        />
      </Field>

      <p style={{ color:"#60a5fa", fontSize:11, fontWeight:700, textTransform:"uppercase", letterSpacing:"0.07em", margin:"4px 0 12px" }}>🔒 Проксі</p>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
        <Field label="Тип">
          <select style={{ ...S.inp, cursor:"pointer" }} value={f.proxy_type || "socks5"} onChange={set("proxy_type")}>
            {["http","https","socks5"].map(t=><option key={t}>{t}</option>)}
          </select>
        </Field>
        <Field label="Порт"><input style={S.inp} value={f.proxy_port || ""} onChange={set("proxy_port")} placeholder="21502" /></Field>
        <Field label="Host / IP"><input style={S.inp} value={f.proxy_host || ""} onChange={set("proxy_host")} placeholder="proxy.example.com" /></Field>
        <Field label="Логін"><input style={S.inp} value={f.proxy_user || ""} onChange={set("proxy_user")} placeholder="user" /></Field>
        <Field label="Пароль"><input style={S.inp} value={f.proxy_pass || ""} onChange={set("proxy_pass")} placeholder="password" /></Field>
        <Field label="Нотатки"><input style={S.inp} value={f.notes || ""} onChange={set("notes")} placeholder="2FA, дата покупки, якість тощо" /></Field>
      </div>

      <div style={{ display:"flex", gap:10, justifyContent:"flex-end", marginTop:16 }}>
        <button onClick={onClose} style={S.btnGhost}>Скасувати</button>
        <button onClick={()=>onSave(f)} style={S.btn}>{editing ? "Зберегти" : "Додати фарм"}</button>
      </div>
    </div>
  );
};

const FarmAccountImport = ({ farm, onClose, onSave }) => {
  const [raw, setRaw] = useState("");
  const [status, setStatus] = useState("unknown");

  const submit = () => {
    const rows = raw.split(/\r?\n/).map(line => line.trim()).filter(Boolean).map((line, idx) => {
      const parts = line.split("|").map(p => p.trim());
      return {
        fb_account_id: parts[0] || `manual-${idx + 1}`,
        name: parts[1] || parts[0] || `Кабінет ${idx + 1}`,
        status: parts[2] || status,
      };
    });
    onSave(rows);
  };

  return (
    <Modal title={`Додати кабінети · ${farm.name}`} onClose={onClose}>
      <div style={{ background:"#0f1117", border:"1px solid #1e2330", borderRadius:10, padding:12, color:"#94a3b8", fontSize:12, marginBottom:14 }}>
        Формат: <code>account_id|name|status</code>. Status: <code>alive</code>, <code>banned</code>, <code>warming</code>, <code>checking</code>, <code>unknown</code>.
      </div>
      <Field label="Статус за замовчуванням">
        <select style={{ ...S.inp, cursor:"pointer" }} value={status} onChange={e=>setStatus(e.target.value)}>
          {Object.entries(FARM_ACCOUNT_STATUS).map(([key,label]) => <option key={key} value={key}>{label}</option>)}
        </select>
      </Field>
      <Field label="Кабінети">
        <textarea style={{ ...S.inp, minHeight:220, resize:"vertical", fontFamily:"monospace", fontSize:12 }} value={raw} onChange={e=>setRaw(e.target.value)} placeholder={"act_123|BM Main|alive\nact_456|Spend cap|banned"} />
      </Field>
      <div style={{ display:"flex", gap:10, justifyContent:"flex-end" }}>
        <button onClick={onClose} style={S.btnGhost}>Скасувати</button>
        <button onClick={submit} style={S.btn}>Зберегти кабінети</button>
      </div>
    </Modal>
  );
};

const BulkFarmImport = ({ buyers, farmFolders=[], user, onClose, onDone, showToast }) => {
  const [buyerId, setBuyerId] = useState("");
  const [folderId, setFolderId] = useState("");
  const [defaultProxy, setDefaultProxy] = useState("");
  const [status, setStatus] = useState("new");
  const [raw, setRaw] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    const lines = raw.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    if (!lines.length) { showToast("Встав хоча б один cookie", "error"); return; }
    setLoading(true);

    const defaultParsedProxy = parseProxyString(defaultProxy);
    const payloads = lines.map((line, index) => {
      const parts = line.split("|").map(p => p.trim());
      let name = `FARM-${String(index + 1).padStart(3, "0")}`;
      let cookie = line;
      let proxyRaw = "";
      if (parts.length >= 3) {
        name = parts[0] || name;
        cookie = parts[1] || "";
        proxyRaw = parts.slice(2).join("|");
      } else if (parts.length === 2) {
        name = parts[0] || name;
        cookie = parts[1] || "";
      }
      const parsedProxy = proxyRaw ? parseProxyString(proxyRaw) : defaultParsedProxy;
      return {
        user_id:user.id,
        buyer_id:buyerId || null,
        folder_id:folderId || null,
        name,
        cookie_data:cookie,
        status,
        notes:"bulk import",
        proxy_type:parsedProxy.proxy_type || "socks5",
        proxy_host:parsedProxy.proxy_host || "",
        proxy_port:parsedProxy.proxy_port || "",
        proxy_user:parsedProxy.proxy_user || "",
        proxy_pass:parsedProxy.proxy_pass || "",
      };
    }).filter(row => row.cookie_data);

    if (!payloads.length) { setLoading(false); showToast("Не знайшов валідних cookie", "error"); return; }
    const { error } = await supabase.from("fb_farms").insert(payloads);
    setLoading(false);
    if (error) { showToast("Помилка імпорту: " + error.message, "error"); return; }
    showToast(`Імпортовано ${payloads.length} фармів`);
    onDone();
    onClose();
  };

  return (
    <Modal title="🌱 Імпорт ферм по cookies" onClose={onClose}>
      <div style={{ background:"#0f1117", border:"1px solid #1e2330", borderRadius:10, padding:12, color:"#94a3b8", fontSize:12, marginBottom:14 }}>
        Формати рядка: <code>Назва|cookie|proxy</code>, <code>Назва|cookie</code> або просто <code>cookie</code>. Proxy: <code>socks5://user:pass@host:port</code> або <code>host:port:user:pass</code>.
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
        <Field label="Байєр">
          <select style={{ ...S.inp, cursor:"pointer" }} value={buyerId} onChange={e=>setBuyerId(e.target.value)}>
            <option value="">— не призначено —</option>
            {buyers.map(b=><option key={b.id} value={b.id}>{b.full_name}</option>)}
          </select>
        </Field>
        <Field label="Папка">
          <select style={{ ...S.inp, cursor:"pointer" }} value={folderId} onChange={e=>setFolderId(e.target.value)}>
            <option value="">Без папки</option>
            {farmFolders.map(folder=><option key={folder.id} value={folder.id}>📁 {folder.name}</option>)}
          </select>
        </Field>
        <Field label="Статус">
          <select style={{ ...S.inp, cursor:"pointer" }} value={status} onChange={e=>setStatus(e.target.value)}>
            {Object.entries(FARM_STATUS).map(([key,label]) => <option key={key} value={key}>{label}</option>)}
          </select>
        </Field>
      </div>
      <Field label="Default proxy optional">
        <input style={S.inp} value={defaultProxy} onChange={e=>setDefaultProxy(e.target.value)} placeholder="socks5://user:pass@host:port" />
      </Field>
      <Field label="Cookies">
        <textarea style={{ ...S.inp, minHeight:220, resize:"vertical", fontFamily:"monospace", fontSize:12 }} value={raw} onChange={e=>setRaw(e.target.value)} placeholder={"FARM-01|c_user=...; xs=...|socks5://user:pass@host:port\nFARM-02|[{\"name\":\"c_user\",...}]"} />
      </Field>
      <div style={{ display:"flex", gap:10, justifyContent:"flex-end" }}>
        <button onClick={onClose} style={S.btnGhost}>Скасувати</button>
        <button onClick={submit} disabled={loading} style={{ ...S.btn, opacity:loading ? 0.7 : 1 }}>{loading ? "Імпортую…" : "Імпортувати"}</button>
      </div>
    </Modal>
  );
};

const FarmAccountsTable = ({ accounts }) => {
  if (!accounts.length) {
    return <div style={{ color:"#64748b", padding:18, textAlign:"center", border:"1px dashed #1e2330", borderRadius:10 }}>Кабінети ще не додані. Натисни “Чек” або “+ Кабінети”.</div>;
  }
  return (
    <div style={{ border:"1px solid #1e2330", borderRadius:10, overflow:"hidden" }}>
      <table style={{ width:"100%", borderCollapse:"collapse" }}>
        <thead>
          <tr style={{ background:"#0f1117" }}>
            <th style={{ padding:"9px 12px", textAlign:"left", color:"#64748b", fontSize:11, textTransform:"uppercase" }}>Кабінет</th>
            <th style={{ padding:"9px 12px", textAlign:"left", color:"#64748b", fontSize:11, textTransform:"uppercase" }}>Статус</th>
            <th style={{ padding:"9px 12px", textAlign:"right", color:"#64748b", fontSize:11, textTransform:"uppercase" }}>Spend cap</th>
            <th style={{ padding:"9px 12px", textAlign:"right", color:"#64748b", fontSize:11, textTransform:"uppercase" }}>Перевірка</th>
          </tr>
        </thead>
        <tbody>
          {accounts.map(acc => {
            const color = FARM_ACCOUNT_COLOR[acc.status] || "#64748b";
            const isBanned = acc.status === "banned";
            return (
              <tr key={acc.id || acc.fb_account_id} style={{ background:isBanned ? "#7f1d1d33" : "transparent" }}>
                <td style={{ padding:"10px 12px", borderTop:"1px solid #1a1d23" }}>
                  <div style={{ color:isBanned ? "#fecaca" : "#e2e8f0", fontWeight:800 }}>{acc.name || "Ad account"}</div>
                  <div style={{ color:"#64748b", fontSize:11, fontFamily:"monospace" }}>{acc.fb_account_id}</div>
                  {acc.raw?.disable_reason && <div style={{ color:"#fca5a5", fontSize:11 }}>Reason: {acc.raw.disable_reason}</div>}
                </td>
                <td style={{ padding:"10px 12px", borderTop:"1px solid #1a1d23" }}>
                  <span style={{ background:`${color}22`, color, border:`1px solid ${color}66`, borderRadius:999, padding:"3px 9px", fontSize:12, fontWeight:900 }}>{FARM_ACCOUNT_STATUS[acc.status] || acc.status}</span>
                </td>
                <td style={{ padding:"10px 12px", textAlign:"right", borderTop:"1px solid #1a1d23", color:"#94a3b8", fontSize:12 }}>{acc.spend_cap ? `$${Number(acc.spend_cap).toFixed(2)}` : "—"}</td>
                <td style={{ padding:"10px 12px", textAlign:"right", borderTop:"1px solid #1a1d23", color:"#64748b", fontSize:12 }}>{acc.checked_at ? new Date(acc.checked_at).toLocaleString("uk-UA") : "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

const FarmRow = ({ farm, farmAccounts, buyers, farmFolders, isAdmin, onEdit, onDelete, onCheck, onImportAccounts, checking }) => {
  const [expanded, setExpanded] = useState(false);
  const buyer = buyers.find(b => b.id === farm.buyer_id);
  const folder = farmFolders.find(f => f.id === farm.folder_id);
  const statusKey = farm.status || "new";
  const accounts = farmAccounts.filter(a => a.farm_id === farm.id);
  const bannedCount = accounts.filter(a => a.status === "banned").length;
  const aliveCount = accounts.filter(a => a.status === "alive").length;
  const borderColor = statusKey === "banned" || bannedCount > 0 ? "#7f1d1d" : statusKey === "checking" ? "#854d0e" : "#1e2330";

  return (
    <div style={{ border:`1px solid ${borderColor}`, borderRadius:12, background:"#13151c", overflow:"hidden" }}>
      <div onClick={()=>setExpanded(v=>!v)} style={{ padding:16, display:"grid", gridTemplateColumns:"1fr auto", gap:14, alignItems:"center", cursor:"pointer" }}>
        <div style={{ minWidth:0 }}>
          <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:6 }}>
            <span style={{ width:9, height:9, borderRadius:"50%", background:FARM_STATUS_COLOR[statusKey] || "#64748b", display:"inline-block" }} />
            <div style={{ color:"#e2e8f0", fontWeight:800, fontSize:15, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{farm.name || "FARM"}</div>
            <span style={{ color:FARM_STATUS_COLOR[statusKey] || "#64748b", background:"#0f1117", border:"1px solid #1e2330", borderRadius:999, padding:"2px 8px", fontSize:11, fontWeight:800 }}>{FARM_STATUS[statusKey] || statusKey}</span>
            {bannedCount > 0 && <span style={{ color:"#fecaca", background:"#7f1d1d66", borderRadius:999, padding:"2px 8px", fontSize:11, fontWeight:900 }}>бан кабів: {bannedCount}</span>}
          </div>
          <div style={{ color:"#64748b", fontSize:12, display:"flex", gap:12, flexWrap:"wrap" }}>
            <span>📁 {folder?.name || "Без папки"}</span>
            <span>👤 {buyer?.full_name || "не призначено"}</span>
            <span>🍪 {maskSecret(farm.cookie_data)}</span>
            <span>🔑 {farm.access_token ? "token є" : "без token"}</span>
            <span>🔒 {proxyLabel(farm)}</span>
            <span>📊 {accounts.length} каб. / 🟢 {aliveCount} / 🔴 {bannedCount}</span>
            {farm.last_check_at && <span>🕒 {new Date(farm.last_check_at).toLocaleString("uk-UA")}</span>}
          </div>
          {farm.check_error && <div style={{ marginTop:7, color:"#fca5a5", fontSize:12 }}>⚠️ {farm.check_error}</div>}
          {farm.notes && <div style={{ marginTop:5, color:"#64748b", fontSize:12 }}>📝 {farm.notes}</div>}
        </div>
        <div style={{ display:"flex", gap:8 }} onClick={e=>e.stopPropagation()}>
          <button onClick={()=>onCheck(farm)} disabled={checking} style={{ ...S.btnGreen, padding:"7px 10px", opacity:checking ? 0.65 : 1 }}>{checking ? "чекаю…" : "🔍 Чек"}</button>
          {isAdmin && <button onClick={()=>onImportAccounts(farm)} style={{ ...S.btnGhost, padding:"7px 10px" }}>+ Кабінети</button>}
          {isAdmin && <button onClick={onEdit} style={{ ...S.btnGhost, padding:"7px 10px" }}>✏️</button>}
          {isAdmin && <button onClick={onDelete} style={{ ...S.btnGhost, padding:"7px 10px", color:"#f87171" }}>🗑</button>}
        </div>
      </div>

      {expanded && (
        <div style={{ background:"#0f1117", padding:16, borderTop:"1px solid #1e2330" }}>
          <FarmAccountsTable accounts={accounts} />
        </div>
      )}
    </div>
  );
};

const FarmsPanel = ({ farms, farmAccounts, farmFolders, buyers, user, isAdmin, onRefresh, showToast }) => {
  const [modal, setModal] = useState(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [accountImportFarm, setAccountImportFarm] = useState(null);
  const [checkingId, setCheckingId] = useState(null);
  const [selectedFolder, setSelectedFolder] = useState(FARM_FOLDER_ALL);
  const [q, setQ] = useState("");

  const folderCount = (folderId) => {
    if (folderId === FARM_FOLDER_ALL) return farms.length;
    if (folderId === FARM_FOLDER_NONE) return farms.filter(f => !f.folder_id).length;
    return farms.filter(f => f.folder_id === folderId).length;
  };

  const filtered = farms.filter(f => {
    const folder = farmFolders.find(ff => ff.id === f.folder_id);
    const folderMatches = selectedFolder === FARM_FOLDER_ALL
      || (selectedFolder === FARM_FOLDER_NONE ? !f.folder_id : f.folder_id === selectedFolder);
    const text = [f.name, f.status, f.proxy_host, f.notes, folder?.name, buyers.find(b=>b.id===f.buyer_id)?.full_name].join(" ").toLowerCase();
    return folderMatches && (!q.trim() || text.includes(q.trim().toLowerCase()));
  });

  const stats = {
    total: farms.length,
    ready: farms.filter(f=>f.status === "ready").length,
    checking: farms.filter(f=>f.status === "checking").length,
    banned: farms.filter(f=>f.status === "banned").length,
    bannedAccounts: farmAccounts.filter(a=>a.status === "banned").length,
  };

  const createFolder = async () => {
    if (!isAdmin) return;
    const name = prompt("Назва папки", `Агент ${farmFolders.length + 1}`);
    if (!name?.trim()) return;
    const { error } = await supabase.from("fb_farm_folders").insert([{ name:name.trim(), user_id:user.id }]);
    if (error) { showToast("Помилка створення папки: " + error.message, "error"); return; }
    showToast("Папку створено");
    onRefresh();
  };

  const saveFarm = async (f) => {
    if (!isAdmin) { showToast("Фарми може редагувати тільки адмін", "error"); return; }
    const payload = {
      name:f.name || "FARM",
      buyer_id:f.buyer_id || null,
      folder_id:f.folder_id || null,
      status:f.status || "new",
      proxy_type:f.proxy_type || "socks5",
      proxy_host:f.proxy_host || "",
      proxy_port:f.proxy_port || "",
      proxy_user:f.proxy_user || "",
      proxy_pass:f.proxy_pass || "",
      notes:f.notes || "",
      user_id:user.id,
    };
    if (f.cookie_data?.trim()) payload.cookie_data = f.cookie_data.trim();
    if (f.access_token?.trim()) payload.access_token = f.access_token.trim();
    if (!modal?.data?.id && !payload.cookie_data) { showToast("Для нового фарму потрібен cookie", "error"); return; }

    let error;
    if (modal?.mode === "edit") ({ error } = await supabase.from("fb_farms").update(payload).eq("id", modal.data.id));
    else ({ error } = await supabase.from("fb_farms").insert([payload]));
    if (error) { showToast("Помилка збереження фарму: " + error.message, "error"); return; }
    showToast(modal?.mode === "edit" ? "Фарм оновлено" : "Фарм додано");
    setModal(null);
    onRefresh();
  };

  const deleteFarm = async (farm) => {
    if (!isAdmin) return;
    if (!confirm(`Видалити фарм "${farm.name || "FARM"}"?`)) return;
    await supabase.from("fb_farm_accounts").delete().eq("farm_id", farm.id);
    const { error } = await supabase.from("fb_farms").delete().eq("id", farm.id);
    if (error) { showToast("Помилка видалення: " + error.message, "error"); return; }
    showToast("Фарм видалено");
    onRefresh();
  };

  const importFarmAccounts = async (farm, rows) => {
    if (!isAdmin) return;
    const payloads = rows.map(row => ({
      farm_id:farm.id,
      user_id:user.id,
      fb_account_id:row.fb_account_id,
      name:row.name || row.fb_account_id,
      status:row.status || "unknown",
      checked_at:new Date().toISOString(),
      raw:{ source:"manual" },
    }));
    const { error } = await supabase.from("fb_farm_accounts").upsert(payloads, { onConflict:"farm_id,fb_account_id" });
    if (error) { showToast("Помилка імпорту кабінетів: " + error.message, "error"); return; }
    showToast(`Додано/оновлено ${payloads.length} кабінетів`);
    setAccountImportFarm(null);
    onRefresh();
  };

  const checkFarm = async (farm) => {
    setCheckingId(farm.id);
    await supabase.from("fb_farms").update({ status:"checking", check_error:null, last_check_at:new Date().toISOString() }).eq("id", farm.id);
    onRefresh();

    if (!farm.access_token) {
      const message = "Для авточеку потрібен Meta access token. Cookie не використовується для автоматичного логіну.";
      await supabase.from("fb_farms").update({ status:"issue", check_error:message, last_check_at:new Date().toISOString() }).eq("id", farm.id);
      setCheckingId(null);
      showToast(message, "error");
      onRefresh();
      return;
    }

    try {
      const data = await callFbApi(farm.access_token, "me/adaccounts", {
        fields:"id,name,account_status,currency,timezone_name,amount_spent,spend_cap,disable_reason",
        limit:"100",
      }, farmProxy(farm));

      const accounts = data.data || [];
      const now = new Date().toISOString();
      const rows = accounts.map(acc => {
        const status = mapFbAdAccountStatus(acc.account_status);
        return {
          farm_id:farm.id,
          user_id:user.id,
          fb_account_id:acc.id,
          name:acc.name || acc.id,
          status,
          account_status:Number(acc.account_status) || null,
          currency:acc.currency || null,
          timezone:acc.timezone_name || null,
          amount_spent:(parseFloat(acc.amount_spent) || 0) / 100,
          spend_cap:(parseFloat(acc.spend_cap) || 0) / 100,
          raw:acc,
          checked_at:now,
        };
      });

      if (rows.length) {
        const { error } = await supabase.from("fb_farm_accounts").upsert(rows, { onConflict:"farm_id,fb_account_id" });
        if (error) throw error;
      }

      const banned = rows.filter(r => r.status === "banned").length;
      const alive = rows.filter(r => r.status === "alive").length;
      const finalStatus = rows.length === 0 ? "issue" : banned === rows.length ? "banned" : banned > 0 ? "issue" : alive > 0 ? "ready" : "warming";
      const checkError = rows.length === 0 ? "Meta API не повернув кабінети" : banned > 0 ? `Є забанені кабінети: ${banned}` : null;

      await supabase.from("fb_farms").update({ status:finalStatus, check_error:checkError, last_check_at:now }).eq("id", farm.id);
      showToast(`Чек завершено: ${rows.length} каб., банів: ${banned}`);
    } catch (e) {
      await supabase.from("fb_farms").update({ status:"issue", check_error:e.message, last_check_at:new Date().toISOString() }).eq("id", farm.id);
      showToast("Помилка чеку: " + e.message, "error");
    }

    setCheckingId(null);
    onRefresh();
  };

  return (
    <div>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(130px,1fr))", gap:12, marginBottom:24 }}>
        {[["Фармів",stats.total,"#60a5fa"],["Готових",stats.ready,"#4ade80"],["На чеку",stats.checking,"#fbbf24"],["Фармів у бані",stats.banned,"#f87171"],["Бан кабів",stats.bannedAccounts,"#fb7185"]].map(([l,v,c])=>(
          <div key={l} style={S.card}>
            <div style={{ color:"#64748b",fontSize:11,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.07em" }}>{l}</div>
            <div style={{ color:c,fontSize:22,fontWeight:800,marginTop:4 }}>{v}</div>
          </div>
        ))}
      </div>

      <div style={{ display:"flex", gap:8, flexWrap:"wrap", alignItems:"center", marginBottom:18 }}>
        {[{ id:FARM_FOLDER_ALL, name:"Всі фарми" }, { id:FARM_FOLDER_NONE, name:"Без папки" }, ...farmFolders].map(folder => {
          const active = selectedFolder === folder.id;
          return (
            <button
              key={folder.id}
              onClick={()=>setSelectedFolder(folder.id)}
              style={{
                border:active ? "1px solid #3b82f6" : "1px solid #1e2330",
                background:active ? "#1d4ed833" : "#13151c",
                color:active ? "#bfdbfe" : "#94a3b8",
                borderRadius:999,
                padding:"8px 12px",
                cursor:"pointer",
                fontWeight:800,
                fontSize:13,
              }}
            >
              📁 {folder.name} <span style={{ color:active ? "#93c5fd" : "#64748b" }}>· {folderCount(folder.id)}</span>
            </button>
          );
        })}
        {isAdmin && <button onClick={createFolder} style={{ ...S.btnGhost, borderRadius:999, padding:"8px 12px" }}>+ Папка</button>}
      </div>

      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", gap:12, marginBottom:16 }}>
        <div>
          <h3 style={{ color:"#e2e8f0", fontSize:16, fontWeight:700, margin:"0 0 4px" }}>ФАРМИ</h3>
          <div style={{ color:"#64748b", fontSize:12 }}>Відкрий фарм, щоб бачити кабінети. Чек через Meta access token, кабінети в бані підсвічуються червоним.</div>
        </div>
        <div style={{ display:"flex", gap:10 }}>
          <input style={{ ...S.inp, width:260 }} value={q} onChange={e=>setQ(e.target.value)} placeholder="Пошук фарму / proxy / buyer" />
          {isAdmin && <button onClick={()=>setBulkOpen(true)} style={S.btnGhost}>⬆️ Імпорт cookies</button>}
          {isAdmin && <button onClick={()=>setModal({ mode:"add", data:{} })} style={S.btn}>+ Додати фарм</button>}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div style={{ ...S.card, textAlign:"center", color:"#475569", padding:40 }}>Фармів немає або нічого не знайдено</div>
      ) : (
        <div style={{ display:"grid", gap:10 }}>
          {filtered.map(farm => (
            <FarmRow
              key={farm.id}
              farm={farm}
              farmAccounts={farmAccounts}
              buyers={buyers}
              farmFolders={farmFolders}
              isAdmin={isAdmin}
              checking={checkingId === farm.id}
              onCheck={checkFarm}
              onImportAccounts={setAccountImportFarm}
              onEdit={()=>setModal({ mode:"edit", data:farm })}
              onDelete={()=>deleteFarm(farm)}
            />
          ))}
        </div>
      )}

      {modal && (
        <Modal title={modal.mode === "edit" ? "Редагувати фарм" : "Додати фарм"} onClose={()=>setModal(null)}>
          <FarmForm initial={modal.data} buyers={buyers} farmFolders={farmFolders} onSave={saveFarm} onClose={()=>setModal(null)} />
        </Modal>
      )}
      {bulkOpen && <BulkFarmImport buyers={buyers} farmFolders={farmFolders} user={user} onClose={()=>setBulkOpen(false)} onDone={onRefresh} showToast={showToast} />}
      {accountImportFarm && <FarmAccountImport farm={accountImportFarm} onClose={()=>setAccountImportFarm(null)} onSave={(rows)=>importFarmAccounts(accountImportFarm, rows)} />}
    </div>
  );
};

const FbAccountsSubnav = ({ active, onChange }) => {
  const [open, setOpen] = useState(false);
  const items = [
    { id:"setups", label:"FB Акаунти", icon:"▣" },
    { id:"farms", label:"Фарми", icon:"🌱" },
  ];
  const current = items.find(i => i.id === active) || items[0];
  return (
    <div style={{ position:"relative", display:"inline-block", marginBottom:22 }}>
      <button
        onClick={()=>setOpen(o=>!o)}
        style={{ background:"#fff", color:"#111827", border:"none", borderRadius:10, padding:"12px 18px", fontWeight:900, fontSize:16, display:"flex", alignItems:"center", gap:10, cursor:"pointer", boxShadow:"0 10px 30px #0004" }}
      >
        <span>{current.icon}</span>
        <span>{current.label}</span>
        <span style={{ color:"#6b7280" }}>⌄</span>
      </button>
      {open && (
        <div style={{ position:"absolute", top:"calc(100% + 10px)", left:0, width:260, background:"#fff", borderRadius:14, padding:8, boxShadow:"0 16px 45px #0005", zIndex:50 }}>
          {items.map(item => (
            <button
              key={item.id}
              onClick={()=>{ onChange(item.id); setOpen(false); }}
              style={{ width:"100%", border:"none", borderRadius:10, background:active === item.id ? "#e8eef8" : "#fff", color:active === item.id ? "#1e3a8a" : "#374151", padding:"12px 14px", display:"flex", alignItems:"center", gap:12, cursor:"pointer", fontWeight:900, fontSize:15, textAlign:"left" }}
            >
              <span>{item.icon}</span>
              <span style={{ flex:1 }}>{item.label}</span>
              {active === item.id && <span>✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────
export default function FbAccountsTab({ user, isAdmin, canSeeAll }) {
  const [setups, setSetups] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [buyers, setBuyers] = useState([]);
  const [farms, setFarms] = useState([]);
  const [farmAccounts, setFarmAccounts] = useState([]);
  const [farmFolders, setFarmFolders] = useState([]);
  const [setupFolders, setSetupFolders] = useState([]);
  const [selectedSetupFolder, setSelectedSetupFolder] = useState(SETUP_FOLDER_ALL);
  const [section, setSection] = useState("setups");
  const [modal, setModal] = useState(null);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState(null);
  const showToast = (msg, type="ok") => { setToast({msg,type}); setTimeout(()=>setToast(null),3500); };

  const fetchAll = async () => {
    setLoading(true);
    const [{ data: s }, { data: a }, { data: p }, farmsResult, farmAccountsResult, farmFoldersResult, setupFoldersResult] = await Promise.all([
      supabase.from("fb_setups").select("*").order("created_at",{ascending:false}),
      supabase.from("fb_accounts").select("*"),
      supabase.from("profiles").select("id, full_name, role"),
      supabase.from("fb_farms").select("*").order("created_at",{ascending:false}),
      supabase.from("fb_farm_accounts").select("*").order("checked_at",{ascending:false}),
      supabase.from("fb_farm_folders").select("*").order("name",{ascending:true}),
      supabase.from("fb_setup_folders").select("*").order("name",{ascending:true}),
    ]);
    if (s) setSetups(s);
    if (a) setAccounts(a);
    if (p) setBuyers(p);
    if (!farmsResult.error) setFarms(farmsResult.data || []);
    else setFarms([]);
    if (!farmAccountsResult.error) setFarmAccounts(farmAccountsResult.data || []);
    else setFarmAccounts([]);
    if (!farmFoldersResult.error) setFarmFolders(farmFoldersResult.data || []);
    else setFarmFolders([]);
    if (!setupFoldersResult.error) setSetupFolders(setupFoldersResult.data || []);
    else setSetupFolders([]);
    setLoading(false);
  };

  useEffect(()=>{ fetchAll(); },[]);

  const setupFolderCount = (folderId) => {
    if (folderId === SETUP_FOLDER_ALL) return setups.length;
    if (folderId === SETUP_FOLDER_NONE) return setups.filter(s => !s.folder_id).length;
    return setups.filter(s => s.folder_id === folderId).length;
  };

  const filteredSetups = setups.filter(s => selectedSetupFolder === SETUP_FOLDER_ALL
    || (selectedSetupFolder === SETUP_FOLDER_NONE ? !s.folder_id : s.folder_id === selectedSetupFolder)
  );

  const createSetupFolder = async () => {
    if (!isAdmin) return;
    const name = prompt("Назва папки", `Агент ${setupFolders.length + 1}`);
    if (!name?.trim()) return;
    const { error } = await supabase.from("fb_setup_folders").insert([{ name:name.trim(), user_id:user.id }]);
    if (error) { showToast("Помилка створення папки: " + error.message, "error"); return; }
    showToast("Папку створено");
    fetchAll();
  };

  const saveSetup = async (f) => {
    const payload = { name:f.name, token:f.token, buyer_id:f.buyer_id||null, folder_id:f.folder_id||null, proxy_type:f.proxy_type, proxy_host:f.proxy_host, proxy_port:f.proxy_port, proxy_user:f.proxy_user, proxy_pass:f.proxy_pass, user_id:user.id };
    if (modal.mode==="add") {
      const { error } = await supabase.from("fb_setups").insert([payload]);
      if (error) { showToast("❌ "+error.message,"error"); return; }
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

      <FbAccountsSubnav active={section} onChange={setSection} />

      {section === "farms" ? (
        <FarmsPanel farms={farms} farmAccounts={farmAccounts} farmFolders={farmFolders} buyers={buyers} user={user} isAdmin={isAdmin} onRefresh={fetchAll} showToast={showToast} />
      ) : (
        <>
          {/* Stats */}
          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(130px,1fr))", gap:12, marginBottom:24 }}>
            {[["Акаунтів",stats.total,"#60a5fa"],["Живих",stats.alive,"#4ade80"],["На прогріві",stats.warm,"#fbbf24"],["Забанених",stats.banned,"#f87171"],["Спенд сьогодні",`$${stats.spend.toFixed(0)}`,"#a78bfa"]].map(([l,v,c])=>(
              <div key={l} style={S.card}>
                <div style={{ color:"#64748b",fontSize:11,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.07em" }}>{l}</div>
                <div style={{ color:c,fontSize:22,fontWeight:800,marginTop:4 }}>{v}</div>
              </div>
            ))}
          </div>

          <div style={{ display:"flex", gap:8, flexWrap:"wrap", alignItems:"center", marginBottom:18 }}>
            {[{ id:SETUP_FOLDER_ALL, name:"Всі сетапи" }, { id:SETUP_FOLDER_NONE, name:"Без папки" }, ...setupFolders].map(folder => {
              const active = selectedSetupFolder === folder.id;
              return (
                <button
                  key={folder.id}
                  onClick={()=>setSelectedSetupFolder(folder.id)}
                  style={{
                    border:active ? "1px solid #3b82f6" : "1px solid #1e2330",
                    background:active ? "#1d4ed833" : "#13151c",
                    color:active ? "#bfdbfe" : "#94a3b8",
                    borderRadius:999,
                    padding:"8px 12px",
                    cursor:"pointer",
                    fontWeight:800,
                    fontSize:13,
                  }}
                >
                  📁 {folder.name} <span style={{ color:active ? "#93c5fd" : "#64748b" }}>· {setupFolderCount(folder.id)}</span>
                </button>
              );
            })}
            {isAdmin && <button onClick={createSetupFolder} style={{ ...S.btnGhost, borderRadius:999, padding:"8px 12px" }}>+ Папка</button>}
          </div>

          {/* Header */}
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
            <h3 style={{ color:"#e2e8f0", fontSize:16, fontWeight:700, margin:0 }}>ВАШІ СЕТАПИ</h3>
            <button onClick={()=>setModal({mode:"add",data:{}})} style={S.btn}>+ Додати сетап</button>
          </div>

          {/* Setups */}
          {loading ? <div style={{ textAlign:"center",color:"#475569",padding:40 }}>Завантаження…</div> : (
            filteredSetups.length===0
              ? <div style={{ ...S.card, textAlign:"center", color:"#475569", padding:40 }}>Сетапів у цій папці немає</div>
              : filteredSetups.map(s=>(
                <SetupCard
                  key={s.id}
                  setup={s}
                  buyers={buyers}
                  setupFolders={setupFolders}
                  isAdmin={isAdmin}
                  onEdit={()=>setModal({mode:"edit",data:s})}
                  onDelete={()=>delSetup(s.id)}
                  onRefresh={fetchAll}
                />
              ))
          )}

          {modal && (
            <Modal title={modal.mode==="add"?"Додати сетап":"Редагувати сетап"} onClose={()=>setModal(null)}>
              <SetupForm initial={modal.data} buyers={buyers} setupFolders={setupFolders} onSave={saveSetup} onClose={()=>setModal(null)} />
            </Modal>
          )}
        </>
      )}
    </div>
  );
}
