'use strict';

const state = {
  mode: 'tutor', voice: 'en-US-natalie',
  isRecording: false, isSpeaking: false, isThinking: false,
  messages: [], sessionStart: Date.now(),
  wordCount: 0, responseCount: 0,
  playbackSpeed: 1, volume: 1,
  mediaRecorder: null, audioChunks: [],
  audioCtx: null, analyser: null, animFrameId: null, currentAudio: null,
};

const VOICE_AVATARS = {
  'en-US-natalie': 'https://thumbs.dreamstime.com/b/d-icon-avatar-cartoon-cute-freelancer-woman-working-online-learning-laptop-transparent-png-background-works-embodying-345422695.jpg?w=768',
  'en-GB-hazel':   'https://thumbs.dreamstime.com/b/d-icon-avatar-cartoon-cute-freelancer-woman-working-online-learning-laptop-transparent-png-background-works-embodying-345422695.jpg?w=768',
  'en-IN-isha':    'https://thumbs.dreamstime.com/b/d-icon-avatar-cartoon-cute-freelancer-woman-working-online-learning-laptop-transparent-png-background-works-embodying-345422695.jpg?w=768',
  'en-US-marcus':  'https://img.freepik.com/free-photo/androgynous-avatar-non-binary-queer-person_23-2151100221.jpg?semt=ais_hybrid&w=740&q=80',
  'en-AU-evander': 'https://img.freepik.com/free-photo/androgynous-avatar-non-binary-queer-person_23-2151100221.jpg?semt=ais_hybrid&w=740&q=80',
};
function getAssistantAvatar() {
  return VOICE_AVATARS[state.voice] || VOICE_AVATARS['en-US-marcus'];
}

function syncAvatars() {
  const url = getAssistantAvatar();
  // Topbar avatar
  const topImg = $('topbarAvatarImg');
  if (topImg) topImg.src = url;
  // Viz circle center avatar
  const vizImg = $('vizAvatarImg');
  if (vizImg) vizImg.src = url;
  // All existing assistant message avatars in chat
  document.querySelectorAll('.msg-avatar.avatar-img img').forEach(img => img.src = url);
}

const QUICK_STARTS = {
  tutor: ['Explain quantum computing','Help me with calculus','What is machine learning?','Teach me about DNA'],
  customer_support: ['Track my order','Request a refund','Reset my password','Billing question'],
  productivity: ['Plan my day','Set a reminder','Help me focus','Weekly review'],
  language_coach: ['Practice Spanish','Correct my grammar','Teach me French phrases','Pronunciation tips'],
};
const MODE_META = {
  tutor:            { icon: 'fa-graduation-cap', label: 'Tutor Mode' },
  customer_support: { icon: 'fa-headset',        label: 'Support Mode' },
  productivity:     { icon: 'fa-bolt',            label: 'Productivity Mode' },
  language_coach:   { icon: 'fa-language',        label: 'Language Mode' },
};

const $ = id => document.getElementById(id);
const chatArea       = $('chatArea');
const messagesEl     = $('messages');
const welcomeScreen  = $('welcomeScreen');
const textInput      = $('textInput');
const micBtn         = $('micBtn');
const micIcon        = $('micIcon');
const sendBtn        = $('sendBtn');
const statusDot      = $('statusDot');
const statusText     = $('statusText');
const waveformCont   = $('waveformContainer');
const waveformCanvas = $('waveform');
const vizCanvas      = $('vizCanvas');
const eqBarsEl       = $('eqBars');
const toastCont      = $('toastContainer');
const loadingOverlay = $('loadingOverlay');
const loadingText    = $('loadingText');
const quickStarts    = $('quickStarts');
const lastTranscript = $('lastTranscript');
const modePill       = $('modePill');
const modePillText   = $('modePillText');
const charCount      = $('charCount');
const volVal         = $('volVal');

let pendingFile = null;
let pendingFileType = null;

document.addEventListener('DOMContentLoaded', () => {
  initParticles();
  initEqBars();
  initVizCanvas();
  renderQuickStarts(state.mode);
  startSessionTimer();
  bindEvents();
  setStatus('ready');
  // Sync all avatars to default voice on load
  syncAvatars();
});

