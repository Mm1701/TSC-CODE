const { createClient } = supabase;
const db = createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
const $ = (s)=>document.querySelector(s);
const $$ = (s)=>[...document.querySelectorAll(s)];
let user = null;
let sessions = [];
let currentSession = null;
let scannerBackPage = "singleFiles";
let singleReader = null, oldReader = null, newReader = null;
let oldBoxCurrent = "";
let recentSingle = [], recentPairs = [];
let selectedFiles = new Set();
let modalType = "SINGLE";
let lastScanAt = 0;
let lastScanCode = "";

function escapeHtml(v){return String(v??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]));}
function toast(msg, error=false){const t=$("#toast");t.textContent=msg;t.className="toast show "+(error?"error":"");clearTimeout(window.__toast);window.__toast=setTimeout(()=>t.className="toast",2300);}
function autoName(){const d=new Date(),p=n=>String(n).padStart(2,"0");return `TSC${String(d.getFullYear()).slice(-2)}${p(d.getMonth()+1)}${p(d.getDate())}${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;}
function formatTime(v){return new Date(v).toLocaleString("vi-VN",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"});}
function typeLabel(t){return t==="PAIR"?"QR CẶP":"QR ĐƠN";}
function statusLabel(s){return s==="ACTIVE"?"Đang quét":s==="PAUSED"?"Tạm dừng":"Hoàn thành";}
function statusClass(s){return s==="ACTIVE"?"active":s==="PAUSED"?"paused":"done";}
function beep(ok=true){
  try{const C=window.AudioContext||window.webkitAudioContext;if(!C)return;const c=new C(),o=c.createOscillator(),g=c.createGain();o.frequency.value=ok?880:220;o.connect(g);g.connect(c.destination);g.gain.setValueAtTime(.0001,c.currentTime);g.gain.exponentialRampToValueAtTime(.12,c.currentTime+.01);g.gain.exponentialRampToValueAtTime(.0001,c.currentTime+.12);o.start();o.stop(c.currentTime+.13)}catch(e){}
  if(navigator.vibrate) navigator.vibrate(ok?[35]:[80,40,80]);
}
function safeScanGate(code){
  const now=Date.now();
  if(now-lastScanAt<700 && code===lastScanCode)return false;
  lastScanAt=now;lastScanCode=code;return true;
}

async function ensureProfile(){
  const {data}=await db.from("profiles").select("id").eq("id",user.id).maybeSingle();
  if(!data) await db.from("profiles").insert({id:user.id,email:user.email});
}
async function login(e){
  e.preventDefault();$("#loginError").textContent="";
  const {data,error}=await db.auth.signInWithPassword({email:$("#email").value.trim(),password:$("#password").value});
  if(error){$("#loginError").textContent=error.message;return;}
  user=data.user; await ensureProfile(); showApp();
}
async function logout(){stopAllReaders();await db.auth.signOut();location.reload();}
function showApp(){
  $("#loginView").classList.add("hidden");$("#appView").classList.remove("hidden");$("#userEmail").textContent=user.email||"User";$("#todayBadge").textContent=new Date().toLocaleDateString("vi-VN").replaceAll("/","");
  bindNavigation();loadSessions();showPage("home");
}
function showPage(page){
  $$(".page").forEach(x=>x.classList.remove("active"));
  const el=$("#"+page);if(el)el.classList.add("active");
  const names={home:"Tổng quan",singleFiles:"Quét đơn",pairFiles:"Quét theo cặp",files:"Quản lý file",history:"Lịch sử",scanner:"Scanner"};
  $("#pageTitle").textContent=names[page]||"BOX QR";
  $$(".nav-item[data-page]").forEach(x=>x.classList.toggle("active",x.dataset.page===page));
  if(page==="singleFiles")renderSessionList("SINGLE");
  if(page==="pairFiles")renderSessionList("PAIR");
  if(page==="files")renderAllSessions();
  if(page==="history")loadHistory();
}
function bindNavigation(){
  $$("[data-page]").forEach(b=>b.addEventListener("click",()=>showPage(b.dataset.page)));
  $("#logoutBtn").onclick=logout;
  $("#themeBtn").onclick=()=>document.body.classList.toggle("dark");
  $("#newSingleBtn").onclick=()=>openSessionModal("SINGLE");
  $("#newPairBtn").onclick=()=>openSessionModal("PAIR");
  $("#refreshFilesBtn").onclick=loadSessions;
  $("#clearSelectedBtn").onclick=()=>{selectedFiles.clear();renderAllSessions();};
  $("#exportSelectedBtn").onclick=exportSelected;
  $("#singleSearch").oninput=()=>renderSessionList("SINGLE");
  $("#singleStatus").onchange=()=>renderSessionList("SINGLE");
  $("#pairSearch").oninput=()=>renderSessionList("PAIR");
  $("#pairStatus").onchange=()=>renderSessionList("PAIR");
  $("#allSearch").oninput=renderAllSessions;$("#allType").onchange=renderAllSessions;
  $("#historySearch").oninput=loadHistory;
  $("#closeModal").onclick=closeModal;
  $$('input[name="nameMode"]').forEach(x=>x.onchange=toggleNameMode);
  $("#createSessionBtn").onclick=createSession;
  $("#scannerBack").onclick=()=>{stopAllReaders();showPage(scannerBackPage);loadSessions();};
  $("#singleStart").onclick=startSingleCamera;$("#singleStop").onclick=()=>stopReader("single");
  $("#singleManualBtn").onclick=()=>submitSingle($("#singleManual").value);
  $("#singleManual").onkeydown=e=>{if(e.key==="Enter")submitSingle(e.target.value)};
  $("#oldStart").onclick=startOldCamera;$("#newStart").onclick=startNewCamera;
  $("#oldManual").onkeydown=e=>{if(e.key==="Enter")submitOld(e.target.value)};
  $("#newManual").onkeydown=e=>{if(e.key==="Enter")submitNew(e.target.value)};
  $("#mobileMenu").onclick=()=>document.querySelector(".sidebar").classList.toggle("open");
}
function openSessionModal(type){modalType=type;$("#modalTitle").textContent=type==="PAIR"?"Tạo file QR theo cặp":"Tạo file QR đơn";$("#modalTypeHint").textContent=type==="PAIR"?"File sẽ xuất 2 cột oldBOX, newBOX.":"File sẽ xuất 1 cột SN.";$("#autoNamePreview").textContent=autoName();$("#customName").value="";$("#customName").classList.add("hidden");document.querySelector('input[value="auto"]').checked=true;$("#sessionModal").classList.remove("hidden");}
function closeModal(){$("#sessionModal").classList.add("hidden")}
function toggleNameMode(){const custom=document.querySelector('input[name="nameMode"]:checked').value==="custom";$("#customName").classList.toggle("hidden",!custom);}
async function createSession(){
  const mode=document.querySelector('input[name="nameMode"]:checked').value;
  const name=mode==="auto"?autoName():$("#customName").value.trim();
  if(!name)return toast("Nhập tên file.",true);
  const {data,error}=await db.from("scan_sessions").insert({name,session_type:modalType,status:"ACTIVE",created_by:user.id}).select().single();
  if(error){toast(error.message,true);return}
  currentSession=data;closeModal();openScanner(data,modalType==="PAIR"?"pairFiles":"singleFiles");
}
async function loadSessions(){
  const {data,error}=await db.from("scan_sessions").select("*").order("updated_at",{ascending:false});
  if(error){toast(error.message,true);return}
  sessions=data||[];renderSessionList("SINGLE");renderSessionList("PAIR");renderAllSessions();renderRecent();
}
function sessionCard(s, selectable=false){
  const checked=selectedFiles.has(s.id)?"checked":"";
  return `<div class="file-card">
    ${selectable?`<label class="check"><input type="checkbox" data-select="${s.id}" ${checked}><span></span></label>`:""}
    <div class="file-icon ${s.session_type==="PAIR"?"purple":""}">${s.session_type==="PAIR"?"⇄":"▣"}</div>
    <div class="file-main"><div class="file-name">${escapeHtml(s.name)}</div><div class="file-sub">${typeLabel(s.session_type)} · ${formatTime(s.updated_at)}</div></div>
    <span class="status ${statusClass(s.status)}">${statusLabel(s.status)}</span>
    <button class="btn small ghost" data-resume="${s.id}">Tiếp tục</button>
  </div>`;
}
function wireSessionButtons(){
  $$("[data-resume]").forEach(b=>b.onclick=()=>resumeSession(b.dataset.resume));
  $$("[data-select]").forEach(b=>b.onchange=()=>{if(b.checked)selectedFiles.add(b.dataset.select);else selectedFiles.delete(b.dataset.select);updateExportBar();});
}
function renderSessionList(type){
  const search=(type==="SINGLE"?$("#singleSearch").value:$("#pairSearch").value).toLowerCase();
  const status=type==="SINGLE"?$("#singleStatus").value:$("#pairStatus").value;
  const el=type==="SINGLE"?$("#singleSessionList"):$("#pairSessionList");
  const arr=sessions.filter(s=>s.session_type===type && (!status||s.status===status) && s.name.toLowerCase().includes(search));
  el.innerHTML=arr.length?arr.map(s=>sessionCard(s)).join(""):`<div class="empty-state">Chưa có file ${type==="PAIR"?"QR cặp":"QR đơn"}.<br>Bấm <b>Quét file mới</b> để bắt đầu.</div>`;
  wireSessionButtons();
}
function renderAllSessions(){
  const search=$("#allSearch").value.toLowerCase(),type=$("#allType").value;
  const arr=sessions.filter(s=>(!type||s.session_type===type)&&s.name.toLowerCase().includes(search));
  $("#allSessionList").innerHTML=arr.length?arr.map(s=>sessionCard(s,true)).join(""):`<div class="empty-state">Chưa có file.</div>`;
  wireSessionButtons();updateExportBar();
}
function updateExportBar(){const n=selectedFiles.size;$("#selectedCount").textContent=n;$("#exportBar").classList.toggle("hidden",!n);}
function renderRecent(){
  const arr=sessions.slice(0,6);
  $("#recentSessions").innerHTML=arr.length?arr.map(s=>sessionCard(s)).join(""):`<div class="empty-state">Chưa có file. Tạo file mới để bắt đầu.</div>`;
  wireSessionButtons();
}
async function resumeSession(id){
  const s=sessions.find(x=>x.id===id);if(!s)return;
  currentSession=s;await db.from("scan_sessions").update({status:"ACTIVE",updated_at:new Date().toISOString()}).eq("id",id);
  openScanner(s,s.session_type==="PAIR"?"pairFiles":"singleFiles");
}
function openScanner(s,backPage){
  currentSession=s;scannerBackPage=backPage;showPage("scanner");
  $("#scannerTitle").textContent=s.name;$("#scannerMeta").textContent=`${typeLabel(s.session_type)} · ${statusLabel(s.status)}`;
  $("#singleScanner").classList.toggle("hidden",s.session_type!=="SINGLE");
  $("#pairScanner").classList.toggle("hidden",s.session_type!=="PAIR");
  if(s.session_type==="SINGLE")initSingleScanner();else initPairScanner();
}
async function initSingleScanner(){
  stopAllReaders();recentSingle=[];$("#singleRecentList").innerHTML="";$("#singleRecentCount").textContent="0";
  const {data}=await db.from("qr_codes").select("sn").eq("session_id",currentSession.id).order("created_at",{ascending:false}).limit(10);
  recentSingle=(data||[]).map(x=>x.sn);renderRecentSingle();
  await refreshSingleCounters();
  setAlert("single","Sẵn sàng","Đưa mã QR vào khung camera.","neutral");
}
async function initPairScanner(){
  stopAllReaders();oldBoxCurrent="";recentPairs=[];$("#currentOldBox").textContent="Chưa có OldBOX";$("#currentNewBox").textContent="Chờ NewBOX";$("#pairInstruction").textContent="Bước 1 · Quét OldBOX";
  $("#newStart").disabled=true;$("#newManual").disabled=true;$("#oldStepStatus").textContent="Chưa quét";$("#newStepStatus").textContent="Đang chờ OldBOX";
  const {data}=await db.from("box_pairs").select("old_box,new_box").eq("session_id",currentSession.id).order("created_at",{ascending:false}).limit(10);
  recentPairs=data||[];renderRecentPairs();await refreshPairCounters();setAlert("pair","Đang chờ OldBOX","Hãy quét OldBOX trước.","neutral");
}
function setAlert(type,title,small,state){
  const el=type==="single"?$("#singleAlert"):$("#pairAlert");el.className=`scan-alert ${state}`;el.innerHTML=`<span>${state==="pass"?"✓":state==="fail"?"!":"●"}</span><div><b>${escapeHtml(title)}</b><small>${escapeHtml(small)}</small></div>`;
}
async function startReader(kind,elementId,onDecode){
  stopReader(kind);
  const reader=new Html5Qrcode(elementId);
  if(kind==="single")singleReader=reader;if(kind==="old")oldReader=reader;if(kind==="new")newReader=reader;
  try{
    await reader.start({facingMode:"environment"},{fps:12,qrbox:(w,h)=>({width:Math.min(260,w*.75),height:Math.min(260,h*.75)})},onDecode,()=>{});
  }catch(e){toast("Không mở được camera. Kiểm tra quyền camera.",true);stopReader(kind);}
}
function stopReader(kind){
  const r=kind==="single"?singleReader:kind==="old"?oldReader:newReader;
  if(r){r.stop().catch(()=>{});r.clear().catch(()=>{});}
  if(kind==="single")singleReader=null;if(kind==="old")oldReader=null;if(kind==="new")newReader=null;
}
function stopAllReaders(){["single","old","new"].forEach(stopReader)}
function startSingleCamera(){startReader("single","singleReader",code=>{if(safeScanGate(code))submitSingle(code)})}
function startOldCamera(){startReader("old","oldReader",code=>{if(safeScanGate(code))submitOld(code)})}
function startNewCamera(){if(!oldBoxCurrent)return;startReader("new","newReader",code=>{if(safeScanGate(code))submitNew(code)})}
async function submitSingle(raw){
  const sn=String(raw||"").trim();if(!sn)return;
  const {data:exists}=await db.from("qr_codes").select("id").eq("session_id",currentSession.id).eq("sn",sn).maybeSingle();
  if(exists){await logScan("SINGLE",sn,"FAIL","Mã đã tồn tại trong file");setAlert("single","TRÙNG MÃ",`${sn} đã quét trước đó trong file này.`,"fail");beep(false);$("#singleValue")?.textContent;return;}
  const {error}=await db.from("qr_codes").insert({session_id:currentSession.id,sn,created_by:user.id});
  if(error){await logScan("SINGLE",sn,"FAIL",error.message);setAlert("single","KHÔNG LƯU ĐƯỢC",error.message,"fail");beep(false);return;}
  await db.from("scan_logs").insert({session_id:currentSession.id,scan_type:"SINGLE",code:sn,result:"PASS",created_by:user.id});
  recentSingle=[sn,...recentSingle.filter(x=>x!==sn)].slice(0,10);renderRecentSingle();await refreshSingleCounters();await touchSession();
  setAlert("single","PASS",sn,"pass");beep(true);$("#singleManual").value="";
}
function renderRecentSingle(){$("#singleRecentCount").textContent=recentSingle.length;$("#singleRecentList").innerHTML=recentSingle.map((x,i)=>`<div class="recent-code"><span>${i===0?"NEW":"#"+(i+1)}</span><b>${escapeHtml(x)}</b></div>`).join("")||`<div class="muted">Chưa có mã.</div>`;}
async function refreshSingleCounters(){
  const {count:total}=await db.from("qr_codes").select("*",{count:"exact",head:true}).eq("session_id",currentSession.id);
  const {count:fail}=await db.from("scan_logs").select("*",{count:"exact",head:true}).eq("session_id",currentSession.id).eq("scan_type","SINGLE").eq("result","FAIL");
  $("#singleTotal").textContent=total||0;$("#singlePass").textContent=total||0;$("#singleFail").textContent=fail||0;
}
async function submitOld(raw){
  const old=String(raw||"").trim();if(!old)return;
  const {data:exists}=await db.from("box_pairs").select("id").eq("session_id",currentSession.id).eq("old_box",old).maybeSingle();
  if(exists){await logScan("PAIR_OLD",old,"FAIL","OldBOX đã tồn tại trong file");setAlert("pair","TRÙNG OLDBOX",`${old} đã được ghép trong file này.`,"fail");beep(false);return;}
  oldBoxCurrent=old;stopReader("old");$("#currentOldBox").textContent=old;$("#currentNewBox").textContent="Chờ NewBOX";$("#oldStepStatus").textContent="Đã quét";$("#newStepStatus").textContent="Sẵn sàng";$("#newStart").disabled=false;$("#newManual").disabled=false;$("#pairInstruction").textContent=`Bước 2 · Đang chờ NewBOX cho ${old}`;setAlert("pair","OldBOX OK",`Đang chờ NewBOX cho ${old}.`,"pass");beep(true);$("#oldManual").value="";
}
async function submitNew(raw){
  const nw=String(raw||"").trim();if(!nw||!oldBoxCurrent)return;
  if(nw===oldBoxCurrent){await logScan("PAIR_NEW",nw,"FAIL","OldBOX và NewBOX không được giống nhau");setAlert("pair","KHÔNG HỢP LỆ",`NewBOX không được giống OldBOX ${oldBoxCurrent}.`,"fail");beep(false);return;}
  const {data:oldUsed}=await db.from("box_pairs").select("id").eq("session_id",currentSession.id).eq("old_box",oldBoxCurrent).maybeSingle();
  const {data:newUsed}=await db.from("box_pairs").select("id").eq("session_id",currentSession.id).eq("new_box",nw).maybeSingle();
  if(oldUsed){await logScan("PAIR_NEW",nw,"FAIL","OldBOX đã được ghép");setAlert("pair","OLDBOX ĐÃ TỒN TẠI",oldBoxCurrent,"fail");beep(false);return;}
  if(newUsed){await logScan("PAIR_NEW",nw,"FAIL","NewBOX đã được sử dụng");setAlert("pair","TRÙNG NEWBOX",`${nw} đã được dùng trong file này.`,"fail");beep(false);return;}
  const {error}=await db.from("box_pairs").insert({session_id:currentSession.id,old_box:oldBoxCurrent,new_box:nw,created_by:user.id});
  if(error){await logScan("PAIR",nw,"FAIL",error.message);setAlert("pair","KHÔNG LƯU ĐƯỢC",error.message,"fail");beep(false);return;}
  await logScan("PAIR",`${oldBoxCurrent} → ${nw}`,"PASS","Pair OK",oldBoxCurrent,nw);
  recentPairs=[{old_box:oldBoxCurrent,new_box:nw},...recentPairs].slice(0,10);renderRecentPairs();await refreshPairCounters();await touchSession();
  $("#currentNewBox").textContent=nw;setAlert("pair","PAIR PASS",`${oldBoxCurrent} → ${nw}`,"pass");beep(true);
  setTimeout(()=>resetPairForNext(),500);
}
function resetPairForNext(){oldBoxCurrent="";$("#currentOldBox").textContent="Chưa có OldBOX";$("#currentNewBox").textContent="Chờ NewBOX";$("#pairInstruction").textContent="Bước 1 · Quét OldBOX";$("#oldStepStatus").textContent="Chưa quét";$("#newStepStatus").textContent="Đang chờ OldBOX";$("#newStart").disabled=true;$("#newManual").disabled=true;$("#oldManual").value="";$("#newManual").value="";setAlert("pair","Đang chờ OldBOX","Hãy quét OldBOX tiếp theo.","neutral");}
function renderRecentPairs(){$("#pairRecentCount").textContent=recentPairs.length;$("#pairRecentList").innerHTML=recentPairs.map((p,i)=>`<div class="recent-pair"><span>${i===0?"NEW":"#"+(i+1)}</span><b>${escapeHtml(p.old_box)}</b><strong>→</strong><b>${escapeHtml(p.new_box)}</b></div>`).join("")||`<div class="muted">Chưa có cặp.</div>`;}
async function refreshPairCounters(){
  const {count:total}=await db.from("box_pairs").select("*",{count:"exact",head:true}).eq("session_id",currentSession.id);
  const {count:fail}=await db.from("scan_logs").select("*",{count:"exact",head:true}).eq("session_id",currentSession.id).in("scan_type",["PAIR_OLD","PAIR_NEW","PAIR"]).eq("result","FAIL");
  $("#pairTotal").textContent=total||0;$("#pairPass").textContent=total||0;$("#pairFail").textContent=fail||0;
}
async function touchSession(){await db.from("scan_sessions").update({updated_at:new Date().toISOString(),status:"ACTIVE"}).eq("id",currentSession.id);}
async function logScan(type,code,result,reason,oldBox=null,newBox=null){await db.from("scan_logs").insert({session_id:currentSession.id,scan_type:type,code,old_box:oldBox,new_box:newBox,result,reason,created_by:user.id});}
async function loadHistory(){
  let q=db.from("scan_logs").select("created_at,scan_type,code,result,reason,session_id,scan_sessions(name)").eq("created_by",user.id).order("created_at",{ascending:false}).limit(200);
  const term=$("#historySearch").value.trim();if(term)q=q.or(`code.ilike.%${term}%,reason.ilike.%${term}%`);
  const {data,error}=await q;if(error){$("#historyBody").innerHTML=`<tr><td colspan="6">${escapeHtml(error.message)}</td></tr>`;return}
  $("#historyBody").innerHTML=(data||[]).map(x=>`<tr><td>${formatTime(x.created_at)}</td><td>${escapeHtml(x.scan_sessions?.name||"—")}</td><td>${escapeHtml(x.scan_type)}</td><td>${escapeHtml(x.code||"—")}</td><td><span class="result ${x.result.toLowerCase()}">${x.result}</span></td><td>${escapeHtml(x.reason||"")}</td></tr>`).join("")||`<tr><td colspan="6">Chưa có dữ liệu.</td></tr>`;
}
async function exportSelected(){
  const arr=sessions.filter(s=>selectedFiles.has(s.id));if(!arr.length)return;
  const types=new Set(arr.map(s=>s.session_type));if(types.size>1){toast("Chỉ được chọn các file cùng loại để xuất.",true);return;}
  const type=arr[0].session_type;let rows=[];
  for(const s of arr){
    if(type==="SINGLE"){const {data}=await db.from("qr_codes").select("sn").eq("session_id",s.id).order("created_at");rows.push(...(data||[]).map(x=>({SN:x.sn})));}
    else {const {data}=await db.from("box_pairs").select("old_box,new_box").eq("session_id",s.id).order("created_at");rows.push(...(data||[]).map(x=>({oldBOX:x.old_box,newBOX:x.new_box})));}
  }
  const ws=XLSX.utils.json_to_sheet(rows);const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,type==="SINGLE"?"SN":"BOX_PAIR");
  XLSX.writeFile(wb,`${arr.length===1?arr[0].name:"BOX_QR_EXPORT"}_${new Date().toISOString().slice(0,10)}.xlsx`);
  toast("✓ Đã xuất Excel");
}
$("#loginForm").addEventListener("submit",login);
window.addEventListener("load",async()=>{
  if(window.SUPABASE_URL.includes("YOUR_")){$("#loginError").textContent="Hãy điền SUPABASE_URL và SUPABASE_ANON_KEY trong js/config.js";return;}
  const {data}=await db.auth.getSession();if(data.session){user=data.session.user;await ensureProfile();showApp();}
});