/* ---------------- CLOCK + DATE LINE ---------------- */

let currentHourFormat = '24h';

function pad(n) { return String(n).padStart(2, '0'); }

function formatTimeParts(date) {
  const hour24 = date.getHours();
  if (currentHourFormat === '12h') {
    const suffix = hour24 >= 12 ? 'PM' : 'AM';
    const displayHour = hour24 % 12 || 12;
    return {
      time: `${pad(displayHour)}<span class="text-blue animate-blink">:</span>${pad(date.getMinutes())}<span class="text-blue animate-blink">:</span>${pad(date.getSeconds())}`,
      suffix
    };
  }

  return {
    time: `${pad(hour24)}<span class="text-blue animate-blink">:</span>${pad(date.getMinutes())}<span class="text-blue animate-blink">:</span>${pad(date.getSeconds())}`,
    suffix: ''
  };
}

function updateClock() {
  const now = new Date();
  const { time, suffix } = formatTimeParts(now);
  const suffixMarkup = currentHourFormat === '12h' ? `<span class="text-text-dim text-[20px] ml-2 align-middle">${suffix}</span>` : '';
  document.getElementById('clock-time').innerHTML = `${time}${suffixMarkup}`;

  const days = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const dateStr = `${days[now.getDay()]}, ${months[now.getMonth()]} ${now.getDate()}, ${now.getFullYear()}`;
  document.getElementById('gitline').textContent = dateStr;

  const hour = now.getHours();
  const greeting = document.getElementById('greeting');
  if (hour < 5) greeting.textContent = '// still up? get some rest, developer';
  else if (hour < 12) greeting.textContent = '// good morning, developer';
  else if (hour < 18) greeting.textContent = '// good afternoon, developer';
  else greeting.textContent = '// good evening, developer';
}
updateClock();
setInterval(updateClock, 1000);

const QUOTES = [
  'Believe you can and you\'re halfway there.',
  'Your time is limited, so don\'t waste it living someone else\'s life.',
  'The only way to do great work is to love what you do.',
  'If you can dream it, you can do it.',
  'Don\'t watch the clock; do what it does. Keep going.',
  'Do what you can, with what you have, where you are.',
  'The future belongs to those who believe in the beauty of their dreams.'
];
document.getElementById('quote').textContent = '// ' + QUOTES[Math.floor(Math.random() * QUOTES.length)];



/* ---------------- STORAGE HELPERS ----------------
   Uses chrome.storage.local instead of window.localStorage.
   Why: Chrome pre-renders/caches New Tab page instances in the
   background for speed. A page opened earlier can keep showing
   stale data even after you've made changes elsewhere. chrome.storage
   fixes this two ways: (1) it's the same store shared by every open
   instance of this page, and (2) chrome.storage.onChanged fires a
   live event in every open tab whenever data changes, so all open
   tabs immediately re-render with the latest data — no stale caches,
   no reload needed. Falls back to localStorage if chrome.storage is
   ever unavailable (e.g. testing the raw HTML file outside Chrome). */

const hasChromeStorage = typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local;

function storageGet(keys) {
  if (hasChromeStorage) {
    return new Promise(resolve => chrome.storage.local.get(keys, resolve));
  }
  const result = {};
  Object.keys(keys).forEach(k => {
    try {
      const raw = localStorage.getItem(k);
      result[k] = raw ? JSON.parse(raw) : keys[k];
    } catch (e) {
      result[k] = keys[k];
    }
  });
  return Promise.resolve(result);
}

/* Tracks writes this tab made itself, keyed by storage key.
   chrome.storage.onChanged fires in EVERY context that has a listener,
   including the tab that called .set() — not just other tabs. Without
   this, typing in a sticky note (which calls storageSet on every
   keystroke) would trigger the onChanged listener below, which
   re-renders the notes board and destroys/recreates the textarea you're
   actively typing in — killing focus and the cursor position after
   nearly every character. This counter lets the onChanged listener
   recognize "this change came from me, I'm already in sync" and skip
   the redundant re-render, while still re-rendering for changes that
   really did come from another tab. */