function bindEvents() {
  $('sidebarToggle').addEventListener('click', () => $('sidebar').classList.toggle('collapsed'));
  document.querySelectorAll('.mode-btn').forEach(btn => btn.addEventListener('click', () => switchMode(btn.dataset.mode)));
  $('voiceSelect').addEventListener('change', e => {
    state.voice = e.target.value;
    syncAvatars();
  });
  textInput.addEventListener('input', onTextInput);
  textInput.addEventListener('keydown', onTextKeydown);
  sendBtn.addEventListener('click', () => sendTextMessage());
  micBtn.addEventListener('click', toggleRecording);
  document.addEventListener('keydown', e => {
    if (e.code === 'Space' && document.activeElement !== textInput) { e.preventDefault(); toggleRecording(); }
  });
  $('resetBtn').addEventListener('click', resetConversation);
  $('clearBtn').addEventListener('click', clearHistory);
  $('historyRefresh').addEventListener('click', loadHistory);
  loadHistory();
  $('attachBtn').addEventListener('click', () => $('fileInput').click());
  $('fileInput').addEventListener('change', onFileSelected);
  $('attachRemove').addEventListener('click', clearAttachment);
  $('themeToggle').addEventListener('click', toggleTheme);
  $('shareBtn').addEventListener('click', openShareModal);
  $('shareModalClose').addEventListener('click', closeShareModal);
  $('shareModal').addEventListener('click', e => { if (e.target === $('shareModal')) closeShareModal(); });
  $('shareCopyText').addEventListener('click', shareCopyText);
  $('shareDownloadTxt').addEventListener('click', shareDownloadTxt);
  $('shareDownloadHtml').addEventListener('click', shareDownloadHtml);
  $('shareNative').addEventListener('click', shareNative);
  $('fullscreenBtn').addEventListener('click', toggleFullscreen);
  $('vizClose').addEventListener('click', () => { $('vizPanel').style.display = 'none'; });
  document.querySelectorAll('.speed-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.speed-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.playbackSpeed = parseFloat(btn.dataset.speed);
      if (state.currentAudio) state.currentAudio.playbackRate = state.playbackSpeed;
    });
  });
  $('volumeSlider').addEventListener('input', e => {
    state.volume = parseFloat(e.target.value);
    volVal.textContent = Math.round(state.volume * 100) + '%';
    if (state.currentAudio) state.currentAudio.volume = state.volume;
  });
  messagesEl.addEventListener('click', e => {
    const btn = e.target.closest('.msg-action-btn');
    if (!btn) return;
    const bubble = btn.closest('.message').querySelector('.msg-bubble');
    if (btn.dataset.action === 'copy') { navigator.clipboard.writeText(bubble.innerText.trim()); showToast('Copied!', 'success'); }
    if (btn.dataset.action === 'replay') speakText(bubble.innerText.trim());
  });
}

function switchMode(mode) {
  state.mode = mode;
  document.querySelectorAll('.mode-btn').forEach(btn => {
    const active = btn.dataset.mode === mode;
    btn.classList.toggle('active', active);
    const badge = btn.querySelector('.mode-badge');
    if (badge) badge.remove();
    if (active) { const b = document.createElement('span'); b.className = 'mode-badge'; b.textContent = 'Active'; btn.appendChild(b); }
  });
  const meta = MODE_META[mode];
  modePillText.textContent = meta.label;
  modePill.querySelector('i').className = `fa-solid ${meta.icon}`;
  renderQuickStarts(mode);
  showToast(`Switched to ${meta.label}`, 'info');
  fetch('/api/mode', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({mode}) }).catch(() => {});
}

function renderQuickStarts(mode) {
  quickStarts.innerHTML = '';
  QUICK_STARTS[mode].forEach(txt => {
    const chip = document.createElement('button');
    chip.className = 'quick-chip';
    chip.textContent = txt;
    chip.addEventListener('click', () => { textInput.value = txt; sendTextMessage(); });
    quickStarts.appendChild(chip);
  });
}

