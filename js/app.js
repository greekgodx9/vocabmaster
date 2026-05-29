// ── Helpers ────────────────────────────────────────────────────────────────
function $(id) { return document.getElementById(id); }
function fmtDate(isoStr) {
  if (!isoStr) return '—';
  return new Date(isoStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
function fmtDateShort(isoStr) {
  if (!isoStr) return '—';
  return new Date(isoStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
function daysUntil(isoStr) {
  const now = new Date(); now.setHours(0,0,0,0);
  const t   = new Date(isoStr); t.setHours(0,0,0,0);
  return Math.round((t - now) / 86400000);
}
function toast(msg, type = '') {
  const el = $('toast');
  el.textContent = msg;
  el.className = `toast ${type} show`;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.remove('show'), 2800);
}
function setDisplay(el, show) { if (el) el.style.display = show ? '' : 'none'; }
function escHtml(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function friendlyDateKey(key) {
  const today = new Date().toISOString().slice(0,10);
  const yesterday = new Date(Date.now()-86400000).toISOString().slice(0,10);
  if (key === today)     return `Today  (${fmtDateShort(key)})`;
  if (key === yesterday) return `Yesterday  (${fmtDateShort(key)})`;
  return fmtDate(key);
}

// ── Navigation ─────────────────────────────────────────────────────────────
function navigate(viewName) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
  const view = $(`view-${viewName}`);
  if (view) view.classList.add('active');
  const link = document.querySelector(`.nav-link[data-view="${viewName}"]`);
  if (link) link.classList.add('active');

  if (viewName === 'dashboard')  renderDashboard();
  if (viewName === 'words')      renderWords();
  if (viewName === 'article')    renderArticleWordList();
  if (viewName === 'wordbooks')  renderWordBooks();
  if (viewName === 'review')     renderReviewStart();
  if (viewName === 'progress')   renderProgress();
}

// ── DASHBOARD ──────────────────────────────────────────────────────────────
function renderDashboard() {
  const words  = Storage.getWords();
  const due    = Storage.getWordsDueToday();
  const streak = Storage.getStreak();

  $('today-date').textContent    = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  $('streak-count').textContent  = streak;
  $('total-words').textContent   = words.length;
  $('due-today').textContent     = due.length;
  $('mastered-words').textContent = words.filter(w => SM2.getStatus(w.sm2) === 'mature').length;

  const btn = $('btn-checkin');
  const checkedIn = Storage.hasCheckedInToday();
  btn.textContent = checkedIn ? '✓ Checked In' : 'Check In';
  btn.classList.toggle('checked', checkedIn);
  btn.disabled = checkedIn;

  const badge = $('review-badge');
  badge.textContent = due.length;
  badge.classList.toggle('visible', due.length > 0);
  $('btn-start-review').disabled = due.length === 0;

  const recent = [...words].sort((a,b) => new Date(b.dateAdded)-new Date(a.dateAdded)).slice(0,12);
  $('recent-words-list').innerHTML = recent.length
    ? recent.map(w => `<span class="word-chip">${escHtml(w.word)}</span>`).join('')
    : '<span class="empty-hint">No words yet — go to "My Words" to add some!</span>';
}

// ── WORDS VIEW ─────────────────────────────────────────────────────────────
let _groupByDate = false;

function renderWords() {
  const search = $('word-search').value.toLowerCase();
  const filter = $('word-filter').value;
  let words = Storage.getWords();

  if (search) words = words.filter(w =>
    w.word.toLowerCase().includes(search) ||
    (w.meanings || []).some(m => m.toLowerCase().includes(search)) ||
    (w.definition || '').toLowerCase().includes(search)
  );
  if (filter !== 'all') words = words.filter(w => SM2.getStatus(w.sm2) === filter);
  words.sort((a,b) => new Date(b.dateAdded) - new Date(a.dateAdded));

  const tbody    = $('words-table-body');
  const noMsg    = $('no-words-msg');
  const table    = $('words-table');
  const groupBtn = $('btn-group-date');

  groupBtn.style.background = _groupByDate ? 'var(--primary-light)' : '';
  groupBtn.style.color = _groupByDate ? 'var(--primary)' : '';

  if (!words.length) {
    table.style.display = 'none';
    noMsg.style.display = '';
    return;
  }

  table.style.display = '';
  noMsg.style.display = 'none';

  function makeRow(w) {
    const status  = SM2.getStatus(w.sm2);
    const nextStr = new Date(w.sm2.nextReview) <= new Date()
      ? '<span style="color:#d97706">Due now</span>'
      : fmtDateShort(w.sm2.nextReview);
    const meanings = (w.meanings && w.meanings.length) ? w.meanings : (w.definition ? [w.definition] : []);
    const defHtml = meanings.length === 0
      ? '<span style="color:#d1d5db">—</span>'
      : meanings.length === 1
        ? escHtml(meanings[0])
        : `<div class="multi-meanings">${meanings.map((m,i) => `<span class="sense">${i+1}. ${escHtml(m)}</span>`).join('')}</div>`;
    return `
      <tr>
        <td class="word-cell">${escHtml(w.word)}</td>
        <td class="def-cell">${defHtml}</td>
        <td class="date-cell">${fmtDateShort(w.dateAdded)}</td>
        <td class="date-cell">${nextStr}</td>
        <td><span class="status-badge status-${status}">${status.charAt(0).toUpperCase()+status.slice(1)}</span></td>
        <td><button class="btn-delete" data-id="${w.id}" title="Delete">&#10005;</button></td>
      </tr>`;
  }

  if (!_groupByDate) {
    tbody.innerHTML = words.map(makeRow).join('');
  } else {
    // Group by date key
    const groups = new Map();
    for (const w of words) {
      const key = (w.dateAdded || '').slice(0,10) || 'unknown';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(w);
    }
    let html = '';
    for (const [key, group] of groups) {
      html += `<tr><td colspan="6" class="date-group-header">${escHtml(friendlyDateKey(key))}<span class="date-group-count">${group.length} words</span></td></tr>`;
      html += group.map(makeRow).join('');
    }
    tbody.innerHTML = html;
  }

  tbody.querySelectorAll('.btn-delete').forEach(btn => {
    btn.addEventListener('click', () => {
      const w = Storage.getWords().find(x => x.id === btn.dataset.id);
      if (w && confirm(`Delete "${w.word}"?`)) {
        Storage.deleteWord(btn.dataset.id);
        renderWords();
        renderDashboard();
        toast('Word deleted');
        syncInBackground();
      }
    });
  });
}

// ── ARTICLE VIEW ───────────────────────────────────────────────────────────
function renderArticleWordList() {
  const words = Storage.getWords();
  const container = $('article-word-list');
  if (!words.length) {
    container.innerHTML = '<span class="empty-hint">Add words first in "My Words"</span>';
    return;
  }
  // Sort by dateAdded desc, group by date for display
  const sorted = [...words].sort((a,b) => new Date(b.dateAdded)-new Date(a.dateAdded));
  const groups = new Map();
  for (const w of sorted) {
    const key = (w.dateAdded||'').slice(0,10)||'unknown';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(w);
  }
  let html = '';
  for (const [key, group] of groups) {
    html += `<div style="font-size:11px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.5px;padding:6px 4px 2px;margin-top:4px;">${friendlyDateKey(key)}</div>`;
    html += group.map(w => `
      <label class="word-checkbox-item">
        <input type="checkbox" class="article-word-cb" value="${w.id}" checked>
        <span>${escHtml(w.word)}${(w.meanings||[]).length > 1 ? ' <span style="color:#a78bfa;font-size:11px">(×'+w.meanings.length+')</span>' : ''}</span>
      </label>`).join('');
  }
  container.innerHTML = html;
}

function selectArticleWords(ids) {
  document.querySelectorAll('.article-word-cb').forEach(cb => {
    cb.checked = ids === null ? true : ids.has(cb.value);
  });
}

let currentArticleText = '';

async function handleGenerateArticle() {
  const checked = [...document.querySelectorAll('.article-word-cb:checked')].map(cb => cb.value);
  if (!checked.length) { toast('Select at least one word', 'error'); return; }

  const words  = Storage.getWords().filter(w => checked.includes(w.id));
  const length = $('article-length').value;
  const level  = $('article-level').value;
  const topic  = $('article-topic').value.trim();

  $('article-empty').style.display   = 'none';
  $('article-content').style.display = 'none';
  $('article-loading').style.display = '';

  try {
    const raw = await API.generateArticle(words, { length, level, topic });

    // Build color-coding map: new=blue, due=amber, established=green
    const today = new Date().toISOString().slice(0, 10);
    const now   = new Date();
    const wordStatusMap = {};
    words.forEach(w => {
      const key   = w.word.toLowerCase();
      const isNew = (w.dateAdded || '').slice(0, 10) === today;
      const isDue = new Date(w.sm2.nextReview) <= now;
      wordStatusMap[key] = isNew ? 'mark-new' : isDue ? 'mark-due' : 'mark-review';
    });

    const { title, html, targetWords } = API.parseArticle(raw, words, wordStatusMap);

    $('article-title').textContent    = title;
    $('article-body').innerHTML       = html;
    $('article-legend').style.display = '';

    const targetEl = $('article-target-words');
    targetEl.innerHTML = targetWords.length
      ? targetWords.map(w => `<span class="word-chip">${escHtml(w.word)}</span>`).join('')
      : '<span class="empty-hint">Words may appear in alternate forms</span>';

    currentArticleText = title + '.\n\n' + TTS.extractText($('article-body').innerHTML);

    $('article-loading').style.display = 'none';
    $('article-content').style.display = '';
    TTS.stop();
    updateTTSButtons(false, false);
    setupArticleTooltip();
  } catch (err) {
    $('article-loading').style.display = 'none';
    $('article-empty').style.display   = '';
    toast(err.message, 'error');
    console.error(err);
  }
}

// ── WORD TOOLTIP ───────────────────────────────────────────────────────────
let _ttHideTimer = null;

function setupArticleTooltip() {
  const body = $('article-body');
  // Remove previous listeners by cloning (simple reset)
  const fresh = body.cloneNode(true);
  body.parentNode.replaceChild(fresh, body);

  fresh.addEventListener('mouseover', e => {
    const mark = e.target.closest('mark');
    if (!mark) return;
    clearTimeout(_ttHideTimer);
    renderWordTooltip(mark);
  });

  fresh.addEventListener('mouseleave', () => {
    _ttHideTimer = setTimeout(() => {
      const tt = $('word-tooltip');
      tt.classList.remove('tt-visible');
      setTimeout(() => { if (!tt.classList.contains('tt-visible')) tt.style.display = 'none'; }, 150);
    }, 100);
  });
}

async function renderWordTooltip(mark) {
  const tt       = $('word-tooltip');
  const wordText = mark.dataset.word || mark.textContent.trim();
  const word     = Storage.getWords().find(w => w.word.toLowerCase() === wordText.toLowerCase());

  let html = `<div class="tt-word">${escHtml(wordText)}</div>`;

  if (!word) {
    html += `<div class="tt-loading">Not in your word list</div>`;
    tt.innerHTML = html;
    tt.style.display = '';
    positionTooltip(tt, mark);
    tt.classList.add('tt-visible');
    return;
  }

  const richMeanings = word.richMeanings;
  const flatMeanings = word.meanings;
  const hasData = (richMeanings && richMeanings.length) || (flatMeanings && flatMeanings.length) || word.definition;

  if (!hasData) {
    // Fetch on demand
    html += `<div class="tt-loading">Loading...</div>`;
    tt.innerHTML = html;
    tt.style.display = '';
    positionTooltip(tt, mark);
    tt.classList.add('tt-visible');

    const data = await API.fetchDictionary(wordText);
    if (data) {
      Storage.updateWord(word.id, {
        phonetic: data.phonetic, richMeanings: data.richMeanings,
        examples: data.examples, meanings: data.meanings,
        definition: data.meanings[0] || '',
      });
      renderWordTooltip(mark); // re-render with data
    }
    return;
  }

  if (word.phonetic) html += `<div class="tt-phonetic">${escHtml(word.phonetic)}</div>`;

  if (richMeanings && richMeanings.length) {
    richMeanings.slice(0, 3).forEach(m => {
      html += `<div class="tt-meaning"><span class="tt-pos">${escHtml(m.pos)}</span><span class="tt-def">${escHtml(m.definition)}</span></div>`;
      if (m.example) html += `<div class="tt-example">"${escHtml(m.example)}"</div>`;
    });
  } else if (flatMeanings && flatMeanings.length) {
    flatMeanings.slice(0, 3).forEach(m => {
      html += `<div class="tt-meaning"><span class="tt-def">${escHtml(m)}</span></div>`;
    });
  } else if (word.definition) {
    html += `<div class="tt-meaning"><span class="tt-def">${escHtml(word.definition)}</span></div>`;
  }

  if (word.examples && word.examples.length && !(richMeanings && richMeanings.some(m => m.example))) {
    html += `<div class="tt-example">"${escHtml(word.examples[0])}"</div>`;
  }

  // Lazy-fetch phonetic + richMeanings if still missing
  if (!word.phonetic || !(richMeanings && richMeanings.length)) {
    API.fetchDictionary(wordText).then(data => {
      if (data) {
        const patch = { phonetic: data.phonetic, richMeanings: data.richMeanings, examples: data.examples };
        if (!(flatMeanings && flatMeanings.length) && !word.definition) {
          patch.meanings = data.meanings; patch.definition = data.meanings[0] || '';
        }
        Storage.updateWord(word.id, patch);
      }
    });
  }

  tt.innerHTML = html;
  tt.style.display = '';
  positionTooltip(tt, mark);
  tt.classList.add('tt-visible');
}

function positionTooltip(tt, target) {
  const r  = target.getBoundingClientRect();
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  let left = r.left, top = r.bottom + 10;
  if (left + 340 > vw - 10) left = vw - 350;
  if (left < 10) left = 10;
  if (top + 220 > vh) top = r.top - 224;
  tt.style.left = left + 'px';
  tt.style.top  = top + 'px';
}

// ── AUTO ENRICHMENT ────────────────────────────────────────────────────────
async function enrichWordsInBackground(words) {
  const toEnrich = words.filter(w => !w.phonetic || !(w.richMeanings && w.richMeanings.length));
  for (const word of toEnrich) {
    const data = await API.fetchDictionary(word.word);
    if (data) {
      const patch = { phonetic: data.phonetic, richMeanings: data.richMeanings, examples: data.examples };
      const hasMeaning = (word.meanings && word.meanings.length) || word.definition;
      if (!hasMeaning) {
        patch.meanings  = data.meanings;
        patch.definition = data.meanings[0] || '';
      }
      Storage.updateWord(word.id, patch);
    }
    await new Promise(r => setTimeout(r, 300));
  }
  if (toEnrich.length) renderWords();
}

function updateTTSButtons(speaking, paused) {
  $('tts-play').disabled  = speaking && !paused;
  $('tts-pause').disabled = !speaking || paused;
  $('tts-stop').disabled  = !speaking;
}

// ── WORD BOOKS VIEW ────────────────────────────────────────────────────────
let _wbImportedWords = [];  // parsed words waiting to be saved into a new book

function renderWordBooks() {
  const books = Storage.getWordBooks();
  const list  = $('wordbooks-list');
  const empty = $('no-wordbooks');

  if (!books.length) {
    list.innerHTML  = '';
    empty.style.display = '';
    return;
  }
  empty.style.display = 'none';

  const today = new Date().toISOString().slice(0,10);

  list.innerHTML = books.map(book => {
    const total    = book.words.length;
    const released = book.releasedCount || 0;
    const pct      = total ? Math.round((released / total) * 100) : 0;
    const pending  = total - released;
    const daysLeft = book.dailyGoal > 0 ? Math.ceil(pending / book.dailyGoal) : '?';
    const releasedToday = book.lastReleaseDate === today ? Math.min(book.dailyGoal, total - (released - book.dailyGoal)) : 0;

    let badgeCls = 'wb-badge-active', badgeTxt = '▶ Active';
    if (!book.active) { badgeCls = 'wb-badge-done'; badgeTxt = '✓ Complete'; }

    return `
    <div class="wordbook-card" data-id="${book.id}">
      <div class="wb-card-header">
        <div>
          <div class="wb-card-name">${escHtml(book.name)}</div>
          <div class="wb-card-meta">Daily goal: ${book.dailyGoal} words &nbsp;·&nbsp; Started ${fmtDateShort(book.startDate)}</div>
        </div>
        <div style="display:flex;gap:8px;align-items:center">
          <span class="wb-badge ${badgeCls}">${badgeTxt}</span>
          <div class="wb-card-actions">
            <button class="btn-text wb-btn-pause" data-id="${book.id}" title="${book.active ? 'Pause' : 'Resume'}">${book.active ? '⏸' : '▶'}</button>
            <button class="btn-text wb-btn-delete" data-id="${book.id}" title="Delete" style="color:#ef4444">&#128465;</button>
          </div>
        </div>
      </div>
      <div class="wb-progress-bar"><div class="wb-progress-fill" style="width:${pct}%"></div></div>
      <div class="wb-stats">
        <div class="wb-stat"><div class="wb-stat-val">${total}</div><div class="wb-stat-lbl">Total</div></div>
        <div class="wb-stat"><div class="wb-stat-val">${released}</div><div class="wb-stat-lbl">Released</div></div>
        <div class="wb-stat"><div class="wb-stat-val">${pending}</div><div class="wb-stat-lbl">Remaining</div></div>
        <div class="wb-stat"><div class="wb-stat-val">${book.active ? daysLeft : '—'}</div><div class="wb-stat-lbl">Days Left</div></div>
      </div>
      ${releasedToday > 0 ? `<div class="wb-today-release">🌅 Released ${releasedToday} new words today from this plan</div>` : ''}
    </div>`;
  }).join('');

  list.querySelectorAll('.wb-btn-pause').forEach(btn => {
    btn.addEventListener('click', () => {
      const book = Storage.getWordBooks().find(b => b.id === btn.dataset.id);
      if (book) {
        Storage.updateWordBook(book.id, { active: !book.active });
        renderWordBooks();
      }
    });
  });

  list.querySelectorAll('.wb-btn-delete').forEach(btn => {
    btn.addEventListener('click', () => {
      if (confirm('Delete this word book plan? (Words already released to My Words will be kept)')) {
        Storage.deleteWordBook(btn.dataset.id);
        renderWordBooks();
        toast('Word book deleted');
      }
    });
  });
}

// ── CSV / EXCEL IMPORT ─────────────────────────────────────────────────────
function parseCSVText(text) {
  const lines = text.trim().split(/\r?\n/);
  const results = [];
  for (const line of lines) {
    if (!line.trim()) continue;
    // Simple CSV parse: handle quoted fields
    const cols = parseCSVLine(line);
    const word = (cols[0] || '').trim();
    if (!word) continue;
    // Col 1 = def1, col 2 = def2, col 3 = def3, etc.
    const meanings = cols.slice(1).map(c => c.trim()).filter(Boolean);
    results.push({ word, meanings });
  }
  return results;
}

function parseCSVLine(line) {
  const cols = [];
  let cur = '', inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { inQ = !inQ; }
    else if (ch === ',' && !inQ) { cols.push(cur); cur = ''; }
    else { cur += ch; }
  }
  cols.push(cur);
  return cols;
}

function parseExcelFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => {
      try {
        if (typeof XLSX === 'undefined') throw new Error('SheetJS not loaded — try CSV instead');
        const wb   = XLSX.read(e.target.result, { type: 'array' });
        const ws   = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
        const results = [];
        for (const row of rows) {
          const word = String(row[0] || '').trim();
          if (!word || word.toLowerCase() === 'word') continue; // skip header
          const meanings = row.slice(1).map(c => String(c||'').trim()).filter(Boolean);
          results.push({ word, meanings });
        }
        resolve(results);
      } catch (err) { reject(err); }
    };
    reader.onerror = () => reject(new Error('File read error'));
    reader.readAsArrayBuffer(file);
  });
}

