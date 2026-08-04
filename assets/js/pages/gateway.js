(function initGateway(global) {
  const api = global.VeriTrustSupabase;
  const form = document.getElementById('gateway-form');
  if (!form || !api) return;
  const elements = Object.fromEntries(['auth','error','text','urls','file','file-label','context','submit','cancel','status','status-copy','empty','output','recommendation','risk','verdict','reasons','evidence','audit','refresh','result-loading','history-list','history-pagination','history-count','history-more'].map((name) => [name, document.getElementById(`gateway-${name}`)]));
  const resultPanel = document.querySelector('.gateway-result');
  let activeScanId = null;
  let polling = null;
  let historyRows = [];
  let visibleHistoryCount = 5;
  let historySelectionPending = false;
  const HISTORY_PAGE_SIZE = 5;

  function setError(message) { elements.error.textContent = message || ''; elements.error.hidden = !message; }
  function setBusy(busy, message) {
    form.querySelectorAll('input,textarea,select,button').forEach((item) => {
      if (item !== elements.cancel) item.disabled = busy;
    });
    elements.submit.textContent = busy ? 'Processing…' : 'Analyze through gateway';
    elements.submit.classList.toggle('is-loading', busy);
    elements.submit.classList.remove('vt-loading-shimmer');
    if (busy) elements.submit.setAttribute('aria-busy', 'true');
    else elements.submit.removeAttribute('aria-busy');
    resultPanel?.classList.toggle('is-loading', busy);
    resultPanel?.classList.remove('vt-loading-shimmer');
    if (message) elements['status-copy'].textContent = message;
  }
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
    resultPanel?.classList.remove('vt-loading-shimmer');
    resultPanel?.querySelectorAll('.vt-loading-shimmer').forEach((node) => {
      node.classList.remove('vt-loading-shimmer');
    });
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

  async function openHistoryScan(scan, item) {
    if (historySelectionPending) return;
    historySelectionPending = true;
    setError('');
    clearTimeout(polling);
    elements['history-list'].querySelectorAll('.gateway-history-item').forEach((historyItem) => {
      historyItem.classList.toggle('is-selected', historyItem === item);
      historyItem.removeAttribute('aria-current');
    });
    item.disabled = true;
    item.setAttribute('aria-current', 'true');
    elements['result-loading'].hidden = false;
    resultPanel?.classList.add('is-history-loading');
    resultPanel?.classList.remove('vt-loading-shimmer');
    resultPanel?.setAttribute('aria-busy', 'true');
    elements['status-copy'].textContent = `Loading ${scan.display_id || 'selected scan'}…`;

    try {
      const data = await request(`/api/v1/gateway/scans/${scan.id}`, { cache: 'no-store' });
      render(data);
    } catch (error) {
      setError(error.message);
      elements['status-copy'].textContent = 'The selected scan could not be loaded.';
    } finally {
      historySelectionPending = false;
      item.disabled = false;
      elements['result-loading'].hidden = true;
      resultPanel?.classList.remove('is-history-loading', 'vt-loading-shimmer');
      resultPanel?.removeAttribute('aria-busy');
    }
  }

  function renderHistory() {
    const visibleRows = historyRows.slice(0, visibleHistoryCount);
    elements['history-list'].replaceChildren(...visibleRows.map((scan) => {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'gateway-history-item';
      item.setAttribute('aria-label', `Open scan ${scan.display_id || scan.id}, ${scan.status || 'unknown status'}`);

      const id = document.createElement('strong');
      id.textContent = scan.display_id || scan.id;
      const state = document.createElement('em');
      state.textContent = scan.status || 'unknown';
      const time = document.createElement('span');
      time.textContent = new Date(scan.created_at).toLocaleString();

      item.append(id, state, time);
      item.addEventListener('click', () => openHistoryScan(scan, item));
      return item;
    }));

    if (!historyRows.length) {
      elements['history-list'].textContent = 'No gateway scans yet.';
      elements['history-pagination'].hidden = true;
      return;
    }

    elements['history-count'].textContent = `Showing ${visibleRows.length} of ${historyRows.length} scans`;
    elements['history-more'].hidden = visibleRows.length >= historyRows.length;
    elements['history-pagination'].hidden = false;
  }

  async function refreshHistory() {
    elements.refresh.disabled = true;
    elements.refresh.classList.add('is-loading');
    elements.refresh.classList.remove('vt-loading-shimmer');
    elements.refresh.setAttribute('aria-busy', 'true');
    try {
      const data = await request('/api/v1/gateway/scans?limit=50', { cache: 'no-store' });
      historyRows = Array.isArray(data.scans) ? data.scans : [];
      visibleHistoryCount = HISTORY_PAGE_SIZE;
      renderHistory();
    } catch (error) {
      elements['history-list'].textContent = error.message;
      elements['history-pagination'].hidden = true;
    } finally {
      elements.refresh.disabled = false;
      elements.refresh.classList.remove('is-loading');
      elements.refresh.removeAttribute('aria-busy');
    }
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
  elements['history-more'].addEventListener('click', () => {
    visibleHistoryCount = Math.min(historyRows.length, visibleHistoryCount + HISTORY_PAGE_SIZE);
    renderHistory();
  });
  api.getSession().then((session)=>{elements.auth.hidden=Boolean(session);form.querySelectorAll('input,textarea,select,button').forEach((item)=>item.disabled=!session);if(session)refreshHistory();});
})(window);
