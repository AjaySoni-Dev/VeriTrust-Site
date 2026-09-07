const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];

const state = {
  projects: [], projectId: null, runId: null, run: null, pollTimer: null, previewUrl: null,
  providerHealth: {}, selectedProvider: localStorage.getItem("awb.provider") || null,
  codexModels: [], codexLoginId: null, codexLoginTimer: null, deviceVerificationUrl: null,
};

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>'"]/g, (ch) => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"})[ch]);
}
function toast(message, error=false) {
  const el = $("#toast"); el.textContent = message; el.className = "toast show" + (error ? " error" : "");
  clearTimeout(el._t); el._t = setTimeout(() => el.className = "toast", 4500);
}
async function api(url, options={}) {
  const response = await fetch(url, {headers:{"Content-Type":"application/json", ...(options.headers || {})}, ...options});
  let body = {}; try { body = await response.json(); } catch {}
  if (!response.ok) {
    const detail = typeof body.detail === "string" ? body.detail : (body.detail ? JSON.stringify(body.detail) : null);
    throw new Error(detail || body.error || `${response.status} ${response.statusText}`);
  }
  return body;
}

function selectedProvider() { return $("#providerSelect").value || "nvidia"; }
function selectedModel() {
  return selectedProvider() === "codex" ? ($("#codexModelSelect").value || null) : (state.providerHealth.nvidia?.model_id || null);
}
function selectedEffort() { return selectedProvider() === "codex" ? ($("#codexEffortSelect").value || null) : null; }
function providerReady(provider=selectedProvider()) { return !!state.providerHealth[provider]?.ready; }

function updateProviderSummary() {
  const provider = selectedProvider();
  const health = state.providerHealth[provider] || {};
  const ready = !!health.ready;
  const status = $("#providerReady");
  status.className = `provider-state ${ready ? "ok" : "bad"}`;
  status.textContent = ready ? "READY" : "SETUP";
  const pill = $("#modelPill"); pill.classList.remove("ok","bad"); pill.classList.add(ready ? "ok" : "bad");
  const model = selectedModel();
  $("#modelText").textContent = ready ? `${provider === "codex" ? "Codex" : "NVIDIA"} · ${model || "ready"}` : (provider === "codex" ? "Connect ChatGPT" : "NVIDIA key required");
  $("#footerProvider").textContent = provider === "codex" ? "OpenAI Codex" : "NVIDIA NIM";
  $("#footerModel").textContent = model || "—";
  $("#modelTestBtn").disabled = !ready;
}

async function loadHealth({refreshCodexModels=false}={}) {
  try {
    const health = await api("/api/models/providers");
    state.providerHealth = health.providers || {};
    $("#nvidiaModel").textContent = state.providerHealth.nvidia?.model_id || "—";
    renderCodexHealth(state.providerHealth.codex || {});
    if (!state.selectedProvider) state.selectedProvider = health.default_provider || "nvidia";
    if (!["nvidia","codex"].includes(state.selectedProvider)) state.selectedProvider = "nvidia";
    $("#providerSelect").value = state.selectedProvider;
    switchProvider(state.selectedProvider, false);
    if (state.providerHealth.codex?.authenticated) await loadCodexModels(refreshCodexModels);
    updateProviderSummary();
  } catch (err) {
    $("#modelPill").classList.add("bad"); $("#modelText").textContent = "Backend unavailable";
  }
}