function showImportPreview(words) {
  _wbImportedWords = words;
  const preview = $('file-preview');
  const info    = $('wb-preview-info');

  if (!words.length) {
    preview.innerHTML = '';
    info.textContent = '';
    info.classList.remove('visible');
    return;
  }

  info.textContent = `✓ ${words.length} words ready to import`;
  info.classList.add('visible');

  const rows = words.slice(0, 8).map(w => {
    const def = w.meanings.join(' | ') || '—';
    return `<div class="preview-row"><span class="preview-word">${escHtml(w.word)}</span><span class="preview-def">${escHtml(def)}</span></div>`;
  });
  if (words.length > 8) rows.push(`<div class="preview-row" style="color:var(--text-muted);font-style:italic">… and ${words.length - 8} more</div>`);
  preview.innerHTML = rows.join('');
}

function downloadTemplate() {
  const csv = `Word,Definition 1,Definition 2,Definition 3
ephemeral,lasting for a very short time,,
ubiquitous,present appearing or found everywhere,,
bank,(n.) the side of a river,(n.) a financial institution,(v.) to tilt an aircraft
sanction,(n.) official approval,(v.) to impose a penalty on,
corroborate,to confirm or support with evidence,,
`;
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
  a.download = 'vocabmaster-template.csv'; a.click(); URL.revokeObjectURL(a.href);
}