function onTextInput() {
  charCount.textContent = `${textInput.value.length}/500`;
  textInput.style.height = 'auto';
  textInput.style.height = Math.min(textInput.scrollHeight, 120) + 'px';
}

function onTextKeydown(e) {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendTextMessage(); }
}

async function sendTextMessage() {
  const text = textInput.value.trim();
  if (!text && !pendingFile) return;
  if (state.isThinking) return;
  state.isThinking = true;
  sendBtn.disabled = true;
  textInput.value = '';
  textInput.style.height = 'auto';
  charCount.textContent = '0/500';
  await processUserInput(text);
  sendBtn.disabled = false;
}

async function processUserInput(userText) {
  if (!userText && !pendingFile) { state.isThinking = false; return; }

  hideWelcome();
  const displayText = userText || (pendingFileType === 'image' ? '📷 Image attached' : '📄 PDF attached');
  addMessage('user', displayText, pendingFile, pendingFileType);
  updateStats(displayText, false);
  setStatus('thinking');
  const typingId = showTypingIndicator();

  try {
    let res;
    const voice = state.voice;

    if (pendingFile && pendingFileType === 'image') {
      const fd = new FormData();
      fd.append('image', pendingFile);
      fd.append('message', userText || 'Describe this image in detail.');
      fd.append('voice', voice);
      res = await fetch('/api/chat/image', { method: 'POST', body: fd });
    } else if (pendingFile && pendingFileType === 'pdf') {
      const fd = new FormData();
      fd.append('pdf', pendingFile);
      fd.append('message', userText || 'Summarize this document.');
      fd.append('voice', voice);
      res = await fetch('/api/chat/pdf', { method: 'POST', body: fd });
    } else {
      res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userText, mode: state.mode, voice }),
      });
    }

    clearAttachment();
    if (!res.ok) throw new Error(`Server error ${res.status}`);
    const data = await res.json();

    removeTypingIndicator(typingId);
    addMessage('assistant', data.text, null, null, data.chart, data.images || []);
    updateStats(data.text, true);
    lastTranscript.textContent = userText || '(attachment)';
    loadHistory();

    if (data.audio_url) await playAudioUrl(data.audio_url);
    else browserSpeak(data.text);

  } catch (err) {
    removeTypingIndicator(typingId);
    const errMsg = 'Sorry, something went wrong. Please try again.';
    addMessage('assistant', errMsg);
    browserSpeak(errMsg);
    showToast('Connection error — check the server', 'error');
    console.error(err);
  } finally {
    setStatus('ready');
    state.isThinking = false;
  }
}

async function toggleRecording() {
  if (state.isRecording) stopRecording(); else await startRecording();
}

async function startRecording() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    state.audioChunks = [];
    state.mediaRecorder = new MediaRecorder(stream);
    state.mediaRecorder.ondataavailable = e => { if (e.data.size > 0) state.audioChunks.push(e.data); };
    state.mediaRecorder.onstop = async () => {
      stream.getTracks().forEach(t => t.stop());
      await transcribeAndSend(new Blob(state.audioChunks, { type: 'audio/webm' }));
    };
    state.mediaRecorder.start(100);
    state.isRecording = true;
    micBtn.classList.add('recording');
    micIcon.className = 'fa-solid fa-stop';
    waveformCont.classList.add('active');
    setStatus('listening');
    initAudioVisualizer(stream);
  } catch (err) { showToast('Microphone access denied', 'error'); }
}

function stopRecording() {
  if (state.mediaRecorder && state.mediaRecorder.state !== 'inactive') state.mediaRecorder.stop();
  state.isRecording = false;
  micBtn.classList.remove('recording');
  micIcon.className = 'fa-solid fa-microphone';
  waveformCont.classList.remove('active');
  stopAudioVisualizer();
  setStatus('thinking');
}