function renderCodexHealth(health) {
  const available = !!(health.cli?.available ?? health.cli?.installed), installed = !!health.cli?.installed, connected = !!health.authenticated;
  // If npx is available, no global/user-local Codex installation is required.
  $("#installCodexBtn").hidden = available;
  $("#connectCodexBtn").hidden = !available || connected;
  const deviceBtn = $("#deviceCodexBtn"); if (deviceBtn) deviceBtn.hidden = true;
  $("#codexDisconnected").hidden = connected;
  $("#codexConnected").hidden = !connected;
  if (!available) {
    $("#codexStatusText").textContent = "Codex backend runtime is unavailable. Install Node.js/npm (recommended) or Codex CLI, then retry.";
  } else if (!connected) {
    const runtime = installed ? `Codex CLI ${health.cli?.version || "available"}` : "Official Codex backend via npx";
    $("#codexStatusText").textContent = `${runtime}. Connect through the ChatGPT web sign-in page; your normal local Codex login is not reused.`;
  }
  if (connected) {
    const acct = health.account || {};
    const chatgptManaged = health.auth_mode === "chatgpt" || acct.type === "chatgpt";
    $("#codexAccount").textContent = acct.email || acct.name || (chatgptManaged ? "ChatGPT connected" : "Codex authenticated");
    if (chatgptManaged) {
      $("#codexPlan").textContent = health.plan_type ? `${String(health.plan_type).toUpperCase()} plan · Codex-managed ChatGPT OAuth` : "Codex-managed ChatGPT OAuth";
    } else {
      $("#codexPlan").textContent = `Auth mode: ${health.auth_mode || acct.type || "Codex"}`;
    }
  }
}

function switchProvider(provider, persist=true) {
  state.selectedProvider = provider;
  if (persist) localStorage.setItem("awb.provider", provider);
  $("#nvidiaPanel").hidden = provider !== "nvidia";
  $("#codexPanel").hidden = provider !== "codex";
  updateProviderSummary();
}

function effortValues(model) {
  return (model?.supportedReasoningEfforts || []).map(x => typeof x === "string" ? x : (x.reasoningEffort || x.effort)).filter(Boolean);
}
function modelId(model) { return model?.model || model?.id || ""; }
async function loadCodexModels(force=false) {
  try {
    const data = await api(`/api/models/codex/list?force=${force ? "true" : "false"}`);
    if (!data.ok) throw new Error(data.error || "Could not load Codex models");
    state.codexModels = data.models || [];
    const select = $("#codexModelSelect");
    const previous = localStorage.getItem("awb.codex.model") || select.value;
    select.innerHTML = "";
    for (const model of state.codexModels) {
      const id = modelId(model); if (!id) continue;
      const opt = document.createElement("option"); opt.value = id;
      opt.textContent = `${model.displayName || id}${model.isDefault ? " · default" : ""}`;
      select.appendChild(opt);
    }
    const available = [...select.options].map(o => o.value);
    const defaultModel = state.codexModels.find(m => m.isDefault);
    select.value = available.includes(previous) ? previous : (modelId(defaultModel) || available[0] || "");
    renderEfforts();
    await loadCodexUsage();
    updateProviderSummary();
  } catch (err) {
    state.codexModels = [];
    $("#codexModelSelect").innerHTML = '<option value="">No models available</option>';
    $("#codexEffortSelect").innerHTML = '<option value="">—</option>';
    $("#codexQuota").textContent = err.message;
  }
}
function renderEfforts() {
  const id = $("#codexModelSelect").value;
  const model = state.codexModels.find(m => modelId(m) === id);
  const efforts = effortValues(model);
  const select = $("#codexEffortSelect"); select.innerHTML = "";
  const remembered = localStorage.getItem(`awb.codex.effort.${id}`);
  const defaultEffort = model?.defaultReasoningEffort || efforts[0] || "";
  const values = efforts.length ? efforts : [defaultEffort].filter(Boolean);
  if (!values.length) {
    const opt=document.createElement("option"); opt.value=""; opt.textContent="Provider default"; select.appendChild(opt);
  } else {
    for (const effort of values) { const opt=document.createElement("option"); opt.value=effort; opt.textContent=effort; select.appendChild(opt); }
    select.value = values.includes(remembered) ? remembered : (values.includes(defaultEffort) ? defaultEffort : values[0]);
  }
  localStorage.setItem("awb.codex.model", id);
  updateProviderSummary();
}
function quotaLine(label, bucket) {
  if (!bucket) return "";
  const used = Number(bucket.usedPercent ?? 0);
  let reset = "";
  if (bucket.resetsAt) { try { reset = ` · resets ${new Date(Number(bucket.resetsAt)*1000).toLocaleString()}`; } catch {} }
  return `${label}: ${Number.isFinite(used) ? used.toFixed(0) : "?"}% used${reset}`;
}
async function loadCodexUsage() {
  try {
    const limits = await api("/api/models/codex/rate-limits");
    const rows = [];
    const buckets = limits.rateLimitsByLimitId || {};
    for (const [id, value] of Object.entries(buckets)) rows.push(quotaLine(value.limitName || id, value.primary));
    if (!rows.length && limits.rateLimits) rows.push(quotaLine(limits.rateLimits.limitName || limits.rateLimits.limitId || "Codex", limits.rateLimits.primary));
    $("#codexQuota").innerHTML = rows.filter(Boolean).map(escapeHtml).join("<br>") || "Connected. No quota window details returned.";
  } catch (err) { $("#codexQuota").textContent = `Usage unavailable: ${err.message}`; }
}

