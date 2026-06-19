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

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────
export default function FbAccountsTab({ user, isAdmin, canSeeAll }) {
  const [setups, setSetups] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [buyers, setBuyers] = useState([]);
  const [modal, setModal] = useState(null);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState(null);
  const showToast = (msg, type="ok") => { setToast({msg,type}); setTimeout(()=>setToast(null),3500); };

  const fetchAll = async () => {
    setLoading(true);
    const [{ data: s }, { data: a }, { data: p }] = await Promise.all([
      supabase.from("fb_setups").select("*").order("created_at",{ascending:false}),
      supabase.from("fb_accounts").select("*"),
      supabase.from("profiles").select("id, full_name, role"),
    ]);
    if (s) setSetups(s);
    if (a) setAccounts(a);
    if (p) setBuyers(p);
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
    </div>
  );
}