async function transcribeAndSend(blob) {
  showLoading('Transcribing speech...');
  try {
    const fd = new FormData();
    fd.append('audio', blob, 'recording.webm');
    fd.append('mode', state.mode);
    fd.append('voice', state.voice);
    const res = await fetch('/api/transcribe', { method: 'POST', body: fd });
    const data = await res.json();
    hideLoading();
    if (data.text && data.text.trim()) await processUserInput(data.text.trim());
    else { showToast(data.hint || "Couldn't catch that — try typing", 'info'); setStatus('ready'); }
  } catch (err) { hideLoading(); showToast('Transcription error', 'error'); setStatus('ready'); }
}

async function playAudioUrl(url) {
  return new Promise(resolve => {
    setStatus('speaking');
    const audio = new Audio(url);
    audio.playbackRate = state.playbackSpeed;
    audio.volume = state.volume;
    state.currentAudio = audio;
    if (!state.audioCtx) state.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const src = state.audioCtx.createMediaElementSource(audio);
    const analyser = state.audioCtx.createAnalyser();
    analyser.fftSize = 64;
    src.connect(analyser); analyser.connect(state.audioCtx.destination);
    state.analyser = analyser;
    animateEqBars();
    audio.onended = () => { state.currentAudio = null; setStatus('ready'); stopEqAnimation(); resolve(); };
    audio.onerror = () => { setStatus('ready'); resolve(); };
    audio.play().catch(() => { setStatus('ready'); resolve(); });
  });
}

function speakText(text) {
  fetch('/api/tts', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({text, voice: state.voice}) })
    .then(r => r.json()).then(d => { if (d.audio_url) playAudioUrl(d.audio_url); }).catch(() => browserSpeak(text));
}

function browserSpeak(text) {
  if (!window.speechSynthesis) return;
  const utt = new SpeechSynthesisUtterance(text);
  utt.rate = state.playbackSpeed; utt.volume = state.volume;
  utt.onstart = () => setStatus('speaking'); utt.onend = () => setStatus('ready');
  window.speechSynthesis.speak(utt);
}

function addMessage(role, text, file = null, fileType = null, chartData = null, fetchedImages = []) {
  const isUser = role === 'user';
  state.messages.push({ role, text, time: new Date() });

  const avatarHtml = isUser
    ? `<div class="msg-avatar"><i class="fa-solid fa-user"></i></div>`
    : `<div class="msg-avatar avatar-img"><img src="${getAssistantAvatar()}" alt="assistant"/></div>`;

  const contentHtml = isUser
    ? escapeHtml(text)
    : (typeof marked !== 'undefined' ? marked.parse(text) : escapeHtml(text));

  let attachHtml = '';
  if (file && fileType === 'image') attachHtml = `<img src="${URL.createObjectURL(file)}" class="msg-img-preview" alt="attachment"/>`;
  else if (file && fileType === 'pdf') attachHtml = `<div class="msg-pdf-chip"><i class="fa-solid fa-file-pdf"></i> ${escapeHtml(file.name)}</div>`;

  let fetchedImgHtml = '';
  if (fetchedImages && fetchedImages.length > 0) {
    fetchedImgHtml = `<div class="fetched-images">` +
      fetchedImages.map(img => `<figure class="fetched-img-wrap"><img src="${img.url}" alt="${escapeHtml(img.caption)}" class="fetched-img" loading="lazy"/><figcaption>${escapeHtml(img.caption)}</figcaption></figure>`).join('') +
      `</div>`;
  }

  const chartId = chartData ? 'chart-' + Date.now() : null;
  const chartHtml = chartData ? `<div class="chart-wrap"><canvas id="${chartId}"></canvas></div>` : '';

  const el = document.createElement('div');
  el.className = `message ${role}`;
  el.innerHTML = `
    ${avatarHtml}
    <div class="msg-body">
      ${attachHtml}${fetchedImgHtml}
      <div class="msg-bubble markdown-body">${contentHtml}</div>
      ${chartHtml}
      <div class="msg-meta">
        <span>${formatTime(state.messages[state.messages.length-1].time)}</span>
        <div class="msg-actions">
          <button class="msg-action-btn" data-action="copy" title="Copy"><i class="fa-solid fa-copy"></i></button>
          ${!isUser ? `<button class="msg-action-btn" data-action="replay" title="Replay"><i class="fa-solid fa-play"></i></button>` : ''}
        </div>
      </div>
    </div>`;

  messagesEl.appendChild(el);
  if (chartData && chartId) renderChart(chartId, chartData);
  scrollToBottom();
  $('statMessages').textContent = state.messages.length;
}