async function installCodex() {
  const btn=$("#installCodexBtn"); btn.disabled=true; btn.textContent="Installing…";
  try { await api("/api/models/codex/install", {method:"POST",body:"{}"}); toast("Codex CLI installed."); await loadHealth(); }
  catch(err){ toast(err.message,true); }
  finally { btn.disabled=false; btn.textContent="Prepare Codex backend"; }
}
function startLoginPolling(loginId) {
  clearInterval(state.codexLoginTimer); state.codexLoginId=loginId;
  let ticks=0;
  state.codexLoginTimer=setInterval(async()=>{
    ticks++;
    try {
      const result=await api(`/api/models/codex/login/${encodeURIComponent(loginId)}`);
      if (result.authenticated || result.completed?.success) {
        clearInterval(state.codexLoginTimer); state.codexLoginTimer=null; state.codexLoginId=null;
        $("#deviceCodeBox").hidden=true; toast("ChatGPT connected to Codex."); await loadHealth({refreshCodexModels:true});
      } else if (result.completed && result.completed.success === false) {
        clearInterval(state.codexLoginTimer); state.codexLoginTimer=null; toast(result.completed.error || "Codex login failed",true);
      } else if (ticks > 240) {
        clearInterval(state.codexLoginTimer); state.codexLoginTimer=null; toast("Login is still pending. You can try connecting again.",true);
      }
    } catch(err) { if (ticks > 3) console.warn(err); }
  },1000);
}
async function connectCodexBrowser() {
  try {
    // Canonical website flow: OpenAI device-code login. Unlike the legacy
    // browser callback, this does not depend on redirect_uri=localhost and
    // therefore works when the browser and backend are on different machines.
    const result=await api("/api/models/codex/connect-web",{method:"POST",body:"{}"});
    if (!result.verificationUrl || !result.userCode || !result.loginId) throw new Error("Codex did not return ChatGPT web verification details");
    state.deviceVerificationUrl=result.verificationUrl; $("#deviceUserCode").textContent=result.userCode; $("#deviceCodeBox").hidden=false;
    window.open(result.verificationUrl,"_blank","noopener,noreferrer");
    startLoginPolling(result.loginId); toast("Sign in to ChatGPT in the opened OpenAI page and enter the shown code.");
  } catch(err){ toast(err.message,true); }
}
async function connectCodexDevice() { return connectCodexBrowser(); }
async function logoutCodex() {
  try { await api("/api/models/codex/logout",{method:"POST",body:"{}"}); state.codexModels=[]; toast("Codex disconnected."); await loadHealth(); }
  catch(err){ toast(err.message,true); }
}