async function createWordBook() {
  const name = $('wb-name').value.trim();
  const goal = parseInt($('wb-daily-goal').value) || 50;
  if (!name) { toast('请填写词书名称', 'error'); return; }

  // Get words: file import or paste
  let words = [];
  const activeTab = document.querySelector('.import-tab.active')?.dataset.tab;

  if (activeTab === 'paste') {
    const text = $('wb-paste-input').value.trim();
    if (!text) { toast('请粘贴单词内容', 'error'); return; }
    const lines = text.split('\n').filter(l => l.trim());
    words = lines.map(line => {
      const colonIdx = line.indexOf(':');
      if (colonIdx > 0) {
        return { word: line.slice(0, colonIdx).trim(), meanings: line.slice(colonIdx+1).split(/[;|]/).map(s=>s.trim()).filter(Boolean) };
      }
      return { word: line.trim(), meanings: [] };
    });
  } else {
    words = _wbImportedWords;
  }

  if (!words.length) { toast('请先导入单词', 'error'); return; }

  const bookWords = words.map(w => ({ ...w, status: 'pending' }));
  const book = Storage.addWordBook({ name, dailyGoal: goal, words: bookWords, startDate: new Date().toISOString() });

  // Release first day's words immediately
  const released = Storage.releaseWordsForToday();

  // Reset form
  $('wordbook-create-panel').classList.remove('open');
  $('wb-name').value = '';
  $('wb-daily-goal').value = '50';
  $('wb-paste-input').value = '';
  $('file-preview').innerHTML = '';
  $('wb-preview-info').classList.remove('visible');
  _wbImportedWords = [];

  renderWordBooks();
  renderDashboard();
  syncInBackground();
  toast(`词书「${name}」创建成功！今日已释放 ${released} 个新词`, 'success');
}