function showTypingIndicator() {
  const id = 'typing-' + Date.now();
  const el = document.createElement('div');
  el.className = 'message assistant typing-indicator'; el.id = id;
  el.innerHTML = `<div class="msg-avatar avatar-img"><img src="${getAssistantAvatar()}" alt="assistant"/></div>
    <div class="msg-body"><div class="msg-bubble"><div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div></div></div>`;
  messagesEl.appendChild(el); scrollToBottom(); return id;
}
function removeTypingIndicator(id) { const el = $(id); if (el) el.remove(); }
function hideWelcome() { welcomeScreen.classList.add('hidden'); }
function scrollToBottom() { chatArea.scrollTo({ top: chatArea.scrollHeight, behavior: 'smooth' }); }

function updateStats(text, isResponse) {
  state.wordCount += text.trim().split(/\s+/).length;
  $('statWords').textContent = state.wordCount;
  if (isResponse) { state.responseCount++; $('statResponses').textContent = state.responseCount; }
}

function startSessionTimer() {
  setInterval(() => {
    const s = Math.floor((Date.now() - state.sessionStart) / 1000);
    $('statDuration').textContent = s >= 60 ? `${Math.floor(s/60)}m${s%60}s` : `${s}s`;
  }, 1000);
}

function setStatus(s) {
  const labels = { ready:'Ready', listening:'Listening...', thinking:'Thinking...', speaking:'Speaking...', error:'Error' };
  statusDot.className = 'status-dot ' + s;
  statusText.textContent = labels[s] || s;
  $('vizLabel').textContent = labels[s] || s;
}

function resetConversation() {
  fetch('/api/reset', { method: 'POST' }).catch(() => {});
  state.messages = []; state.wordCount = 0; state.responseCount = 0;
  messagesEl.innerHTML = '';
  welcomeScreen.classList.remove('hidden');
  $('statMessages').textContent = 0; $('statWords').textContent = 0; $('statResponses').textContent = 0;
  lastTranscript.textContent = '—';
  showToast('Conversation reset', 'success');
}

function clearHistory() {
  fetch('/api/history/clear', { method: 'POST' }).catch(() => {});
  resetConversation(); loadHistory();
  showToast('History cleared', 'info');
}

async function loadHistory() {
  const list = $('historyList');
  if (!list) return;
  try {
    const data = await fetch('/api/history?limit=60').then(r => r.json());
    if (!data.length) { list.innerHTML = '<p class="history-empty">No history yet</p>'; return; }
    const groups = {};
    data.forEach(e => { const d = e.timestamp.split('T')[0]; if (!groups[d]) groups[d] = []; groups[d].push(e); });
    list.innerHTML = Object.entries(groups).reverse().map(([date, entries]) =>
      `<div class="history-date-group"><span class="history-date">${formatHistoryDate(date)}</span>
      ${entries.filter(e => e.role === 'user').map(e =>
        `<div class="history-item" data-text="${escapeHtml(e.text)}" title="${escapeHtml(e.text)}">
          <i class="fa-solid fa-message"></i>
          <span>${escapeHtml(e.text.slice(0,38))}${e.text.length>38?'…':''}</span>
          <span class="history-time">${e.timestamp.split('T')[1].slice(0,5)}</span>
        </div>`).join('')}
      </div>`).join('');
    list.querySelectorAll('.history-item').forEach(item => {
      item.addEventListener('click', () => { textInput.value = item.dataset.text; textInput.focus(); showToast('Loaded from history','info'); });
    });
  } catch { list.innerHTML = '<p class="history-empty">Could not load history</p>'; }
}

function formatHistoryDate(dateStr) {
  const d = new Date(dateStr), today = new Date(), yest = new Date(today);
  yest.setDate(today.getDate()-1);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === yest.toDateString()) return 'Yesterday';
  return d.toLocaleDateString([], { month:'short', day:'numeric' });
}