async function loadProjects(preferId=null) {
  const data=await api("/api/projects"); state.projects=data.projects||[]; const select=$("#projectSelect"); select.innerHTML="";
  for(const project of state.projects){const option=document.createElement("option");option.value=project.project_id;option.textContent=`${project.name}${project.latest_run_id?" · existing":""}`;select.appendChild(option);}
  if(!state.projects.length){await createProject("My Website");return;}
  const target=preferId&&state.projects.some(p=>p.project_id===preferId)?preferId:(state.projectId&&state.projects.some(p=>p.project_id===state.projectId)?state.projectId:state.projects[0].project_id);
  select.value=target;state.projectId=target;const project=state.projects.find(p=>p.project_id===target);
  if(project?.latest_run_id&&!state.runId){showPreview(`/preview/${project.latest_run_id}/index.html`);$("#previewAddress").textContent=`/preview/${project.latest_run_id}/index.html`;}
}
async function createProject(defaultName=null){const name=defaultName||prompt("Project name:","My Website");if(!name)return;try{const project=await api("/api/projects",{method:"POST",body:JSON.stringify({name})});state.projectId=project.project_id;state.runId=null;state.run=null;await loadProjects(project.project_id);resetRunUi();toast(`Created project: ${project.name}`);}catch(err){toast(err.message,true);}}
function resetRunUi(){clearInterval(state.pollTimer);state.pollTimer=null;$("#trace").innerHTML='<div class="trace-empty">No run started.</div>';$("#plan").innerHTML='<div class="trace-empty">Plan appears after analysis.</div>';$("#verification").innerHTML='<div class="trace-empty">Verification evidence appears after the first run.</div>';$("#changes").innerHTML='<span class="muted">No patches yet.</span>';setStatus("idle","IDLE");setControls(false,false);renderMetrics(null);}
function setControls(running,artifactReady){$("#generateBtn").disabled=running;$("#stopBtn").disabled=!running;$("#downloadBtn").disabled=!artifactReady;$("#providerSelect").disabled=running;$("#codexModelSelect").disabled=running;$("#codexEffortSelect").disabled=running;}
function setStatus(css,label){const badge=$("#statusBadge");badge.className=`status ${css}`;badge.textContent=label;}