// ── REVIEW SESSION ─────────────────────────────────────────────────────────
let reviewQueue = [], reviewIndex = 0, reviewStats = {};

function renderReviewStart() {
  const due = Storage.getWordsDueToday();
  $('review-count').textContent = due.length;
  setDisplay($('review-start'),    true);
  setDisplay($('review-session'),  false);
  setDisplay($('review-complete'), false);
}

function startReview() {
  reviewQueue = Storage.getWordsDueToday();
  if (!reviewQueue.length) { toast('No words due today!'); return; }
  for (let i = reviewQueue.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i+1));
    [reviewQueue[i], reviewQueue[j]] = [reviewQueue[j], reviewQueue[i]];
  }
  reviewIndex = 0;
  reviewStats = { again:0, hard:0, good:0, easy:0 };
  setDisplay($('review-start'),    false);
  setDisplay($('review-session'),  true);
  setDisplay($('review-complete'), false);
  showCard();
}

function showCard() {
  if (reviewIndex >= reviewQueue.length) { finishReview(); return; }

  const word = reviewQueue[reviewIndex];
  $('card-word').textContent      = word.word;
  $('card-word-back').textContent = word.word;

  // Show all meanings on card back
  const meanings = (word.meanings && word.meanings.length) ? word.meanings : (word.definition ? [word.definition] : []);
  if (!meanings.length) {
    $('card-definition').innerHTML = '<em style="color:#9ca3af">No definition saved — did you recall it?</em>';
  } else if (meanings.length === 1) {
    $('card-definition').textContent = meanings[0];
  } else {
    $('card-definition').innerHTML = meanings.map((m,i) => `<div style="margin-bottom:6px"><span style="color:var(--primary);font-weight:700">${i+1}.</span> ${escHtml(m)}</div>`).join('');
  }

  document.querySelectorAll('.rate-btn').forEach(btn => {
    const q   = parseInt(btn.dataset.quality);
    const sub = btn.querySelector('.rate-sub');
    if (sub) sub.textContent = SM2.nextLabel(q, word.sm2);
  });

  setDisplay($('card-front'), true);
  setDisplay($('card-back'),  false);

  const pct = (reviewIndex / reviewQueue.length) * 100;
  $('review-progress-fill').style.width = pct + '%';
  $('review-progress-text').textContent = `${reviewIndex} / ${reviewQueue.length}`;
}

function flipCard() { setDisplay($('card-front'), false); setDisplay($('card-back'), true); }

function rateCard(quality) {
  const word   = reviewQueue[reviewIndex];
  const newSm2 = SM2.calculate(word.sm2, quality);
  Storage.updateWord(word.id, { sm2: newSm2 });
  const label  = quality === 0 ? 'again' : quality <= 2 ? 'hard' : quality === 3 ? 'good' : 'easy';
  reviewStats[label]++;
  reviewIndex++;
  showCard();
}

function finishReview() {
  setDisplay($('review-session'),  false);
  setDisplay($('review-complete'), true);
  $('review-progress-fill').style.width = '100%';
  $('review-progress-text').textContent = `${reviewQueue.length} / ${reviewQueue.length}`;
  const { again, hard, good, easy } = reviewStats;
  const total = reviewQueue.length;
  $('review-summary').innerHTML = `
    <div class="review-summary-item">Reviewed <strong>${total}</strong> word${total !== 1 ? 's' : ''}</div>
    <div class="review-summary-item" style="gap:20px;margin-top:8px">
      <span style="color:#dc2626">● Again: ${again}</span>
      <span style="color:#d97706">● Hard: ${hard}</span>
      <span style="color:#059669">● Good: ${good}</span>
      <span style="color:#2563eb">● Easy: ${easy}</span>
    </div>`;
  renderDashboard();
  syncInBackground();
}