function toggleTheme() {
  document.body.classList.toggle('light-theme');
  $('themeToggle').querySelector('i').className = document.body.classList.contains('light-theme') ? 'fa-solid fa-sun' : 'fa-solid fa-moon';
}
function toggleFullscreen() {
  if (!document.fullscreenElement) { document.documentElement.requestFullscreen(); $('fullscreenBtn').querySelector('i').className = 'fa-solid fa-compress'; }
  else { document.exitFullscreen(); $('fullscreenBtn').querySelector('i').className = 'fa-solid fa-expand'; }
}
function showLoading(msg='Processing...') { loadingText.textContent = msg; loadingOverlay.classList.add('active'); }
function hideLoading() { loadingOverlay.classList.remove('active'); }
function showToast(msg, type='info') {
  const icons = { success:'fa-circle-check', error:'fa-circle-xmark', info:'fa-circle-info' };
  const t = document.createElement('div'); t.className = `toast ${type}`;
  t.innerHTML = `<i class="fa-solid ${icons[type]}"></i><span>${msg}</span>`;
  toastCont.appendChild(t); setTimeout(() => t.remove(), 3500);
}
function onFileSelected(e) {
  const file = e.target.files[0]; if (!file) return;
  pendingFile = file; pendingFileType = file.type.startsWith('image/') ? 'image' : 'pdf';
  $('attachIcon').className = `fa-solid ${pendingFileType==='image'?'fa-image':'fa-file-pdf'}`;
  $('attachName').textContent = file.name.length>24 ? file.name.slice(0,22)+'…' : file.name;
  $('attachmentPreview').style.display = 'flex';
  $('fileInput').value = '';
  showToast(`${pendingFileType==='image'?'Image':'PDF'} attached`, 'success');
}
function clearAttachment() { pendingFile=null; pendingFileType=null; $('attachmentPreview').style.display='none'; }

function renderChart(canvasId, data) {
  const canvas = $(canvasId); if (!canvas || typeof Chart==='undefined') return;
  new Chart(canvas, {
    type: data.type||'bar',
    data: { labels: data.labels||[], datasets: (data.datasets||[]).map(ds => ({...ds,
      backgroundColor: ds.backgroundColor||['rgba(139,92,246,0.7)','rgba(6,182,212,0.7)','rgba(245,158,11,0.7)','rgba(236,72,153,0.7)'],
      borderColor: ds.borderColor||'rgba(139,92,246,1)', borderWidth:1 })) },
    options: { responsive:true, plugins:{ legend:{ labels:{ color:'#9ca3af' } } },
      scales: data.type!=='pie'&&data.type!=='doughnut' ? {
        x:{ticks:{color:'#9ca3af'},grid:{color:'rgba(255,255,255,0.05)'}},
        y:{ticks:{color:'#9ca3af'},grid:{color:'rgba(255,255,255,0.05)'}} } : {} },
  });
}