const pendingLocalChanges = { todos: 0, notes: 0, links: 0, settings: 0 };

function storageSet(key, value) {
  if (hasChromeStorage) {
    pendingLocalChanges[key] = (pendingLocalChanges[key] || 0) + 1;
    chrome.storage.local.set({ [key]: value });
  } else {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* ignore */ }
  }
}

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}


/* ---------------- STATE ---------------- */

let todos = [];
let notes = [];
let links = [];

const NOTE_COLORS = ['yellow', 'pink', 'green', 'blue'];
const MAX_NOTES = 4;

function backfillNoteColors() {
  notes.forEach((note, i) => {
    if (!note.color) note.color = NOTE_COLORS[i % NOTE_COLORS.length];
  });
}


/* ---------------- TODO LIST ---------------- */

function renderTodos() {
  const list = document.getElementById('todo-list');
  list.innerHTML = '';

  if (todos.length === 0) {
    const hint = document.createElement('li');
    hint.className = 'empty-hint';
    hint.textContent = 'no tasks yet — add one above';
    list.appendChild(hint);
  }

  todos.forEach(todo => {
    const li = document.createElement('li');
    li.className = 'todo-item' + (todo.done ? ' done' : '');

    const box = document.createElement('span');
    box.className = 'box';
    box.addEventListener('click', () => {
      todo.done = !todo.done;
      storageSet('todos', todos);
      renderTodos();
    });

    const label = document.createElement('span');
    label.className = 'label';
    label.textContent = todo.text;

    const del = document.createElement('button');
    del.className = 'del';
    del.textContent = '✕';
    del.title = 'remove';
    del.addEventListener('click', () => {
      todos = todos.filter(t => t.id !== todo.id);
      storageSet('todos', todos);
      renderTodos();
    });

    li.append(box, label, del);
    list.appendChild(li);
  });

  const openCount = todos.filter(t => !t.done).length;
  document.getElementById('todo-count').textContent = `${openCount} open`;
}

document.getElementById('todo-form').addEventListener('submit', e => {
  e.preventDefault();
  const input = document.getElementById('todo-input');
  const text = input.value.trim();
  if (!text) return;
  todos.push({ id: uid(), text, done: false });
  storageSet('todos', todos);
  input.value = '';
  renderTodos();
});


/* ---------------- STICKY NOTES ---------------- */

function renderNotes() {
  const board = document.getElementById('notes-board');
  board.innerHTML = '';

  if (notes.length === 0) {
    const hint = document.createElement('p');
    hint.className = 'empty-hint';
    hint.textContent = 'no notes yet — add one above';
    board.appendChild(hint);
  }

  notes.forEach(note => {
    const div = document.createElement('div');
    div.className = 'note';
    div.dataset.color = note.color;

    const tape = document.createElement('div');
    tape.className = 'tape';

    const textarea = document.createElement('textarea');
    textarea.value = note.text;
    textarea.maxLength = 240;
    textarea.spellcheck = false;
    textarea.addEventListener('input', () => {
      note.text = textarea.value;
      storageSet('notes', notes);
    });

    const del = document.createElement('button');
    del.className = 'note-del';
    del.textContent = 'remove';
    del.addEventListener('click', () => {
      notes = notes.filter(n => n.id !== note.id);
      storageSet('notes', notes);
      renderNotes();
    });

    div.append(tape, textarea, del);
    board.appendChild(div);
  });

  const addBtn = document.getElementById('note-add');
  addBtn.disabled = notes.length >= MAX_NOTES;
  addBtn.title = notes.length >= MAX_NOTES ? `max ${MAX_NOTES} notes` : 'add note';
}