// ── SPELLING TEST ──────────────────────────────────────────────────────────
let spellQueue = [], spellIndex = 0, spellResults = [], _spellPhoneticShown = false;

function startSpellingTest() {
  spellQueue   = [...reviewQueue];
  spellIndex   = 0;
  spellResults = [];
  setDisplay($('review-complete'),     false);
  setDisplay($('review-spell-results'), false);
  setDisplay($('review-spelling'),      true);
  showSpellCard();
}

function showSpellCard() {
  if (spellIndex >= spellQueue.length) { finishSpellingTest(); return; }
  const word = spellQueue[spellIndex];
  const pct  = (spellIndex / spellQueue.length) * 100;

  $('spell-header').textContent       = `Word ${spellIndex + 1} of ${spellQueue.length}`;
  $('spell-progress-fill').style.width = pct + '%';
  $('spell-progress-text').textContent = `${spellIndex} / ${spellQueue.length}`;

  // Definition hint (no word shown)
  const rm = word.richMeanings;
  const fm = word.meanings;
  let defHtml = '';
  if (rm && rm.length) {
    defHtml = rm.slice(0, 3).map(m =>
      `<div class="spell-def-entry"><span class="spell-def-pos">${escHtml(m.pos)}</span>${escHtml(m.definition)}</div>`
    ).join('');
  } else if (fm && fm.length) {
    defHtml = fm.slice(0, 3).map(m => `<div class="spell-def-entry">${escHtml(m)}</div>`).join('');
  } else if (word.definition) {
    defHtml = `<div class="spell-def-entry">${escHtml(word.definition)}</div>`;
  } else {
    defHtml = '<div style="color:var(--text-muted);font-style:italic">No definition — recall the word from memory.</div>';
  }
  $('spell-def').innerHTML = defHtml;

  const ex = (rm && rm.find(m => m.example)?.example) || (word.examples && word.examples[0]) || '';
  $('spell-example').textContent = ex ? `"${ex}"` : '';

  // Reset phonetic toggle
  _spellPhoneticShown = false;
  $('spell-phonetic-toggle').innerHTML = '&#128266; Show phonetic hint';

  const inp = $('spell-input');
  inp.value = ''; inp.className = 'spell-input'; inp.disabled = false;
  $('spell-feedback').textContent = ''; $('spell-feedback').className = 'spell-feedback';
  $('btn-spell-check').disabled = false; $('btn-spell-skip').disabled = false;
  setTimeout(() => inp.focus(), 50);
}

function checkSpelling() {
  const word  = spellQueue[spellIndex];
  const inp   = $('spell-input');
  const typed = inp.value.trim();
  if (!typed) { toast('Type the word first', 'error'); return; }

  const correct = typed.toLowerCase() === word.word.toLowerCase();
  spellResults.push({ word, status: correct ? 'correct' : 'wrong', typed });

  const fb = $('spell-feedback');
  if (correct) {
    inp.className = 'spell-input spell-correct';
    fb.textContent = '✓ Correct!'; fb.className = 'spell-feedback fb-correct';
  } else {
    inp.className = 'spell-input spell-wrong';
    fb.innerHTML  = `✗ The answer is <strong>${escHtml(word.word)}</strong>`;
    fb.className  = 'spell-feedback fb-wrong';
  }

  inp.disabled = true; $('btn-spell-check').disabled = true; $('btn-spell-skip').disabled = true;
  spellIndex++;
  setTimeout(showSpellCard, correct ? 900 : 1600);
}

function skipSpell() {
  spellResults.push({ word: spellQueue[spellIndex], status: 'skip', typed: '' });
  spellIndex++;
  showSpellCard();
}

function finishSpellingTest() {
  setDisplay($('review-spelling'),      false);
  setDisplay($('review-spell-results'), true);

  const correct = spellResults.filter(r => r.status === 'correct').length;
  const wrong   = spellResults.filter(r => r.status === 'wrong').length;
  const skipped = spellResults.filter(r => r.status === 'skip').length;
  const score   = spellQueue.length ? Math.round((correct / spellQueue.length) * 100) : 0;

  let html = `
    <div style="font-size:40px;font-weight:800;color:var(--primary);margin-bottom:4px">${score}%</div>
    <div style="color:var(--text-muted);font-size:14px;margin-bottom:20px">
      ${correct} correct &nbsp;·&nbsp; ${wrong} wrong &nbsp;·&nbsp; ${skipped} skipped
    </div>`;

  html += spellResults.map(r => {
    const cls    = `spell-result-row spell-result-${r.status}`;
    const badge  = r.status === 'correct' ? '✓ Correct' : r.status === 'wrong' ? '✗ Wrong' : '— Skipped';
    const answer = r.status === 'wrong' ? `<div class="spell-result-answer">you typed: "${escHtml(r.typed)}"</div>` : '';
    return `<div class="${cls}">
      <span class="spell-result-word">${escHtml(r.word.word)}</span>
      <div style="text-align:right">${answer}<span class="spell-result-badge">${badge}</span></div>
    </div>`;
  }).join('');

  $('spell-results-body').innerHTML = html;
}

// ── PROGRESS VIEW ──────────────────────────────────────────────────────────
function renderProgress() {
  const words  = Storage.getWords();
  const counts = { new:0, learning:0, young:0, mature:0 };
  words.forEach(w => counts[SM2.getStatus(w.sm2)]++);
  const total = words.length || 1;
  ['new','learning','young','mature'].forEach(s => {
    $(`cnt-${s}`).textContent   = counts[s];
    $(`bar-${s}`).style.width   = Math.max((counts[s]/total)*100, counts[s]?2:0) + '%';
  });
  $('progress-streak').textContent = Storage.getStreak();
  renderHeatmap();
  renderUpcoming();
}

function renderHeatmap() {
  const checkIns = new Set(Storage.getCheckIns());
  const today = new Date(); today.setHours(0,0,0,0);
  const days = Array.from({ length: 84 }, (_, i) => {
    const d = new Date(today); d.setDate(d.getDate() - (83 - i)); return d;
  });
  const weeks = Array.from({ length: 12 }, (_, i) => days.slice(i*7, i*7+7));
  $('heatmap-container').innerHTML = weeks.map(week =>
    `<div class="heatmap-week">${week.map(d => {
      const key   = d.toISOString().slice(0,10);
      const level = checkIns.has(key) ? 3 : 0;
      return `<div class="heatmap-cell level-${level}" title="${fmtDateShort(key)}"></div>`;
    }).join('')}</div>`
  ).join('');
}

