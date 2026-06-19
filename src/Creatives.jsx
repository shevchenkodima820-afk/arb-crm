import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "./supabase";

const S = {
  page: { background:"#fff", color:"#202124", border:"1px solid #e5e7eb", borderRadius:16, overflow:"hidden", minHeight:"calc(100vh - 150px)", boxShadow:"0 2px 10px #00000012" },
  inp: { background:"#fff", border:"1px solid #e5e7eb", borderRadius:8, color:"#202124", padding:"10px 12px", width:"100%", fontSize:14, outline:"none" },
  btn: { background:"#2563eb", border:"none", color:"#fff", borderRadius:8, padding:"10px 18px", cursor:"pointer", fontWeight:800, fontSize:14 },
  btnGhost: { background:"#fff", border:"1px solid #e5e7eb", color:"#202124", borderRadius:8, padding:"10px 16px", cursor:"pointer", fontWeight:700, fontSize:14 },
  muted: { color:"#9ca3af" },
};

const TYPE_OPTIONS = [
  ["all", "Всі"],
  ["photo", "Фото"],
  ["video", "Відео"],
];
const ORIENTATION_OPTIONS = [
  ["all", "Всі"],
  ["square", "Квадрат"],
  ["portrait", "Портрет"],
  ["album", "Альбом"],
];
const DURATION_OPTIONS = [
  ["all", "Всі"],
  ["lt30", "< 30 сек"],
  ["30to120", "30 сек - 2 хв"],
  ["gt120", "> 2 хв"],
];

const emptyUpload = {
  name:"",
  folder_id:"",
  domain_id:"",
  status:"тест",
  buyer:"",
  media_type:"photo",
  orientation:"square",
  duration_bucket:"",
  preview_url:"",
};

function CheckboxLine({ checked, onChange, label }) {
  return (
    <label style={{ display:"flex", alignItems:"center", gap:10, color:"#202124", fontWeight:700, fontSize:14, margin:"9px 0", cursor:"pointer" }}>
      <input type="checkbox" checked={checked} onChange={e=>onChange(e.target.checked)} style={{ width:18, height:18, accentColor:"#202124" }} />
      {label}
    </label>
  );
}

function FilterGroup({ title, value, onChange, options }) {
  return (
    <div style={{ marginBottom:26 }}>
      <div style={{ color:"#6b7280", fontWeight:800, fontSize:13, marginBottom:10 }}>{title}</div>
      {options.map(([key, label]) => (
        <CheckboxLine key={key} label={label} checked={value === key} onChange={() => onChange(key)} />
      ))}
    </div>
  );
}

function Modal({ title, children, onClose }) {
  return (
    <div style={{ position:"fixed", inset:0, background:"#0007", zIndex:1000, display:"flex", alignItems:"center", justifyContent:"center" }}>
      <div style={{ background:"#fff", color:"#202124", width:"min(620px,96vw)", maxHeight:"90vh", overflowY:"auto", borderRadius:16, boxShadow:"0 20px 80px #0004", padding:24 }}>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:18 }}>
          <h3 style={{ margin:0, fontSize:18, fontWeight:900 }}>{title}</h3>
          <button onClick={onClose} style={{ border:"none", background:"transparent", cursor:"pointer", fontSize:24, color:"#6b7280" }}>×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function detectType(url = "", file) {
  const type = file?.type || "";
  if (type.startsWith("video/")) return "video";
  if (type.startsWith("image/")) return "photo";
  const clean = url.split("?")[0].toLowerCase();
  if (/\.(mp4|mov|webm|avi|mkv)$/.test(clean)) return "video";
  return "photo";
}


