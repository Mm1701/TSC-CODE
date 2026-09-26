const sb = supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
let user = null;
let singleScanner = null;
let oldScanner = null;
let newScanner = null;
let oldBox = "";
let newBox = "";
let historyCache = [];
let pairCache = [];

document.addEventListener("DOMContentLoaded", async () => {
  bindUI();
  const { data } = await sb.auth.getSession();
  if (data.session) await showApp(data.session.user);
  else showLogin();
});

function bindUI() {
  $("#loginForm").addEventListener("submit", login);
  $("#logoutBtn").addEventListener("click", () => sb.auth.signOut());
  $("#themeBtn").addEventListener("click", toggleTheme);
  $("#mobileMenu").addEventListener("click", () => $(".sidebar").classList.toggle("open"));

  $$(".nav-item[data-page]").forEach(b => b.addEventListener("click", () => openPage(b.dataset.page)));
  $$("[data-go]").forEach(b => b.addEventListener("click", () => openPage(b.dataset.go)));

  $("#singleStart").addEventListener("click", () => startScanner("single"));
  $("#singleStop").addEventListener("click", () => stopScanner("single"));
  $("#singleManual").addEventListener("keydown", e => { if (e.key === "Enter") processSingle(e.target.value); });

  $("#oldManual").addEventListener("keydown", e => { if (e.key === "Enter") processOld(e.target.value); });
  $("#newManual").addEventListener("keydown", e => { if (e.key === "Enter") processNew(e.target.value); });
  $("#pairReset").addEventListener("click", resetPair);

  $("#historySearch").addEventListener("input", renderHistory);
  $("#pairSearch").addEventListener("input", renderPairs);

  $("#exportSingleBtn").addEventListener("click", exportSingles);
  $("#exportPairsBtn").addEventListener("click", exportPairs);
  $("#exportPairBtn").addEventListener("click", exportPairs);
  $("#importSingleBtn").addEventListener("click", importSingles);
  $("#importPairBtn").addEventListener("click", importPairs);

  sb.auth.onAuthStateChange(async (_event, session) => {
    if (session?.user) await showApp(session.user);
    else showLogin();
  });

  sb.channel("qr-live")
    .on("postgres_changes", { event: "*", schema: "public", table: "scan_logs" }, () => loadDashboard())
    .on("postgres_changes", { event: "*", schema: "public", table: "box_pairs" }, () => { loadDashboard(); loadPairs(); })
    .subscribe();
}

async function login(e) {
  e.preventDefault();
  $("#loginError").textContent = "";
  const { error } = await sb.auth.signInWithPassword({
    email: $("#email").value.trim(),
    password: $("#password").value
  });
  if (error) $("#loginError").textContent = error.message;
}

function showLogin() {
  $("#loginView").classList.remove("hidden");
  $("#appView").classList.add("hidden");
}

async function showApp(u) {
  user = u;
  $("#loginView").classList.add("hidden");
  $("#appView").classList.remove("hidden");
  $("#userEmail").textContent = u.email || "User";
  await loadDashboard();
  await loadHistory();
  await loadPairs();
}

function openPage(id) {
  $$(".page").forEach(p => p.classList.remove("active-page"));
  $("#" + id).classList.add("active-page");
  $$(".nav-item[data-page]").forEach(b => b.classList.toggle("active", b.dataset.page === id));
  $("#pageTitle").textContent = ({
    dashboard:"Dashboard", single:"QR đơn", pair:"OldBOX → NewBOX",
    history:"Lịch sử", manage:"Quản lý Pair", import:"Import / Export"
  })[id] || id;
  $(".sidebar").classList.remove("open");
}

async function loadDashboard() {
  const { count: single } = await sb.from("qr_codes").select("*", { count:"exact", head:true });
  const { count: pairs } = await sb.from("box_pairs").select("*", { count:"exact", head:true });
  const { count: pass } = await sb.from("scan_logs").select("*", { count:"exact", head:true }).eq("result","PASS");
  const { count: fail } = await sb.from("scan_logs").select("*", { count:"exact", head:true }).eq("result","FAIL");
  $("#statSingle").textContent = single ?? 0;
  $("#statPairs").textContent = pairs ?? 0;
  $("#statPass").textContent = pass ?? 0;
  $("#statFail").textContent = fail ?? 0;
  const { data } = await sb.from("scan_logs").select("*").order("created_at",{ascending:false}).limit(8);
  $("#recentList").innerHTML = (data || []).map(x =>
    `<div class="activity"><span class="${x.result === "PASS" ? "okdot":"bad_dot"}"></span><div><b>${escapeHtml(x.sn || x.old_box || "-")}</b><small>${escapeHtml(x.scan_type)} · ${formatTime(x.created_at)}</small></div><strong class="${x.result === "PASS" ? "pass":"fail"}">${x.result}</strong></div>`
  ).join("") || `<div class="empty">Chưa có dữ liệu.</div>`;
}