document.getElementById('note-add').addEventListener('click', () => {
  if (notes.length >= MAX_NOTES) return;
  const usedColors = notes.map(n => n.color);
  const nextColor = NOTE_COLORS.find(c => !usedColors.includes(c)) || NOTE_COLORS[notes.length % NOTE_COLORS.length];
  notes.push({ id: uid(), text: '', color: nextColor });
  storageSet('notes', notes);
  renderNotes();
});


/* ---------------- SHORTCUTS ---------------- */

function normalizeUrl(u) {
  if (!/^https?:\/\//i.test(u)) return 'https://' + u;
  return u;
}

function closeAllMenus() {
  document.querySelectorAll('.link-menu.show').forEach(m => m.classList.remove('show'));
  document.querySelectorAll('.menu-btn.open').forEach(b => b.classList.remove('open'));
}

/* ---- drag-to-reorder ---- */
let draggedTile = null;

function renderLinks() {
  const grid = document.getElementById('links-grid');
  grid.innerHTML = '';

  links.forEach(link => {
    const a = document.createElement('a');
    a.className = 'link-tile';
    a.href = link.url;
    a.dataset.id = link.id;
    a.draggable = true;

    a.addEventListener('dragstart', (e) => {
      draggedTile = a;
      e.dataTransfer.effectAllowed = 'move';
      // Firefox requires data to be set for drag to start
      e.dataTransfer.setData('text/plain', link.id);
      closeAllMenus();
      // apply the visual state after the drag image is captured
      requestAnimationFrame(() => a.classList.add('dragging'));
    });

    a.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      if (!draggedTile || draggedTile === a) return;
      const rect = a.getBoundingClientRect();
      const midY = rect.top + rect.height / 2;
      const midX = rect.left + rect.width / 2;
      const before = e.clientY < midY - 6 ? true : (e.clientY > midY + 6 ? false : e.clientX < midX);
      grid.insertBefore(draggedTile, before ? a : a.nextSibling);
    });

    a.addEventListener('drop', (e) => {
      e.preventDefault();
    });

    a.addEventListener('dragend', () => {
      a.classList.remove('dragging');
      draggedTile = null;
      // persist whatever order is now in the DOM
      const newOrder = Array.from(grid.children)
        .map(el => links.find(l => l.id === el.dataset.id))
        .filter(Boolean);
      if (newOrder.length === links.length) {
        links = newOrder;
        storageSet('links', links);
      }
    });

    const dot = document.createElement('span');
    dot.className = 'dot';

    const label = document.createElement('span');
    label.className = 'label';
    label.textContent = link.label;

    const menuBtn = document.createElement('button');
    menuBtn.className = 'menu-btn';
    menuBtn.textContent = '⋯';
    menuBtn.title = 'options';

    const menu = document.createElement('div');
    menu.className = 'link-menu';

    const editOpt = document.createElement('button');
    editOpt.className = 'edit-opt';
    editOpt.textContent = 'edit';

    const removeOpt = document.createElement('button');
    removeOpt.className = 'remove-opt';
    removeOpt.textContent = 'remove';

    menu.append(editOpt, removeOpt);

    menuBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const isOpen = menu.classList.contains('show');
      closeAllMenus();
      if (!isOpen) {
        menu.classList.add('show');
        menuBtn.classList.add('open');
      }
    });

    editOpt.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      closeAllMenus();
      openLinkModal('edit', link);
    });

    removeOpt.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      closeAllMenus();
      links = links.filter(l => l.id !== link.id);
      storageSet('links', links);
      renderLinks();
    });

    a.append(dot, label, menuBtn, menu);
    grid.appendChild(a);
  });
}

document.addEventListener('click', closeAllMenus);

const linksGrid = document.getElementById('links-grid');
linksGrid.addEventListener('dragover', (e) => e.preventDefault());
linksGrid.addEventListener('drop', (e) => e.preventDefault());

/* ---- add / edit modal ---- */

