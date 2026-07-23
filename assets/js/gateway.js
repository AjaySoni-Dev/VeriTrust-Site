(function initGateway(global) {
  const api = global.VeriTrustSupabase;
  const form = document.getElementById('gateway-form');
  if (!form || !api) return;
  const elements = Object.fromEntries(['auth','error','text','urls','file','file-label','context','submit','cancel','status','status-copy','empty','output','recommendation','risk','verdict','reasons','evidence','audit','refresh','history-list'].map((name) => [name, document.getElementById(`gateway-${name}`)]));
  let activeScanId = null;
  let polling = null;

  function setError(message) { elements.error.textContent = message || ''; elements.error.hidden = !message; }
  function setBusy(busy, message) { form.querySelectorAll('input,textarea,select,button').forEach((item) => { if (item !== elements.cancel) item.disabled = busy; }); elements.submit.textContent = busy ? 'Processing…' : 'Analyze through gateway'; document.querySelector('.gateway-result').classList.toggle('is-loading', busy); if (message) elements['status-copy'].textContent = message; }
  async function request(url, options = {}) { return api.callAppApi(url, options); }

  async function uploadMedia(file) {
    const registered = await request('/api/v1/gateway/uploads', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind: file.type.startsWith('image/') ? 'image' : file.type.startsWith('audio/') ? 'audio' : 'video', mime_type: file.type, size_bytes: file.size }) });
    const config = global.VeriTrust_CONFIG || {};
    if (!registered.signed_upload || !registered.signed_upload.url) throw new Error('A signed private upload URL was not returned.');
    const signedUrl = /^https?:/i.test(registered.signed_upload.url || '') ? registered.signed_upload.url : `${String(config.supabase?.url || '').replace(/\/$/,'')}/storage/v1${registered.signed_upload.url}`;
    const uploadResponse = await fetch(signedUrl, { method: 'PUT', headers: { 'Content-Type': file.type, 'x-upsert': 'false' }, body: file });
    if (!uploadResponse.ok) throw new Error('The private media upload failed.');
    await request(`/api/v1/gateway/uploads/${registered.upload_id}/complete`, { method: 'POST' });
    return { upload_id: registered.upload_id, kind: file.type.startsWith('image/') ? 'image' : file.type.startsWith('audio/') ? 'audio' : 'video' };
  }

  function render(data) {
    activeScanId = data.scan_id || activeScanId;
    const decision = data.decision || {};
    elements.empty.hidden = true; elements.output.hidden = false;
    elements.status.textContent = data.status || 'unknown'; elements['status-copy'].textContent = data.status === 'completed' ? 'Final policy decision available.' : 'Analysis is continuing in the durable worker.';
    elements.recommendation.textContent = decision.recommendation || 'Pending'; elements.risk.textContent = Number.isFinite(Number(decision.risk)) ? `${Math.round(Number(decision.risk) * 100)}%` : 'Pending'; elements.verdict.textContent = decision.verdict || 'Unknown';
    elements.reasons.replaceChildren(...(decision.reason_codes || []).map((code) => { const span=document.createElement('span'); span.textContent=code.replaceAll('_',' '); return span; }));
    elements.evidence.replaceChildren(...(data.evidence || []).map((item) => { const article=document.createElement('article'); const heading=document.createElement('div'); heading.className='gateway-evidence-head'; const strong=document.createElement('strong'); strong.textContent=String(item.model||'Model').replaceAll('_',' '); const status=document.createElement('span'); status.textContent=item.status; status.dataset.status=String(item.status||'unknown').toLowerCase(); heading.append(strong,status); const detail=document.createElement('p'); detail.textContent=item.score===null||item.score===undefined?'No score available':`Score ${Math.round(Number(item.score)*100)}% · ${item.verdict} · ${item.model_version}`; article.append(heading,detail); return article; }));
    elements.audit.replaceChildren(...[['Scan',data.display_id||data.scan_id],['Request',data.submission_request_id||data.request_id],['Policy',data.policy_version_id],['Correlation',data.correlation_version]].map(([label,value])=>{const line=document.createElement('div');line.textContent=`${label}: ${value||'—'}`;return line;}));
    elements.cancel.hidden = !['accepted','queued','processing','partially_completed','cancel_requested'].includes(data.status);
  }

  async function poll(scanId) {
    clearTimeout(polling);
    try { const data=await request(`/api/v1/gateway/scans/${scanId}`,{cache:'no-store'}); render(data); if (!['completed','failed','cancelled'].includes(data.status)) polling=setTimeout(()=>poll(scanId),2500); else setBusy(false); }
    catch(error){setError(error.message);setBusy(false);}
  }

  async function refreshHistory() {
    try { const data=await request('/api/v1/gateway/scans?limit=12',{cache:'no-store'}); const rows=data.scans||[]; elements['history-list'].replaceChildren(...rows.map((scan)=>{const article=document.createElement('article');const id=document.createElement('strong');id.textContent=scan.display_id;const state=document.createElement('em');state.textContent=scan.status;const time=document.createElement('span');time.textContent=new Date(scan.created_at).toLocaleString();article.append(id,state,time);article.tabIndex=0;article.addEventListener('click',async()=>render(await request(`/api/v1/gateway/scans/${scan.id}`)));return article;})); if(!rows.length)elements['history-list'].textContent='No gateway scans yet.'; }
    catch(error){elements['history-list'].textContent=error.message;}
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault(); setError(''); setBusy(true,'Validating and routing applicable models…');
    try {
      const session=await api.getSession(); if(!session)throw new Error('Sign in before submitting a gateway scan.');
      const files=[...elements.file.files];
      if(files.length>10)throw new Error('Choose no more than 10 media files.');
      const media=[];
      for(const file of files)media.push(await uploadMedia(file));
      const urls=elements.urls.value.split(/\r?\n/).map((value)=>value.trim()).filter(Boolean);
      const context=elements.context.value;
      const data=await request('/api/v1/gateway/scans',{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':crypto.randomUUID()},body:JSON.stringify({source:{kind:'web'},content:{text:elements.text.value,urls,media},processing_mode:media.length?'hybrid':'synchronous',metadata:{context_categories:context?[context]:[]}})});
      render(data); await refreshHistory(); if(!['completed','failed','cancelled'].includes(data.status))poll(data.scan_id);else setBusy(false);
    } catch(error){setError(error.message);setBusy(false);}
  });
  elements.file.addEventListener('change',()=>{const files=[...elements.file.files];elements['file-label'].textContent=files.length?`${files.length} file${files.length===1?'':'s'} selected`:'Choose up to 10 images, audio, or video files';});
  elements.cancel.addEventListener('click',async()=>{if(!activeScanId)return;try{await request(`/api/v1/gateway/scans/${activeScanId}/cancel`,{method:'POST'});poll(activeScanId);}catch(error){setError(error.message);}});
  elements.refresh.addEventListener('click',refreshHistory);
  api.getSession().then((session)=>{elements.auth.hidden=Boolean(session);form.querySelectorAll('input,textarea,select,button').forEach((item)=>item.disabled=!session);if(session)refreshHistory();});
})(window);