async function processSingle(raw) {
  const sn = String(raw || "").trim();
  if (!sn) return;
  const { data: exists } = await sb.from("qr_codes").select("id").eq("sn", sn).maybeSingle();
  if (exists) {
    await logScan({scan_type:"SINGLE", sn, result:"FAIL", reason:"SN đã tồn tại"});
    setSingleResult("FAIL","SN đã tồn tại");
    return;
  }
  const { error } = await sb.from("qr_codes").insert({sn, created_by:user.id});
  if (error) {
    await logScan({scan_type:"SINGLE", sn, result:"FAIL", reason:error.message});
    setSingleResult("FAIL", error.message);
    return;
  }
  await logScan({scan_type:"SINGLE", sn, result:"PASS", reason:"OK"});
  setSingleResult("PASS", sn);
  $("#singleManual").value = "";
  toast("✓ Scan SN thành công");
  loadDashboard();
}

function setSingleResult(result, value) {
  $("#singleResult").className = "scan-result " + result.toLowerCase();
  $("#singleResult").textContent = result;
  $("#singleValue").textContent = value;
}

async function processOld(raw) {
  const v = String(raw || "").trim();
  if (!v) return;
  oldBox = v;
  $("#oldValue").textContent = v;
  $("#pairResult").className = "scan-result neutral";
  $("#pairResult").textContent = "Đang chờ NewBOX";
  await logScan({scan_type:"PAIR_OLD", old_box:v, result:"PASS", reason:"OldBOX scanned"});
}

async function processNew(raw) {
  const v = String(raw || "").trim();
  if (!v || !oldBox) return;
  newBox = v;
  $("#newValue").textContent = v;

  if (oldBox === newBox) return finishPairFail("OldBOX và NewBOX không được giống nhau");
  const { data: oldUsed } = await sb.from("box_pairs").select("id").eq("old_box",oldBox).maybeSingle();
  if (oldUsed) return finishPairFail("OldBOX đã được ghép");
  const { data: newUsed } = await sb.from("box_pairs").select("id").eq("new_box",newBox).maybeSingle();
  if (newUsed) return finishPairFail("NewBOX đã được ghép");

  const { error } = await sb.from("box_pairs").insert({old_box:oldBox,new_box:newBox,created_by:user.id});
  if (error) return finishPairFail(error.message);

  await logScan({scan_type:"PAIR",old_box:oldBox,new_box:newBox,result:"PASS",reason:"OK"});
  $("#pairResult").className = "scan-result pass";
  $("#pairResult").textContent = "✓ PAIR PASS";
  toast("✓ Ghép OldBOX → NewBOX thành công");
  loadDashboard(); loadPairs();
}

async function finishPairFail(reason) {
  await logScan({scan_type:"PAIR",old_box:oldBox,new_box:newBox,result:"FAIL",reason});
  $("#pairResult").className = "scan-result fail";
  $("#pairResult").textContent = "✕ " + reason;
  toast("✕ " + reason, true);
}

async function logScan(payload) {
  await sb.from("scan_logs").insert({...payload, user_id:user?.id || null});
}

function resetPair() {
  oldBox = ""; newBox = "";
  $("#oldValue").textContent = "Chưa có";
  $("#newValue").textContent = "Chưa có";
  $("#oldManual").value = ""; $("#newManual").value = "";
  $("#pairResult").className = "scan-result neutral";
  $("#pairResult").textContent = "Đang chờ OldBOX";
}

async function startScanner(type) {
  if (!window.Html5Qrcode) return toast("Thư viện camera chưa sẵn sàng, thử lại.", true);
  await stopScanner(type);
  const id = type === "single" ? "singleReader" : "oldReader";
  const scanner = new Html5Qrcode(id);
  if (type === "single") singleScanner = scanner; else oldScanner = scanner;
  await scanner.start({facingMode:"environment"},{fps:10,qrbox:{width:230,height:230}},
    text => type === "single" ? processSingle(text) : processOld(text), ()=>{});
}

async function stopScanner(type) {
  const scanner = type === "single" ? singleScanner : oldScanner;
  if (scanner) {
    try { await scanner.stop(); } catch {}
    try { scanner.clear(); } catch {}
    if (type === "single") singleScanner=null; else oldScanner=null;
  }
}