const linkModalOverlay = document.getElementById('link-modal-overlay');
const linkModalTitle = document.getElementById('link-modal-title');
const linkNameInput = document.getElementById('link-name-input');
const linkUrlInput = document.getElementById('link-url-input');
const linkModalCancel = document.getElementById('link-modal-cancel');
const linkModalSave = document.getElementById('link-modal-save');

let modalMode = 'add'; // 'add' | 'edit'
let editingLinkId = null;

function openLinkModal(mode, link) {
  modalMode = mode;
  editingLinkId = link ? link.id : null;
  linkModalTitle.textContent = mode === 'edit' ? '// edit shortcut' : '// new shortcut';
  linkNameInput.value = link ? link.label : '';
  linkUrlInput.value = link ? link.url.replace(/^https?:\/\//i, '') : '';
  linkModalOverlay.classList.add('show');
  setTimeout(() => linkNameInput.focus(), 0);
}

function closeLinkModal() {
  linkModalOverlay.classList.remove('show');
  editingLinkId = null;
}

document.getElementById('link-add').addEventListener('click', () => {
  closeAllMenus();
  openLinkModal('add', null);
});
linkModalCancel.addEventListener('click', closeLinkModal);
linkModalOverlay.addEventListener('click', (e) => {
  if (e.target === linkModalOverlay) closeLinkModal();
});

linkModalSave.addEventListener('click', () => {
  const label = linkNameInput.value.trim();
  const urlRaw = linkUrlInput.value.trim();
  if (!label || !urlRaw) return;
  const url = normalizeUrl(urlRaw);

  if (modalMode === 'edit' && editingLinkId) {
    const target = links.find(l => l.id === editingLinkId);
    if (target) {
      target.label = label;
      target.url = url;
    }
  } else {
    links.push({ id: uid(), label, url });
  }
  storageSet('links', links);
  renderLinks();
  closeLinkModal();
});

[linkNameInput, linkUrlInput].forEach(inp => {
  inp.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      linkModalSave.click();
    } else if (e.key === 'Escape') {
      closeLinkModal();
    }
  });
});


/* ---------------- INIT + LIVE CROSS-TAB SYNC ---------------- */

const DEFAULT_LINKS = [
  { id: uid(), label: 'ChatGPT', url: 'https://chatgpt.com' },
  { id: uid(), label: 'GitHub', url: 'https://github.com' },
  { id: uid(), label: 'Notion', url: 'https://notion.so' }
];

const DEFAULT_NOTES = [
  { id: uid(), text: "Life's Beautiful, Jane", color: NOTE_COLORS[0] }
];

storageGet({ todos: [], notes: DEFAULT_NOTES, links: DEFAULT_LINKS }).then(data => {
  todos = data.todos || [];
  notes = data.notes || [];
  links = data.links || [];
  backfillNoteColors();
  renderTodos();
  renderNotes();
  renderLinks();
});

if (hasChromeStorage) {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;

    if (changes.todos) {
      if (pendingLocalChanges.todos > 0) {
        pendingLocalChanges.todos--;
      } else {
        todos = changes.todos.newValue || [];
        renderTodos();
      }
    }
    if (changes.notes) {
      if (pendingLocalChanges.notes > 0) {
        pendingLocalChanges.notes--;
      } else {
        notes = changes.notes.newValue || [];
        backfillNoteColors();
        renderNotes();
      }
    }
    if (changes.links) {
      if (pendingLocalChanges.links > 0) {
        pendingLocalChanges.links--;
      } else {
        links = changes.links.newValue || [];
        renderLinks();
      }
    }
    if (changes.settings) {
      if (pendingLocalChanges.settings > 0) {
        pendingLocalChanges.settings--;
      } else {
        const s = changes.settings.newValue || DEFAULT_SETTINGS;
        currentTheme = s.theme || 'ash';
        applyTheme(currentTheme);
        const tabName = s.tabName || 'Telos';
        const tabInput = document.getElementById('tab-name-input');
        if (tabInput) tabInput.value = tabName;
        applyTabName(tabName);
        applyHourFormat(s.hourFormat || DEFAULT_SETTINGS.hourFormat);
        applyPanelVisibility(s.panels || DEFAULT_SETTINGS.panels);
      }
    }
  });
}