async function copyCreativeToGoogleDrive({ fileUrl, originalName, creativeName, folderName, tags, crmCreativeId, mimeType }) {
  const payload = { fileUrl, originalName, creativeName, folderName, tags, crmCreativeId, mimeType };

  async function getFreshSession() {
    let { data: { session } } = await supabase.auth.getSession();
    const expiresAtMs = session?.expires_at ? session.expires_at * 1000 : 0;
    if (!session?.access_token || (expiresAtMs && expiresAtMs < Date.now() + 60000)) {
      const refreshed = await supabase.auth.refreshSession();
      session = refreshed.data?.session || session;
    }
    if (!session?.access_token) throw new Error("Немає активної сесії. Перелогінься в CRM.");
    return session;
  }

  async function postWithSession(session) {
    const res = await fetch("/api/google-drive-upload", {
      method:"POST",
      headers:{
        "Content-Type":"application/json",
        Authorization:`Bearer ${session.access_token}`,
      },
      body:JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error(data?.error || `Google Drive upload error ${res.status}`), { status:res.status });
    return data;
  }

  try {
    return await postWithSession(await getFreshSession());
  } catch (e) {
    if (e.status !== 401) throw e;
    const refreshed = await supabase.auth.refreshSession();
    const session = refreshed.data?.session;
    if (!session?.access_token) throw new Error("Сесія CRM застаріла. Вийди і зайди знову.");
    return postWithSession(session);
  }
}

function defaultFolderName(row) {
  return row.folder_name || row.buyer || "Unsorted";
}

function field(row, key, fallback = "") {
  return row[key] ?? fallback;
}

export default function CreativesLibraryTab({ user, isAdmin, domains = [] }) {
  const [creatives, setCreatives] = useState([]);
  const [folders, setFolders] = useState([]);
  const [selectedFolder, setSelectedFolder] = useState(null);
  const [filterType, setFilterType] = useState("all");
  const [filterOrientation, setFilterOrientation] = useState("all");
  const [filterDuration, setFilterDuration] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [neverLaunched, setNeverLaunched] = useState(false);
  const [archived, setArchived] = useState(false);
  const [search, setSearch] = useState("");
  const [view, setView] = useState("grid");
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [upload, setUpload] = useState(emptyUpload);
  const [uploadFiles, setUploadFiles] = useState([]);
  const [uploadFolderKey, setUploadFolderKey] = useState("derived:Unsorted");
  const [uploadTags, setUploadTags] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef(null);

  const showToast = (msg, type = "ok") => { setToast({ msg, type }); setTimeout(()=>setToast(null), 3500); };

  const fetchData = async () => {
    setLoading(true);
    const { data:c, error:ce } = await supabase.from("creatives").select("*").order("created_at", { ascending:false });
    if (ce) showToast("Помилка креативів: " + ce.message, "error");
    setCreatives(c || []);

    const { data:f, error:fe } = await supabase.from("creative_folders").select("*").order("name", { ascending:true });
    if (!fe) setFolders(f || []);
    else setFolders([]);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const folderCards = useMemo(() => {
    const map = new Map();
    folders.forEach(f => map.set(`folder:${f.id}`, { id:f.id, key:`folder:${f.id}`, name:f.name, db:true, count:0 }));
    creatives.forEach(c => {
      const folderId = c.folder_id;
      if (folderId && map.has(`folder:${folderId}`)) {
        map.get(`folder:${folderId}`).count += 1;
        return;
      }
      const name = defaultFolderName(c);
      const key = `derived:${name}`;
      if (!map.has(key)) map.set(key, { id:null, key, name, db:false, count:0 });
      map.get(key).count += 1;
    });
    if (!map.has("derived:Unsorted")) map.set("derived:Unsorted", { id:null, key:"derived:Unsorted", name:"Unsorted", db:false, count:0 });
    return [...map.values()].sort((a,b) => a.name.localeCompare(b.name));
  }, [folders, creatives]);

  const filteredCreatives = useMemo(() => {
    const q = search.trim().toLowerCase();
    return creatives.filter(c => {
      const mediaType = field(c, "media_type", detectType(c.preview_url));
      const orientation = field(c, "orientation", "square");
      const duration = field(c, "duration_bucket", "");
      const created = (c.added_date || c.created_at || "").slice(0, 10);
      const folderName = defaultFolderName(c);

      if (selectedFolder) {
        if (selectedFolder.id) {
          if (c.folder_id !== selectedFolder.id) return false;
        } else if (folderName !== selectedFolder.name) return false;
      }
      if (filterType !== "all" && mediaType !== filterType) return false;
      if (filterOrientation !== "all" && orientation !== filterOrientation) return false;
      if (filterDuration !== "all" && duration !== filterDuration) return false;
      if (dateFrom && created < dateFrom) return false;
      if (dateTo && created > dateTo) return false;
      if (neverLaunched && Number(c.launched_count || 0) > 0) return false;
      if (archived && !c.archived) return false;
      if (!archived && c.archived) return false;
      if (q && ![c.name, c.buyer, c.status, c.preview_url, folderName].join(" ").toLowerCase().includes(q)) return false;
      return true;
    });
  }, [creatives, selectedFolder, filterType, filterOrientation, filterDuration, dateFrom, dateTo, neverLaunched, archived, search]);

  const createFolder = async () => {
    const name = prompt("Назва нової папки");
    if (!name?.trim()) return;
    const { error } = await supabase.from("creative_folders").insert([{ name:name.trim(), user_id:user.id }]);
    if (error) showToast("Не можу створити папку. Виконай SQL migration creative_folders. " + error.message, "error");
    else { showToast("Папку створено"); fetchData(); }
  };

  const openUpload = () => {
    const key = selectedFolder?.key || "derived:Unsorted";
    setUpload({ ...emptyUpload, folder_id:selectedFolder?.id || "", buyer:selectedFolder?.id ? "" : selectedFolder?.name === "Unsorted" ? "" : selectedFolder?.name || "" });
    setUploadFolderKey(key);
    setUploadFiles([]);
    setUploadTags("");
    setDragOver(false);
    setUploadOpen(true);
  };

  const closeUpload = () => {
    setUploadOpen(false);
    setUpload(emptyUpload);
    setUploadFiles([]);
    setUploadTags("");
    setDragOver(false);
  };

  const selectUploadFolder = (folder) => {
    setUploadFolderKey(folder.key);
    setUpload(prev => ({
      ...prev,
      folder_id:folder.id || "",
      buyer:folder.id || folder.name === "Unsorted" ? "" : folder.name,
    }));
  };

  const addUploadFiles = (files) => {
    const list = Array.from(files || []).filter(file => file.type.startsWith("image/") || file.type.startsWith("video/"));
    if (!list.length) return;
    setUploadFiles(prev => [...prev, ...list]);
    if (!upload.name && list.length === 1) {
      const file = list[0];
      setUpload(prev => ({ ...prev, name:file.name.replace(/\.[^.]+$/, ""), media_type:detectType("", file) }));
    }
  };

  const saveCreative = async () => {
    if (!uploadFiles.length && !upload.preview_url) { showToast("Додай файли або URL", "error"); return; }
    setUploading(true);

    const tags = uploadTags.split(",").map(t => t.trim()).filter(Boolean);
    const selectedUploadFolder = folderCards.find(f => f.key === uploadFolderKey);
    const basePayload = {
      user_id:user.id,
      domain_id:upload.domain_id || null,
      status:upload.status || "тест",
      buyer:upload.buyer || (selectedUploadFolder?.id || selectedUploadFolder?.name === "Unsorted" ? "" : selectedUploadFolder?.name || ""),
      spend:0,
      revenue:0,
      ctr:0,
      cr:0,
      installs:0,
      regy:0,
      ftd:0,
      added_date:new Date().toISOString().slice(0,10),
      folder_id:upload.folder_id || null,
      orientation:upload.orientation,
      duration_bucket:upload.duration_bucket || null,
      archived:false,
      launched_count:0,
      tags,
    };

    const payloads = [];
    if (upload.preview_url && !uploadFiles.length) {
      payloads.push({ ...basePayload, name:upload.name || "creative", preview_url:upload.preview_url, media_type:detectType(upload.preview_url) });
    }

    for (const file of uploadFiles) {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const path = `${user.id}/${Date.now()}-${Math.random().toString(36).slice(2)}-${safeName}`;
      const { error } = await supabase.storage.from("creatives").upload(path, file, { upsert:false });
      if (error) {
        showToast("Upload error: " + error.message, "error");
        setUploading(false);
        return;
      }
      const { data } = supabase.storage.from("creatives").getPublicUrl(path);
      payloads.push({
        ...basePayload,
        name:uploadFiles.length === 1 && upload.name ? upload.name : file.name.replace(/\.[^.]+$/, ""),
        preview_url:data.publicUrl,
        media_type:detectType(data.publicUrl, file),
      });
    }

    let inserted = [];
    let { data:insertedData, error } = await supabase.from("creatives").insert(payloads).select();
    if (error && /folder_id|media_type|orientation|duration_bucket|archived|launched_count|tags|google_drive/i.test(error.message)) {
      const fallback = payloads.map(payload => {
        const copy = { ...payload };
        delete copy.folder_id;
        delete copy.media_type;
        delete copy.orientation;
        delete copy.duration_bucket;
        delete copy.archived;
        delete copy.launched_count;
        delete copy.tags;
        delete copy.google_drive_file_id;
        delete copy.google_drive_web_url;
        delete copy.google_drive_folder_id;
        return copy;
      });
      ({ data:insertedData, error } = await supabase.from("creatives").insert(fallback).select());
    }
    inserted = insertedData || [];

    if (error) {
      setUploading(false);
      showToast("Помилка збереження: " + error.message, "error");
      return;
    }

    let driveUploaded = 0;
    let driveFailed = 0;
    const driveErrors = [];
    const driveFolderName = selectedUploadFolder?.name || "Unsorted";

    for (const creative of inserted) {
      try {
        const drive = await copyCreativeToGoogleDrive({
          fileUrl:creative.preview_url,
          originalName:creative.name,
          creativeName:creative.name,
          folderName:driveFolderName,
          tags,
          crmCreativeId:creative.id,
          mimeType:creative.media_type === "video" ? "video/mp4" : undefined,
        });
        driveUploaded += 1;
        await supabase.from("creatives").update({
          google_drive_file_id:drive.fileId,
          google_drive_web_url:drive.webViewLink,
          google_drive_folder_id:drive.folderId,
        }).eq("id", creative.id);
      } catch (driveError) {
        driveFailed += 1;
        driveErrors.push(driveError.message || String(driveError));
        try { await supabase.from("creatives").update({ google_drive_error:driveError.message }).eq("id", creative.id); } catch {}
      }
    }

    setUploading(false);
    showToast(driveFailed ? `Завантажено ${payloads.length}. Drive помилка [drive-oauth-noauth-v4]: ${driveErrors[0] || `${driveFailed} помилок`}` : `Завантажено ${payloads.length} і скопійовано в Google Drive`, driveFailed ? "error" : "ok");
    closeUpload();
    fetchData();
  };

  const archiveCreative = async (creative) => {
    const { error } = await supabase.from("creatives").update({ archived:!creative.archived }).eq("id", creative.id);
    if (error) showToast("Для архіву виконай SQL migration: " + error.message, "error");
    else fetchData();
  };

  const GridIcon = () => <span style={{ fontSize:21, lineHeight:1 }}>▦</span>;
  const ListIcon = () => <span style={{ fontSize:22, lineHeight:1 }}>☷</span>;

  return (
    <div style={S.page}>
      {toast && <div style={{ position:"fixed", bottom:24, right:24, zIndex:9999, background:toast.type === "error" ? "#dc2626" : "#16a34a", color:"#fff", padding:"12px 18px", borderRadius:10, fontWeight:800 }}>{toast.msg}</div>}

      <div style={{ display:"grid", gridTemplateColumns:"260px 1fr", minHeight:"calc(100vh - 150px)" }}>
        <aside style={{ borderRight:"1px solid #eef0f3", background:"#fff" }}>
          <div style={{ padding:"18px 22px", borderBottom:"1px solid #eef0f3", fontWeight:900, fontSize:16 }}>Фільтри</div>
          <div style={{ padding:22 }}>
            <FilterGroup title="Тип" value={filterType} onChange={setFilterType} options={TYPE_OPTIONS} />
            <FilterGroup title="Орієнтація" value={filterOrientation} onChange={setFilterOrientation} options={ORIENTATION_OPTIONS} />
            <FilterGroup title="Тривалість" value={filterDuration} onChange={setFilterDuration} options={DURATION_OPTIONS} />

            <div style={{ marginBottom:24 }}>
              <div style={{ color:"#6b7280", fontWeight:800, fontSize:13, marginBottom:10 }}>Дата додавання</div>
              <input style={{ ...S.inp, marginBottom:8 }} type="date" value={dateFrom} onChange={e=>setDateFrom(e.target.value)} />
              <input style={S.inp} type="date" value={dateTo} onChange={e=>setDateTo(e.target.value)} />
            </div>

            <CheckboxLine checked={neverLaunched} onChange={setNeverLaunched} label={<span>Жодного разу не<br />запущено</span>} />
            <CheckboxLine checked={archived} onChange={setArchived} label="В архіві" />
          </div>
        </aside>

        <main style={{ minWidth:0, background:"#fff" }}>
          <div style={{ height:64, display:"flex", alignItems:"center", gap:14, borderBottom:"1px solid #eef0f3", padding:"0 20px" }}>
            <div style={{ position:"relative", width:"min(560px,50vw)" }}>
              <span style={{ position:"absolute", left:12, top:"50%", transform:"translateY(-50%)", color:"#9ca3af" }}>⌕</span>
              <input style={{ ...S.inp, paddingLeft:32, fontSize:15 }} value={search} onChange={e=>setSearch(e.target.value)} placeholder="Пошук або нові критерії пошуку" />
            </div>
            <div style={{ flex:1 }} />
            <span style={{ color:"#9ca3af", fontWeight:700 }}>{selectedFolder ? filteredCreatives.length : folderCards.length}</span>
            <button onClick={()=>setView("grid")} style={{ ...S.btn, padding:"11px 13px", background:view === "grid" ? "#2563eb" : "#fff", color:view === "grid" ? "#fff" : "#202124", border:view === "grid" ? "none" : "1px solid #e5e7eb" }}><GridIcon /></button>
            <button onClick={()=>setView("list")} style={{ ...S.btnGhost, padding:"10px 13px", background:view === "list" ? "#2563eb" : "#fff", color:view === "list" ? "#fff" : "#202124" }}><ListIcon /></button>
            <button onClick={openUpload} style={{ ...S.btn, display:"flex", alignItems:"center", gap:8 }}>↥ Завантажити</button>
          </div>

          <div style={{ height:64, display:"flex", alignItems:"center", justifyContent:"space-between", padding:"0 24px", borderBottom:"1px solid #f3f4f6" }}>
            <div>
              {selectedFolder ? (
                <button onClick={()=>setSelectedFolder(null)} style={{ border:"none", background:"transparent", color:"#2563eb", cursor:"pointer", fontWeight:800 }}>← Усі папки / {selectedFolder.name}</button>
              ) : <span style={{ color:"#9ca3af", fontSize:13 }}>{loading ? "Завантаження…" : ""}</span>}
            </div>
            <button onClick={createFolder} style={{ border:"none", background:"transparent", color:"#202124", cursor:"pointer", fontWeight:900, fontSize:15 }}>✚ Нова папка</button>
          </div>

          {!selectedFolder ? (
            <div style={{ padding:22 }}>
              <div style={{ display:view === "grid" ? "grid" : "block", gridTemplateColumns:"repeat(auto-fill, minmax(190px, 1fr))", gap:14 }}>
                {folderCards.map(folder => view === "grid" ? (
                  <button key={folder.key} onClick={()=>setSelectedFolder(folder)} style={{ height:190, border:"none", borderRadius:8, background:"#fafafa", cursor:"pointer", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:14 }}>
                    <div style={{ fontSize:54, color:"#f4b400", lineHeight:1 }}>📁</div>
                    <div style={{ fontWeight:900, fontSize:15, color:"#202124" }}>{folder.name}</div>
                    <div style={{ background:"#f3f4f6", color:"#4b5563", borderRadius:8, padding:"3px 9px", fontWeight:800, fontSize:12 }}>{folder.count}</div>
                  </button>
                ) : (
                  <button key={folder.key} onClick={()=>setSelectedFolder(folder)} style={{ width:"100%", border:"none", borderBottom:"1px solid #f3f4f6", background:"#fff", cursor:"pointer", display:"flex", alignItems:"center", gap:14, padding:"14px 8px" }}>
                    <span style={{ fontSize:28 }}>📁</span><span style={{ fontWeight:900 }}>{folder.name}</span><span style={{ marginLeft:"auto", color:"#6b7280" }}>{folder.count}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div style={{ padding:22 }}>
              {filteredCreatives.length === 0 ? <div style={{ color:"#9ca3af", textAlign:"center", padding:60 }}>У цій папці немає креативів</div> : null}
              <div style={{ display:view === "grid" ? "grid" : "block", gridTemplateColumns:"repeat(auto-fill, minmax(210px, 1fr))", gap:14 }}>
                {filteredCreatives.map(c => {
                  const mediaType = field(c, "media_type", detectType(c.preview_url));
                  return view === "grid" ? (
                    <div key={c.id} style={{ background:"#fafafa", borderRadius:10, overflow:"hidden", border:"1px solid #f0f0f0" }}>
                      <div style={{ height:150, background:"#f3f4f6", display:"flex", alignItems:"center", justifyContent:"center" }}>
                        {c.preview_url ? mediaType === "video" ? <video src={c.preview_url} style={{ width:"100%", height:"100%", objectFit:"cover" }} muted /> : <img src={c.preview_url} alt="" style={{ width:"100%", height:"100%", objectFit:"cover" }} /> : <span style={{ color:"#9ca3af", fontSize:36 }}>🖼</span>}
                      </div>
                      <div style={{ padding:12 }}>
                        <div style={{ fontWeight:900, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{c.name || "creative"}</div>
                        <div style={{ color:"#9ca3af", fontSize:12, marginTop:4 }}>{mediaType} · {c.added_date || c.created_at?.slice(0,10) || "—"}</div>
                        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginTop:10 }}>
                          <span style={{ color:c.status === "активний" ? "#16a34a" : "#6b7280", fontSize:12, fontWeight:800 }}>{c.status}</span>
                          {c.google_drive_web_url && <a href={c.google_drive_web_url} target="_blank" rel="noreferrer" style={{ color:"#2563eb", fontSize:12, fontWeight:900, textDecoration:"none" }}>Drive</a>}
                          <button onClick={()=>archiveCreative(c)} style={{ border:"none", background:"transparent", cursor:"pointer", color:"#6b7280" }}>{c.archived ? "↩" : "Архів"}</button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div key={c.id} style={{ display:"flex", alignItems:"center", gap:12, padding:"12px 8px", borderBottom:"1px solid #f3f4f6" }}>
                      <div style={{ width:54, height:54, borderRadius:8, overflow:"hidden", background:"#f3f4f6", display:"flex", alignItems:"center", justifyContent:"center" }}>{c.preview_url ? <img src={c.preview_url} alt="" style={{ width:"100%", height:"100%", objectFit:"cover" }} /> : "🖼"}</div>
                      <div style={{ fontWeight:900 }}>{c.name}</div>
                      <div style={{ color:"#9ca3af" }}>{mediaType}</div>
                      {c.google_drive_web_url && <a href={c.google_drive_web_url} target="_blank" rel="noreferrer" style={{ color:"#2563eb", fontWeight:900, textDecoration:"none" }}>Drive</a>}
                      <div style={{ marginLeft:"auto", color:"#9ca3af" }}>{c.added_date || c.created_at?.slice(0,10)}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </main>
      </div>

      {uploadOpen && (
        <div style={{ position:"fixed", inset:0, zIndex:1000, background:"#0008", color:"#202124", display:"flex", alignItems:"flex-start", justifyContent:"center", overflowY:"auto", padding:"10px 24px 40px" }}>
          <div style={{ position:"relative", width:"min(900px, calc(100vw - 48px))", background:"#fff", borderRadius:8, boxShadow:"0 24px 90px #0005", padding:"32px 32px 26px", marginTop:0 }}>
            <button
              onClick={closeUpload}
              disabled={uploading}
              style={{ position:"absolute", top:6, right:6, width:54, height:54, border:"2px solid #9ca3af", borderRadius:12, background:"#fff", color:"#202124", fontSize:32, lineHeight:1, cursor:uploading ? "not-allowed" : "pointer", zIndex:1001 }}
              aria-label="Закрити"
            >×</button>

            <h1 style={{ margin:"4px 0 28px", fontSize:24, lineHeight:1.15, fontWeight:900 }}>Завантаження креативів</h1>

            <div
              onClick={()=>fileRef.current?.click()}
              onDragEnter={e=>{ e.preventDefault(); setDragOver(true); }}
              onDragOver={e=>{ e.preventDefault(); setDragOver(true); }}
              onDragLeave={e=>{ e.preventDefault(); setDragOver(false); }}
              onDrop={e=>{ e.preventDefault(); setDragOver(false); addUploadFiles(e.dataTransfer.files); }}
              style={{ height:270, border:`2px dashed ${dragOver ? "#60a5fa" : "#d1d5db"}`, borderRadius:12, background:dragOver ? "#f8fafc" : "#fff", display:"flex", alignItems:"center", justifyContent:"center", flexDirection:"column", cursor:"pointer", userSelect:"none" }}
            >
              <input ref={fileRef} type="file" multiple accept="image/*,video/*" style={{ display:"none" }} onChange={e=>addUploadFiles(e.target.files)} />
              <div style={{ color:"#9ca3af", fontSize:44, lineHeight:1, marginBottom:22 }}>☁</div>
              <div style={{ color:"#4b5563", fontSize:17, fontWeight:700, marginBottom:18 }}>Перетягніть файли сюди</div>
              <div style={{ color:"#9ca3af", fontSize:17 }}>або натисніть для вибору</div>
              {uploadFiles.length > 0 && (
                <div style={{ marginTop:28, background:"#fff", border:"1px solid #dbeafe", borderRadius:12, padding:"10px 16px", color:"#1d4ed8", fontSize:16, fontWeight:800 }}>
                  Обрано файлів: {uploadFiles.length}
                </div>
              )}
            </div>

            {uploadFiles.length > 0 && (
              <div style={{ marginTop:18, border:"1px solid #e5e7eb", borderRadius:10, overflow:"hidden" }}>
                {uploadFiles.slice(0, 6).map((file, idx) => (
                  <div key={`${file.name}-${idx}`} style={{ display:"flex", alignItems:"center", gap:10, padding:"10px 14px", borderBottom:idx === Math.min(uploadFiles.length, 6) - 1 ? "none" : "1px solid #f3f4f6", color:"#4b5563", fontSize:14 }}>
                    <span>{file.type.startsWith("video/") ? "🎬" : "🖼"}</span>
                    <span style={{ fontWeight:700 }}>{file.name}</span>
                    <span style={{ marginLeft:"auto", color:"#9ca3af" }}>{(file.size / 1024 / 1024).toFixed(2)} MB</span>
                  </div>
                ))}
                {uploadFiles.length > 6 && <div style={{ padding:"10px 14px", color:"#6b7280" }}>+ ще {uploadFiles.length - 6} файлів</div>}
              </div>
            )}

            <div style={{ marginTop:22 }}>
              <div style={{ color:"#6b7280", fontWeight:900, fontSize:15, marginBottom:10 }}>Папка</div>
              <div style={{ border:"1px solid #d1d5db", borderRadius:8, overflow:"hidden", maxHeight:245, overflowY:"auto" }}>
                {folderCards.map(folder => {
                  const selected = uploadFolderKey === folder.key;
                  const isUnsorted = folder.name === "Unsorted";
                  return (
                    <button
                      key={folder.key}
                      onClick={()=>selectUploadFolder(folder)}
                      style={{ width:"100%", border:"none", background:selected ? "#eff6ff" : "#fff", display:"flex", alignItems:"center", gap:12, padding:"9px 34px", color:selected ? "#1e40af" : "#3f3f46", fontSize:16, fontWeight:selected ? 900 : 500, cursor:"pointer", textAlign:"left" }}
                    >
                      <span style={{ color:"#f4b400", fontSize:18 }}>{isUnsorted ? "🗂" : "📁"}</span>
                      <span>{isUnsorted ? "Без вказівки (Unsorted)" : folder.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div style={{ marginTop:22 }}>
              <div style={{ color:"#6b7280", fontWeight:900, fontSize:15, marginBottom:10 }}>Теги (необов'язково)</div>
              <input
                style={{ width:"100%", boxSizing:"border-box", border:"1px solid #d1d5db", borderRadius:8, padding:"12px 16px", fontSize:17, color:"#3f3f46", outline:"none" }}
                value={uploadTags}
                onChange={e=>setUploadTags(e.target.value)}
                placeholder="Додати тег..."
              />
            </div>

            <div style={{ display:"flex", justifyContent:"flex-end", marginTop:30 }}>
              <button
                onClick={saveCreative}
                disabled={uploading || uploadFiles.length === 0}
                style={{ border:"none", borderRadius:12, background:uploading || uploadFiles.length === 0 ? "#93aef5" : "#2563eb", color:"#fff", fontSize:18, fontWeight:900, padding:"16px 30px", cursor:uploading || uploadFiles.length === 0 ? "not-allowed" : "pointer", minWidth:180 }}
              >
                {uploading ? "Завантажую…" : "Завантажити"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