async function loadHistory() {
  const { data } = await sb.from("scan_logs").select("*").order("created_at",{ascending:false}).limit(500);
  historyCache = data || [];
  renderHistory();
}
function renderHistory() {
  const q = ($("#historySearch").value || "").toLowerCase();
  $("#historyBody").innerHTML = historyCache.filter(x => JSON.stringify(x).toLowerCase().includes(q)).map(x =>
    `<tr><td>${formatTime(x.created_at)}</td><td>${x.scan_type}</td><td>${escapeHtml(x.sn||"")}</td><td>${escapeHtml(x.old_box||"")}</td><td>${escapeHtml(x.new_box||"")}</td><td><span class="badge ${x.result.toLowerCase()}">${x.result}</span></td><td>${escapeHtml(x.reason||"")}</td></tr>`
  ).join("") || `<tr><td colspan="7" class="empty">Không có dữ liệu.</td></tr>`;
}

async function loadPairs() {
  const { data } = await sb.from("box_pairs").select("*").order("created_at",{ascending:false}).limit(1000);
  pairCache = data || [];
  renderPairs();
}
function renderPairs() {
  const q = ($("#pairSearch").value || "").toLowerCase();
  $("#pairBody").innerHTML = pairCache.filter(x => `${x.old_box} ${x.new_box}`.toLowerCase().includes(q)).map(x =>
    `<tr><td>${escapeHtml(x.old_box)}</td><td>${escapeHtml(x.new_box)}</td><td>${escapeHtml(x.created_by||"")}</td><td>${formatTime(x.created_at)}</td></tr>`
  ).join("") || `<tr><td colspan="4" class="empty">Chưa có pair.</td></tr>`;
}

function parseExcel(file, expected) {
  return file.arrayBuffer().then(buf => {
    const wb = XLSX.read(buf,{type:"array"});
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws,{defval:""});
    return rows.map(r => {
      const out = {};
      Object.keys(r).forEach(k => out[k.trim()] = String(r[k]).trim());
      return out;
    });
  }).then(rows => ({rows, expected}));
}

async function importSingles() {
  const file = $("#singleFile").files[0]; if (!file) return toast("Chọn file Excel.",true);
  const {rows} = await parseExcel(file,"SN");
  let ok=0, fail=0;
  for (const r of rows) {
    const sn = r.SN || r.sn;
    if (!sn) { fail++; continue; }
    const {data:exists}=await sb.from("qr_codes").select("id").eq("sn",sn).maybeSingle();
    if (exists) { fail++; continue; }
    const {error}=await sb.from("qr_codes").insert({sn,created_by:user.id});
    if (error) fail++; else ok++;
  }
  $("#singleImportInfo").textContent=`✓ ${ok} import · ✕ ${fail} bỏ qua`;
  loadDashboard();
}

async function importPairs() {
  const file = $("#pairFile").files[0]; if (!file) return toast("Chọn file Excel.",true);
  const {rows}=await parseExcel(file,"PAIR");
  let ok=0,fail=0;
  for (const r of rows) {
    const oldv=r.oldBOX || r.oldBox || r.old_box;
    const newv=r.newBOX || r.newBox || r.new_box;
    if (!oldv || !newv || oldv===newv) {fail++;continue;}
    const {data:o}=await sb.from("box_pairs").select("id").eq("old_box",oldv).maybeSingle();
    const {data:n}=await sb.from("box_pairs").select("id").eq("new_box",newv).maybeSingle();
    if(o||n){fail++;continue;}
    const {error}=await sb.from("box_pairs").insert({old_box:oldv,new_box:newv,created_by:user.id});
    if(error) fail++; else ok++;
  }
  $("#pairImportInfo").textContent=`✓ ${ok} import · ✕ ${fail} bỏ qua`;
  loadDashboard(); loadPairs();
}

function exportSingles() {
  sb.from("qr_codes").select("sn").order("created_at").then(({data,error})=>{
    if(error) return toast(error.message,true);
    downloadXlsx(data.map(x=>({SN:x.sn})),"SN.xlsx");
  });
}
function exportPairs() {
  sb.from("box_pairs").select("old_box,new_box").order("created_at").then(({data,error})=>{
    if(error) return toast(error.message,true);
    downloadXlsx(data.map(x=>({oldBOX:x.old_box,newBOX:x.new_box})),"oldBOX_newBOX.xlsx");
  });
}
function downloadXlsx(rows,name) {
  const ws=XLSX.utils.json_to_sheet(rows);
  const wb=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb,ws,"Data");
  XLSX.writeFile(wb,name);
}

function toggleTheme() {
  document.body.classList.toggle("light");
  localStorage.setItem("boxTheme",document.body.classList.contains("light")?"light":"dark");
}
if (localStorage.getItem("boxTheme")==="light") document.body.classList.add("light");

function toast(msg,bad=false) {
  const t=$("#toast"); t.textContent=msg; t.className="toast show "+(bad?"bad":"");
  setTimeout(()=>t.classList.remove("show"),2500);
}
function formatTime(v) { return v ? new Date(v).toLocaleString("vi-VN") : ""; }
function escapeHtml(v) { return String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c])); }
