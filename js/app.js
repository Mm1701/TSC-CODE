const db=supabase.createClient(window.SUPABASE_URL,window.SUPABASE_ANON_KEY);
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const LS={get:(k,d)=>{try{return localStorage.getItem(k)??d}catch(e){return d}},set:(k,v)=>{try{localStorage.setItem(k,v)}catch(e){}}};
let user=null,sessions=[],cur=null,kind="SINGLE",cam=null,wake=null,busy=false,lockUntil=0,last={code:"",seen:0};
let codes=new Set(),oldSet=new Set(),newSet=new Set(),recent=[],step="old",oldBox="",stats={pass:0,fail:0},sel=new Set(),modalType="SINGLE",nameMode="auto";
const pref={sound:LS.get("sound","1")==="1",vib:LS.get("vib","1")==="1"};
const esc=v=>String(v??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]));
const fmt=v=>new Date(v).toLocaleString("vi-VN",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"});
const clean=v=>String(v??"").replace(/[\u0000-\u001f\u007f]/g,"").trim().slice(0,200);
function toast(m,err){const t=$("#toast");t.textContent=m;t.className="toast show"+(err?" err":"");clearTimeout(toast.t);toast.t=setTimeout(()=>t.className="toast",2600)}
function ask(msg){return new Promise(r=>{$("#dlgMsg").textContent=msg;$("#dlg").classList.remove("hidden");const done=v=>{$("#dlg").classList.add("hidden");r(v)};$("#dlgYes").onclick=()=>done(true);$("#dlgNo").onclick=()=>done(false)})}
function autoName(){const d=new Date(),p=n=>String(n).padStart(2,"0");return`TSC${String(d.getFullYear()).slice(-2)}${p(d.getMonth()+1)}${p(d.getDate())}${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`}
const dupErr=e=>e&&(e.code==="23505"||/duplicate key/i.test(e.message||""));
const netMsg=e=>/fetch|network/i.test(e?.message||"")?"Mất kết nối mạng. Mã CHƯA được lưu.":(e?.message||"Lỗi không xác định");

/* ---------- âm thanh / rung ---------- */
let ac;
function tone(seq){try{ac=ac||new(window.AudioContext||window.webkitAudioContext)();ac.resume();let t=ac.currentTime;for(const[f,d,ty]of seq){const o=ac.createOscillator(),g=ac.createGain();o.type=ty||"sine";o.frequency.value=f;o.connect(g);g.connect(ac.destination);g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(.3,t+.01);g.gain.exponentialRampToValueAtTime(.0001,t+d);o.start(t);o.stop(t+d+.02);t+=d}}catch(e){}}
function feedback(ok){if(pref.sound)tone(ok?[[880,.09],[1320,.13]]:[[200,.2,"square"],[150,.3,"square"]]);if(pref.vib&&navigator.vibrate)navigator.vibrate(ok?40:[150,70,150,70,250])}
function flash(ok,title,sub){const f=$("#flash");$("#flashTitle").textContent=title;$("#flashSub").textContent=sub||"";f.className="flash "+(ok?"pass":"fail");void f.offsetWidth;clearTimeout(flash.t);flash.t=setTimeout(()=>f.className="flash",ok?900:1800)}

/* ---------- đăng nhập ---------- */
async function login(e){e.preventDefault();const b=$("#loginBtn");$("#loginError").textContent="";b.disabled=true;b.textContent="Đang đăng nhập…";
  const{data,error}=await db.auth.signInWithPassword({email:$("#email").value.trim(),password:$("#password").value});
  b.disabled=false;b.textContent="Đăng nhập";
  if(error){$("#loginError").textContent=/invalid login/i.test(error.message)?"Sai email hoặc mật khẩu.":netMsg(error);return}
  user=data.user;await start()}
async function start(){$("#loginView").classList.add("hidden");$("#appView").classList.remove("hidden");$("#userEmail").textContent=user.email||"";
  const{data}=await db.from("profiles").select("id").eq("id",user.id).maybeSingle();if(!data)await db.from("profiles").insert({id:user.id,email:user.email});
  await loadSessions();showPage("home")}

/* ---------- điều hướng ---------- */
function showPage(p){if(p!=="scanner")camStop();
  $$(".page").forEach(x=>x.classList.toggle("active",x.id===p));
  $$(".tab").forEach(t=>t.classList.toggle("active",t.dataset.page===(p==="scanner"?"scan":p)));
  if(p==="scan")renderScanList();if(p==="files")renderAll();if(p==="history")loadHistory();if(p==="home")renderRecent();scrollTo(0,0)}

/* ---------- danh sách file ---------- */
async function loadSessions(){const{data,error}=await db.from("scan_sessions").select("*").order("updated_at",{ascending:false});
  if(error){toast(netMsg(error),1);return}sessions=data||[];renderRecent();renderScanList();renderAll()}
const pillLabel={ACTIVE:"Đang quét",PAUSED:"Tạm dừng",COMPLETED:"Hoàn thành"};
function card(s,check){return`<div class="file">${check?`<input type="checkbox" data-sel="${s.id}" ${sel.has(s.id)?"checked":""}>`:""}<span class="ico ${s.session_type==="PAIR"?"purple":"blue"}">${s.session_type==="PAIR"?"⇄":"▣"}</span><div class="file-main"><div class="file-name">${esc(s.name)}</div><div class="file-sub">${s.session_type==="PAIR"?"QR cặp":"QR đơn"} · ${fmt(s.updated_at)}</div></div><span class="pill ${s.status.toLowerCase()}">${pillLabel[s.status]}</span><button class="btn small" data-act="resume" data-id="${s.id}">Mở</button><button class="btn small danger" data-act="delsession" data-id="${s.id}">Xóa</button></div>`}
const empty=t=>`<div class="empty">${t}</div>`;
function renderRecent(){$("#recentSessions").innerHTML=sessions.slice(0,5).map(s=>card(s)).join("")||empty("Chưa có file nào. Chọn một chế độ quét ở trên để bắt đầu.")}
function renderScanList(){const q=$("#scanSearch").value.toLowerCase();$$("#kindSeg button").forEach(b=>b.classList.toggle("on",b.dataset.kind===kind));
  const a=sessions.filter(s=>s.session_type===kind&&s.name.toLowerCase().includes(q));$("#scanList").innerHTML=a.map(s=>card(s)).join("")||empty("Chưa có file. Bấm <b>＋ File mới</b> để bắt đầu.")}
function renderAll(){const q=$("#allSearch").value.toLowerCase(),t=$("#allType").value;const a=sessions.filter(s=>(!t||s.session_type===t)&&s.name.toLowerCase().includes(q));
  $("#allList").innerHTML=a.map(s=>card(s,1)).join("")||empty("Chưa có file.");$("#selCount").textContent=sel.size;$("#exportBar").classList.toggle("hidden",!sel.size)}

/* ---------- tạo / mở / đóng file ---------- */
function openModal(t){modalType=t;nameMode="auto";$("#modalTitle").textContent=t==="PAIR"?"File QR theo cặp":"File QR đơn";$("#modalHint").textContent=t==="PAIR"?"Xuất 2 cột: oldBOX, newBOX.":"Xuất 1 cột: SN.";$("#autoName").textContent=autoName();$("#customName").value="";$("#customName").classList.add("hidden");$("#autoName").classList.remove("hidden");$$("[data-nm]").forEach(b=>b.classList.toggle("on",b.dataset.nm==="auto"));$("#modal").classList.remove("hidden")}
async function createSession(){const name=nameMode==="auto"?autoName():clean($("#customName").value);if(!name)return toast("Nhập tên file.",1);
  const b=$("#createBtn");b.disabled=true;const{data,error}=await db.from("scan_sessions").insert({name,session_type:modalType,status:"ACTIVE",created_by:user.id}).select().single();b.disabled=false;
  if(error)return toast(dupErr(error)?"Tên file đã tồn tại, hãy chọn tên khác.":netMsg(error),1);
  $("#modal").classList.add("hidden");sessions.unshift(data);openScanner(data)}
async function setStatus(s,status){const{error}=await db.from("scan_sessions").update({status,updated_at:new Date().toISOString()}).eq("id",s.id);if(!error)s.status=status;return!error}
async function resume(id){const s=sessions.find(x=>x.id===id);if(!s)return;await setStatus(s,"ACTIVE");openScanner(s)}
async function delSession(id){const s=sessions.find(x=>x.id===id);if(!s||!await ask(`Xóa file "${s.name}" và toàn bộ mã bên trong?`))return;
  const{error}=await db.from("scan_sessions").delete().eq("id",id);if(error)return toast(netMsg(error),1);sel.delete(id);await loadSessions();toast("Đã xóa file")}

/* ---------- scanner ---------- */
async function fetchAll(table,cols,sid){const out=[];for(let f=0;;f+=1000){const{data,error}=await db.from(table).select(cols).eq("session_id",sid).order("created_at").order("id").range(f,f+999);if(error)throw error;out.push(...data);if(data.length<1000)break}return out}
async function openScanner(s){cur=s;kind=s.session_type;showPage("scanner");await camStop();
  $("#scTitle").textContent=s.name;$("#scKind").textContent=kind==="PAIR"?"QR THEO CẶP":"QR ĐƠN";$("#pairBox").classList.toggle("hidden",kind!=="PAIR");
  busy=true;last={code:"",seen:0};step="old";oldBox="";codes=new Set();oldSet=new Set();newSet=new Set();recent=[];stats={pass:0,fail:0};
  try{
    if(kind==="SINGLE"){const r=await fetchAll("qr_codes","id,sn,created_at",s.id);r.forEach(x=>codes.add(x.sn));recent=r.slice(-10).reverse().map(x=>({id:x.id,a:x.sn}))}
    else{const r=await fetchAll("box_pairs","id,old_box,new_box,created_at",s.id);r.forEach(x=>{oldSet.add(x.old_box);newSet.add(x.new_box)});recent=r.slice(-10).reverse().map(x=>({id:x.id,a:x.old_box,b:x.new_box}))}
    const{count}=await db.from("scan_logs").select("id",{count:"exact",head:true}).eq("session_id",s.id).eq("result","FAIL").neq("scan_type","DELETE");stats.fail=count||0;
  }catch(e){toast("Không tải được dữ liệu file: "+netMsg(e),1)}
  busy=false;renderScanner()}
function renderScanner(){const total=kind==="SINGLE"?codes.size:oldSet.size;stats.pass=total;
  $("#stTotal").textContent=total;$("#stPass").textContent=total;$("#stFail").textContent=stats.fail;$("#recentCount").textContent=recent.length;
  $("#recentList").innerHTML=recent.map(r=>`<div class="rc"><b>${esc(r.a)}${r.b!=null?` → ${esc(r.b)}`:""}</b><button class="x" data-act="${r.b!=null?"delpair":"delcode"}" data-id="${r.id}">×</button></div>`).join("")||`<div class="muted" style="padding:12px">Chưa có mã.</div>`;
  if(kind==="PAIR"){const two=step==="new";$("#stepBadge").textContent=two?"2":"1";$("#stepBadge").classList.toggle("two",two);$("#stepText").textContent=two?"Quét NewBOX":"Quét OldBOX";$("#pvOld").textContent=oldBox||"—";$("#pvNew").textContent="—";$("#resetOld").classList.toggle("hidden",!two)}}
async function camStart(){await camStop();
  try{const F=Html5QrcodeSupportedFormats;cam=new Html5Qrcode("reader",{formatsToSupport:[F.QR_CODE,F.CODE_128,F.CODE_39,F.DATA_MATRIX],verbose:false});
    await cam.start({facingMode:"environment"},{fps:10,qrbox:(w,h)=>{const n=Math.floor(Math.min(w,h)*.68);return{width:n,height:n}}},onDecode,()=>{});
    $("#camIdle").classList.add("hidden");try{wake=await navigator.wakeLock?.request("screen")}catch(e){}
  }catch(e){cam=null;toast("Không mở được camera. Hãy cho phép quyền camera và dùng HTTPS.",1)}}
async function camStop(){const c=cam;cam=null;try{await wake?.release()}catch(e){}wake=null;if(c){try{await c.stop()}catch(e){}try{c.clear()}catch(e){}}$("#camIdle")?.classList.remove("hidden")}
function onDecode(txt){const c=clean(txt),now=Date.now();if(!c)return;const same=c===last.code&&now-last.seen<2500;last={code:c,seen:now};if(same||busy||now<lockUntil)return;submit(c)}
async function submit(raw){const c=clean(raw);if(!c||!cur||busy)return;busy=true;try{await(kind==="SINGLE"?doSingle(c):doPair(c))}finally{busy=false;lockUntil=Date.now()+1200;renderScanner()}}
function log(type,code,result,reason,o,n){db.from("scan_logs").insert({session_id:cur.id,scan_type:type,code,old_box:o||null,new_box:n||null,result,reason,created_by:user.id}).then(()=>{},()=>{})}
function fail(type,code,title,sub){stats.fail++;log(type,code,"FAIL",title+" — "+sub);flash(false,title,sub);feedback(false)}
function pass(type,code,title,sub,o,n){log(type,code,"PASS",title,o,n);flash(true,title,sub);feedback(true)}
async function doSingle(c){
  if(codes.has(c))return fail("SINGLE",c,"TRÙNG MÃ",c+" đã quét trong file này");
  const{data,error}=await db.from("qr_codes").insert({session_id:cur.id,sn:c,created_by:user.id}).select("id").single();
  if(error)return dupErr(error)?fail("SINGLE",c,"TRÙNG MÃ",c+" đã có trong file"):fail("SINGLE",c,"KHÔNG LƯU ĐƯỢC",netMsg(error));
  codes.add(c);recent=[{id:data.id,a:c},...recent].slice(0,10);pass("SINGLE",c,"PASS",c);touch();$("#manual").value=""}
async function doPair(c){
  const strict=window.STRICT_CROSS_CHECK!==false;
  if(step==="old"){
    if(oldSet.has(c))return fail("PAIR_OLD",c,"TRÙNG OLDBOX",c+" đã được ghép trong file");
    if(strict&&newSet.has(c))return fail("PAIR_OLD",c,"NHẦM BOX",c+" đang là NewBOX của cặp khác");
    oldBox=c;step="new";pass("PAIR_OLD",c,"OLDBOX OK","Giờ quét NewBOX",c);$("#manual").value="";return}
  if(c===oldBox)return fail("PAIR_NEW",c,"NHẦM BOX","NewBOX không được giống OldBOX");
  if(newSet.has(c))return fail("PAIR_NEW",c,"TRÙNG NEWBOX",c+" đã được dùng trong file");
  if(strict&&oldSet.has(c))return fail("PAIR_NEW",c,"NHẦM BOX",c+" đang là OldBOX của cặp khác");
  const{data,error}=await db.from("box_pairs").insert({session_id:cur.id,old_box:oldBox,new_box:c,created_by:user.id}).select("id").single();
  if(error)return dupErr(error)?fail("PAIR_NEW",c,"TRÙNG",`${oldBox} hoặc ${c} đã có trong file`):fail("PAIR_NEW",c,"KHÔNG LƯU ĐƯỢC",netMsg(error));
  oldSet.add(oldBox);newSet.add(c);recent=[{id:data.id,a:oldBox,b:c},...recent].slice(0,10);pass("PAIR",`${oldBox} → ${c}`,"PAIR PASS",`${oldBox} → ${c}`,oldBox,c);
  oldBox="";step="old";touch();$("#manual").value=""}
function touch(){db.from("scan_sessions").update({updated_at:new Date().toISOString(),status:"ACTIVE"}).eq("id",cur.id).then(()=>{},()=>{})}
async function delCode(id){const r=recent.find(x=>x.id===id);if(!r||!await ask(`Xóa mã "${r.a}" khỏi file?`))return;
  const{error}=await db.from("qr_codes").delete().eq("id",id);if(error)return toast(netMsg(error),1);codes.delete(r.a);recent=recent.filter(x=>x.id!==id);log("DELETE",r.a,"PASS","Người dùng xóa mã");renderScanner();toast("Đã xóa mã")}
async function delPair(id){const r=recent.find(x=>x.id===id);if(!r||!await ask(`Xóa cặp ${r.a} → ${r.b}?`))return;
  const{error}=await db.from("box_pairs").delete().eq("id",id);if(error)return toast(netMsg(error),1);oldSet.delete(r.a);newSet.delete(r.b);recent=recent.filter(x=>x.id!==id);log("DELETE",`${r.a} → ${r.b}`,"PASS","Người dùng xóa cặp",r.a,r.b);renderScanner();toast("Đã xóa cặp")}
async function leave(status){const s=cur;await camStop();if(s&&status)await setStatus(s,status);cur=null;await loadSessions();showPage("scan")}

/* ---------- lịch sử & export ---------- */
async function loadHistory(){let q=db.from("scan_logs").select("created_at,scan_type,code,result,reason,scan_sessions(name)").eq("created_by",user.id).order("created_at",{ascending:false}).limit(200);
  const r=$("#histResult").value;if(r)q=q.eq("result",r);const t=$("#histSearch").value.replace(/[,()%*\\]/g," ").trim();if(t)q=q.or(`code.ilike.%${t}%,reason.ilike.%${t}%`);
  const{data,error}=await q;if(error){$("#histBody").innerHTML=`<tr><td colspan="5">${esc(netMsg(error))}</td></tr>`;return}
  $("#histBody").innerHTML=(data||[]).map(x=>`<tr><td>${fmt(x.created_at)}</td><td>${esc(x.scan_sessions?.name||"—")}</td><td>${esc(x.code||"—")}</td><td class="res ${x.result.toLowerCase()}">${x.result}</td><td>${esc(x.reason||"")}</td></tr>`).join("")||`<tr><td colspan="5">Chưa có dữ liệu.</td></tr>`}
async function exportSel(){const a=sessions.filter(s=>sel.has(s.id));if(!a.length)return;if(new Set(a.map(s=>s.session_type)).size>1)return toast("Chỉ xuất được các file cùng loại.",1);
  const single=a[0].session_type==="SINGLE",rows=[];const b=$("#exportBtn");b.disabled=true;b.textContent="Đang xuất…";
  try{for(const s of a){if(single)(await fetchAll("qr_codes","sn,created_at,id",s.id)).forEach(x=>rows.push({SN:x.sn}));else(await fetchAll("box_pairs","old_box,new_box,created_at,id",s.id)).forEach(x=>rows.push({oldBOX:x.old_box,newBOX:x.new_box}))}
    if(!rows.length)return toast("File chưa có dữ liệu để xuất.",1);
    const ws=XLSX.utils.json_to_sheet(rows),wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,single?"SN":"BOX_PAIR");
    const nm=(a.length===1?a[0].name:"BOX_QR_EXPORT").replace(/[\\/:*?"<>|]/g,"_");XLSX.writeFile(wb,`${nm}_${new Date().toISOString().slice(0,10)}.xlsx`);toast(`Đã xuất ${rows.length} dòng`)
  }catch(e){toast("Xuất thất bại: "+netMsg(e),1)}finally{b.disabled=false;b.textContent="Xuất Excel"}}

/* ---------- giao diện ---------- */
function setTheme(t){LS.set("theme",t);t==="auto"?document.documentElement.removeAttribute("data-theme"):document.documentElement.dataset.theme=t;$$("#themeSeg button").forEach(b=>b.classList.toggle("on",b.dataset.theme===t))}
const debounce=(f,ms=300)=>{let t;return(...a)=>{clearTimeout(t);t=setTimeout(()=>f(...a),ms)}};
function bind(){
  document.addEventListener("click",e=>{
    const t=e.target.closest("[data-page]");if(t&&t.classList.contains("tab"))return showPage(t.dataset.page);
    const st=e.target.closest("[data-start]");if(st){kind=st.dataset.start;return openModal(kind)}
    const a=e.target.closest("[data-act]");if(!a)return;const id=a.dataset.id;
    ({resume:()=>resume(id),delsession:()=>delSession(id),delcode:()=>delCode(id),delpair:()=>delPair(id)})[a.dataset.act]?.()});
  document.addEventListener("change",e=>{const c=e.target.closest("[data-sel]");if(c){c.checked?sel.add(c.dataset.sel):sel.delete(c.dataset.sel);$("#selCount").textContent=sel.size;$("#exportBar").classList.toggle("hidden",!sel.size)}});
  $("#kindSeg").onclick=e=>{const b=e.target.closest("[data-kind]");if(b){kind=b.dataset.kind;renderScanList()}};
  $("#newBtn").onclick=()=>openModal(kind);$("#scanSearch").oninput=renderScanList;$("#allSearch").oninput=renderAll;$("#allType").onchange=renderAll;
  $("#histSearch").oninput=debounce(loadHistory);$("#histResult").onchange=loadHistory;
  $("#clearSel").onclick=()=>{sel.clear();renderAll()};$("#exportBtn").onclick=exportSel;
  $$("[data-nm]").forEach(b=>b.onclick=()=>{nameMode=b.dataset.nm;$$("[data-nm]").forEach(x=>x.classList.toggle("on",x===b));$("#customName").classList.toggle("hidden",nameMode!=="custom");$("#autoName").classList.toggle("hidden",nameMode==="custom");if(nameMode==="custom")$("#customName").focus()});
  $("#modalCancel").onclick=()=>$("#modal").classList.add("hidden");$("#createBtn").onclick=createSession;$("#customName").onkeydown=e=>{if(e.key==="Enter")createSession()};
  $("#backBtn").onclick=()=>leave("PAUSED");
  $("#finishBtn").onclick=async()=>{if(await ask("Đánh dấu file này là Hoàn thành?"))leave("COMPLETED")};
  $("#camStart").onclick=camStart;$("#camStop").onclick=camStop;
  $("#manual").onkeydown=e=>{if(e.key==="Enter")submit(e.target.value)};$("#manualBtn").onclick=()=>submit($("#manual").value);
  $("#resetOld").onclick=()=>{step="old";oldBox="";renderScanner();toast("Đã hủy OldBOX, quét lại từ đầu")};
  $("#optSound").checked=pref.sound;$("#optVib").checked=pref.vib;
  $("#optSound").onchange=e=>{pref.sound=e.target.checked;LS.set("sound",pref.sound?"1":"0");if(pref.sound)feedback(true)};
  $("#optVib").onchange=e=>{pref.vib=e.target.checked;LS.set("vib",pref.vib?"1":"0");if(pref.vib)feedback(true)};
  $("#themeSeg").onclick=e=>{const b=e.target.closest("[data-theme]");if(b)setTheme(b.dataset.theme)};
  $("#logoutBtn").onclick=async()=>{await camStop();await db.auth.signOut();location.reload()};
  document.addEventListener("visibilitychange",()=>{if(document.hidden&&cam){camStop();toast("Camera đã tắt khi rời trang")}});
  $("#loginForm").addEventListener("submit",login);
}
window.addEventListener("load",async()=>{setTheme(LS.get("theme","auto"));bind();
  if(!window.SUPABASE_URL||window.SUPABASE_URL.includes("YOUR_"))return void($("#loginError").textContent="Hãy điền SUPABASE_URL và SUPABASE_ANON_KEY trong js/config.js");
  try{const{data}=await db.auth.getSession();if(data.session){user=data.session.user;await start()}}catch(e){$("#loginError").textContent=netMsg(e)}
  db.auth.onAuthStateChange(ev=>{if(ev==="SIGNED_OUT"&&user)location.reload()})});