/* ---------------- SETTINGS ---------------- */

const THEMES = {
  //                  bg        panel     panel2    line      text      textDim   blue      blue2     red
  midnight: { bg:'#0d1420', panel:'#131c2b', panel2:'#182335', line:'#263349', text:'#dbe4f3', textDim:'#7c8aa8', blue:'#4f8ff7', blue2:'#6fb4ff', red:'#c6604d' },
  abyss:    { bg:'#0a0e17', panel:'#101626', panel2:'#141e30', line:'#1e2d44', text:'#d0ddf5', textDim:'#6a7d9e', blue:'#3d7ef5', blue2:'#5da4ff', red:'#c0584a' },
  forest:   { bg:'#0d1a12', panel:'#111f16', panel2:'#16271c', line:'#223b2a', text:'#d5edd8', textDim:'#6a8f72', blue:'#4ecb7a', blue2:'#72e89a', red:'#c06050' },
  plum:     { bg:'#130d1e', panel:'#1a1028', panel2:'#201433', line:'#2e1d48', text:'#e2d5f5', textDim:'#8f7aaa', blue:'#9f6cf5', blue2:'#bf9aff', red:'#d05870' },
  ember:    { bg:'#1a0d0a', panel:'#22110d', panel2:'#2a1610', line:'#3d2016', text:'#f5e2d8', textDim:'#a07060', blue:'#e87040', blue2:'#ff9060', red:'#e05040' },
  slate:    { bg:'#111418', panel:'#181c21', panel2:'#1e242c', line:'#28313d', text:'#d8e0ee', textDim:'#6e7d94', blue:'#5a8fc0', blue2:'#7ab0e0', red:'#c0605a' },
  ocean:    { bg:'#091421', panel:'#0e1c2e', panel2:'#122338', line:'#1a3350', text:'#cce8f5', textDim:'#5a8aaa', blue:'#30b4e8', blue2:'#60d4ff', red:'#c05060' },
  ash:      { bg:'#000000', panel:'#141414', panel2:'#1c1c1c', line:'#2a2a2a', text:'#e8e8e8', textDim:'#888888', blue:'#bbbbbb', blue2:'#dddddd', red:'#cc6666' },
};

const DEFAULT_SETTINGS = { theme: 'ash', tabName: 'Telos', hourFormat: '24h', panels: { todo: true, shortcuts: true, notes: true } };

function applyTheme(name) {
  const t = THEMES[name] || THEMES.ash;
  const root = document.documentElement;
  root.style.setProperty('--bg',        t.bg);
  root.style.setProperty('--bg-panel',  t.panel);
  root.style.setProperty('--bg-panel-2',t.panel2);
  root.style.setProperty('--line',      t.line);
  root.style.setProperty('--text',      t.text);
  root.style.setProperty('--text-dim',  t.textDim);
  root.style.setProperty('--blue',      t.blue);
  root.style.setProperty('--blue-2',    t.blue2);
  root.style.setProperty('--red',       t.red);

  // update active theme badge
  const themeBadge = document.getElementById('current-theme-name');
  if (themeBadge) {
    themeBadge.textContent = name.charAt(0).toUpperCase() + name.slice(1);
  }

  // mark active swatch
  document.querySelectorAll('.swatch').forEach(s => {
    s.classList.toggle('active', s.dataset.theme === name);
  });
}

function applyPanelVisibility(panels) {
  document.getElementById('panel-todo').style.display  = panels.todo      ? '' : 'none';
  document.getElementById('panel-links').style.display = panels.shortcuts  ? '' : 'none';
  document.getElementById('panel-notes').style.display = panels.notes      ? '' : 'none';

  document.getElementById('toggle-todo').checked      = panels.todo;
  document.getElementById('toggle-shortcuts').checked = panels.shortcuts;
  document.getElementById('toggle-notes').checked     = panels.notes;
}

