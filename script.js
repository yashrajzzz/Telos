/* ---------------- CLOCK + DATE LINE ---------------- */

function pad(n) { return String(n).padStart(2, '0'); }

function updateClock() {
  const now = new Date();
  const h = pad(now.getHours());
  const m = pad(now.getMinutes());
  const s = pad(now.getSeconds());
  document.getElementById('clock-time').innerHTML =
    `${h}<span class="cursor">:</span>${m}<span class="cursor">:</span>${s}`;

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


/* ---------------- SEARCH BAR ---------------- */

document.getElementById('searchbar').addEventListener('submit', e => {
  e.preventDefault();
  const input = document.getElementById('search-input');
  const query = input.value.trim();
  if (!query) return;
  // if it looks like a URL, go straight there; otherwise search Google
  const isUrl = /^(https?:\/\/)?[\w-]+(\.[\w-]+)+.*$/i.test(query) && !query.includes(' ');
  const dest = isUrl ? normalizeUrl(query) : `https://www.google.com/search?q=${encodeURIComponent(query)}`;
  window.location.href = dest;
});


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
const pendingLocalChanges = { todos: 0, notes: 0, links: 0, activeTabMode: 0 };

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
      const before = e.clientX - rect.left < rect.width / 2;
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


/* ---------------- TOP BROWSER TABS (100% REAL-TIME DYNAMIC) ---------------- */

let activeTabMode = 'frequent'; // 'frequent' | 'recent' | 'open'
let loadedTabs = [];

function extractDomain(rawUrl) {
  try {
    const parsed = new URL(rawUrl);
    return parsed.hostname.replace(/^www\./, '');
  } catch (e) {
    return rawUrl ? rawUrl.replace(/^https?:\/\/(www\.)?/, '').split('/')[0] : '';
  }
}

function getFaviconUrl(url, explicitFavicon) {
  if (explicitFavicon && (explicitFavicon.startsWith('http') || explicitFavicon.startsWith('data:'))) {
    return explicitFavicon;
  }
  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id) {
    try {
      const u = new URL(chrome.runtime.getURL('/_favicon/'));
      u.searchParams.set('pageUrl', url);
      u.searchParams.set('size', '32');
      return u.toString();
    } catch (e) {
      // fallback
    }
  }
  const domain = extractDomain(url);
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=32`;
}

/* 1. Frequently Opened: Combines Chrome Top Sites + Chrome History visit counts dynamically */
function fetchFrequentlyOpened() {
  return new Promise((resolve) => {
    const resultsMap = new Map();

    const fetchTopSites = new Promise((res) => {
      if (typeof chrome !== 'undefined' && chrome.topSites && chrome.topSites.get) {
        chrome.topSites.get((sites) => {
          if (sites) {
            sites.forEach(s => {
              if (s.url && !s.url.startsWith('chrome://') && !s.url.startsWith('chrome-extension://')) {
                resultsMap.set(s.url, {
                  id: uid(),
                  title: s.title || extractDomain(s.url),
                  url: s.url,
                  type: 'frequent'
                });
              }
            });
          }
          res();
        });
      } else {
        res();
      }
    });

    const fetchHistoryByVisitCount = new Promise((res) => {
      if (typeof chrome !== 'undefined' && chrome.history && chrome.history.search) {
        const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
        chrome.history.search({ text: '', startTime: thirtyDaysAgo, maxResults: 300 }, (historyItems) => {
          if (historyItems) {
            const sorted = historyItems
              .filter(h => h.url && !h.url.startsWith('chrome://') && !h.url.startsWith('chrome-extension://'))
              .sort((a, b) => (b.visitCount || 0) - (a.visitCount || 0));

            sorted.slice(0, 20).forEach(h => {
              if (!resultsMap.has(h.url)) {
                resultsMap.set(h.url, {
                  id: uid(),
                  title: h.title || extractDomain(h.url),
                  url: h.url,
                  visitCount: h.visitCount,
                  type: 'frequent'
                });
              }
            });
          }
          res();
        });
      } else {
        res();
      }
    });

    Promise.all([fetchTopSites, fetchHistoryByVisitCount]).then(() => {
      resolve(Array.from(resultsMap.values()).slice(0, 16));
    });
  });
}

/* 2. Previously Opened: Combines recently closed tabs (sessions) + recent browsing history in real-time */
function fetchPreviouslyOpened() {
  return new Promise((resolve) => {
    const list = [];
    const seenUrls = new Set();

    const fetchSessions = new Promise((res) => {
      if (typeof chrome !== 'undefined' && chrome.sessions && chrome.sessions.getRecentlyClosed) {
        chrome.sessions.getRecentlyClosed({ maxResults: 25 }, (sessions) => {
          if (sessions) {
            sessions.forEach(sess => {
              if (sess.tab && sess.tab.url && !sess.tab.url.startsWith('chrome://') && !sess.tab.url.startsWith('chrome-extension://')) {
                if (!seenUrls.has(sess.tab.url)) {
                  seenUrls.add(sess.tab.url);
                  list.push({
                    id: uid(),
                    sessionId: sess.tab.sessionId,
                    title: sess.tab.title || extractDomain(sess.tab.url),
                    url: sess.tab.url,
                    favIconUrl: sess.tab.favIconUrl,
                    type: 'recent'
                  });
                }
              } else if (sess.window && sess.window.tabs) {
                sess.window.tabs.forEach(t => {
                  if (t.url && !t.url.startsWith('chrome://') && !t.url.startsWith('chrome-extension://') && !seenUrls.has(t.url)) {
                    seenUrls.add(t.url);
                    list.push({
                      id: uid(),
                      sessionId: t.sessionId,
                      title: t.title || extractDomain(t.url),
                      url: t.url,
                      favIconUrl: t.favIconUrl,
                      type: 'recent'
                    });
                  }
                });
              }
            });
          }
          res();
        });
      } else {
        res();
      }
    });

    fetchSessions.then(() => {
      if (typeof chrome !== 'undefined' && chrome.history && chrome.history.search) {
        chrome.history.search({ text: '', maxResults: 30 }, (historyItems) => {
          if (historyItems) {
            historyItems.forEach(h => {
              if (h.url && !h.url.startsWith('chrome://') && !h.url.startsWith('chrome-extension://') && !seenUrls.has(h.url)) {
                seenUrls.add(h.url);
                list.push({
                  id: uid(),
                  title: h.title || extractDomain(h.url),
                  url: h.url,
                  lastVisitTime: h.lastVisitTime,
                  type: 'recent'
                });
              }
            });
          }
          resolve(list.slice(0, 16));
        });
      } else {
        resolve(list.slice(0, 16));
      }
    });
  });
}

/* 3. Open Tabs: Queries live open browser tabs in real-time */
function fetchOpenTabs() {
  return new Promise((resolve) => {
    if (typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.query) {
      chrome.tabs.query({ currentWindow: true }, (tabs) => {
        if (tabs && tabs.length > 0) {
          const list = tabs
            .filter(t => t.url && !t.url.startsWith('chrome-extension://'))
            .map(t => ({
              id: uid(),
              tabId: t.id,
              windowId: t.windowId,
              title: t.title || extractDomain(t.url),
              url: t.url,
              favIconUrl: t.favIconUrl,
              active: t.active,
              type: 'open'
            }));
          resolve(list);
        } else {
          resolve([]);
        }
      });
    } else {
      resolve([]);
    }
  });
}

function updateTabsScrollButtons() {
  const track = document.getElementById('top-tabs-track');
  const btnLeft = document.getElementById('tabs-scroll-left');
  const btnRight = document.getElementById('tabs-scroll-right');
  if (!track || !btnLeft || !btnRight) return;

  const hasOverflow = track.scrollWidth > track.clientWidth + 4;
  if (!hasOverflow) {
    btnLeft.classList.remove('visible');
    btnRight.classList.remove('visible');
    return;
  }

  btnLeft.classList.add('visible');
  btnRight.classList.add('visible');

  btnLeft.classList.toggle('disabled', track.scrollLeft <= 2);
  btnRight.classList.toggle('disabled', track.scrollLeft + track.clientWidth >= track.scrollWidth - 2);
}

function renderTopTabs(tabs) {
  loadedTabs = tabs;
  const track = document.getElementById('top-tabs-track');
  if (!track) return;
  track.innerHTML = '';

  if (!tabs || tabs.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'tabs-empty-state';
    if (typeof chrome === 'undefined' || !chrome.history) {
      empty.textContent = '// load extension in chrome://extensions to sync live data';
    } else if (activeTabMode === 'open') {
      empty.textContent = '// no open tabs found';
    } else if (activeTabMode === 'recent') {
      empty.textContent = '// no recent history found';
    } else {
      empty.textContent = '// no frequently opened sites yet';
    }
    track.appendChild(empty);
    updateTabsScrollButtons();
    return;
  }

  tabs.forEach(tab => {
    const item = document.createElement('a');
    item.className = 'browser-tab' + (tab.active ? ' active-tab' : '');
    item.href = tab.url;
    item.title = `${tab.title}\n${tab.url}`;

    // Favicon or Fallback letter badge
    const domain = extractDomain(tab.url);
    const initial = (domain || tab.title || '?')[0].toUpperCase();

    const img = document.createElement('img');
    img.className = 'tab-favicon';
    img.alt = '';
    img.loading = 'lazy';
    img.src = getFaviconUrl(tab.url, tab.favIconUrl);

    img.onerror = () => {
      const fallback = document.createElement('span');
      fallback.className = 'tab-fallback-icon';
      fallback.textContent = initial;
      if (item.contains(img)) {
        item.replaceChild(fallback, img);
      }
    };

    const titleEl = document.createElement('span');
    titleEl.className = 'tab-title';
    titleEl.textContent = tab.title;

    const domainEl = document.createElement('span');
    domainEl.className = 'tab-domain';
    domainEl.textContent = domain;

    const closeBtn = document.createElement('button');
    closeBtn.className = 'tab-close';
    closeBtn.textContent = '✕';
    closeBtn.title = tab.type === 'open' ? 'close tab' : 'remove';

    closeBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();

      if (tab.type === 'open' && tab.tabId && typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.remove) {
        chrome.tabs.remove(tab.tabId, () => {
          loadAndRenderTopTabs();
        });
      } else {
        loadedTabs = loadedTabs.filter(t => t.id !== tab.id);
        renderTopTabs(loadedTabs);
      }
    });

    item.addEventListener('click', (e) => {
      if (e.button === 1 || e.ctrlKey || e.metaKey) {
        // middle click or command/ctrl click: open in background new tab
        return;
      }
      e.preventDefault();

      if (tab.type === 'open' && tab.tabId && typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.update) {
        chrome.tabs.update(tab.tabId, { active: true });
        if (tab.windowId && chrome.windows && chrome.windows.update) {
          chrome.windows.update(tab.windowId, { focused: true });
        }
      } else if (tab.type === 'recent' && tab.sessionId && typeof chrome !== 'undefined' && chrome.sessions && chrome.sessions.restore) {
        chrome.sessions.restore(tab.sessionId, () => {
          loadAndRenderTopTabs();
        });
      } else {
        window.location.href = tab.url;
      }
    });

    item.append(img, titleEl, domainEl, closeBtn);
    track.appendChild(item);
  });

  updateTabsScrollButtons();
}

function loadAndRenderTopTabs() {
  let fetchPromise;
  if (activeTabMode === 'recent') {
    fetchPromise = fetchPreviouslyOpened();
  } else if (activeTabMode === 'open') {
    fetchPromise = fetchOpenTabs();
  } else {
    fetchPromise = fetchFrequentlyOpened();
  }

  return fetchPromise.then(tabs => {
    renderTopTabs(tabs);
  });
}

function setTopTabsMode(mode) {
  activeTabMode = mode;
  document.querySelectorAll('.top-mode-btn').forEach(btn => {
    const isActive = btn.dataset.mode === mode;
    btn.classList.toggle('active', isActive);
    btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
  });
  storageSet('activeTabMode', mode);
  return loadAndRenderTopTabs();
}

function initTopNavTabs() {
  const track = document.getElementById('top-tabs-track');
  const btnLeft = document.getElementById('tabs-scroll-left');
  const btnRight = document.getElementById('tabs-scroll-right');
  const refreshBtn = document.getElementById('tabs-refresh-btn');

  // Mode switcher clicks
  document.querySelectorAll('.top-mode-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      setTopTabsMode(btn.dataset.mode);
    });
  });

  // Horizontal wheel scroll on tabs strip
  if (track) {
    track.addEventListener('wheel', (e) => {
      if (e.deltaY !== 0) {
        e.preventDefault();
        track.scrollLeft += e.deltaY;
        updateTabsScrollButtons();
      }
    }, { passive: false });

    track.addEventListener('scroll', updateTabsScrollButtons);
  }

  // Scroll buttons
  if (btnLeft && track) {
    btnLeft.addEventListener('click', () => {
      track.scrollBy({ left: -220, behavior: 'smooth' });
    });
  }
  if (btnRight && track) {
    btnRight.addEventListener('click', () => {
      track.scrollBy({ left: 220, behavior: 'smooth' });
    });
  }

  window.addEventListener('resize', updateTabsScrollButtons);

  // Refresh button
  if (refreshBtn) {
    refreshBtn.addEventListener('click', () => {
      refreshBtn.classList.add('spin');
      loadAndRenderTopTabs().then(() => {
        setTimeout(() => refreshBtn.classList.remove('spin'), 600);
      });
    });
  }

  // Real-time live Chrome event listeners
  if (typeof chrome !== 'undefined') {
    // 1. Live tabs events
    if (chrome.tabs) {
      const handleTabsChange = () => {
        if (activeTabMode === 'open') {
          loadAndRenderTopTabs();
        }
      };
      if (chrome.tabs.onCreated) chrome.tabs.onCreated.addListener(handleTabsChange);
      if (chrome.tabs.onRemoved) chrome.tabs.onRemoved.addListener(handleTabsChange);
      if (chrome.tabs.onActivated) chrome.tabs.onActivated.addListener(handleTabsChange);
      if (chrome.tabs.onUpdated) chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
        if (changeInfo.title || changeInfo.url || changeInfo.favIconUrl) {
          handleTabsChange();
        }
      });
    }

    // 2. Live history & sessions events
    if (chrome.history) {
      const handleHistoryChange = () => {
        if (activeTabMode === 'recent' || activeTabMode === 'frequent') {
          loadAndRenderTopTabs();
        }
      };
      if (chrome.history.onVisited) chrome.history.onVisited.addListener(handleHistoryChange);
      if (chrome.history.onVisitRemoved) chrome.history.onVisitRemoved.addListener(handleHistoryChange);
    }

    if (chrome.sessions && chrome.sessions.onChanged) {
      chrome.sessions.onChanged.addListener(() => {
        if (activeTabMode === 'recent') {
          loadAndRenderTopTabs();
        }
      });
    }
  }
}


/* ---------------- INIT + LIVE CROSS-TAB SYNC ---------------- */

const DEFAULT_LINKS = [
  { id: uid(), label: 'GitHub', url: 'https://github.com' },
  { id: uid(), label: 'ChatGPT', url: 'https://chatgpt.com' },
  { id: uid(), label: 'Notion', url: 'https://notion.so' }
];

const DEFAULT_NOTES = [
  { id: uid(), text: "Life's beautiful, Jane", color: NOTE_COLORS[0] }
];

storageGet({ todos: [], notes: DEFAULT_NOTES, links: DEFAULT_LINKS, activeTabMode: 'frequent' }).then(data => {
  todos = data.todos || [];
  notes = data.notes || [];
  links = data.links || [];
  activeTabMode = data.activeTabMode || 'frequent';
  backfillNoteColors();
  renderTodos();
  renderNotes();
  renderLinks();
  initTopNavTabs();
  setTopTabsMode(activeTabMode);
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
    if (changes.activeTabMode) {
      if (pendingLocalChanges.activeTabMode > 0) {
        pendingLocalChanges.activeTabMode--;
      } else {
        setTopTabsMode(changes.activeTabMode.newValue || 'frequent');
      }
    }
  });
}