function renderUpcoming() {
  const words = Storage.getWords().sort((a,b) => new Date(a.sm2.nextReview)-new Date(b.sm2.nextReview)).slice(0,10);
  const el = $('upcoming-reviews');
  if (!words.length) { el.innerHTML = '<p class="empty-hint" style="padding:16px">No words scheduled yet.</p>'; return; }
  el.innerHTML = words.map(w => {
    const d = daysUntil(w.sm2.nextReview);
    const [cls, lbl] = d < 0   ? ['days-overdue', `${-d}d overdue`]
                     : d === 0 ? ['days-today',   'Today']
                     : d <= 3  ? ['days-soon',    `in ${d} day${d>1?'s':''}`]
                               : ['days-later',   fmtDateShort(w.sm2.nextReview)];
    const defText = (w.meanings && w.meanings[0]) || w.definition || '';
    return `
      <div class="upcoming-item">
        <span class="upcoming-word">${escHtml(w.word)}</span>
        <span class="upcoming-date">${defText ? escHtml(defText.slice(0,45))+(defText.length>45?'…':'') : '<em style="color:#d1d5db">—</em>'}</span>
        <span class="upcoming-days"><span class="days-badge ${cls}">${lbl}</span></span>
      </div>`;
  }).join('');
}

// ── SETTINGS ───────────────────────────────────────────────────────────────
function updateProviderUI(provider) {
  const cfg = API.PROVIDERS[provider] || {};
  $('group-model').style.display      = cfg.needsModel ? '' : 'none';
  $('group-custom-url').style.display = cfg.needsUrl   ? '' : 'none';
  if (cfg.needsModel) {
    $('label-model').textContent    = provider === 'doubao' ? 'Endpoint ID' : 'Model ID';
    $('settings-model').placeholder = cfg.defaultModel || cfg.modelHint || '';
    $('hint-model').textContent     = cfg.modelHint || '';
  }
}

function openSettings() {
  const s = Storage.getSettings();
  const p = s.apiProvider || 'deepseek';
  $('settings-provider').value   = p;
  $('settings-api-key').value    = s.apiKey || '';
  $('settings-model').value      = s.apiModel || '';
  $('settings-custom-url').value = s.customUrl || '';
  $('settings-daily-goal').value = s.dailyGoal || 20;
  // Sync fields
  $('settings-supabase-url').value    = s.supabaseUrl || '';
  $('settings-supabase-key').value    = s.supabaseKey || '';
  $('settings-sync-passphrase').value = s.syncPassphrase || '';
  updateSyncStatus();
  updateProviderUI(p);
  $('settings-modal').classList.add('open');
}
function closeSettings() { $('settings-modal').classList.remove('open'); }
function saveSettings() {
  const p   = $('settings-provider').value;
  const cfg = API.PROVIDERS[p] || {};
  Storage.saveSettings({
    apiProvider: p,
    apiKey:      $('settings-api-key').value.trim(),
    apiModel:    $('settings-model').value.trim() || cfg.defaultModel || '',
    customUrl:   $('settings-custom-url').value.trim(),
    dailyGoal:   parseInt($('settings-daily-goal').value) || 20,
    supabaseUrl:    $('settings-supabase-url').value.trim(),
    supabaseKey:    $('settings-supabase-key').value.trim(),
    syncPassphrase: $('settings-sync-passphrase').value.trim(),
  });
  closeSettings();
  updateSyncStatus();
  toast('Settings saved ✓', 'success');
}

// ── SYNC HELPERS ──────────────────────────────────────────────────────────
function updateSyncStatus() {
  const el = $('sync-status');
  if (!el) return;
  const s = Storage.getSettings();
  if (!s.syncPassphrase) {
    el.textContent = 'Set a passphrase above then Save';
    el.style.color = 'var(--text-muted)';
    return;
  }
  el.textContent = 'Ready — click Sync Now ✓';
  el.style.color = '#22c55e';
}

// Silently push local changes to sync server (debounced)
let _syncDebounceTimer = null;
function syncInBackground() {
  clearTimeout(_syncDebounceTimer);
  _syncDebounceTimer = setTimeout(async () => {
    try { await Sync.push(); } catch (err) { /* silent */ }
  }, 1500);
}

