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
    setUpload({ ...emptyUpload, folder_id:selectedFolder?.id || "", buyer:selectedFolder?.id ? "" : selectedFolder?.name || "" });
    setUploadOpen(true);
  };

  const handleFile = async (file) => {
    if (!file) return;
    setUploading(true);
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `${user.id}/${Date.now()}-${safeName}`;
    const { error } = await supabase.storage.from("creatives").upload(path, file, { upsert:false });
    if (error) {
      showToast("Upload error: " + error.message, "error");
      setUploading(false);
      return;
    }
    const { data } = supabase.storage.from("creatives").getPublicUrl(path);
    setUpload(prev => ({ ...prev, preview_url:data.publicUrl, name:prev.name || file.name.replace(/\.[^.]+$/, ""), media_type:detectType(data.publicUrl, file) }));
    setUploading(false);
  };

  const saveCreative = async () => {
    if (!upload.name && !upload.preview_url) { showToast("Додай назву або файл", "error"); return; }
    const payload = {
      user_id:user.id,
      name:upload.name || "creative",
      preview_url:upload.preview_url,
      domain_id:upload.domain_id || null,
      status:upload.status || "тест",
      buyer:upload.buyer || selectedFolder?.name || "",
      spend:0,
      revenue:0,
      ctr:0,
      cr:0,
      installs:0,
      regy:0,
      ftd:0,
      added_date:new Date().toISOString().slice(0,10),
      folder_id:upload.folder_id || null,
      media_type:upload.media_type,
      orientation:upload.orientation,
      duration_bucket:upload.duration_bucket || null,
      archived:false,
      launched_count:0,
    };

    let { error } = await supabase.from("creatives").insert([payload]);
    if (error && /folder_id|media_type|orientation|duration_bucket|archived|launched_count/i.test(error.message)) {
      const fallback = { ...payload };
      delete fallback.folder_id;
      delete fallback.media_type;
      delete fallback.orientation;
      delete fallback.duration_bucket;
      delete fallback.archived;
      delete fallback.launched_count;
      ({ error } = await supabase.from("creatives").insert([fallback]));
    }

    if (error) showToast("Помилка збереження: " + error.message, "error");
    else {
      showToast("Креатив додано");
      setUploadOpen(false);
      setUpload(emptyUpload);
      fetchData();
    }
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
                          <button onClick={()=>archiveCreative(c)} style={{ border:"none", background:"transparent", cursor:"pointer", color:"#6b7280" }}>{c.archived ? "↩" : "Архів"}</button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div key={c.id} style={{ display:"flex", alignItems:"center", gap:12, padding:"12px 8px", borderBottom:"1px solid #f3f4f6" }}>
                      <div style={{ width:54, height:54, borderRadius:8, overflow:"hidden", background:"#f3f4f6", display:"flex", alignItems:"center", justifyContent:"center" }}>{c.preview_url ? <img src={c.preview_url} alt="" style={{ width:"100%", height:"100%", objectFit:"cover" }} /> : "🖼"}</div>
                      <div style={{ fontWeight:900 }}>{c.name}</div>
                      <div style={{ color:"#9ca3af" }}>{mediaType}</div>
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
        <Modal title="Завантажити креатив" onClose={()=>setUploadOpen(false)}>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
            <div><label style={{ fontWeight:800, fontSize:12 }}>Назва</label><input style={S.inp} value={upload.name} onChange={e=>setUpload(p=>({...p, name:e.target.value}))} /></div>
            <div><label style={{ fontWeight:800, fontSize:12 }}>Папка</label><select style={S.inp} value={upload.folder_id} onChange={e=>setUpload(p=>({...p, folder_id:e.target.value}))}><option value="">Unsorted / buyer</option>{folders.map(f=><option key={f.id} value={f.id}>{f.name}</option>)}</select></div>
            <div><label style={{ fontWeight:800, fontSize:12 }}>Тип</label><select style={S.inp} value={upload.media_type} onChange={e=>setUpload(p=>({...p, media_type:e.target.value}))}><option value="photo">Фото</option><option value="video">Відео</option></select></div>
            <div><label style={{ fontWeight:800, fontSize:12 }}>Орієнтація</label><select style={S.inp} value={upload.orientation} onChange={e=>setUpload(p=>({...p, orientation:e.target.value}))}><option value="square">Квадрат</option><option value="portrait">Портрет</option><option value="album">Альбом</option></select></div>
            <div><label style={{ fontWeight:800, fontSize:12 }}>Тривалість</label><select style={S.inp} value={upload.duration_bucket} onChange={e=>setUpload(p=>({...p, duration_bucket:e.target.value}))}><option value="">—</option><option value="lt30">&lt; 30 сек</option><option value="30to120">30 сек - 2 хв</option><option value="gt120">&gt; 2 хв</option></select></div>
            <div><label style={{ fontWeight:800, fontSize:12 }}>Домен</label><select style={S.inp} value={upload.domain_id} onChange={e=>setUpload(p=>({...p, domain_id:e.target.value}))}><option value="">—</option>{domains.map(d=><option key={d.id} value={d.id}>{d.domain}</option>)}</select></div>
          </div>
          <div style={{ marginTop:12 }}><label style={{ fontWeight:800, fontSize:12 }}>URL</label><input style={S.inp} value={upload.preview_url} onChange={e=>setUpload(p=>({...p, preview_url:e.target.value, media_type:detectType(e.target.value)}))} placeholder="або завантаж файл нижче" /></div>
          <div style={{ display:"flex", gap:10, alignItems:"center", marginTop:14 }}>
            <input ref={fileRef} type="file" accept="image/*,video/*" style={{ display:"none" }} onChange={e=>handleFile(e.target.files?.[0])} />
            <button onClick={()=>fileRef.current?.click()} disabled={uploading} style={S.btnGhost}>{uploading ? "Завантажую…" : "Обрати файл"}</button>
            {upload.preview_url && <span style={{ color:"#16a34a", fontWeight:800 }}>Файл/URL готовий</span>}
            <div style={{ flex:1 }} />
            <button onClick={()=>setUploadOpen(false)} style={S.btnGhost}>Скасувати</button>
            <button onClick={saveCreative} style={S.btn}>Зберегти</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
