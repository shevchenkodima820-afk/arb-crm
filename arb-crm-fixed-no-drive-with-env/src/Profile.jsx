import { useState, useRef } from "react";
import { supabase } from "./supabase";

const S = {
  inp: { background:"#0f1117", border:"1px solid #2e3240", borderRadius:8, color:"#e2e8f0", padding:"10px 14px", width:"100%", fontSize:14, outline:"none" },
  btn: { background:"#3b82f6", border:"none", color:"#fff", borderRadius:8, padding:"10px 22px", cursor:"pointer", fontWeight:600, fontSize:14 },
  btnGhost: { background:"#1e2330", border:"1px solid #2e3240", color:"#94a3b8", borderRadius:8, padding:"10px 22px", cursor:"pointer", fontSize:14 },
  card: { background:"#13151c", border:"1px solid #1e2330", borderRadius:14, padding:28, marginBottom:16 },
};

const Field = ({ label, hint, children }) => (
  <div style={{ marginBottom:18 }}>
    <label style={{ display:"block", color:"#94a3b8", fontSize:12, fontWeight:600, marginBottom:6 }}>{label}</label>
    {children}
    {hint && <div style={{ color:"#475569", fontSize:11, marginTop:5 }}>{hint}</div>}
  </div>
);

const Toast = ({ msg, type }) => msg ? (
  <div style={{ position:"fixed", bottom:24, right:24, background:type==="error"?"#dc2626":"#16a34a", color:"#fff", borderRadius:10, padding:"12px 22px", fontSize:14, fontWeight:600, zIndex:999, boxShadow:"0 4px 20px #0008" }}>{msg}</div>
) : null;