// ── EVENT BINDING ──────────────────────────────────────────────────────────
function bindEvents() {
  // ── Mobile hamburger menu ──
  const sidebar = document.querySelector('.sidebar');
  const backdrop = $('sidebar-backdrop');
  const hamburger = $('hamburger-btn');

  function openSidebar() {
    sidebar.classList.add('open');
    backdrop.classList.add('active');
    hamburger.style.opacity = '0';
  }
  function closeSidebar() {
    sidebar.classList.remove('open');
    backdrop.classList.remove('active');
    hamburger.style.opacity = '';
  }

  hamburger.addEventListener('click', openSidebar);
  backdrop.addEventListener('click', closeSidebar);

  // Navigation
  document.querySelectorAll('.nav-link').forEach(l =>
    l.addEventListener('click', e => {
      e.preventDefault();
      navigate(l.dataset.view);
      // Close mobile sidebar after navigation
      if (window.innerWidth <= 640) closeSidebar();
    })
  );

  // Dashboard
  $('btn-checkin').addEventListener('click', () => {
    if (Storage.checkInToday()) { toast('Checked in! 🔥 Keep it up!', 'success'); renderDashboard(); syncInBackground(); }
    else toast('Already checked in today!');
  });
  $('btn-start-review').addEventListener('click', () => navigate('review'));

  // Words view — add words
  $('btn-show-add-word').addEventListener('click', () => $('add-word-panel').classList.toggle('open'));
  $('btn-cancel-add').addEventListener('click', () => { $('add-word-panel').classList.remove('open'); $('word-input').value = ''; });
  $('btn-add-words').addEventListener('click', () => {
    const lines = $('word-input').value.trim().split('\n').filter(l => l.trim());
    if (!lines.length) { toast('Enter at least one word', 'error'); return; }
    const entries = lines.map(line => {
      const ci = line.indexOf(':');
      return ci > 0
        ? { word: line.slice(0, ci).trim(), definition: line.slice(ci+1).trim() }
        : { word: line.trim(), definition: '' };
    });
    const added = Storage.addWords(entries);
    $('word-input').value = '';
    $('add-word-panel').classList.remove('open');
    renderWords(); renderDashboard();
    const skipped = entries.length - added.length;
    toast(`Added ${added.length} word${added.length!==1?'s':''}`+(skipped?` (${skipped} duplicate${skipped!==1?'s':''} skipped)`:''), 'success');
    enrichWordsInBackground(added);
    syncInBackground();
  });
  $('word-search').addEventListener('input', renderWords);
  $('word-filter').addEventListener('change', renderWords);
  $('btn-group-date').addEventListener('click', () => { _groupByDate = !_groupByDate; renderWords(); });

  // Article view — word selection
  $('btn-select-all').addEventListener('click', () => selectArticleWords(null));
  $('btn-select-none').addEventListener('click', () => {
    document.querySelectorAll('.article-word-cb').forEach(cb => cb.checked = false);
  });
  $('btn-select-today-new').addEventListener('click', () =>
    selectArticleWords(new Set(Storage.getWordsAddedToday().map(w => w.id)))
  );
  $('btn-select-today-due').addEventListener('click', () =>
    selectArticleWords(new Set(Storage.getWordsDueToday().map(w => w.id)))
  );
  $('btn-select-today-all').addEventListener('click', () => {
    const ids = new Set([
      ...Storage.getWordsAddedToday().map(w => w.id),
      ...Storage.getWordsDueToday().map(w => w.id),
    ]);
    selectArticleWords(ids);
  });
  $('btn-generate-article').addEventListener('click', handleGenerateArticle);

  // TTS
  $('tts-play').addEventListener('click', () => {
    if (TTS.isPaused()) { TTS.resume(); updateTTSButtons(true, false); return; }
    TTS.speak(currentArticleText, {
      rate: parseFloat($('tts-speed').value),
      voiceIndex: parseInt($('tts-voice').value) || 0,
      onStart: () => updateTTSButtons(true, false),
      onEnd:   () => updateTTSButtons(false, false),
    });
    updateTTSButtons(true, false);
  });
  $('tts-pause').addEventListener('click', () => { TTS.pause(); updateTTSButtons(true, true); $('tts-play').disabled = false; });
  $('tts-stop').addEventListener('click', () => { TTS.stop(); updateTTSButtons(false, false); });
  $('tts-speed').addEventListener('input', () => {
    $('tts-speed-val').textContent = parseFloat($('tts-speed').value).toFixed(1) + 'x';
  });

  // Word Books
  $('btn-new-wordbook').addEventListener('click', () => {
    $('wordbook-create-panel').classList.toggle('open');
    _wbImportedWords = [];
    $('file-preview').innerHTML = '';
    $('wb-preview-info').classList.remove('visible');
  });
  $('btn-cancel-wordbook').addEventListener('click', () => { $('wordbook-create-panel').classList.remove('open'); });
  $('btn-create-wordbook').addEventListener('click', createWordBook);

  // Goal buttons
  document.querySelectorAll('.goal-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.goal-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      $('wb-daily-goal').value = btn.dataset.goal;
    });
  });

  // Import tabs
  document.querySelectorAll('.import-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.import-tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.import-tab-pane').forEach(p => p.classList.remove('active'));
      tab.classList.add('active');
      const pane = $(`import-tab-${tab.dataset.tab}`);
      if (pane) pane.classList.add('active');
    });
  });

  // File drop zone
  const dropZone = $('file-drop-zone');
  const fileInput = $('file-input');
  dropZone.addEventListener('click', () => fileInput.click());
  dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('drag-over'); });
  dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
  dropZone.addEventListener('drop', async e => {
    e.preventDefault(); dropZone.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (file) await handleFileImport(file);
  });
  fileInput.addEventListener('change', async () => {
    if (fileInput.files[0]) await handleFileImport(fileInput.files[0]);
  });
  $('btn-download-template').addEventListener('click', e => { e.stopPropagation(); downloadTemplate(); });

  // Review
  $('btn-begin-review').addEventListener('click', startReview);
  $('btn-flip').addEventListener('click', flipCard);
  document.querySelectorAll('.rate-btn').forEach(btn =>
    btn.addEventListener('click', () => rateCard(parseInt(btn.dataset.quality)))
  );
  $('btn-review-again').addEventListener('click', () => { renderReviewStart(); startReview(); });
  $('btn-back-dashboard').addEventListener('click', () => navigate('dashboard'));

  // Spelling test
  $('btn-start-spelling').addEventListener('click', startSpellingTest);
  $('btn-spell-check').addEventListener('click', checkSpelling);
  $('btn-spell-skip').addEventListener('click', skipSpell);
  $('spell-input').addEventListener('keydown', e => {
    if (e.key === 'Enter' && !$('btn-spell-check').disabled) checkSpelling();
  });
  $('spell-phonetic-toggle').addEventListener('click', () => {
    if (_spellPhoneticShown) return;
    _spellPhoneticShown = true;
    const word    = spellQueue[spellIndex];
    const phonetic = word && word.phonetic ? word.phonetic : null;
    $('spell-phonetic-toggle').innerHTML = phonetic
      ? `Phonetic: <strong>${escHtml(phonetic)}</strong>`
      : 'No phonetic data available';
  });
  $('btn-spell-retry').addEventListener('click', () => {
    spellIndex = 0; spellResults = [];
    setDisplay($('review-spell-results'), false);
    setDisplay($('review-spelling'),       true);
    showSpellCard();
  });
  $('btn-spell-done').addEventListener('click', () => navigate('dashboard'));

  // Settings
  $('btn-settings').addEventListener('click', openSettings);
  $('modal-close').addEventListener('click', closeSettings);
  $('settings-provider').addEventListener('change', () => updateProviderUI($('settings-provider').value));
  $('settings-modal').addEventListener('click', e => { if (e.target === $('settings-modal')) closeSettings(); });
  $('btn-save-settings').addEventListener('click', saveSettings);
  $('btn-toggle-key').addEventListener('click', () => {
    const inp = $('settings-api-key');
    inp.type = inp.type === 'password' ? 'text' : 'password';
    $('btn-toggle-key').textContent = inp.type === 'password' ? 'Show' : 'Hide';
  });
  // Supabase key toggle (may not exist in simplified settings)
  const supabaseKeyToggle = $('btn-toggle-supabase-key');
  if (supabaseKeyToggle) {
    supabaseKeyToggle.addEventListener('click', () => {
      const inp = $('settings-supabase-key');
      inp.type = inp.type === 'password' ? 'text' : 'password';
      supabaseKeyToggle.textContent = inp.type === 'password' ? 'Show' : 'Hide';
    });
  }

  // Sync section toggle — removed (always visible now)

  // ── Local Sync: Show QR Code ──
  $('btn-export-qr').addEventListener('click', () => {
    const data = JSON.stringify(Storage.exportAll());
    // QR codes can hold ~2.5KB. If data is too large, offer file export instead.
    if (data.length > 2200) {
      toast(`Data too large for QR (${(data.length/1024).toFixed(1)}KB). Use "Copy All Data" or file export instead.`, 'error');
      return;
    }
    const qrContainer = $('qr-container');
    const qrDiv = $('qr-code');
    qrDiv.innerHTML = '';
    qrContainer.style.display = '';
    // QR code: encode the data directly as a URL that triggers import
    const payload = btoa(unescape(encodeURIComponent(data)));
    const importUrl = window.location.origin + window.location.pathname + '#import=' + payload;
    new QRCode(qrDiv, {
      text: importUrl,
      width: 220,
      height: 220,
      colorDark: '#4f46e5',
      colorLight: '#ffffff',
    });
  });
  $('btn-close-qr').addEventListener('click', () => {
    $('qr-container').style.display = 'none';
    $('qr-code').innerHTML = '';
  });

  // ── Local Sync: Import from File ──
  $('btn-import-file').addEventListener('click', () => {
    $('import-file-input').click();
  });
  $('import-file-input').addEventListener('change', async () => {
    const file = $('import-file-input').files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      if (!data.words && !data.checkIns && !data.wordBooks) {
        throw new Error('Not a valid VocabMaster export file');
      }
      // Use Sync's merge logic
      Sync._mergeInto(data);
      renderDashboard(); renderWords(); renderWordBooks();
      toast(`Imported ${(data.words||[]).length} words ✓`, 'success');
    } catch (err) {
      toast('Import failed: ' + err.message, 'error');
    }
    $('import-file-input').value = '';
  });

  // ── Local Sync: Copy All Data ──
  $('btn-copy-data').addEventListener('click', async () => {
    const data = JSON.stringify(Storage.exportAll(), null, 2);
    try {
      await navigator.clipboard.writeText(data);
      toast('Data copied to clipboard! Paste into WeChat/QQ/AirDrop.', 'success');
    } catch {
      // Fallback: show in a textarea for manual copy
      const ta = document.createElement('textarea');
      ta.value = data; ta.style.cssText = 'position:fixed;top:10%;left:10%;width:80%;height:80%;z-index:9999';
      ta.select(); document.body.appendChild(ta);
      toast('Tap and hold to Select All → Copy', '');
      ta.addEventListener('blur', () => ta.remove());
    }
  });

  // ── Check URL hash for incoming QR import ──
  if (window.location.hash.startsWith('#import=')) {
    try {
      const payload = window.location.hash.slice(8);
      const json = decodeURIComponent(escape(atob(payload)));
      const data = JSON.parse(json);
      if (data.words || data.checkIns || data.wordBooks) {
        Sync._mergeInto(data);
        // Clean URL
        history.replaceState(null, '', window.location.pathname);
        setTimeout(() => {
          renderDashboard(); renderWords(); renderWordBooks();
          toast('Data imported from QR! ✓', 'success');
        }, 500);
      }
    } catch (err) {
      console.log('QR import failed:', err.message);
      history.replaceState(null, '', window.location.pathname);
    }
  }

  // Settings — Cloud Sync, Supabase key toggle
  $('btn-sync-now').addEventListener('click', async () => {
    const btn = $('btn-sync-now');
    btn.disabled = true;
    btn.textContent = '⏳ Syncing...';
    try {
      // Save settings first (so sync has latest config)
      const p = $('settings-provider').value;
      const cfg = API.PROVIDERS[p] || {};
      Storage.saveSettings({
        apiProvider: p,
        apiKey: $('settings-api-key').value.trim(),
        apiModel: $('settings-model').value.trim() || cfg.defaultModel || '',
        customUrl: $('settings-custom-url').value.trim(),
        dailyGoal: parseInt($('settings-daily-goal').value) || 20,
        supabaseUrl: $('settings-supabase-url').value.trim(),
        supabaseKey: $('settings-supabase-key').value.trim(),
        syncPassphrase: $('settings-sync-passphrase').value.trim(),
      });
      const result = await Sync.sync();
      if (result.pulled && result.pushed) toast('Sync complete: pulled & pushed ✓', 'success');
      else if (result.pulled) toast('Pulled from server ✓', 'success');
      else if (result.pushed) toast('Pushed to server ✓', 'success');
      else toast('Sync configured but no data exchanged', '');
      $('sync-status').textContent = 'Last sync: just now';
      $('sync-status').style.color = '#22c55e';
      renderDashboard();
      renderWords();
      renderWordBooks();
    } catch (err) {
      toast('Sync failed: ' + err.message, 'error');
      $('sync-status').textContent = 'Error: ' + err.message.slice(0, 40);
      $('sync-status').style.color = '#ef4444';
      console.error(err);
    }
    btn.textContent = '🔄 Sync Now';
    btn.disabled = false;
  });
  const btnExport = $('btn-export');
  if (btnExport) {
    btnExport.addEventListener('click', () => {
      const data = JSON.stringify(Storage.exportAll(), null, 2);
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([data], { type: 'application/json' }));
      a.download = `vocabmaster-${new Date().toISOString().slice(0,10)}.json`;
      a.click(); URL.revokeObjectURL(a.href);
    });
  }
  $('btn-clear-data').addEventListener('click', () => {
    if (confirm('Delete ALL data? This cannot be undone.')) {
      Storage.clearAll(); closeSettings(); navigate('dashboard'); toast('All data cleared');
    }
  });
}