function openShareModal() {
  if (!state.messages.length) { showToast('No conversation to share yet','info'); return; }
  $('sharePreview').innerHTML = state.messages.slice(-6).map(m =>
    `<div class="share-prev-msg ${m.role}"><strong>${m.role==='user'?'You':'Assistant'}:</strong> <span>${escapeHtml(m.text.slice(0,120))}${m.text.length>120?'…':''}</span></div>`).join('');
  $('shareModal').classList.add('active');
}
function closeShareModal() { $('shareModal').classList.remove('active'); }
function buildPlainText() {
  return [`ResonaAI Conversation — ${new Date().toLocaleString()}`,'='.repeat(50),'',
    ...state.messages.flatMap(m => [`[${m.role==='user'?'You':'Assistant'}] ${formatTime(m.time)}`, m.text, ''])].join('\n');
}
function buildHtml() {
  const msgs = state.messages.map(m => `<div class="msg ${m.role}"><div class="label">${m.role==='user'?'🧑 You':'🤖 Assistant'} <span>${formatTime(m.time)}</span></div><div class="bubble">${m.text.replace(/\n/g,'<br/>')}</div></div>`).join('');
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"/><title>ResonaAI</title><style>body{font-family:sans-serif;background:#0a0a0f;color:#f1f0ff;max-width:720px;margin:40px auto;padding:20px}h1{color:#8b5cf6}.msg{margin-bottom:20px}.msg.user{text-align:right}.label{font-size:11px;color:#6b7280;margin-bottom:4px}.bubble{display:inline-block;padding:12px 16px;border-radius:14px;max-width:80%;font-size:14px;line-height:1.6;text-align:left}.user .bubble{background:linear-gradient(135deg,#7c3aed,#4f46e5);color:#fff}.assistant .bubble{background:#1e1e2a;border:1px solid #ffffff12}</style></head><body><h1>ResonaAI Conversation</h1><p style="color:#6b7280">Exported ${new Date().toLocaleString()}</p>${msgs}</body></html>`;
}
function shareCopyText() { navigator.clipboard.writeText(buildPlainText()); showToast('Copied!','success'); closeShareModal(); }
function shareDownloadTxt() { triggerDownload(new Blob([buildPlainText()],{type:'text/plain'}),`resonaai-${Date.now()}.txt`); showToast('Downloaded .txt','success'); closeShareModal(); }
function shareDownloadHtml() { triggerDownload(new Blob([buildHtml()],{type:'text/html'}),`resonaai-${Date.now()}.html`); showToast('Downloaded HTML','success'); closeShareModal(); }
async function shareNative() {
  if (navigator.share) { try { await navigator.share({title:'ResonaAI',text:buildPlainText()}); closeShareModal(); } catch(e){} }
  else { navigator.clipboard.writeText(buildPlainText()); showToast('Copied — paste to share!','success'); closeShareModal(); }
}
function triggerDownload(blob, filename) { const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=filename; a.click(); URL.revokeObjectURL(a.href); }
function escapeHtml(str) { return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function formatTime(d) { return d.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}); }

function initAudioVisualizer(stream) {
  if (!state.audioCtx) state.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  const src = state.audioCtx.createMediaStreamSource(stream);
  const analyser = state.audioCtx.createAnalyser(); analyser.fftSize = 256;
  src.connect(analyser); state.analyser = analyser; drawWaveform(analyser);
}
function drawWaveform(analyser) {
  const ctx = waveformCanvas.getContext('2d');
  const bufLen = analyser.frequencyBinCount, dataArr = new Uint8Array(bufLen);
  function draw() {
    if (!state.isRecording) return;
    state.animFrameId = requestAnimationFrame(draw);
    analyser.getByteTimeDomainData(dataArr);
    ctx.clearRect(0,0,waveformCanvas.width,waveformCanvas.height);
    const grad = ctx.createLinearGradient(0,0,waveformCanvas.width,0);
    grad.addColorStop(0,'#8b5cf6'); grad.addColorStop(0.5,'#06b6d4'); grad.addColorStop(1,'#8b5cf6');
    ctx.strokeStyle = grad; ctx.lineWidth = 2; ctx.beginPath();
    const sliceW = waveformCanvas.width / bufLen; let x = 0;
    for (let i=0;i<bufLen;i++) { const y=(dataArr[i]/128)*(waveformCanvas.height/2); i===0?ctx.moveTo(x,y):ctx.lineTo(x,y); x+=sliceW; }
    ctx.stroke();
  }
  draw();
}
function stopAudioVisualizer() {
  if (state.animFrameId) cancelAnimationFrame(state.animFrameId);
  waveformCanvas.getContext('2d').clearRect(0,0,waveformCanvas.width,waveformCanvas.height);
}
function initEqBars() {
  eqBarsEl.innerHTML = '';
  for (let i=0;i<20;i++) { const b=document.createElement('div'); b.className='eq-bar'; b.style.height='4px'; eqBarsEl.appendChild(b); }
}
let eqAnimId = null;
function animateEqBars() {
  const bars = eqBarsEl.querySelectorAll('.eq-bar');
  function draw() {
    eqAnimId = requestAnimationFrame(draw);
    if (state.analyser) {
      const d = new Uint8Array(state.analyser.frequencyBinCount); state.analyser.getByteFrequencyData(d);
      const step = Math.floor(d.length/bars.length);
      bars.forEach((b,i) => { b.style.height = Math.max(4,(d[i*step]/255)*60)+'px'; });
    } else {
      bars.forEach((b,i) => { b.style.height = (4+Math.abs(Math.sin(Date.now()/400+i*0.4))*30)+'px'; });
    }
  }
  draw();
}
function stopEqAnimation() { if (eqAnimId) cancelAnimationFrame(eqAnimId); eqBarsEl.querySelectorAll('.eq-bar').forEach(b=>b.style.height='4px'); }