async function startRun(){
  const promptText=$("#prompt").value.trim(); if(promptText.length<3)return toast("Enter a website request first.",true); if(!state.projectId)return toast("Create or select a project first.",true);
  const provider=selectedProvider(); if(!providerReady(provider)) return toast(provider==="codex"?"Connect your ChatGPT account to Codex first.":"Add your NVIDIA API key in config.py or choose OpenAI Codex.",true);
  const model_id=selectedModel(); if(!model_id)return toast("Choose a model first.",true);
  try{
    setControls(true,false);setStatus("working","STARTING");
    const data=await api(`/api/projects/${state.projectId}/generate`,{method:"POST",body:JSON.stringify({prompt:promptText,inject_demo_bug:$("#demoBug").checked,provider,model_id,reasoning_effort:selectedEffort()})});
    state.runId=data.run_id;state.run=null;$("#trace").innerHTML="";$("#plan").innerHTML="";$("#verification").innerHTML="";$("#changes").innerHTML='<span class="muted">No patches yet.</span>';pollRun();clearInterval(state.pollTimer);state.pollTimer=setInterval(pollRun,750);
  }catch(err){setControls(false,false);setStatus("failed","ERROR");toast(err.message,true);}
}
async function pollRun(){if(!state.runId)return;try{const run=await api(`/api/runs/${state.runId}`);state.run=run;renderRun(run);if(["completed","failed","cancelled"].includes(run.status)){clearInterval(state.pollTimer);state.pollTimer=null;await loadProjects(state.projectId);}}catch(err){clearInterval(state.pollTimer);state.pollTimer=null;toast(`Run polling failed: ${err.message}`,true);}}
function renderRun(run){const running=["queued","working"].includes(run.status);const artifactReady=run.status==="completed"&&!!run.artifact_path;setControls(running,artifactReady);setStatus(run.status==="working"||run.status==="queued"?"working":run.status,`${run.phase} · ${run.status}`.toUpperCase());renderTrace(run.trace||[]);renderPlan(run.plan||[]);renderVerification(run);renderChanges(run.change_history||[]);renderMetrics(run);if(run.preview_url){$("#previewAddress").textContent=run.preview_url.replace(location.origin,"");if(state.previewUrl!==run.preview_url)showPreview(run.preview_url);}if(run.status==="failed"){const reason=run.final_verification?.failed?.[0]?.reason||"Run failed. Inspect the agent trace.";toast(reason,true);}}
function renderTrace(events){const trace=$("#trace");if(!events.length){trace.innerHTML='<div class="trace-empty">Waiting for first agent event…</div>';return;}trace.innerHTML=events.map(e=>{const time=(e.timestamp||"").split("T")[1]?.slice(0,8)||"";return `<div class="trace-item" data-kind="${escapeHtml(e.kind)}"><span class="trace-dot"></span><div class="trace-main"><div class="trace-head"><span class="trace-kind">${escapeHtml(e.kind)}</span><span>${escapeHtml(e.phase)} · ${escapeHtml(time)}</span></div><div class="trace-msg">${escapeHtml(e.message)}</div></div></div>`;}).join("");trace.scrollTop=trace.scrollHeight;}
function renderPlan(plan){const el=$("#plan");if(!plan.length)return el.innerHTML='<div class="trace-empty">Plan appears after analysis.</div>';el.innerHTML=plan.map((step,i)=>`<div class="plan-item"><div class="plan-row"><strong>${i+1}. ${escapeHtml(step.title)}</strong><span class="plan-state">${escapeHtml(step.status)}</span></div><div class="plan-desc">${escapeHtml(step.description)}</div></div>`).join("");}
function requirementText(run,id){return(run.requirements||[]).find(r=>r.id===id)?.text||id||"Requirement";}
function normalizeVerdictItems(items){return(items||[]).map(item=>typeof item==="string"?{id:item,reason:"Verified by available evidence."}:item);}
function renderVerification(run){const verdict=run.final_verification||{};const el=$("#verification");const all=[...normalizeVerdictItems(verdict.passed).map(x=>({...x,type:"pass"})),...normalizeVerdictItems(verdict.failed).map(x=>({...x,type:"fail"})),...normalizeVerdictItems(verdict.uncertain).map(x=>({...x,type:"uncertain"}))];if(!all.length){el.innerHTML='<div class="trace-empty">Verification evidence appears after the first run.</div>';return;}el.innerHTML=all.map(item=>{const symbol=item.type==="pass"?"✓":(item.type==="fail"?"×":"?");return `<div class="verify-item ${item.type}"><div class="verify-title"><strong>${symbol}</strong><span>${escapeHtml(requirementText(run,item.id))}</span></div><div class="verify-reason">${escapeHtml(item.reason||item.evidence||"")}</div></div>`;}).join("");}
function renderChanges(changes){const el=$("#changes");if(!changes.length)return el.innerHTML='<span class="muted">No patches yet.</span>';el.innerHTML=changes.slice(-15).reverse().map(c=>`<div class="change"><span>${escapeHtml(c.path||"file")}</span><span><b class="plus">+${Number(c.lines_added||0)}</b> <b class="minus">-${Number(c.lines_removed||0)}</b></span></div>`).join("");}
function renderMetrics(run){$("#metricIterations").textContent=run?.iteration_count||0;$("#metricRepairs").textContent=run?.self_repair_count||0;$("#metricFiles").textContent=run?.project_files?.length||0;const total=run?.requirements?.length||0;const passed=run?.final_verification?.passed?.length||0;$("#metricReqs").textContent=`${passed}/${total}`;$("#metricContext").textContent=run?.context_compaction_count||0;const saved=Number(run?.context_tokens_saved_est||0);$("#metricSaved").textContent=saved>=1000?`${(saved/1000).toFixed(saved>=10000?0:1)}k`:saved;}
function showPreview(url){state.previewUrl=url;const frame=$("#previewFrame");frame.hidden=false;$("#previewEmpty").hidden=true;frame.src=url+(url.includes("?")?"&":"?")+"t="+Date.now();}
async function stopRun(){if(!state.runId)return;try{await api(`/api/runs/${state.runId}/stop`,{method:"POST",body:"{}"});toast("Stop requested. The controller will halt at the next bounded transition.");}catch(err){toast(err.message,true);}}
async function testModel(){const btn=$("#modelTestBtn");btn.disabled=true;btn.textContent="Testing…";try{const result=await api("/api/models/test",{method:"POST",body:JSON.stringify({provider:selectedProvider(),model_id:selectedModel(),reasoning_effort:selectedEffort()})});if(result.ok)toast(`Model reachable: ${result.model_id} · ${result.response||"OK"}`);else toast(result.error||"Model test failed",true);}catch(err){toast(err.message,true);}finally{btn.disabled=false;btn.textContent="Test selected model";await loadHealth();}}
function activateTab(name){$$('.tab').forEach(t=>t.classList.toggle('active',t.dataset.tab===name));$$('.tab-body').forEach(b=>b.classList.remove('active'));$(`#${name}Tab`).classList.add('active');}