export default function ProfileTab({ user, profile, onProfileUpdate }) {
  const [name, setName] = useState(profile?.full_name || "");
  const [avatar, setAvatar] = useState(profile?.avatar_url || "");
  const [uploading, setUploading] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);

  const [oldPass, setOldPass] = useState("");
  const [newPass, setNewPass] = useState("");
  const [confirmPass, setConfirmPass] = useState("");
  const [savingPass, setSavingPass] = useState(false);

  const [inviteLink, setInviteLink] = useState("");
  const [copied, setCopied] = useState(false);

  const [toast, setToast] = useState(null);
  const fileRef = useRef();

  const showToast = (msg, type="ok") => { setToast({msg,type}); setTimeout(()=>setToast(null),3500); };

  const ROLE_MAP = { admin:"Адміністратор", teamlead:"Тім лід", buyer:"Байєр" };
  const ROLE_COLOR = { admin:"#a78bfa", teamlead:"#fb923c", buyer:"#38bdf8" };

  // ── Аватар ─────────────────────────────────────────────────────────────
  const uploadAvatar = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    const path = `avatars/${user.id}.${file.name.split(".").pop()}`;
    const { error } = await supabase.storage.from("creatives").upload(path, file, { upsert: true });
    if (!error) {
      const { data } = supabase.storage.from("creatives").getPublicUrl(path);
      setAvatar(data.publicUrl);
    }
    setUploading(false);
  };

  // ── Зберегти профіль ───────────────────────────────────────────────────
  const saveProfile = async () => {
    setSavingProfile(true);
    const { error } = await supabase.from("profiles").update({
      full_name: name,
      avatar_url: avatar,
    }).eq("id", user.id);
    if (error) showToast("❌ "+error.message,"error");
    else {
      showToast("Профіль збережено ✓");
      if (onProfileUpdate) onProfileUpdate({ ...profile, full_name: name, avatar_url: avatar });
    }
    setSavingProfile(false);
  };

  // ── Зміна паролю ───────────────────────────────────────────────────────
  const changePassword = async () => {
    if (!newPass || newPass.length < 6) { showToast("❌ Пароль мінімум 6 символів","error"); return; }
    if (newPass !== confirmPass) { showToast("❌ Паролі не співпадають","error"); return; }
    setSavingPass(true);
    const { error } = await supabase.auth.updateUser({ password: newPass });
    if (error) showToast("❌ "+error.message,"error");
    else {
      showToast("Пароль змінено ✓");
      setOldPass(""); setNewPass(""); setConfirmPass("");
    }
    setSavingPass(false);
  };

  // ── Запрошення ─────────────────────────────────────────────────────────
  const generateInvite = () => {
    const base = window.location.origin;
    const link = `${base}?invite=${btoa(user.id + ":" + Date.now())}`;
    setInviteLink(link);
  };

  const copyLink = () => {
    navigator.clipboard.writeText(inviteLink);
    setCopied(true);
    setTimeout(()=>setCopied(false), 2000);
    showToast("Посилання скопійовано ✓");
  };

  const initials = name ? name.split(" ").map(w=>w[0]).join("").toUpperCase().slice(0,2) : "?";
  const roleLabel = ROLE_MAP[profile?.role] || "Байєр";
  const roleColor = ROLE_COLOR[profile?.role] || "#38bdf8";

  return (
    <div style={{ maxWidth:680, margin:"0 auto" }}>
      <Toast msg={toast?.msg} type={toast?.type} />

      {/* ── ПРОФІЛЬ ─── */}
      <div style={S.card}>
        <h3 style={{ color:"#e2e8f0", fontSize:16, fontWeight:800, margin:"0 0 20px" }}>👤 Мій профіль</h3>

        <div style={{ display:"flex", gap:20, alignItems:"flex-start", marginBottom:24 }}>
          {/* Аватар */}
          <div style={{ position:"relative", flexShrink:0 }}>
            <div
              onClick={() => fileRef.current.click()}
              style={{ width:80, height:80, borderRadius:"50%", background: avatar ? "transparent" : "#1e2330", border:"2px solid #2e3240", display:"flex", alignItems:"center", justifyContent:"center", cursor:"pointer", overflow:"hidden", position:"relative" }}
            >
              {avatar
                ? <img src={avatar} alt="" style={{ width:"100%", height:"100%", objectFit:"cover" }} onError={e=>e.target.style.display="none"} />
                : <span style={{ fontSize:26, fontWeight:800, color:roleColor }}>{initials}</span>
              }
              <div style={{ position:"absolute", inset:0, background:"#000a", display:"flex", alignItems:"center", justifyContent:"center", opacity:0, transition:"opacity 0.2s" }}
                onMouseEnter={e=>e.currentTarget.style.opacity=1}
                onMouseLeave={e=>e.currentTarget.style.opacity=0}
              >
                <span style={{ color:"#fff", fontSize:12 }}>📷</span>
              </div>
            </div>
            <input ref={fileRef} type="file" accept="image/*" style={{ display:"none" }} onChange={uploadAvatar} />
            {uploading && <div style={{ position:"absolute", inset:0, background:"#000a", borderRadius:"50%", display:"flex", alignItems:"center", justifyContent:"center", color:"#fff", fontSize:11 }}>…</div>}
          </div>

          <div style={{ flex:1 }}>
            <div style={{ color:"#e2e8f0", fontSize:18, fontWeight:800, marginBottom:4 }}>{name || "Ім'я не вказано"}</div>
            <div style={{ color:"#64748b", fontSize:13, marginBottom:8 }}>{user.email}</div>
            <span style={{ background:`${roleColor}22`, color:roleColor, border:`1px solid ${roleColor}44`, borderRadius:6, padding:"3px 10px", fontSize:12, fontWeight:700 }}>{roleLabel}</span>
          </div>
        </div>

        <Field label="Ім'я та прізвище">
          <input style={S.inp} value={name} onChange={e=>setName(e.target.value)} placeholder="Введіть ім'я" />
        </Field>

        <Field label="Email" hint="Email не можна змінити">
          <input style={{ ...S.inp, opacity:0.5, cursor:"not-allowed" }} value={user.email} disabled />
        </Field>

        <div style={{ display:"flex", justifyContent:"flex-end" }}>
          <button onClick={saveProfile} disabled={savingProfile} style={{ ...S.btn, opacity:savingProfile?0.7:1 }}>
            {savingProfile ? "Збереження…" : "Зберегти профіль"}
          </button>
        </div>
      </div>

      {/* ── ПАРОЛЬ ─── */}
      <div style={S.card}>
        <h3 style={{ color:"#e2e8f0", fontSize:16, fontWeight:800, margin:"0 0 20px" }}>🔒 Зміна паролю</h3>

        <Field label="Новий пароль">
          <input style={S.inp} type="password" value={newPass} onChange={e=>setNewPass(e.target.value)} placeholder="Мінімум 6 символів" />
        </Field>
        <Field label="Підтвердити пароль">
          <input style={S.inp} type="password" value={confirmPass} onChange={e=>setConfirmPass(e.target.value)} placeholder="Повторіть пароль" onKeyDown={e=>e.key==="Enter"&&changePassword()} />
        </Field>

        {newPass && newPass === confirmPass && (
          <div style={{ color:"#4ade80", fontSize:12, marginBottom:12 }}>✓ Паролі співпадають</div>
        )}
        {newPass && confirmPass && newPass !== confirmPass && (
          <div style={{ color:"#f87171", fontSize:12, marginBottom:12 }}>✗ Паролі не співпадають</div>
        )}

        <div style={{ display:"flex", justifyContent:"flex-end" }}>
          <button onClick={changePassword} disabled={savingPass||!newPass||!confirmPass} style={{ ...S.btn, opacity:(savingPass||!newPass||!confirmPass)?0.5:1 }}>
            {savingPass ? "Збереження…" : "Змінити пароль"}
          </button>
        </div>
      </div>

      {/* ── ЗАПРОШЕННЯ ─── */}
      <div style={S.card}>
        <h3 style={{ color:"#e2e8f0", fontSize:16, fontWeight:800, margin:"0 0 8px" }}>🔗 Запросити користувача</h3>
        <p style={{ color:"#64748b", fontSize:13, margin:"0 0 20px" }}>Згенеруйте посилання і надішліть новому байєру — він зможе зареєструватись за ним.</p>

        {!inviteLink ? (
          <button onClick={generateInvite} style={S.btn}>Генерувати посилання</button>
        ) : (
          <div>
            <div style={{ background:"#0f1117", border:"1px solid #2e3240", borderRadius:8, padding:"10px 14px", marginBottom:12, display:"flex", alignItems:"center", gap:10 }}>
              <span style={{ color:"#60a5fa", fontSize:13, flex:1, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{inviteLink}</span>
            </div>
            <div style={{ display:"flex", gap:10 }}>
              <button onClick={copyLink} style={{ ...S.btn, background: copied?"#16a34a":"#3b82f6" }}>
                {copied ? "✓ Скопійовано!" : "📋 Копіювати"}
              </button>
              <button onClick={generateInvite} style={S.btnGhost}>🔄 Нове посилання</button>
            </div>
            <div style={{ color:"#475569", fontSize:11, marginTop:10 }}>⚠️ Посилання веде на сторінку реєстрації. Новий користувач отримає роль Байєр за замовчуванням.</div>
          </div>
        )}
      </div>

    </div>
  );
}
