const statusBadge = document.getElementById('statusBadge');
const totalDoneEl = document.getElementById('totalDone');
const totalRemainingEl = document.getElementById('totalRemaining');
const totalAllEl = document.getElementById('totalAll');
const progressFill = document.getElementById('progressFill');
const progressDetail = document.getElementById('progressDetail');
const successCountEl = document.getElementById('successCount');
const notFoundCountEl = document.getElementById('notFoundCount');
const errorCountEl = document.getElementById('errorCount');
const currentUrlEl = document.getElementById('currentUrl');
const logBody = document.getElementById('logBody');

const batchSizeInput = document.getElementById('batchSizeInput');
const autoCommitInput = document.getElementById('autoCommitInput');
const btnStart = document.getElementById('btnStart');
const btnPause = document.getElementById('btnPause');
const btnStop = document.getElementById('btnStop');

function updateUI(state) {
  totalDoneEl.textContent = state.totalDone;
  totalRemainingEl.textContent = state.totalRemaining;
  totalAllEl.textContent = state.totalAll;
  successCountEl.textContent = state.successCount;
  notFoundCountEl.textContent = state.notFoundCount;
  errorCountEl.textContent = state.errorCount;
  currentUrlEl.textContent = state.currentUrl || '—';

  const pct = state.totalAll > 0 ? Math.round((state.totalDone / state.totalAll) * 100) : 0;
  progressFill.style.width = pct + '%';
  progressDetail.textContent = `${state.totalDone} / ${state.totalAll} produk (${pct}%)`;

  statusBadge.classList.remove('running', 'paused');
  if (state.running && !state.paused) {
    statusBadge.textContent = 'Berjalan';
    statusBadge.classList.add('running');
  } else if (state.running && state.paused) {
    statusBadge.textContent = 'Dijeda';
    statusBadge.classList.add('paused');
  } else {
    statusBadge.textContent = 'Idle';
  }

  btnStart.disabled = state.running && !state.paused;
  btnPause.disabled = !state.running || state.paused;
  btnStop.disabled = !state.running;
  batchSizeInput.disabled = state.running;
  autoCommitInput.disabled = state.running;
}

function appendLog(line) {
  const div = document.createElement('div');
  div.className = 'line';
  if (line.includes('✓')) div.classList.add('success');
  else if (line.includes('⏭')) div.classList.add('skip');
  else if (line.includes('✗') || line.includes('⚠')) div.classList.add('error');
  div.textContent = line;
  logBody.appendChild(div);
  logBody.scrollTop = logBody.scrollHeight;
}

// Initial status load
fetch('/api/status')
  .then((r) => r.json())
  .then(updateUI);

// SSE live updates
const evtSource = new EventSource('/api/events');
evtSource.addEventListener('state', (e) => updateUI(JSON.parse(e.data)));
evtSource.addEventListener('log', (e) => appendLog(JSON.parse(e.data).line));

btnStart.addEventListener('click', () => {
  fetch('/api/status')
    .then((r) => r.json())
    .then((state) => {
      const endpoint = state.running && state.paused ? '/api/resume' : '/api/start';
      fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          batchSize: Number(batchSizeInput.value),
          autoCommit: autoCommitInput.checked,
        }),
      });
    });
});

btnPause.addEventListener('click', () => fetch('/api/pause', { method: 'POST' }));
btnStop.addEventListener('click', () => {
  if (confirm('Hentikan scraping? Progress yang sudah ada tetap tersimpan.')) {
    fetch('/api/stop', { method: 'POST' });
  }
});