function applyTabName(name) {
  document.title = name || 'Telos';
}

function applyHourFormat(format) {
  currentHourFormat = format === '12h' ? '12h' : '24h';
  const select = document.getElementById('hour-format-select');
  if (select) select.value = currentHourFormat;
}

// --- open / close ---
const settingsBtn     = document.getElementById('settings-btn');
const settingsOverlay = document.getElementById('settings-overlay');
const settingsClose   = document.getElementById('settings-close');

function openSettings() {
  settingsOverlay.classList.add('show');
  settingsBtn.classList.add('active');
}
function closeSettings() {
  settingsOverlay.classList.remove('show');
  settingsBtn.classList.remove('active');
}

settingsBtn.addEventListener('click', () => {
  settingsOverlay.classList.contains('show') ? closeSettings() : openSettings();
});
settingsClose.addEventListener('click', closeSettings);
settingsOverlay.addEventListener('click', e => {
  if (e.target === settingsOverlay) closeSettings();
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && settingsOverlay.classList.contains('show')) closeSettings();
});

// --- panel toggles ---
function saveSettings() {
  currentHourFormat = document.getElementById('hour-format-select').value === '12h' ? '12h' : '24h';

  const s = {
    theme: currentTheme,
    tabName: document.getElementById('tab-name-input').value.trim() || 'Telos',
    hourFormat: currentHourFormat,
    panels: {
      todo:      document.getElementById('toggle-todo').checked,
      shortcuts: document.getElementById('toggle-shortcuts').checked,
      notes:     document.getElementById('toggle-notes').checked,
    }
  };
  storageSet('settings', s);
  applyPanelVisibility(s.panels);
  applyTabName(s.tabName);
  applyHourFormat(s.hourFormat);
}

['toggle-todo', 'toggle-shortcuts', 'toggle-notes'].forEach(id => {
  document.getElementById(id).addEventListener('change', saveSettings);
});

document.getElementById('tab-name-input').addEventListener('input', saveSettings);
document.getElementById('hour-format-select').addEventListener('change', saveSettings);

// --- theme swatches ---
let currentTheme = 'ash';

const swatchesContainer = document.getElementById('theme-swatches');
Object.keys(THEMES).forEach(themeName => {
  const t = THEMES[themeName];
  const btn = document.createElement('button');
  btn.className = 'swatch';
  btn.type = 'button';
  btn.dataset.theme = themeName;
  btn.title = themeName.charAt(0).toUpperCase() + themeName.slice(1);

  const preview = document.createElement('span');
  preview.className = 'swatch-preview';
  preview.style.background = `linear-gradient(135deg, ${t.bg} 0%, ${t.bg} 50%, ${t.blue} 50%, ${t.blue} 100%)`;

  const label = document.createElement('span');
  label.className = 'swatch-label';
  label.textContent = themeName.charAt(0).toUpperCase() + themeName.slice(1);

  btn.append(preview, label);

  btn.addEventListener('click', () => {
    currentTheme = themeName;
    applyTheme(currentTheme);
    saveSettings();
  });

  swatchesContainer.appendChild(btn);
});

// --- load settings on init ---
storageGet({ settings: DEFAULT_SETTINGS }).then(data => {
  const s = data.settings || DEFAULT_SETTINGS;
  currentTheme = s.theme || 'ash';
  applyTheme(currentTheme);

  const tabName = s.tabName || 'Telos';
  document.getElementById('tab-name-input').value = tabName;
  applyTabName(tabName);

  applyHourFormat(s.hourFormat || DEFAULT_SETTINGS.hourFormat);
  applyPanelVisibility(s.panels || DEFAULT_SETTINGS.panels);
});
