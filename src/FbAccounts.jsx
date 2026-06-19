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
const SetupForm = ({ initial={}, buyers, onSave, onClose }) => {
  const [f, setF] = useState({
    name:"", token:"", buyer_id:"",
    proxy_type:"socks5", proxy_host:"", proxy_port:"",
    proxy_user:"", proxy_pass:"",
    ...initial
  });
  const set = k => e => setF(p=>({...p,[k]:e.target.value}));
  return (
    <div>
      <Field label="Назва сетапу"><input style={S.inp} value={f.name} onChange={set("name")} placeholder="Мій фарм #1" /></Field>
      <Field label="Байєр">
        <select style={{ ...S.inp, cursor:"pointer" }} value={f.buyer_id} onChange={set("buyer_id")}>
          <option value="">— виберіть байєра —</option>
          {buyers.map(b=><option key={b.id} value={b.id}>{b.full_name}</option>)}
        </select>
      </Field>
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
const SetupCard = ({ setup, buyers, isAdmin, onEdit, onDelete, onRefresh }) => {
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
  ready: "готовий",
  warming: "прогрів",
  banned: "бан",
  issue: "проблема",
};
const FARM_STATUS_COLOR = {
  new: "#60a5fa",
  ready: "#4ade80",
  warming: "#fbbf24",
  banned: "#f87171",
  issue: "#fb7185",
};

const emptyFarm = {
  name:"",
  buyer_id:"",
  cookie_data:"",
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

const FarmForm = ({ initial={}, buyers, onSave, onClose }) => {
  const editing = Boolean(initial.id);
  const [f, setF] = useState({
    ...emptyFarm,
    ...initial,
    cookie_data: editing ? "" : (initial.cookie_data || ""),
  });
  const set = k => e => setF(p=>({...p,[k]:e.target.value}));
  const applyProxyRaw = () => {
    const parsed = parseProxyString(f.proxy_raw);
    setF(p => ({ ...p, ...parsed }));
  };

  return (
    <div>
      <div style={{ background:"#0f1117", border:"1px solid #1e2330", borderRadius:10, padding:12, color:"#94a3b8", fontSize:12, marginBottom:14 }}>
        Cookie — це credential. Зберігай тільки власні/дозволені акаунти. У CRM cookie використовується як запис, без автоматичного логіну в Facebook.
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
        <Field label="Назва фарму"><input style={S.inp} value={f.name} onChange={set("name")} placeholder="FARM-001" /></Field>
        <Field label="Байєр">
          <select style={{ ...S.inp, cursor:"pointer" }} value={f.buyer_id || ""} onChange={set("buyer_id")}>
            <option value="">— не призначено —</option>
            {buyers.map(b=><option key={b.id} value={b.id}>{b.full_name}</option>)}
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
          style={{ ...S.inp, minHeight:120, resize:"vertical", fontFamily:"monospace", fontSize:12 }}
          value={f.cookie_data || ""}
          onChange={set("cookie_data")}
          placeholder={editing ? "Залиш пустим, якщо cookie не змінюється" : "Встав cookie рядок або JSON cookies"}
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

const BulkFarmImport = ({ buyers, user, onClose, onDone, showToast }) => {
  const [buyerId, setBuyerId] = useState("");
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

const FarmRow = ({ farm, buyers, isAdmin, onEdit, onDelete }) => {
  const buyer = buyers.find(b => b.id === farm.buyer_id);
  const statusKey = farm.status || "new";
  return (
    <div style={{ border:"1px solid #1e2330", borderRadius:12, background:"#13151c", padding:16, display:"grid", gridTemplateColumns:"1fr auto", gap:14, alignItems:"center" }}>
      <div style={{ minWidth:0 }}>
        <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:6 }}>
          <span style={{ width:9, height:9, borderRadius:"50%", background:FARM_STATUS_COLOR[statusKey] || "#64748b", display:"inline-block" }} />
          <div style={{ color:"#e2e8f0", fontWeight:800, fontSize:15, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{farm.name || "FARM"}</div>
          <span style={{ color:FARM_STATUS_COLOR[statusKey] || "#64748b", background:"#0f1117", border:"1px solid #1e2330", borderRadius:999, padding:"2px 8px", fontSize:11, fontWeight:800 }}>{FARM_STATUS[statusKey] || statusKey}</span>
        </div>
        <div style={{ color:"#64748b", fontSize:12, display:"flex", gap:12, flexWrap:"wrap" }}>
          <span>👤 {buyer?.full_name || "не призначено"}</span>
          <span>🍪 {maskSecret(farm.cookie_data)}</span>
          <span>🔒 {proxyLabel(farm)}</span>
          {farm.notes && <span>📝 {farm.notes}</span>}
        </div>
      </div>
      <div style={{ display:"flex", gap:8 }}>
        {isAdmin && <button onClick={onEdit} style={{ ...S.btnGhost, padding:"7px 10px" }}>✏️</button>}
        {isAdmin && <button onClick={onDelete} style={{ ...S.btnGhost, padding:"7px 10px", color:"#f87171" }}>🗑</button>}
      </div>
    </div>
  );
};

const FarmsPanel = ({ farms, buyers, user, isAdmin, onRefresh, showToast }) => {
  const [modal, setModal] = useState(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [q, setQ] = useState("");

  const filtered = farms.filter(f => {
    const text = [f.name, f.status, f.proxy_host, f.notes, buyers.find(b=>b.id===f.buyer_id)?.full_name].join(" ").toLowerCase();
    return !q.trim() || text.includes(q.trim().toLowerCase());
  });

  const stats = {
    total: farms.length,
    ready: farms.filter(f=>f.status === "ready").length,
    warming: farms.filter(f=>f.status === "warming").length,
    banned: farms.filter(f=>f.status === "banned").length,
    noProxy: farms.filter(f=>!f.proxy_host).length,
  };

  const saveFarm = async (f) => {
    if (!isAdmin) { showToast("Фарми може редагувати тільки адмін", "error"); return; }
    const payload = {
      name:f.name || "FARM",
      buyer_id:f.buyer_id || null,
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
    const { error } = await supabase.from("fb_farms").delete().eq("id", farm.id);
    if (error) { showToast("Помилка видалення: " + error.message, "error"); return; }
    showToast("Фарм видалено");
    onRefresh();
  };

  return (
    <div>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(130px,1fr))", gap:12, marginBottom:24 }}>
        {[["Фармів",stats.total,"#60a5fa"],["Готових",stats.ready,"#4ade80"],["На прогріві",stats.warming,"#fbbf24"],["Забанених",stats.banned,"#f87171"],["Без проксі",stats.noProxy,"#a78bfa"]].map(([l,v,c])=>(
          <div key={l} style={S.card}>
            <div style={{ color:"#64748b",fontSize:11,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.07em" }}>{l}</div>
            <div style={{ color:c,fontSize:22,fontWeight:800,marginTop:4 }}>{v}</div>
          </div>
        ))}
      </div>

      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", gap:12, marginBottom:16 }}>
        <div>
          <h3 style={{ color:"#e2e8f0", fontSize:16, fontWeight:700, margin:"0 0 4px" }}>ФАРМИ</h3>
          <div style={{ color:"#64748b", fontSize:12 }}>Cookie + proxy для акаунтів. Доступ до повних cookie не показується у списку.</div>
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
              buyers={buyers}
              isAdmin={isAdmin}
              onEdit={()=>setModal({ mode:"edit", data:farm })}
              onDelete={()=>deleteFarm(farm)}
            />
          ))}
        </div>
      )}

      {modal && (
        <Modal title={modal.mode === "edit" ? "Редагувати фарм" : "Додати фарм"} onClose={()=>setModal(null)}>
          <FarmForm initial={modal.data} buyers={buyers} onSave={saveFarm} onClose={()=>setModal(null)} />
        </Modal>
      )}
      {bulkOpen && <BulkFarmImport buyers={buyers} user={user} onClose={()=>setBulkOpen(false)} onDone={onRefresh} showToast={showToast} />}
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
  const [section, setSection] = useState("setups");
  const [modal, setModal] = useState(null);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState(null);
  const showToast = (msg, type="ok") => { setToast({msg,type}); setTimeout(()=>setToast(null),3500); };

  const fetchAll = async () => {
    setLoading(true);
    const [{ data: s }, { data: a }, { data: p }, farmsResult] = await Promise.all([
      supabase.from("fb_setups").select("*").order("created_at",{ascending:false}),
      supabase.from("fb_accounts").select("*"),
      supabase.from("profiles").select("id, full_name, role"),
      supabase.from("fb_farms").select("*").order("created_at",{ascending:false}),
    ]);
    if (s) setSetups(s);
    if (a) setAccounts(a);
    if (p) setBuyers(p);
    if (!farmsResult.error) setFarms(farmsResult.data || []);
    else setFarms([]);
    setLoading(false);
  };

  useEffect(()=>{ fetchAll(); },[]);

  const saveSetup = async (f) => {
    const payload = { name:f.name, token:f.token, buyer_id:f.buyer_id||null, proxy_type:f.proxy_type, proxy_host:f.proxy_host, proxy_port:f.proxy_port, proxy_user:f.proxy_user, proxy_pass:f.proxy_pass, user_id:user.id };
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
        <FarmsPanel farms={farms} buyers={buyers} user={user} isAdmin={isAdmin} onRefresh={fetchAll} showToast={showToast} />
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

          {/* Header */}
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
            <h3 style={{ color:"#e2e8f0", fontSize:16, fontWeight:700, margin:0 }}>ВАШІ СЕТАПИ</h3>
            <button onClick={()=>setModal({mode:"add",data:{}})} style={S.btn}>+ Додати сетап</button>
          </div>

          {/* Setups */}
          {loading ? <div style={{ textAlign:"center",color:"#475569",padding:40 }}>Завантаження…</div> : (
            setups.length===0
              ? <div style={{ ...S.card, textAlign:"center", color:"#475569", padding:40 }}>Немає сетапів — додайте перший</div>
              : setups.map(s=>(
                <SetupCard
                  key={s.id}
                  setup={s}
                  buyers={buyers}
                  isAdmin={isAdmin}
                  onEdit={()=>setModal({mode:"edit",data:s})}
                  onDelete={()=>delSetup(s.id)}
                  onRefresh={fetchAll}
                />
              ))
          )}

          {modal && (
            <Modal title={modal.mode==="add"?"Додати сетап":"Редагувати сетап"} onClose={()=>setModal(null)}>
              <SetupForm initial={modal.data} buyers={buyers} onSave={saveSetup} onClose={()=>setModal(null)} />
            </Modal>
          )}
        </>
      )}
    </div>
  );
}