function initVizCanvas() {
  const ctx = vizCanvas.getContext('2d');
  const cx=vizCanvas.width/2, cy=vizCanvas.height/2, r=70;
  function draw() {
    requestAnimationFrame(draw);
    ctx.clearRect(0,0,vizCanvas.width,vizCanvas.height);
    const t=Date.now()/1000, bars=48;
    for (let i=0;i<bars;i++) {
      const angle=(i/bars)*Math.PI*2-Math.PI/2;
      let amp = 4+Math.abs(Math.sin(t*0.8+i*0.15))*6;
      if (state.analyser) { const d=new Uint8Array(state.analyser.frequencyBinCount); state.analyser.getByteFrequencyData(d); amp=8+(d[Math.floor((i/bars)*d.length)]/255)*40; }
      const x1=cx+Math.cos(angle)*r, y1=cy+Math.sin(angle)*r;
      const x2=cx+Math.cos(angle)*(r+amp), y2=cy+Math.sin(angle)*(r+amp);
      ctx.strokeStyle=`hsla(${(i/bars)*60+260},80%,65%,0.85)`; ctx.lineWidth=2.5; ctx.lineCap='round';
      ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(x2,y2); ctx.stroke();
    }
    const grad=ctx.createRadialGradient(cx,cy,0,cx,cy,r);
    grad.addColorStop(0,'rgba(139,92,246,0.3)'); grad.addColorStop(1,'rgba(6,182,212,0.05)');
    ctx.beginPath(); ctx.arc(cx,cy,r,0,Math.PI*2); ctx.fillStyle=grad; ctx.fill();
  }
  draw();
}

function initParticles() {
  const canvas=$('particles'), ctx=canvas.getContext('2d');
  let W=canvas.width=window.innerWidth, H=canvas.height=window.innerHeight;
  window.addEventListener('resize',()=>{ W=canvas.width=window.innerWidth; H=canvas.height=window.innerHeight; });
  const pts=Array.from({length:60},()=>({x:Math.random()*W,y:Math.random()*H,r:Math.random()*1.5+0.3,vx:(Math.random()-0.5)*0.3,vy:(Math.random()-0.5)*0.3,a:Math.random()*0.4+0.1}));
  function draw() {
    requestAnimationFrame(draw); ctx.clearRect(0,0,W,H);
    pts.forEach(p=>{ p.x+=p.vx; p.y+=p.vy; if(p.x<0)p.x=W; if(p.x>W)p.x=0; if(p.y<0)p.y=H; if(p.y>H)p.y=0; ctx.beginPath(); ctx.arc(p.x,p.y,p.r,0,Math.PI*2); ctx.fillStyle=`rgba(139,92,246,${p.a})`; ctx.fill(); });
    for(let i=0;i<pts.length;i++) for(let j=i+1;j<pts.length;j++) {
      const dx=pts[i].x-pts[j].x, dy=pts[i].y-pts[j].y, dist=Math.sqrt(dx*dx+dy*dy);
      if(dist<100){ ctx.beginPath(); ctx.moveTo(pts[i].x,pts[i].y); ctx.lineTo(pts[j].x,pts[j].y); ctx.strokeStyle=`rgba(139,92,246,${0.06*(1-dist/100)})`; ctx.lineWidth=0.5; ctx.stroke(); }
    }
  }
  draw();
}