async function handleFileImport(file) {
  try {
    let words;
    if (file.name.endsWith('.csv') || file.type === 'text/csv') {
      const text = await file.text();
      words = parseCSVText(text);
    } else {
      words = await parseExcelFile(file);
    }
    showImportPreview(words);
    toast(`Parsed ${words.length} words from ${file.name}`, 'success');
  } catch (err) {
    toast('Import failed: ' + err.message, 'error');
    console.error(err);
  }
}

// ── INIT ───────────────────────────────────────────────────────────────────
function init() {
  // Release daily words from word books before rendering
  const released = Storage.releaseWordsForToday();

  bindEvents();
  TTS.populateVoices($('tts-voice'));

  // Silently enrich words that have no definition in the background
  setTimeout(() => {
    const nodef = Storage.getWords().filter(w => !(w.meanings && w.meanings.length) && !w.definition);
    if (nodef.length) enrichWordsInBackground(nodef);
  }, 1500);

  // Set first import tab pane visible
  const firstPane = document.querySelector('.import-tab-pane');
  if (firstPane) firstPane.classList.add('active');

  navigate('dashboard');

  // ── Auto-sync on startup (silent, delayed) ──
  setTimeout(async () => {
    try {
      const result = await Sync.sync();
      if (result.pulled) {
        // Remote data was merged — refresh all views
        renderDashboard();
        renderWords();
        renderWordBooks();
        console.log('[Sync] Pulled remote data on startup');
      }
    } catch (err) {
      // Silently fail — sync config might not be set up yet
      console.log('[Sync] Startup sync skipped:', err.message);
    }
  }, 2000);

  if (released > 0) {
    setTimeout(() => toast(`📚 Today's word books released ${released} new words!`, 'success'), 800);
  }
  // Check if sync is configured; if not, suggest API key
  if (!Storage.getSettings().apiKey && !Storage.getSettings().syncPassphrase) {
    setTimeout(() => toast('提示：点击左下角 Settings 填入 API Key（推荐 DeepSeek，国内可用）'), 1500);
  }
}

document.addEventListener('DOMContentLoaded', init);