function wireEvents(){
  $("#newProjectBtn").addEventListener("click",()=>createProject());
  $("#projectSelect").addEventListener("change",async e=>{state.projectId=e.target.value;state.runId=null;state.run=null;resetRunUi();const project=state.projects.find(p=>p.project_id===state.projectId);if(project?.latest_run_id)showPreview(`/preview/${project.latest_run_id}/index.html`);});
  $("#providerSelect").addEventListener("change",e=>switchProvider(e.target.value,true));
  $("#installCodexBtn").addEventListener("click",installCodex); $("#connectCodexBtn").addEventListener("click",connectCodexBrowser); const deviceBtn=$("#deviceCodexBtn"); if(deviceBtn) deviceBtn.addEventListener("click",connectCodexDevice); $("#logoutCodexBtn").addEventListener("click",logoutCodex);
  $("#openDeviceUrlBtn").addEventListener("click",()=>{if(state.deviceVerificationUrl)window.open(state.deviceVerificationUrl,"_blank","noopener,noreferrer");});
  $("#refreshCodexBtn").addEventListener("click",()=>loadHealth({refreshCodexModels:true}));
  $("#codexModelSelect").addEventListener("change",()=>{localStorage.setItem("awb.codex.model",$("#codexModelSelect").value);renderEfforts();});
  $("#codexEffortSelect").addEventListener("change",()=>{const id=$("#codexModelSelect").value;if(id)localStorage.setItem(`awb.codex.effort.${id}`,$("#codexEffortSelect").value);});
  $("#generateBtn").addEventListener("click",startRun); $("#stopBtn").addEventListener("click",stopRun); $("#modelTestBtn").addEventListener("click",testModel);
  $("#downloadBtn").addEventListener("click",()=>{if(state.runId)location.href=`/api/runs/${state.runId}/artifact`;});
  $("#refreshPreview").addEventListener("click",()=>{if(state.previewUrl)showPreview(state.previewUrl);});
  $$(".viewport-btn").forEach(btn=>btn.addEventListener("click",()=>{$$(".viewport-btn").forEach(b=>b.classList.remove("active"));btn.classList.add("active");$("#previewFrame").style.width=btn.dataset.width;}));
  $$(".tab").forEach(btn=>btn.addEventListener("click",()=>activateTab(btn.dataset.tab)));
}
async function init(){wireEvents();await Promise.allSettled([loadHealth(),loadProjects()]);}
init();
