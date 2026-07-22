import React, { useState, useEffect, useRef } from 'react';
import './App.css';
import AIPanel from './AIPanel';

const DEFAULT_ROLES = [
  { id: 'oneness', label: 'Oneness (Self)', color: '#9D72DD' },
  { id: 'omowale', label: 'Omowale Republic', color: '#CF6BB0' },
  { id: 'icon', label: 'iCON Marketing', color: '#F0973F' },
  { id: 'nadir', label: 'Nadir Omowale LLC', color: '#6CC056' }
];

const COLOR_CHOICES = ['#9D72DD','#CF6BB0','#6CC056','#F0973F','#F07260','#E6BC3A','#5E9AE6','#E07296','#7F9C8B','#C88A5A','#B57EC8','#8FA36B','#D98C9C','#5FA6B0','#9A8FC2'];

// Curated timezone list for the world clock. Covers the places Cadence actually
// gets used with; the browser resolves the offset and DST automatically.
const TIMEZONES = [
  'Asia/Shanghai','Asia/Hong_Kong','Asia/Taipei','Asia/Tokyo','Asia/Seoul','Asia/Singapore',
  'Asia/Kolkata','Asia/Dubai','Asia/Jerusalem',
  'Europe/London','Europe/Berlin','Europe/Paris','Europe/Amsterdam','Europe/Madrid','Europe/Rome',
  'Europe/Stockholm','Europe/Warsaw','Europe/Moscow',
  'Australia/Sydney','Australia/Melbourne','Australia/Perth','Pacific/Auckland',
  'America/New_York','America/Chicago','America/Denver','America/Los_Angeles',
  'America/Toronto','America/Mexico_City','America/Sao_Paulo',
  'Africa/Johannesburg','Africa/Lagos','Africa/Cairo','UTC'
];

function getMonday(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(d.setDate(diff));
}

// Turn URLs inside a plain-text string into clickable links (returns an array of React nodes)
function linkifyNotes(text) {
  if (!text) return null;
  // Matches full URLs (http/https), www. URLs, and bare domains with a path or a
  // known TLD (e.g. meet.google.com/abc, zoom.us/j/123, example.com).
  const urlRe = /(https?:\/\/[^\s]+|www\.[^\s]+|[a-z0-9-]+(?:\.[a-z0-9-]+)+(?:\/[^\s]*)?)/gi;
  const parts = [];
  let last = 0, m, key = 0;
  while ((m = urlRe.exec(text)) !== null) {
    const raw = m[0];
    // Only treat a bare token as a link if it has a scheme, www, a path, or a
    // recognizable multi-part domain — avoids linkifying ordinary words with dots.
    const hasScheme = /^https?:\/\//i.test(raw);
    const isWww = /^www\./i.test(raw);
    const looksLikeDomain = /^[a-z0-9-]+(\.[a-z0-9-]+)+/i.test(raw) && raw.includes('.');
    if (!hasScheme && !isWww && !looksLikeDomain) continue;
    if (m.index > last) parts.push(text.slice(last, m.index));
    const href = hasScheme ? raw : `https://${raw}`;
    parts.push(
      React.createElement('a', {
        key: key++, href, target: '_blank', rel: 'noopener noreferrer',
        className: 'note-link', onClick: (e) => e.stopPropagation()
      }, raw)
    );
    last = m.index + raw.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

// Inline formatting: **bold**, *italic* / _italic_, plus links. Returns React nodes.
function formatInline(text, keyPrefix) {
  if (!text) return null;
  // Split on bold/italic markers, keeping the delimiters so we can style them.
  // Order matters: bold (**) before italic (*).
  const tokenRe = /(\*\*[^*]+\*\*|\*[^*]+\*|_[^_]+_)/g;
  const out = [];
  let last = 0, m, i = 0;
  while ((m = tokenRe.exec(text)) !== null) {
    if (m.index > last) out.push(...toArray(linkifyNotes(text.slice(last, m.index)), `${keyPrefix}-t${i}`));
    const tok = m[0];
    if (tok.startsWith('**')) {
      out.push(React.createElement('strong', { key: `${keyPrefix}-b${i}` }, tok.slice(2, -2)));
    } else {
      out.push(React.createElement('em', { key: `${keyPrefix}-i${i}` }, tok.slice(1, -1)));
    }
    last = m.index + tok.length; i++;
  }
  if (last < text.length) out.push(...toArray(linkifyNotes(text.slice(last)), `${keyPrefix}-e`));
  return out;
}
function toArray(v, kp) {
  if (v == null) return [];
  const arr = Array.isArray(v) ? v : [v];
  return arr.map((el, i) => (typeof el === 'string' ? el : React.cloneElement(el, { key: `${kp}-${i}` })));
}

// Block-level markdown: bulleted (- or *) and numbered (1.) lists, plus inline
// formatting on every line. Plain lines become paragraphs. Dependency-free, scoped
// to exactly the features we support so it stays predictable.
function renderMarkdown(text) {
  if (!text) return null;
  const lines = String(text).split('\n');
  const blocks = [];
  let list = null; // { type:'ul'|'ol', items:[] }
  const flush = () => {
    if (!list) return;
    blocks.push(React.createElement(list.type, { key: `l${blocks.length}`, className: 'md-list' },
      list.items.map((it, i) => React.createElement('li', { key: i }, formatInline(it, `li${blocks.length}-${i}`)))));
    list = null;
  };
  lines.forEach((line, idx) => {
    const bullet = line.match(/^\s*[-*]\s+(.*)$/);
    const number = line.match(/^\s*\d+\.\s+(.*)$/);
    if (bullet) {
      if (!list || list.type !== 'ul') { flush(); list = { type: 'ul', items: [] }; }
      list.items.push(bullet[1]);
    } else if (number) {
      if (!list || list.type !== 'ol') { flush(); list = { type: 'ol', items: [] }; }
      list.items.push(number[1]);
    } else if (line.trim() === '') {
      flush();
    } else {
      flush();
      blocks.push(React.createElement('div', { key: `p${idx}`, className: 'md-p' }, formatInline(line, `p${idx}`)));
    }
  });
  flush();
  return blocks;
}

function fmtInput(date) {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

// Convert "HH:MM" (24h stored value) into display string honoring use24h
function fmtTime(hhmm, use24h) {
  if (!hhmm) return '';
  const [hStr, mStr] = hhmm.split(':');
  let h = parseInt(hStr, 10);
  const m = mStr || '00';
  if (use24h) return `${String(h).padStart(2,'0')}:${m}`;
  const ampm = h >= 12 ? 'PM' : 'AM';
  let h12 = h % 12; if (h12 === 0) h12 = 12;
  return `${h12}:${m} ${ampm}`;
}

// Build a 24h "HH:MM" string from hour/min/ampm parts
function buildTime(hour, minute, ampm, use24h) {
  if (hour === '' || hour === null || hour === undefined) return '';
  let h = parseInt(hour, 10);
  if (isNaN(h)) return '';
  const m = String(minute === '' ? 0 : parseInt(minute, 10)).padStart(2, '0');
  if (!use24h) {
    if (ampm === 'PM' && h < 12) h += 12;
    if (ampm === 'AM' && h === 12) h = 0;
  }
  h = Math.max(0, Math.min(23, h));
  return `${String(h).padStart(2,'0')}:${m}`;
}

// Split a stored "HH:MM" into editable parts for the given format
function splitTime(hhmm, use24h) {
  if (!hhmm) return { hour: '', minute: '', ampm: 'AM' };
  let [h, m] = hhmm.split(':').map(x => parseInt(x, 10));
  if (use24h) return { hour: String(h), minute: String(m).padStart(2,'0'), ampm: 'AM' };
  const ampm = h >= 12 ? 'PM' : 'AM';
  let h12 = h % 12; if (h12 === 0) h12 = 12;
  return { hour: String(h12), minute: String(m).padStart(2,'0'), ampm };
}

const HOUR_PX = 69; // pixel height of one hour row (48px + 1px gap)

// minutes since midnight from "HH:MM"
function toMinutes(hhmm) {
  if (!hhmm) return null;
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + (m || 0);
}

// Given a day's timed events, assign each a layer for overlap display.
// Layered model (Google-style): each event keeps most of the width but is
// offset and stacked by depth so you can read each one.
function layoutDayEvents(events) {
  const evs = events.map(e => {
    const start = toMinutes(e.time);
    let end;
    if (e.endTime) end = toMinutes(e.endTime);
    else if (e.duration) end = start + parseInt(e.duration, 10);
    else end = start + 60;
    if (end <= start) end = start + 30;
    return { e, start, end };
  }).sort((a, b) => a.start - b.start || b.end - a.end);

  const result = {};
  let cluster = [];
  let clusterEnd = -1;
  const flush = () => {
    if (!cluster.length) return;
    // within a cluster, assign each event a column slot greedily
    const cols = [];
    cluster.forEach(item => {
      let placed = false;
      for (let c = 0; c < cols.length; c++) {
        if (item.start >= cols[c]) { cols[c] = item.end; item.col = c; placed = true; break; }
      }
      if (!placed) { item.col = cols.length; cols.push(item.end); }
    });
    const total = cols.length;
    cluster.forEach(item => {
      result[item.e.id] = { col: item.col, cols: total, start: item.start, end: item.end };
    });
    cluster = [];
  };
  evs.forEach(item => {
    if (cluster.length && item.start >= clusterEnd) flush();
    cluster.push(item);
    clusterEnd = Math.max(clusterEnd, item.end);
  });
  flush();
  return result;
}

// Does a repeating (or single) task occur on dateStr (YYYY-MM-DD)?
// A session is "done" when its scheduled end datetime has passed — no manual checkbox needed.
// occurrenceDate lets repeating sessions be judged per-occurrence.
function isSessionPast(task, occurrenceDate, now) {
  if (!task.time) return false; // only timed sessions
  const dayStr = occurrenceDate || task.startDate;
  if (!dayStr) return false;
  const endHHMM = task.endTime || task.time;
  const [h, m] = endHHMM.split(':').map(Number);
  const end = new Date(dayStr + 'T00:00:00');
  end.setHours(h, m, 0, 0);
  return (now || new Date()) > end;
}

// Which occurrence of its weekday is this date within its month? 1=first, 2=second...
// Returns {week, weekday, isLast}. e.g. first Wednesday → {week:1, weekday:3, isLast:false}
function weekdayPosition(d) {
  const week = Math.floor((d.getDate() - 1) / 7) + 1;
  const nextWeek = new Date(d); nextWeek.setDate(d.getDate() + 7);
  const isLast = nextWeek.getMonth() !== d.getMonth();
  return { week, weekday: d.getDay(), isLast };
}

function occursOn(task, dateStr) {
  const s = task.startDate;
  if (!s) return false;
  // skipped occurrences
  if (task.skipDates && task.skipDates.includes(dateStr)) return false;

  // non-repeating: occurs within its start..end span
  if (!task.repeat || task.repeat.freq === 'none') {
    const e = task.endDate || task.startDate;
    return dateStr >= s && dateStr <= e;
  }

  const rep = task.repeat;
  if (dateStr < s) return false;

  // respect end conditions
  if (rep.endType === 'date' && rep.endDate && dateStr > rep.endDate) return false;

  const startD = parseLocalDate(s);
  const curD = parseLocalDate(dateStr);
  const dayMs = 86400000;
  const daysDiff = Math.round((curD - startD) / dayMs);
  if (daysDiff < 0) return false;

  let matches = false;
  let occurrenceIndex = -1; // which occurrence number this date is (0-based)

  if (rep.freq === 'daily') {
    if (daysDiff % rep.interval === 0) { matches = true; occurrenceIndex = daysDiff / rep.interval; }
  } else if (rep.freq === 'weekly') {
    const wd = curD.getDay(); // 0=Sun
    const weekdays = (rep.weekdays && rep.weekdays.length) ? rep.weekdays : [startD.getDay()];
    const weeksDiff = Math.floor(daysDiff / 7);
    // align weeks to the start week
    const startWeekIndex = weekIndexFrom(startD, curD);
    if (weekdays.includes(wd) && startWeekIndex % rep.interval === 0) {
      matches = true;
    }
  } else if (rep.freq === 'monthly') {
    const monthsDiff = (curD.getFullYear()-startD.getFullYear())*12 + (curD.getMonth()-startD.getMonth());
    if (monthsDiff >= 0 && monthsDiff % rep.interval === 0) {
      if (rep.monthlyMode === 'weekday') {
        // match the same weekday-position as the start date (e.g. first Wednesday)
        const anchor = weekdayPosition(startD);
        const here = weekdayPosition(curD);
        const posMatch = here.weekday === anchor.weekday && (here.week === anchor.week || (anchor.isLast && here.isLast));
        if (posMatch) { matches = true; occurrenceIndex = monthsDiff / rep.interval; }
      } else if (curD.getDate() === startD.getDate()) {
        matches = true; occurrenceIndex = monthsDiff / rep.interval;
      }
    }
  } else if (rep.freq === 'yearly') {
    if (curD.getDate() === startD.getDate() && curD.getMonth() === startD.getMonth()) {
      const yearsDiff = curD.getFullYear()-startD.getFullYear();
      if (yearsDiff >= 0 && yearsDiff % rep.interval === 0) { matches = true; occurrenceIndex = yearsDiff / rep.interval; }
    }
  }

  if (!matches) return false;

  // end-after-N-occurrences: count occurrences up to and including this date
  if (rep.endType === 'count') {
    const n = countOccurrencesThrough(task, dateStr);
    if (n > rep.endCount) return false;
  }
  return true;
}

function parseLocalDate(str) {
  const [y,m,d] = str.split('-').map(Number);
  return new Date(y, m-1, d);
}

function weekIndexFrom(startD, curD) {
  // number of week-boundaries (from start's week) — align to Sunday weeks
  const s = new Date(startD); s.setHours(0,0,0,0);
  const c = new Date(curD); c.setHours(0,0,0,0);
  const sSunday = new Date(s); sSunday.setDate(s.getDate() - s.getDay());
  const cSunday = new Date(c); cSunday.setDate(c.getDate() - c.getDay());
  return Math.round((cSunday - sSunday) / (86400000*7));
}

// Count how many occurrences fall on or before dateStr (for end-after-N)
function countOccurrencesThrough(task, dateStr) {
  const rep = task.repeat;
  const startD = parseLocalDate(task.startDate);
  const endD = parseLocalDate(dateStr);
  let count = 0;
  // iterate day by day — capped for safety
  let cur = new Date(startD);
  let guard = 0;
  while (cur <= endD && guard < 4000) {
    guard++;
    const ds = fmtInput(cur);
    // temporarily check occurrence ignoring the count cap to avoid recursion
    if (occursOnIgnoringCount(task, ds)) count++;
    cur.setDate(cur.getDate()+1);
  }
  return count;
}

function occursOnIgnoringCount(task, dateStr) {
  const rep = task.repeat;
  if (!rep) return false;
  if (task.skipDates && task.skipDates.includes(dateStr)) return false;
  const startD = parseLocalDate(task.startDate);
  const curD = parseLocalDate(dateStr);
  if (curD < startD) return false;
  if (rep.endType === 'date' && rep.endDate && dateStr > rep.endDate) return false;
  const daysDiff = Math.round((curD - startD)/86400000);
  if (rep.freq === 'daily') return daysDiff % rep.interval === 0;
  if (rep.freq === 'weekly') {
    const wd = curD.getDay();
    const weekdays = (rep.weekdays && rep.weekdays.length) ? rep.weekdays : [startD.getDay()];
    return weekdays.includes(wd) && weekIndexFrom(startD, curD) % rep.interval === 0;
  }
  if (rep.freq === 'monthly') {
    const md = (curD.getFullYear()-startD.getFullYear())*12 + (curD.getMonth()-startD.getMonth());
    if (md < 0 || md % rep.interval !== 0) return false;
    if (rep.monthlyMode === 'weekday') {
      const anchor = weekdayPosition(startD);
      const here = weekdayPosition(curD);
      return here.weekday === anchor.weekday && (here.week === anchor.week || (anchor.isLast && here.isLast));
    }
    return curD.getDate() === startD.getDate();
  }
  if (rep.freq === 'yearly') {
    if (curD.getDate() !== startD.getDate() || curD.getMonth() !== startD.getMonth()) return false;
    const yd = curD.getFullYear()-startD.getFullYear();
    return yd >= 0 && yd % rep.interval === 0;
  }
  return false;
}

function App() {
  const [tasks, setTasks] = useState([]);
  const [intentions, setIntentions] = useState([]); // [{ themeId, date }]
  const [roles, setRoles] = useState(DEFAULT_ROLES);
  const [currentWeekStart, setCurrentWeekStart] = useState(getMonday(new Date()));
  const [selectedRole, setSelectedRole] = useState('all');
  const [taskColView, setTaskColView] = useState('byRole'); // byRole | selected | unscheduled
  const [themesSort, setThemesSort] = useState('priority'); // priority | role | type
  const [timelineListView, setTimelineListView] = useState('chrono'); // chrono | byRole | byTheme
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editingOccurrenceDate, setEditingOccurrenceDate] = useState(null);
  const [pendingSave, setPendingSave] = useState(null);
  const [pendingDelete, setPendingDelete] = useState(null);
  const [viewingThemeId, setViewingThemeId] = useState(null);
  const [viewingSession, setViewingSession] = useState(null);
  const [convertingTheme, setConvertingTheme] = useState(null); // themeId being demoted to a session
  const [sessionPanel, setSessionPanel] = useState(null); // { themeId, rect } — hover list of session titles
  const sessionPanelTimer = useRef(null);
  const [editingThemeDesc, setEditingThemeDesc] = useState(false);
  useEffect(() => { setEditingThemeDesc(false); }, [viewingThemeId]);
  const [deferOpen, setDeferOpen] = useState(false);
  const [deferWeeks, setDeferWeeks] = useState(2);
  const [deferReason, setDeferReason] = useState('');
  useEffect(() => { setDeferOpen(false); setDeferReason(''); setDeferWeeks(2); }, [viewingThemeId]);
  const [intentSuggestion, setIntentSuggestion] = useState(null);
  useEffect(() => { setIntentSuggestion(null); }, [viewingThemeId]);
  // Node navigation: breadcrumb path of ids from theme root down to the open node
  const [nodePath, setNodePath] = useState([]);
  useEffect(() => { setNodePath([]); }, [viewingThemeId]);
  const [newChildTitle, setNewChildTitle] = useState('');
  const [newListItem, setNewListItem] = useState('');
  const [editingListName, setEditingListName] = useState(false);
  useEffect(() => { setEditingListName(false); }, [viewingThemeId, nodePath]);
  const [editingResources, setEditingResources] = useState(false);
  useEffect(() => { setEditingResources(false); }, [showModal, editingId]);
  const [resSearch, setResSearch] = useState('');
  const [locFocused, setLocFocused] = useState(false);
  const [draggingOccDate, setDraggingOccDate] = useState(null);
  const [themeSearch, setThemeSearch] = useState('');
  const [themeSearchFocused, setThemeSearchFocused] = useState(false);
  useEffect(() => { setThemeSearch(''); setThemeSearchFocused(false); }, [showModal, editingId]);
  const [editingLocalRes, setEditingLocalRes] = useState(null);
  useEffect(() => { setResSearch(''); setEditingLocalRes(null); }, [showModal, editingId]);
  const [search, setSearch] = useState('');
  const [profileRoleId, setProfileRoleId] = useState(null);
  const [profile, setProfile] = useState(() => {
    try { const s = localStorage.getItem('planner-profile'); if (s) return JSON.parse(s); } catch {}
    return { name: '', workStart: '09:00', workEnd: '18:00', homeTz: '', instructions: '' };
  });
  useEffect(() => { localStorage.setItem('planner-profile', JSON.stringify(profile)); }, [profile]);
  const [editingResourceId, setEditingResourceId] = useState(null);
  const [newResourceName, setNewResourceName] = useState('');
  const [interviewRole, setInterviewRole] = useState(null);
  const [interviewStep, setInterviewStep] = useState(0);
  const [interviewAnswer, setInterviewAnswer] = useState('');
  const [interviewAnswers, setInterviewAnswers] = useState({});
  const [miniMonth, setMiniMonth] = useState(new Date());
  const [use24h, setUse24h] = useState(false);
  const [notifPermission, setNotifPermission] = useState(typeof Notification !== 'undefined' ? Notification.permission : 'default');
  const [popupReminder, setPopupReminder] = useState(null);
  const [showAI, setShowAI] = useState(false);
  const [dayStartHour, setDayStartHour] = useState(() => {
    const saved = localStorage.getItem('planner-day-start');
    return saved !== null ? parseInt(saved, 10) : 10;
  });
  const [viewMode, setViewMode] = useState('score'); // 'score' | 'timeline'
  const [density, setDensity] = useState(() => localStorage.getItem('planner-density') || 'balanced');
  const [showSettings, setShowSettings] = useState(false);
  const [settingsTab, setSettingsTab] = useState('roles'); // roles | display | clock | profile
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth <= 640);
  const [mobileDrawer, setMobileDrawer] = useState(null); // null | 'roles' | 'sessions' | 'themes'
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth <= 640);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  useEffect(() => { if (!isMobile) setMobileDrawer(null); }, [isMobile]);
  const [clockCities, setClockCities] = useState(() => {
    try { const s = localStorage.getItem('planner-clocks'); if (s) return JSON.parse(s); } catch {}
    return [
      { id: 1, label: 'Guangzhou', tz: 'Asia/Shanghai' },
      { id: 2, label: 'Berlin', tz: 'Europe/Berlin' },
      { id: 3, label: 'Mumbai', tz: 'Asia/Kolkata' },
      { id: 4, label: 'Sydney', tz: 'Australia/Sydney' },
    ];
  });
  const [clockNow, setClockNow] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setClockNow(new Date()), 30000); // refresh twice a minute
    return () => clearInterval(id);
  }, []);
  useEffect(() => { localStorage.setItem('planner-clocks', JSON.stringify(clockCities)); }, [clockCities]);

  // ---- Backup / transfer (export & import) ----
  const [lastExport, setLastExport] = useState(() => localStorage.getItem('planner-last-export') || '');
  const [importErr, setImportErr] = useState('');

  // Everything Cadence stores lives under planner-* keys. Snapshot them all rather
  // than listing each by hand, so nothing is missed now or as new keys are added.
  // (fired-reminders is transient dedup state — not worth carrying between devices.)
  function collectData() {
    const data = {};
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith('planner-') && k !== 'planner-fired-reminders' && k !== 'planner-last-export') {
        data[k] = localStorage.getItem(k);
      }
    }
    return data;
  }

  function exportData() {
    const payload = {
      app: 'Cadence Studio',
      format: 1,
      exportedAt: new Date().toISOString(),
      counts: (() => {
        const isTheme = t => t.kind === 'weekly' || t.kind === 'project' || t.kind === 'standing';
        return { sessions: tasks.filter(t => !isTheme(t)).length, themes: tasks.filter(isTheme).length, roles: roles.length };
      })(),
      data: collectData(),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const d = new Date();
    a.href = url;
    a.download = `cadence-${fmtInput(d)}.json`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
    const stamp = new Date().toISOString();
    localStorage.setItem('planner-last-export', stamp);
    setLastExport(stamp);
  }

  // Read a file, validate it, back up the CURRENT state first, then replace.
  function importData(file) {
    setImportErr('');
    const reader = new FileReader();
    reader.onload = () => {
      let payload;
      try { payload = JSON.parse(reader.result); }
      catch { setImportErr('That file isn’t valid Cadence data (couldn’t read it).'); return; }
      if (!payload || payload.app !== 'Cadence Studio' || !payload.data) {
        setImportErr('That doesn’t look like a Cadence export.'); return;
      }
      const c = payload.counts || {};
      const when = payload.exportedAt ? new Date(payload.exportedAt).toLocaleString('en-US', { dateStyle:'medium', timeStyle:'short' }) : 'an unknown time';
      const ok = window.confirm(
        `This backup has ${c.sessions ?? '?'} sessions, ${c.themes ?? '?'} themes, and ${c.roles ?? '?'} roles, saved ${when}.\n\n` +
        `Importing REPLACES everything currently in Cadence on this device. Your current data will be saved to a backup file first, just in case.\n\nReplace everything now?`
      );
      if (!ok) return;

      // Safety net: download the current state before overwriting it.
      try {
        const backup = { app: 'Cadence Studio', format: 1, exportedAt: new Date().toISOString(), note: 'auto-backup before import', data: collectData() };
        const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = `cadence-backup-before-import-${fmtInput(new Date())}.json`;
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } catch {}

      // Replace: clear existing planner-* keys, then write the imported ones.
      const toRemove = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith('planner-') && k !== 'planner-last-export') toRemove.push(k);
      }
      toRemove.forEach(k => localStorage.removeItem(k));
      Object.entries(payload.data).forEach(([k, v]) => localStorage.setItem(k, v));
      // Reload so every piece of state re-reads from the fresh localStorage cleanly.
      window.location.reload();
    };
    reader.onerror = () => setImportErr('Couldn’t read that file.');
    reader.readAsText(file);
  }

  // Nudge: more than a day since the last export (or never), and there's something
  // to lose. Deliberately gentle — a dot on the gear, no modal, no nagging.
  const exportStale = (() => {
    if (!tasks || tasks.length === 0) return false;
    if (!lastExport) return true;
    const ageMs = Date.now() - new Date(lastExport).getTime();
    return ageMs > 24 * 60 * 60 * 1000;
  })();
  const [gridSnap, setGridSnap] = useState(() => parseInt(localStorage.getItem('planner-gridsnap'),10) || 30);
  const [timelineDay, setTimelineDay] = useState(fmtInput(new Date()));
  const [mutedRoles, setMutedRoles] = useState([]);      // role ids hidden
  const [nowClock, setNowClock] = useState(new Date());
  useEffect(() => { const iv = setInterval(() => setNowClock(new Date()), 30000); return () => clearInterval(iv); }, []);
  const [soloRole, setSoloRole] = useState(null);        // role id to focus, or null
  const [armedRole, setArmedRole] = useState(null);      // role id record-armed
  const [conductorMsg, setConductorMsg] = useState(null); // { kind:'clear'|'conflict', text, free? }
  const [hoverTip, setHoverTip] = useState(null); // shown only for overlapping (crammed) sessions
  const calScrollRef = useRef(null);
  const timelineScrollRef = useRef(null);
  const [formData, setFormData] = useState(blankForm('oneness'));

  // ---- Node model (project tier) ----
  // The interior-node display name lives in ONE place. Swap it when the word lands.
  // Placeholder only; not baked into data or logic anywhere.
  // The list item is deliberately plain. An item with a time becomes a Session;
  // without one it stays an item on the list. No special name needed.
  const NODE_LABEL = 'List item';
  const NODE_LABEL_PLURAL = 'List';

  function blankForm(role) {
    return { title: '', role, priority: 'medium', isBackground: false, allDay: false, themeIds: [], done: false, startDate: '', endDate: '', time: '', endTime: '', duration: '', location: '', notes: '', links: '', tags: '', reminderDate: '', reminderTime: '',
      kind: 'weekly', themeWeek: fmtInput(currentWeekStart), themeEnd: '',
      parentId: null, checklist: [], listName: '',
      resourceRefs: [], localResources: [],
      repeatFreq: 'none', repeatInterval: 1, repeatWeekdays: [], repeatMonthlyMode: 'date', repeatEndType: 'never', repeatEndDate: '', repeatEndCount: 10 };
  }

  // LOAD
  const [loaded, setLoaded] = useState(false);
  const undoStack = useRef([]);
  const redoStack = useRef([]);
  const isUndoRedo = useRef(false);
  const lastCommitted = useRef(null);
  useEffect(() => {
    const t = localStorage.getItem('planner-tasks');
    if (t) try {
      const parsed = JSON.parse(t);
      const thisWeek = fmtInput(getMonday(new Date()));
      // STAGE 1 migration: give dateless themes the new week-scoped model.
      // kind: 'standing' | 'weekly' | 'project'. themeWeek = Monday of the week it belongs to.
      // migratedClean marks pre-existing themes so the Unfinished Business tray starts fresh from here.
      const migrated = parsed.map(task => {
        if (task.kind) return task; // already has a theme kind — leave it
        // A session tagged to a parent theme (or nested under one) is NOT a theme,
        // even with no time. Don't stamp it — that was reverting conversions on reload.
        const taggedToTheme = (task.themeIds && task.themeIds.length > 0) || task.themeId != null;
        const isChild = task.parentId != null;
        if (taggedToTheme || isChild) return task;
        // Timed / all-day items are already sessions.
        if (task.time || task.allDay) return task;
        // What remains: a standalone, dateless, untagged item — a legacy theme. Migrate it.
        return { ...task, kind: 'weekly', themeWeek: task.themeWeek || thisWeek, themeEnd: task.themeEnd || '', migratedClean: true };
      });
      setTasks(migrated);
    } catch(e){}
    const inten = localStorage.getItem('planner-intentions');
    if (inten) try { setIntentions(JSON.parse(inten)); } catch(e){}
    const r = localStorage.getItem('planner-roles');
    if (r) try { setRoles(JSON.parse(r)); } catch(e){}
    const f = localStorage.getItem('planner-24h');
    if (f) setUse24h(f === 'true');
    setLoaded(true);
  }, []);
  useEffect(() => { if (loaded) localStorage.setItem('planner-tasks', JSON.stringify(tasks)); }, [tasks, loaded]);

  // UNDO/REDO history capture
  useEffect(() => {
    if (!loaded) return;
    const snapshot = JSON.stringify({ tasks, roles, intentions });
    if (lastCommitted.current === null) { lastCommitted.current = snapshot; return; }
    if (snapshot === lastCommitted.current) return;
    if (isUndoRedo.current) { isUndoRedo.current = false; lastCommitted.current = snapshot; return; }
    undoStack.current.push(lastCommitted.current);
    if (undoStack.current.length > 40) undoStack.current.shift();
    redoStack.current = [];
    lastCommitted.current = snapshot;
  }, [tasks, roles, intentions, loaded]);

  function applySnapshot(snap) {
    const data = JSON.parse(snap);
    isUndoRedo.current = true;
    setTasks(data.tasks || []);
    setRoles(data.roles || DEFAULT_ROLES);
    setIntentions(data.intentions || []);
    lastCommitted.current = snap;
  }
  function doUndo() {
    if (undoStack.current.length === 0) return;
    const current = JSON.stringify({ tasks, roles, intentions });
    redoStack.current.push(current);
    const prev = undoStack.current.pop();
    applySnapshot(prev);
  }
  function doRedo() {
    if (redoStack.current.length === 0) return;
    const current = JSON.stringify({ tasks, roles, intentions });
    undoStack.current.push(current);
    const next = redoStack.current.pop();
    applySnapshot(next);
  }

  useEffect(() => {
    const onKey = (e) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod || (e.key !== 'z' && e.key !== 'y' && e.key !== 'Z')) return;
      // only skip if actively typing in a field
      const el = document.activeElement;
      const tag = (el && el.tagName || '').toLowerCase();
      const typing = tag === 'input' || tag === 'textarea' || (el && el.isContentEditable);
      if (typing) return;
      const key = e.key.toLowerCase();
      if (key === 'z' && !e.shiftKey) { e.preventDefault(); doUndo(); }
      else if ((key === 'z' && e.shiftKey) || key === 'y') { e.preventDefault(); doRedo(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });
  useEffect(() => { if (loaded) localStorage.setItem('planner-intentions', JSON.stringify(intentions)); }, [intentions, loaded]);
  useEffect(() => { if (loaded) localStorage.setItem('planner-roles', JSON.stringify(roles)); }, [roles, loaded]);
  useEffect(() => { if (loaded) localStorage.setItem('planner-24h', String(use24h)); }, [use24h, loaded]);
  useEffect(() => { localStorage.setItem('planner-day-start', String(dayStartHour)); }, [dayStartHour]);

  useEffect(() => {
    const DENSITY = {
      airy:     { row:'94px', fs:'14px',   gap:'11px', pad:'11px', small:'13.5px', micro:'11px'  },
      balanced: { row:'74px', fs:'13px',   gap:'8px',  pad:'9px',  small:'12.5px', micro:'10px'  },
      compact:  { row:'54px', fs:'11.5px', gap:'5px',  pad:'5px',  small:'11.5px', micro:'9px'   },
    };
    const d = DENSITY[density] || DENSITY.balanced;
    const r = document.documentElement.style;
    r.setProperty('--row-h', d.row);
    r.setProperty('--chip-fs', d.fs);
    r.setProperty('--chip-gap', d.gap);
    r.setProperty('--chip-pad', d.pad);
    r.setProperty('--small-fs', d.small);
    r.setProperty('--micro-fs', d.micro);
    localStorage.setItem('planner-density', density);
  }, [density]);

  useEffect(() => { localStorage.setItem('planner-gridsnap', String(gridSnap)); }, [gridSnap]);

  // Auto-resolve: drop intentions once a real session fulfills them that day
  useEffect(() => {
    if (!loaded) return;
    setIntentions(prev => {
      const stillNeeded = prev.filter(intn => {
        const has = tasks.some(t => {
          if (!t.time) return false;
          if (!occursOn(t, intn.date)) return false;
          const ids = t.themeIds || (t.themeId ? [t.themeId] : []);
          return ids.includes(intn.themeId);
        });
        return !has;
      });
      return stillNeeded.length === prev.length ? prev : stillNeeded;
    });
  }, [tasks, loaded]);

  // Scroll the calendar to the preferred day-start hour
  useEffect(() => {
    if (viewMode === 'score' && calScrollRef.current) {
      const rowHeight = 69; // 68px + 1px gap
      // delay one frame so the element is laid out after the view switch
      requestAnimationFrame(() => {
        if (calScrollRef.current) calScrollRef.current.scrollTop = dayStartHour * rowHeight;
      });
    }
  }, [dayStartHour, loaded, viewMode]);

  // Scroll the Timeline horizontally to the work-hours start
  useEffect(() => {
    if (viewMode === 'timeline' && timelineScrollRef.current) {
      const hourW = parseInt(timelineScrollRef.current.getAttribute('data-hourw'),10) || 130;
      // label column is 100px; align so dayStartHour sits just after the labels
      timelineScrollRef.current.scrollLeft = dayStartHour * hourW;
    }
  }, [viewMode, timelineDay, dayStartHour]);

  // REMINDER ENGINE: checks every 30s for due reminders (handles repeats)
  useEffect(() => {
    const fired = new Set(JSON.parse(localStorage.getItem('planner-fired-reminders') || '[]'));
    const fire = (t, key, whenLabel) => {
      fired.add(key);
      localStorage.setItem('planner-fired-reminders', JSON.stringify([...fired]));
      setPopupReminder(t);
      if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        try {
          new Notification('Reminder: ' + t.title, {
            body: (t.notes || '') + (whenLabel ? `\n${whenLabel}` : ''),
            tag: 'planner-' + key
          });
        } catch (err) {}
      }
    };
    const check = () => {
      const now = new Date();
      const todayStr = fmtInput(now);
      tasks.forEach(t => {
        if (!t.reminder) return;
        if (t.done) return; // completed sessions don't nag
        const remindTime = (t.reminder.split('T')[1] || '').slice(0,5); // "HH:MM"

        if (t.repeat && t.repeat.freq !== 'none' && remindTime) {
          // repeating: fire at remindTime on each occurrence day
          if (!occursOn(t, todayStr)) return;
          const key = t.id + '@' + todayStr; // dedup per occurrence date
          if (fired.has(key)) return;
          const [h,m] = remindTime.split(':').map(Number);
          const remindAt = new Date(now); remindAt.setHours(h, m, 0, 0);
          if (remindAt <= now && (now - remindAt) < 2*60*60*1000) {
            fire(t, key, `Reminder for today (${remindTime})`);
          }
        } else {
          // one-off reminder (original behavior)
          if (fired.has(t.id)) return;
          const remindAt = new Date(t.reminder);
          if (isNaN(remindAt)) return;
          if (remindAt <= now && (now - remindAt) < 24*60*60*1000) {
            fire(t, t.id, t.startDate ? `Due ${t.startDate}` : '');
          }
        }
      });
    };
    const iv = setInterval(check, 30000);
    check();
    return () => clearInterval(iv);
  }, [tasks]);

  function requestNotifications() {
    if (typeof Notification === 'undefined') { alert('This browser does not support notifications.'); return; }
    Notification.requestPermission().then(p => setNotifPermission(p));
  }

  function updateRole(id, patch) {
    setRoles(roles.map(r => r.id === id ? { ...r, ...patch } : r));
  }

  // ---- Role resource interview ----
  // Each question yields one resource entry. Tailored sets for known roles, a general fallback,
  // and description-based matching so a thin role's interview doubles as getting-to-know-you.
  const INTERVIEW_SETS = {
    oneness: { label: 'personal · mind, body, spirit', questions: [
      { key: 'training', prompt: 'Where do you train or work out? (gym, studio, app, coach)' },
      { key: 'nutrition', prompt: 'Any nutrition, meal, or food resource you rely on?' },
      { key: 'reading', prompt: 'What are you reading or where do you track books?' },
      { key: 'practice', prompt: 'A meditation, journaling, or spiritual practice tool?' },
      { key: 'care', prompt: 'A doctor, therapist, or practitioner worth keeping handy?' },
    ]},
    omowale: { label: 'family & home', questions: [
      { key: 'kids', prompt: "Your kids' schools or activities? (name each as its own resource)" },
      { key: 'medical', prompt: 'Family medical contacts (pediatrician, dentist)?' },
      { key: 'family-docs', prompt: 'A family calendar, shared drive, or docs link?' },
      { key: 'contractor', prompt: 'Contractors or home-service vendors for current projects?' },
      { key: 'house', prompt: 'Anyone else you call for the house? (plumber, electrician, landlord)' },
    ]},
    'nadir-llc': { label: 'music business & consultancy', questions: [
      { key: 'distribution', prompt: 'Who handles your music distribution or aggregation?' },
      { key: 'pro', prompt: 'Your PRO and any publishing admin? (ASCAP, BMI, etc.)' },
      { key: 'licensing', prompt: 'Sync and mechanical licensing contact or service?' },
      { key: 'press', prompt: 'Press, PR, or playlist contacts?' },
      { key: 'mastering', prompt: 'Mastering or production resource?' },
      { key: 'consult-tools', prompt: 'Consultancy tools you use? (Cadence Studio counts)' },
      { key: 'money', prompt: 'Accountant, lawyer, or business bank?' },
    ]},
    'icon-marketing': { label: 'iCON · international ops & marketing', questions: [
      { key: 'distributors', prompt: 'Key distributor or dealer contacts for the account?' },
      { key: 'ad-platforms', prompt: 'Ad and analytics platforms you run?' },
      { key: 'design', prompt: 'Design, asset, or brand-file resources?' },
      { key: 'docs-systems', prompt: 'Documentation or support systems? (Zendesk, docs sites)' },
      { key: 'localization', prompt: 'Translation or localization vendors?' },
    ]},
    general: { label: 'general', questions: [
      { key: 'about', prompt: 'In a sentence, what is this role about?', target: 'description' },
      { key: 'tools', prompt: 'What tools or apps do you use most for it?' },
      { key: 'people', prompt: 'Key people or contacts for this role?' },
      { key: 'links', prompt: 'Any sites, docs, or accounts you open often?' },
    ]},
  };
  function interviewSetForRole(role) {
    if (INTERVIEW_SETS[role.id]) return INTERVIEW_SETS[role.id];
    const desc = (role.description || role.label || '').toLowerCase();
    if (/family|home|kid|wife|house/.test(desc)) return INTERVIEW_SETS.omowale;
    if (/music|artist|label|consult|business/.test(desc)) return INTERVIEW_SETS['nadir-llc'];
    if (/market|ops|distributor|icon/.test(desc)) return INTERVIEW_SETS['icon-marketing'];
    if (/mind|body|spirit|personal|health|fitness/.test(desc)) return INTERVIEW_SETS.oneness;
    return INTERVIEW_SETS.general;
  }

  function startInterview(role) { setInterviewRole(role); setInterviewStep(0); setInterviewAnswer(''); setInterviewAnswers({}); }
  // Write all collected answers at once: description-targeted questions feed the role's
  // Description; the rest become resources. Called only when the interview finishes.
  function commitInterview(answers) {
    const role = interviewRole;
    if (!role) return;
    const set = interviewSetForRole(role);
    const descPieces = [];
    const resourceEntries = [];
    set.questions.forEach((q, i) => {
      const ans = (answers[i] || '').trim();
      if (!ans) return;
      if (q.target === 'description') { descPieces.push(ans); return; }
      const isLink = /^(https?:\/\/|www\.)/i.test(ans);
      if (isLink) resourceEntries.push({ link: ans, description: q.prompt.replace(/\?$/,'') });
      else ans.split(',').map(s => s.trim()).filter(Boolean).forEach(name => resourceEntries.push({ name }));
    });
    if (descPieces.length) {
      const existing = (role.description || '').trim();
      updateRole(role.id, { description: [existing, ...descPieces].filter(Boolean).join('\n') });
    }
    if (resourceEntries.length) addRoleResources(role.id, resourceEntries);
  }
  function endInterview(commit, answers) {
    if (commit) commitInterview(answers);
    setInterviewRole(null); setInterviewStep(0); setInterviewAnswer(''); setInterviewAnswers({});
  }
  function interviewNext() {
    const set = interviewSetForRole(interviewRole);
    const answers = { ...interviewAnswers, [interviewStep]: interviewAnswer };
    setInterviewAnswers(answers);
    if (interviewStep + 1 >= set.questions.length) { endInterview(true, answers); }
    else { setInterviewStep(interviewStep + 1); setInterviewAnswer(answers[interviewStep + 1] || ''); }
  }
  function interviewSkip() {
    const set = interviewSetForRole(interviewRole);
    const answers = { ...interviewAnswers, [interviewStep]: '' };
    setInterviewAnswers(answers);
    if (interviewStep + 1 >= set.questions.length) { endInterview(true, answers); }
    else { setInterviewStep(interviewStep + 1); setInterviewAnswer(answers[interviewStep + 1] || ''); }
  }
  function interviewBack() {
    if (interviewStep === 0) return;
    const answers = { ...interviewAnswers, [interviewStep]: interviewAnswer };
    setInterviewAnswers(answers);
    setInterviewStep(interviewStep - 1);
    setInterviewAnswer(answers[interviewStep - 1] || '');
  }

  // ---- Role resource library helpers ----
  // Entry shape: { id, name, link, phone, email, description, notes }
  function roleResourceList(role) {
    if (Array.isArray(role.resourceList)) return role.resourceList;
    // migrate an old pasted-links string into rows the first time we read it
    const lines = (role.resources || '').split('\n').map(l => l.trim()).filter(Boolean);
    return lines.map((l, i) => {
      const isLink = /^(https?:\/\/|www\.)/i.test(l);
      return { id: Date.now() + i, name: isLink ? '' : l, link: isLink ? l : '', phone: '', email: '', description: '', notes: '' };
    });
  }
  function addRoleResource(roleId, entry) {
    addRoleResources(roleId, [entry]);
  }
  // Batched insert: adds several entries in ONE functional update so none are lost to stale state.
  function addRoleResources(roleId, entries) {
    setRoles(prev => prev.map(r => {
      if (r.id !== roleId) return r;
      const list = roleResourceList(r);
      const base = Date.now();
      const added = entries.map((e, i) => ({ id: base + i, name: '', link: '', phone: '', email: '', description: '', notes: '', ...e }));
      return { ...r, resourceList: [...list, ...added] };
    }));
  }
  function updateRoleResource(roleId, entryId, patch) {
    setRoles(roles.map(r => {
      if (r.id !== roleId) return r;
      const list = roleResourceList(r).map(e => e.id === entryId ? { ...e, ...patch } : e);
      return { ...r, resourceList: list };
    }));
  }
  function removeRoleResource(roleId, entryId) {
    setRoles(roles.map(r => {
      if (r.id !== roleId) return r;
      return { ...r, resourceList: roleResourceList(r).filter(e => e.id !== entryId) };
    }));
  }
  // Reorder a role's resources by moving one entry to another entry's position.
  function reorderRoleResource(roleId, dragId, dropId) {
    if (dragId === dropId) return;
    setRoles(prev => prev.map(r => {
      if (r.id !== roleId) return r;
      const list = roleResourceList(r).slice();
      const from = list.findIndex(e => e.id === dragId);
      const to = list.findIndex(e => e.id === dropId);
      if (from < 0 || to < 0) return r;
      const [moved] = list.splice(from, 1);
      list.splice(to, 0, moved);
      return { ...r, resourceList: list };
    }));
  }
  // Search every role's library. Returns {roleId, roleLabel, entry} matches.
  function searchResourceLibrary(q) {
    const query = q.trim().toLowerCase();
    if (!query) return [];
    const out = [];
    roles.forEach(r => roleResourceList(r).forEach(e => {
      const hay = `${e.name} ${e.description} ${e.link} ${e.email} ${e.phone} ${e.notes}`.toLowerCase();
      if (hay.includes(query)) out.push({ roleId: r.id, roleLabel: r.label, entry: e });
    }));
    return out.slice(0, 8);
  }
  // Resolve a saved reference to its live entry, or a tombstone if the source is gone.
  function resolveResourceRef(ref) {
    const r = roles.find(x => x.id === ref.roleId);
    const entry = r ? roleResourceList(r).find(e => e.id === ref.entryId) : null;
    if (entry) return { ...entry, _roleLabel: r.label, _live: true };
    return { id: ref.entryId, name: ref.name || 'Removed resource', _live: false };
  }

  // A Theme is an untimed task (lives in the band). Sessions are timed tasks.
  function getThemes() {
    // A theme has no clock time AND is a theme kind (weekly/project/standing).
    // Unscheduled sessions also lack a time but carry no kind and are tagged to a
    // parent theme, so exclude those — otherwise a converted session reappears here.
    return tasks.filter(t => {
      if (t.time || t.allDay) return false;
      if (t.parentId != null) return false; // list-items and reparented work aren't themes
      const isThemeKind = t.kind === 'weekly' || t.kind === 'project' || t.kind === 'standing';
      const hasParentTheme = (t.themeIds && t.themeIds.length > 0) || t.themeId != null;
      if (!isThemeKind && hasParentTheme) return false; // an unscheduled session, not a theme
      return true;
    });
  }
  // Collect the ids of every untimed item in a node's subtree (the tree of list items).
  function subtreeItemIds(rootId) {
    const acc = new Set([rootId]);
    const walk = (id) => {
      tasks.forEach(t => {
        if (t.parentId === id && !t.time && !t.allDay && !acc.has(t.id)) { acc.add(t.id); walk(t.id); }
      });
    };
    walk(rootId);
    return acc;
  }

  // ROLLUP: a session belongs to a theme if it's tagged to it directly (themeIds)
  // or if it hangs anywhere in the theme's item tree (parentId chain).
  // Unscheduled sessions belonging to a theme — folded-back work waiting to be
  // assigned a time. Mirrors sessionsForTheme but for items WITHOUT a time/all-day.
  function unscheduledForTheme(themeId) {
    const treeIds = subtreeItemIds(themeId);
    const theme = tasks.find(t => t.id === themeId);
    const themeTitle = (theme?.title || '').trim().toLowerCase();
    return tasks.filter(t => {
      if (t.time || t.allDay) return false;      // only unscheduled
      if (t.id === themeId) return false;         // not the theme itself
      if ((t.kind === 'weekly' || t.kind === 'project' || t.kind === 'standing')) return false; // not a theme
      const ids = t.themeIds || (t.themeId ? [t.themeId] : []);
      if (ids.includes(themeId)) return true;
      if (t.parentId != null && treeIds.has(t.parentId)) return true;
      return false;
    });
  }

  function sessionsForTheme(themeId) {
    const treeIds = subtreeItemIds(themeId);
    const theme = tasks.find(t => t.id === themeId);
    const themeTitle = (theme?.title || '').trim().toLowerCase();
    return tasks.filter(t => {
      if (!t.time && !t.allDay) return false;
      const ids = t.themeIds || (t.themeId ? [t.themeId] : []);
      if (ids.includes(themeId)) return true;
      if (t.parentId != null && treeIds.has(t.parentId)) return true;
      // Fallback: an untagged session that shares the theme's exact title belongs to it.
      // This catches sessions booked directly on the calendar rather than through the theme.
      if (themeTitle && (t.title || '').trim().toLowerCase() === themeTitle) return true;
      return false;
    });
  }

  // For a given date, return themes present that day with their state.
  // state: 'committed' (a session that day), 'background' (only background session that day), 'intended' (placed, no session)
  function themesForDay(dateStr) {
    const map = {}; // themeId -> { theme, hasSession, allBackground }
    tasks.forEach(t => {
      if (!t.time) return;
      if (!occursOn(t, dateStr)) return;
      const ids = t.themeIds || (t.themeId ? [t.themeId] : []);
      ids.forEach(id => {
        if (!map[id]) map[id] = { hasSession: false, anyForeground: false };
        map[id].hasSession = true;
        if (!t.isBackground) map[id].anyForeground = true;
      });
    });
    // intentions placed on this day
    intentions.forEach(intn => {
      if (intn.date !== dateStr) return;
      if (!map[intn.themeId]) map[intn.themeId] = { hasSession: false, anyForeground: false };
    });
    return Object.keys(map).map(id => {
      const theme = tasks.find(t => t.id === Number(id) || t.id === id);
      const info = map[id];
      let state;
      if (!info.hasSession) state = 'intended';
      else if (!info.anyForeground) state = 'background';
      else state = 'committed';
      return theme && !theme.done ? { theme, state } : null;
    }).filter(Boolean);
  }

  function minToHHMM(m) { const h=Math.floor(m/60)%24; const mm=m%60; return `${String(h).padStart(2,'0')}:${String(mm).padStart(2,'0')}`; }

  function nearestFreeSlot(roleId, dateStr, durationMin, excludeId) {
    const winStart = dayStartHour*60;
    const winEnd = 16*60; // 4pm working window (spec §8)
    const busy = tasks.filter(t => t.time && !t.isBackground && !t.allDay && occursOn(t, dateStr) && t.id !== excludeId)
      .map(t => { const ts=toMinutes(t.time); const te=t.endTime?toMinutes(t.endTime):(t.duration?ts+parseInt(t.duration,10):ts+60); return [ts,te]; })
      .sort((a,b)=>a[0]-b[0]);
    for (let s = winStart; s + durationMin <= winEnd; s += gridSnap) {
      const e = s + durationMin;
      const clash = busy.some(([bs,be]) => s < be && bs < e);
      if (!clash) return minToHHMM(s);
    }
    return null;
  }

  // Conductor: check a proposed session against ALL sessions that day (background excluded)
  function conductorCheck(roleId, dateStr, startMin, durationMin, excludeId) {
    let end = startMin + durationMin;
    if (end <= startMin) end = 24 * 60; // guard: malformed/wrapped end → treat as rest of day
    const hits = [];
    // Timed foreground sessions that overlap the slot
    tasks.filter(t => t.time && !t.isBackground && !t.allDay && occursOn(t, dateStr) && t.id !== excludeId).forEach(t => {
      const ts = toMinutes(t.time);
      let te = t.endTime ? toMinutes(t.endTime) : (t.duration ? ts+parseInt(t.duration,10) : ts+60);
      if (te <= ts) te = 24 * 60; // guard: other session's end wraps/malformed → rest of day
      if (startMin < te && ts < end) {
        const ds = new Date(t.startDate+'T00:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric'});
        const de = t.endDate && t.endDate !== t.startDate ? '\u2013'+new Date(t.endDate+'T00:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric'}) : '';
        hits.push({ t, label: `"${t.title}" (${ds}${de} \u00b7 ${fmtTime(t.time,use24h)}\u2013${fmtTime(minToHHMM(te),use24h)})` });
      }
    });
    // All-day foreground events claim the whole day
    tasks.filter(t => t.allDay && !t.isBackground && occursOn(t, dateStr) && t.id !== excludeId).forEach(t => {
      const ds = new Date(t.startDate+'T00:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric'});
      const de = t.endDate && t.endDate !== t.startDate ? '\u2013'+new Date(t.endDate+'T00:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric'}) : '';
      hits.push({ t, label: `"${t.title}" (${ds}${de} \u00b7 all day)` });
    });
    if (hits.length > 0) {
      const first = hits[0].t;
      const crossRole = hits.some(h => h.t.role !== roleId);
      const free = nearestFreeSlot(roleId, dateStr, durationMin, excludeId);
      return { kind: 'conflict', crossRole, conflictTitle: first.title, conflictTime: hits[0].label,
        text: `Conflicts with ${hits.map(h => h.label).join(', ')}${crossRole ? ' \u00b7 includes a different role' : ''}. Schedule anyway?`, free };
    }
    return { kind: 'clear', text: 'Conductor \u00b7 this slot is clear' };
  }

  // Day coverage: % of the working window (dayStart–4pm) booked by foreground sessions
  function dayCoverage(dateStr) {
    const winStart = dayStartHour * 60;
    const winEnd = 16 * 60; // 4pm working window (spec §8)
    const span = Math.max(1, winEnd - winStart);
    const ivs = tasks.filter(t => t.time && !t.isBackground && !t.allDay && occursOn(t, dateStr))
      .map(t => { const s=toMinutes(t.time); const e=t.endTime?toMinutes(t.endTime):(t.duration?s+parseInt(t.duration,10):s+60); return [Math.max(s,winStart), Math.min(e,winEnd)]; })
      .filter(([s,e]) => e > s)
      .sort((a,b)=>a[0]-b[0]);
    // merge overlaps so double-booking doesn't exceed 100%
    let booked = 0, curS = null, curE = null;
    ivs.forEach(([s,e]) => {
      if (curE === null) { curS=s; curE=e; }
      else if (s <= curE) { curE = Math.max(curE, e); }
      else { booked += curE-curS; curS=s; curE=e; }
    });
    if (curE !== null) booked += curE-curS;
    return Math.round((booked / span) * 100);
  }

  // Suggest the most open working day this week for a theme (lightest coverage, soonest).
  // Local heuristic so it always works without an API key; framed as a Cadence nudge.
  // Location suggestions, scoped to the current session's series (same title).
  // A series is sessions sharing a title: the haircut, the CPARB meeting, Documentation Weekly.
  // Empty field → only this series' past locations. After 3+ typed chars, fall back to
  // broader history so a genuinely reused place can still surface when clearly intended.
  function locationSuggestions(query, seriesTitle) {
    const q = (query || '').trim().toLowerCase();
    const title = (seriesTitle || '').trim().toLowerCase();
    const seriesCounts = {}, globalCounts = {};
    tasks.forEach(t => {
      const loc = (t.location || '').trim();
      if (!loc) return;
      globalCounts[loc] = (globalCounts[loc] || 0) + 1;
      if (title && (t.title || '').trim().toLowerCase() === title) seriesCounts[loc] = (seriesCounts[loc] || 0) + 1;
    });
    const rank = counts => Object.keys(counts)
      .filter(loc => !q || (loc.toLowerCase().includes(q) && loc.toLowerCase() !== q))
      .sort((a, b) => counts[b] - counts[a] || a.localeCompare(b));
    const series = rank(seriesCounts);
    // Only widen to global history once the user has typed enough to mean it.
    if (q.length >= 3) {
      const extra = rank(globalCounts).filter(loc => !series.includes(loc));
      return [...series, ...extra].slice(0, 6);
    }
    return series.slice(0, 6);
  }

  function suggestIntentDay() {
    const week = viewedWeekDates();
    const todayStr = fmtInput(new Date());
    const candidates = week
      .filter(d => d >= todayStr)
      .map(d => ({ date: d, load: dayCoverage(d) }))
      .sort((a, b) => a.load - b.load || a.date.localeCompare(b.date));
    return candidates.length ? candidates[0] : null;
  }

  function addIntention(themeId, dateStr) {
    setIntentions(prev => {
      if (prev.some(i => i.themeId === themeId && i.date === dateStr)) return prev;
      return [...prev, { themeId, date: dateStr }];
    });
    // Intending a day IS a decision: move a weekly theme to that day's week so it
    // stops showing as slipped. (Standing/project themes keep their own dates.)
    const wk = fmtInput(getMonday(new Date(dateStr + 'T00:00:00')));
    setTasks(prev => prev.map(t => {
      if (t.id !== themeId) return t;
      if ((t.kind || 'weekly') !== 'weekly') return t;
      return { ...t, themeWeek: wk, startDate: wk };
    }));
  }
  function removeIntention(themeId, dateStr) {
    setIntentions(prev => prev.filter(i => !(i.themeId === themeId && i.date === dateStr)));
  }

  function buildWeekContext() {
    const weekDates = [0,1,2,3,4,5,6].map(i => { const d=new Date(currentWeekStart); d.setDate(d.getDate()+i); return fmtInput(d); });
    const ws = weekDates[0], we = weekDates[6];
    const inWeek = tasks.filter(t => {
      if (!t.startDate) return false;
      const e = t.endDate || t.startDate;
      return e >= ws && t.startDate <= we;
    });
    if (inWeek.length === 0) return `Week of ${ws} to ${we}. No tasks scheduled yet.`;
    const lines = inWeek.map(t => {
      const roleLabel = (roles.find(r => r.id === t.role) || {}).label || t.role;
      const when = t.time ? `${t.startDate} ${t.time}` : `${t.startDate}${t.endDate && t.endDate!==t.startDate ? ' to '+t.endDate : ''} (priority)`;
      return `- [${roleLabel}] ${t.title} — ${t.priority} — ${when}`;
    });
    return `Week of ${ws} to ${we}. Today is ${fmtInput(new Date())}.\nCurrent items:\n${lines.join('\n')}`;
  }

  function addTasksFromAI(drafts) {
    const valid = roles.map(r => r.id);
    const newOnes = drafts.map(d => ({
      id: Date.now() + Math.floor(Math.random()*10000),
      title: d.title || 'Untitled',
      role: valid.includes(d.role) ? d.role : (selectedRole === 'all' ? roles[0].id : selectedRole),
      priority: ['low','medium','high'].includes(d.priority) ? d.priority : 'medium',
      startDate: d.startDate || fmtInput(currentWeekStart),
      endDate: d.endDate || d.startDate || fmtInput(currentWeekStart),
      time: d.time || '',
      endTime: d.endTime || '',
      duration: '',
      notes: d.notes || '',
      links: '',
      tags: [],
      reminder: ''
    }));
    setTasks(prev => [...prev, ...newOnes]);
  }

  const roleColor = (id) => (roles.find(r => r.id === id) || {}).color || '#999';
  const roleLabel = (id) => (roles.find(r => r.id === id) || {}).label || id;
  const isRoleSelected = (role) => selectedRole === 'all' || selectedRole === role;
  const fmtRange = (start) => { const e = new Date(start); e.setDate(e.getDate()+6); return `${start.toLocaleDateString('en-US',{month:'short',day:'numeric'})} - ${e.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})}`; };

  function openModal(withTime) {
    setEditingId(null);
    // withTime === true → a Session draft. false → a Theme draft. Both open with a
    // blank date field — the only real difference is a theme contains other sessions.
    const isSession = withTime !== false;
    setFormData({ ...blankForm(selectedRole === 'all' ? roles[0].id : selectedRole),
      startDate: '', endDate: '', time: '', endTime: '', duration: '',
      draftKind: isSession ? 'session' : 'theme',
      kind: isSession ? undefined : 'weekly',
      themeWeek: '' });
    setShowModal(true);
  }

  function openModalAt(dateStr, hour, minutes) {
    setEditingId(null);
    let time = '';
    if (minutes !== null && minutes !== undefined) {
      const h = Math.floor(minutes / 60), m = minutes % 60;
      time = `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
    } else if (hour !== null && hour !== undefined) {
      time = `${String(hour).padStart(2,'0')}:00`;
    }
    setFormData({ ...blankForm(selectedRole === 'all' ? roles[0].id : selectedRole), startDate: dateStr, time });
    setShowModal(true);
  }

  const dragGrabOffsetY = useRef(0);

  function handleDragStart(e, task, occDate) {
    e.stopPropagation();
    e.dataTransfer.setData('text/plain', String(task.id));
    e.dataTransfer.effectAllowed = 'move';
    setDraggingOccDate(occDate || null);
    // How far below the block's top edge the user grabbed. On drop we subtract this
    // so the block's TOP lands where aimed, not the cursor (which sits mid-block and
    // was pushing every drop ~a half-hour late).
    try {
      const r = e.currentTarget.getBoundingClientRect();
      dragGrabOffsetY.current = e.clientY - r.top;
    } catch { dragGrabOffsetY.current = 0; }
  }

  function addDays(dateStr, n) {
    const [y,m,d] = dateStr.split('-').map(Number);
    const dt = new Date(y, m-1, d); // local time, no UTC shift
    dt.setDate(dt.getDate() + n);
    return fmtInput(dt);
  }

  function daysBetween(a, b) {
    const [y1,m1,d1] = a.split('-').map(Number);
    const [y2,m2,d2] = b.split('-').map(Number);
    return Math.round((new Date(y2,m2-1,d2) - new Date(y1,m1-1,d1)) / 86400000);
  }

  function handleDrop(e, dateStr, hour, snappedMin) {
    e.preventDefault();
    const raw = e.dataTransfer.getData('text/plain');
    const id = Number(raw);
    if (!id) return;
    const moving = tasks.find(t => Number(t.id) === id);
    if (!moving) return;

    // Which minute of the day does the drop land on? Prefer the snapped cursor
    // position; fall back to the top of the hour if none was passed.
    const startMin = (snappedMin !== null && snappedMin !== undefined)
      ? snappedMin
      : (hour !== null && hour !== undefined ? hour * 60 : null);

    let newTime = moving.time, newEnd = moving.endTime;
    if (startMin !== null) {
      newTime = minToHHMM(startMin);
      const oldStart = moving.time ? toMinutes(moving.time) : null;
      if (oldStart !== null && moving.endTime) newEnd = minToHHMM(Math.min(24*60, startMin + (toMinutes(moving.endTime) - oldStart)));
      else if (moving.duration) newEnd = minToHHMM(Math.min(24*60, startMin + parseInt(moving.duration,10)));
    } else {
      newTime = ''; newEnd = '';
    }

    if (newTime && !moving.isBackground && !moving.allDay) {
      const durMin = newEnd ? (toMinutes(newEnd) - toMinutes(newTime)) : (moving.duration ? parseInt(moving.duration,10) : 60);
      const check = conductorCheck(moving.role, dateStr, toMinutes(newTime), durMin, moving.id);
      if (check.kind === 'conflict') {
        const ok = window.confirm(`Conductor: this lands on "${check.conflictTitle}" (${check.conflictTime})${check.crossRole ? ', a different role' : ''}.\n\nDrop it here anyway?`);
        if (!ok) return;
      }
    }

    const isRecurring = moving.repeat && moving.repeat.freq && moving.repeat.freq !== 'none';
    if (isRecurring) {
      // Don't assume. Route through the same scope modal the editor uses so the user
      // chooses "just this one" or "the whole series". data carries the new date/time.
      const draggedDate = draggingOccDate || moving.startDate;
      const data = { ...moving, startDate: dateStr, endDate: dateStr, time: newTime, endTime: newTime ? newEnd : moving.endTime };
      setPendingSave({ data, original: moving, occ: draggedDate, kind: 'series', fromDrag: true, dropDate: dateStr });
      setDraggingOccDate(null);
      return;
    }

    const spanDays = daysBetween(moving.startDate, moving.endDate || moving.startDate);
    const movedToNewDate = dateStr !== moving.startDate;
    setTasks(prev => prev.map(t => {
      if (Number(t.id) !== id) return t;
      const updated = { ...t, startDate: dateStr, endDate: addDays(dateStr, spanDays), time: newTime };
      if (newTime) { if (newEnd) updated.endTime = newEnd; } else { updated.endTime = ''; }
      // Moving a session to a different day means it's being rescheduled, not completed —
      // clear any stale done flag so it doesn't render faded on its new date.
      if (movedToNewDate && t.done) updated.done = false;
      return updated;
    }));
  }

  function openSessionView(task, occurrenceDate) {
    setViewingSession({ task, date: occurrenceDate || task.startDate });
  }

  // Hover panel listing a theme's session titles. Uses a short close delay so the
  // pointer can travel from the count into the panel without it vanishing.
  function openSessionPanel(themeId, rect) {
    if (sessionPanelTimer.current) { clearTimeout(sessionPanelTimer.current); sessionPanelTimer.current = null; }
    setSessionPanel({ themeId, rect: { left: rect.left, top: rect.top, bottom: rect.bottom } });
  }
  function scheduleClosePanel() {
    if (sessionPanelTimer.current) clearTimeout(sessionPanelTimer.current);
    sessionPanelTimer.current = setTimeout(() => setSessionPanel(null), 220);
  }
  function keepPanelOpen() {
    if (sessionPanelTimer.current) { clearTimeout(sessionPanelTimer.current); sessionPanelTimer.current = null; }
  }

  function openEdit(task, occurrenceDate) {
    setEditingId(task.id);
    setEditingOccurrenceDate(occurrenceDate || null);
    const rep = task.repeat || {};
    setFormData({
      title: task.title, role: task.role, priority: task.priority, isBackground: !!task.isBackground,
      themeIds: task.themeIds || (task.themeId ? [task.themeId] : []), done: !!task.done, allDay: !!task.allDay,
      startDate: occurrenceDate && rep.freq && rep.freq !== 'none' ? occurrenceDate : task.startDate,
      endDate: task.endDate || '', time: task.time || '',
      endTime: task.endTime || '', duration: task.duration || '', location: task.location || '',
      notes: task.notes || '', links: Array.isArray(task.links) ? task.links.join('\n') : (task.links || ''), tags: (task.tags || []).join(', '),
      reminderDate: task.reminder ? task.reminder.split('T')[0] : '',
      reminderTime: task.reminder ? (task.reminder.split('T')[1] || '').slice(0,5) : '',
      kind: task.kind || 'weekly', themeWeek: task.themeWeek || fmtInput(currentWeekStart), themeEnd: task.themeEnd || '',
      parentId: task.parentId ?? null, checklist: task.checklist || [], listName: task.listName || '',
      resourceRefs: task.resourceRefs || [], localResources: task.localResources || [], links: Array.isArray(task.links) ? task.links.join('\n') : (task.links || ''),
      repeatFreq: rep.freq || 'none',
      repeatMonthlyMode: rep.monthlyMode || 'date',
      repeatInterval: rep.interval || 1,
      repeatWeekdays: rep.weekdays || [],
      repeatEndType: rep.endType || 'never',
      repeatEndDate: rep.endDate || '',
      repeatEndCount: rep.endCount || 10
    });
    setShowModal(true);
  }

  function findConflicts(data) {
    if (!data.time) return [];
    const start = toMinutes(data.time);
    let end;
    if (data.endTime) end = toMinutes(data.endTime);
    else if (data.duration) end = start + parseInt(data.duration, 10);
    else end = start + 60;
    if (end <= start) end = 24 * 60; // guard: malformed/wrapped end → treat as rest of day
    return tasks.filter(t => {
      if (t.id === data.id) return false;
      if (t.isBackground) return false; // backdrop events never flag conflicts
      // Does this task ACTUALLY occur on the same date? occursOn respects recurrence
      // rules and skipDates, so a moved/skipped occurrence no longer phantom-conflicts.
      if (!occursOn(t, data.startDate)) return false;
      // all-day events claim the whole day: always ask before booking over one
      if (t.allDay) return true;
      if (!t.time) return false;
      const os = toMinutes(t.time);
      let oe;
      if (t.endTime) oe = toMinutes(t.endTime);
      else if (t.duration) oe = os + parseInt(t.duration, 10);
      else oe = os + 60;
      if (oe <= os) oe = 24 * 60; // guard: other session's end wraps/malformed → rest of day
      return start < oe && os < end; // overlap
    });
  }

  function buildTaskData() {
    return {
      id: editingId || Date.now(),
      title: formData.title.trim(),
      role: formData.role,
      priority: formData.priority,
      isBackground: !!formData.isBackground,
      themeIds: formData.themeIds || [],
      done: !!formData.done,
      allDay: !!formData.allDay,
      startDate: (() => {
        if (formData.draftKind === 'session') return formData.startDate; // blank allowed
        const taggedToTheme = (formData.themeIds && formData.themeIds.length > 0) || formData.themeId != null;
        if (taggedToTheme || formData.time || formData.allDay) return formData.startDate;
        // A theme needs to live in a week to appear in the rail. If the user left the
        // date blank, quietly place it in the week they're viewing.
        return formData.startDate || formData.themeWeek || fmtInput(currentWeekStart);
      })(),
      endDate: (() => {
        if (formData.draftKind === 'session') return formData.endDate || '';
        const taggedToTheme = (formData.themeIds && formData.themeIds.length > 0) || formData.themeId != null;
        if (taggedToTheme || formData.time || formData.allDay) return formData.endDate || '';
        return formData.themeEnd || formData.themeWeek || formData.startDate || fmtInput(currentWeekStart);
      })(),
      time: formData.allDay ? '' : formData.time,
      endTime: formData.allDay ? '' : (formData.endTime || (formData.time && formData.duration ? minToHHMM(toMinutes(formData.time) + parseInt(formData.duration, 10)) : '')),
      duration: formData.allDay ? '' : ((formData.endTime || (formData.time && formData.duration)) ? '' : formData.duration),
      notes: formData.notes.trim(),
      location: (formData.location || '').trim(),
      tags: formData.tags.split(',').map(t => t.trim()).filter(Boolean),
      reminder: formData.reminderDate ? `${formData.reminderDate}T${formData.reminderTime || '09:00'}` : '',
      repeat: formData.repeatFreq === 'none' ? null : {
        freq: formData.repeatFreq,
        interval: Math.max(1, parseInt(formData.repeatInterval,10) || 1),
        weekdays: formData.repeatFreq === 'weekly' ? formData.repeatWeekdays : [],
        monthlyMode: formData.repeatFreq === 'monthly' ? (formData.repeatMonthlyMode || 'date') : undefined,
        endType: formData.repeatEndType,
        endDate: formData.repeatEndDate,
        endCount: Math.max(1, parseInt(formData.repeatEndCount,10) || 1)
      },
      skipDates: editingId ? (tasks.find(t=>t.id===editingId)?.skipDates || []) : [],
      // Theme kind applies ONLY to genuine themes (containers). A session — even one
      // with no time — that is tagged to a parent theme must NOT get a kind, or it
      // would masquerade as a theme. Everything is a session; some just lack a time.
      kind: (() => {
        // Explicit draft intent wins: a Session draft is never a theme.
        if (formData.draftKind === 'session') return undefined;
        if (formData.draftKind === 'theme') return formData.kind || 'weekly';
        const taggedToTheme = (formData.themeIds && formData.themeIds.length > 0) || formData.themeId != null;
        if (taggedToTheme) return undefined; // a session under a theme, not a theme
        if (formData.kind) return formData.kind;
        if (editingId) return tasks.find(t=>t.id===editingId)?.kind;
        return 'weekly';
      })(),
      themeWeek: (() => {
        // If the user gave the theme a start date, its week follows that date.
        if (formData.draftKind !== 'session' && formData.startDate) {
          return fmtInput(getMonday(new Date(formData.startDate + 'T00:00:00')));
        }
        return formData.themeWeek || (editingId ? (tasks.find(t=>t.id===editingId)?.themeWeek) : fmtInput(currentWeekStart)) || fmtInput(currentWeekStart);
      })(),
      themeEnd: formData.themeEnd || (editingId ? (tasks.find(t=>t.id===editingId)?.themeEnd) : '') || '',
      // node model: parent link + checklist (the "list" tier)
      parentId: formData.parentId !== undefined ? formData.parentId : (editingId ? (tasks.find(t=>t.id===editingId)?.parentId ?? null) : null),
      checklist: formData.checklist || (editingId ? (tasks.find(t=>t.id===editingId)?.checklist || []) : []),
      listName: formData.listName !== undefined ? formData.listName : (editingId ? (tasks.find(t=>t.id===editingId)?.listName || '') : ''),
      resourceRefs: formData.resourceRefs || [],
      localResources: (() => {
        const local = formData.localResources || [];
        // one-time migration: fold any old free-text Resources into a local resource
        const rawLinks = formData.links;
        const oldText = (Array.isArray(rawLinks) ? rawLinks.join('\n') : (rawLinks || '')).trim();
        if (oldText && !(formData.localResources || []).some(r => r._fromLinks)) {
          const isLink = /^(https?:\/\/|www\.)/i.test(oldText);
          return [...local, { id: Date.now(), _fromLinks: true, name: isLink ? '' : oldText.slice(0,40), link: isLink ? oldText : '', phone: '', email: '', description: '', notes: isLink ? '' : oldText }];
        }
        return local;
      })(),
      links: ''
    };
  }

  function saveTask(e) {
    e.preventDefault();
    if (!formData.title.trim()) { alert('Enter a title'); return; }
    // A time needs a date to live on the calendar. If there's a time but no date,
    // ask the user to pick a date (or clear the time to keep it unscheduled).
    if (formData.time && !formData.startDate) {
      alert('This session has a time but no date. Add a start date, or clear the time to keep it unscheduled.');
      return;
    }
    // An all-day session claims a DAY, so it needs a date — without one there's no
    // day to draw it on and it would silently vanish from the calendar.
    if (formData.allDay && !formData.startDate) {
      alert('An all-day session needs a start date. Add one, or uncheck All day to keep it unscheduled.');
      return;
    }
    const data = buildTaskData();

    // conflict check
    const conflicts = data.isBackground ? [] : findConflicts(data);
    if (conflicts.length > 0) {
      const names = conflicts.slice(0,3).map(c => `“${c.title}” (${fmtTime(c.time, use24h)})`).join(', ');
      const more = conflicts.length > 3 ? ` and ${conflicts.length-3} more` : '';
      const ok = window.confirm(`Heads up — this overlaps ${names}${more}.\n\nAdd it anyway?`);
      if (!ok) return;
    }

    const original = editingId ? tasks.find(t => t.id === editingId) : null;
    const isSeries = original && original.repeat && original.repeat.freq !== 'none';
    const isMultiDaySpan = original && !isSeries && original.endDate && original.endDate !== original.startDate;
    const timeChanged = original && (original.time !== data.time || original.endTime !== data.endTime);

    // editing one occurrence of a repeating series → ask scope
    if (isSeries && editingOccurrenceDate) {
      setPendingSave({ data, original, occ: editingOccurrenceDate, kind: 'series' });
      return; // scope modal will finish the save
    }

    // editing the time on a multi-day span → ask whether to move just this day or the whole span
    if (isMultiDaySpan && timeChanged && editingOccurrenceDate) {
      setPendingSave({ data, original, occ: editingOccurrenceDate, kind: 'span' });
      return;
    }

    // normal save (new task, or whole-series edit of a non-occurrence context)
    commitSave(data);
  }

  function commitSave(data) {
    if (editingId) {
      setTasks(tasks.map(t => t.id === editingId ? data : t));
      const fired = new Set(JSON.parse(localStorage.getItem('planner-fired-reminders') || '[]'));
      fired.delete(editingId);
      localStorage.setItem('planner-fired-reminders', JSON.stringify([...fired]));
    } else {
      setTasks([...tasks, data]);
    }
    setShowModal(false);
    setEditingOccurrenceDate(null);
  }

  // Apply an edit at a chosen scope: 'this' | 'following' | 'all'
  function applySaveScope(scope) {
    if (!pendingSave) return;
    const { data, original, occ, kind } = pendingSave;
    const dayBefore = addDays(occ, -1);

    if (kind === 'span') {
      // multi-day span: 'this' splits the single day out; 'all' moves the whole span
      if (scope === 'all') {
        const merged = { ...data, id: original.id, startDate: original.startDate, endDate: original.endDate };
        setTasks(tasks.map(t => t.id === original.id ? merged : t));
      } else if (scope === 'this') {
        // carve occ out of the span, leaving the remaining days, and create a standalone for occ with the edit
        const remaining = [];
        if (occ > original.startDate) remaining.push({ ...original, endDate: dayBefore });
        if (occ < (original.endDate || original.startDate)) remaining.push({ ...original, id: Date.now()+3, startDate: addDays(occ,1) });
        const single = { ...data, id: Date.now()+1, startDate: occ, endDate: occ };
        const others = tasks.filter(t => t.id !== original.id);
        setTasks([...others, ...remaining, single]);
      }
      setPendingSave(null);
      setShowModal(false);
      setEditingOccurrenceDate(null);
      return;
    }

    if (scope === 'all') {
      if (pendingSave.fromDrag) {
        // A drag of the whole series MOVES the rhythm: shift the anchor by the same day
        // offset as the drop, and adopt the dropped time. Skip dates shift with it.
        const offset = daysBetween(occ, pendingSave.dropDate);
        const newStart = addDays(original.startDate, offset);
        const shiftedSkips = (original.skipDates || []).map(d => addDays(d, offset));
        const merged = { ...original, startDate: newStart, time: data.time, endTime: data.endTime,
          endDate: original.endDate ? addDays(original.endDate, offset) : original.endDate, skipDates: shiftedSkips };
        setTasks(tasks.map(t => t.id === original.id ? merged : t));
      } else {
        // Editor edit: keep the series' original startDate, apply all other edits
        const merged = { ...data, id: original.id, startDate: original.startDate, skipDates: original.skipDates || [] };
        setTasks(tasks.map(t => t.id === original.id ? merged : t));
      }
    } else if (scope === 'this') {
      // Skip the ORIGINAL occurrence date on the master; spin off a standalone at the
      // EDITED date/time. occ = the date the user opened; data.startDate = where they moved it.
      const spanDays = daysBetween(data.startDate, data.endDate && data.endDate !== data.startDate ? data.endDate : data.startDate);
      const masterSkipped = { ...original, skipDates: [...(original.skipDates||[]), occ] };
      const single = { ...data, id: Date.now() + 1, repeat: null,
        startDate: data.startDate, endDate: spanDays > 0 ? data.endDate : data.startDate, skipDates: [] };
      setTasks(tasks.map(t => t.id === original.id ? masterSkipped : t).concat([single]));
    } else if (scope === 'following') {
      // cap original series to end the day before this occurrence
      const cappedRepeat = { ...original.repeat, endType: 'date', endDate: dayBefore };
      const capped = { ...original, repeat: cappedRepeat };
      // new series starts at this occurrence with the edits, carrying forward the original end condition.
      // For a drag, the new series anchors at the dropped date; for an edit, at data.startDate.
      const newStart = pendingSave.fromDrag ? pendingSave.dropDate : (data.startDate || occ);
      const newRepeat = { ...(data.repeat || original.repeat), endType: original.repeat.endType, endDate: original.repeat.endDate, endCount: original.repeat.endCount };
      const newSeries = { ...data, id: Date.now() + 2, startDate: newStart, repeat: newRepeat, skipDates: (original.skipDates||[]).filter(d => d >= occ) };
      setTasks(tasks.map(t => t.id === original.id ? capped : t).concat([newSeries]));
    }
    setPendingSave(null);
    setShowModal(false);
    setEditingOccurrenceDate(null);
  }

  function deleteTask(id) { setTasks(tasks.filter(t => t.id !== id)); }

  function requestDelete() {
    const original = editingId ? tasks.find(t => t.id === editingId) : null;
    const isSeries = original && original.repeat && original.repeat.freq !== 'none';
    if (isSeries && editingOccurrenceDate) {
      setPendingDelete({ original, occ: editingOccurrenceDate });
      return;
    }
    deleteTask(editingId);
    setShowModal(false);
    setEditingOccurrenceDate(null);
  }

  function applyDeleteScope(scope) {
    if (!pendingDelete) return;
    const { original, occ } = pendingDelete;
    if (scope === 'all') {
      setTasks(tasks.filter(t => t.id !== original.id));
    } else if (scope === 'this') {
      setTasks(tasks.map(t => t.id === original.id ? { ...t, skipDates: [...(t.skipDates||[]), occ] } : t));
    } else if (scope === 'following') {
      const dayBefore = addDays(occ, -1);
      if (dayBefore < original.startDate) {
        // removing from the very start = delete whole series
        setTasks(tasks.filter(t => t.id !== original.id));
      } else {
        setTasks(tasks.map(t => t.id === original.id ? { ...t, repeat: { ...t.repeat, endType: 'date', endDate: dayBefore } } : t));
      }
    }
    setPendingDelete(null);
    setShowModal(false);
    setEditingOccurrenceDate(null);
  }
  function skipOccurrence(id, dateStr) {
    setTasks(tasks.map(t => {
      if (t.id !== id) return t;
      const skips = t.skipDates ? [...t.skipDates] : [];
      if (!skips.includes(dateStr)) skips.push(dateStr);
      return { ...t, skipDates: skips };
    }));
  }

  // Compute how many hour-rows a timed task spans
  function taskSpanHours(t) {
    if (!t.time) return 1;
    const startH = parseInt(t.time.split(':')[0]);
    if (t.endTime) {
      const endH = parseInt(t.endTime.split(':')[0]);
      const endM = parseInt(t.endTime.split(':')[1] || '0');
      return Math.max(1, (endH + (endM > 0 ? 1 : 0)) - startH);
    }
    if (t.duration) {
      const mins = parseInt(t.duration);
      if (!isNaN(mins)) return Math.max(1, Math.ceil(mins / 60));
    }
    return 1;
  }

  const searchMatch = (t) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return [t.title, t.notes, t.startDate, t.priority, (t.tags||[]).join(' '), (roles.find(r=>r.id===t.role)||{}).label]
      .filter(Boolean).some(f => f.toLowerCase().includes(q));
  };

  const hours = Array.from({ length: 24 }, (_, i) => i);
  const days = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];

  // Priorities = no time
  const PRIORITY_RANK = { high: 0, medium: 1, low: 2 };
  function byPriority(a, b) {
    const pa = PRIORITY_RANK[a.priority] ?? 1;
    const pb = PRIORITY_RANK[b.priority] ?? 1;
    if (pa !== pb) return pa - pb;
    return (a.startDate || '').localeCompare(b.startDate || '');
  }
  const priorityTasks = (() => {
    const isRealTheme = (t) => {
      // A theme is a theme-kind item. An unscheduled session also has no time but
      // carries no kind and is tagged to a parent theme — those belong under their
      // theme, not in the Themes rail.
      const isThemeKind = t.kind === 'weekly' || t.kind === 'project' || t.kind === 'standing';
      const hasParentTheme = (t.themeIds && t.themeIds.length > 0) || t.themeId != null;
      if (!isThemeKind && hasParentTheme) return false;
      return true;
    };
    const list = tasks.filter(t => isRoleSelected(t.role) && t.startDate && !t.time && !t.allDay && !t.done && !t.parentId && isRealTheme(t) && searchMatch(t) && themeInViewedWeek(t)).slice();
    if (themesSort === 'role') {
      const order = roles.map(r => r.id);
      return list.sort((a, b) => (order.indexOf(a.role) - order.indexOf(b.role)) || byPriority(a, b));
    }
    if (themesSort === 'type') {
      const kOrder = ['weekly', 'project', 'standing'];
      return list.sort((a, b) => (kOrder.indexOf(a.kind || 'weekly') - kOrder.indexOf(b.kind || 'weekly')) || byPriority(a, b));
    }
    return list.sort(byPriority);
  })();

  // Task column content
  // Monday..Sunday date strings for the currently viewed Score week
  function viewedWeekDates() {
    return [0,1,2,3,4,5,6].map(i => { const d=new Date(currentWeekStart); d.setDate(d.getDate()+i); return fmtInput(d); });
  }
  // Does a session (timed task) belong to the viewed week? Recurring → any occurrence in the week.
  function sessionInViewedWeek(t) {
    const week = viewedWeekDates();
    const weekStart = week[0], weekEnd = week[6];
    if (t.repeat && t.repeat.freq && t.repeat.freq !== 'none') {
      return week.some(d => occursOn(t, d));
    }
    const start = t.startDate || '';
    if (!start) return false;
    // A timed session lives on its scheduled day. Only treat it as spanning when
    // endDate is explicitly a LATER day than startDate (a true multi-day session).
    const end = (t.endDate && t.endDate > start) ? t.endDate : start;
    return start <= weekEnd && end >= weekStart;
  }

  // Does a theme belong in the viewed week? Depends on its kind.
  //  standing → always (no dates, ever-present)
  //  weekly   → only the week it's stamped to (themeWeek)
  //  project  → any week its [themeWeek .. themeEnd] span touches
  function themeInViewedWeek(t) {
    const kind = t.kind || 'weekly';
    if (kind === 'standing') return true;
    const week = viewedWeekDates();
    const weekStart = week[0], weekEnd = week[6];
    const tWeek = t.themeWeek || fmtInput(getMonday(new Date(t.startDate || weekStart)));
    if (kind === 'project') {
      const spanEnd = t.themeEnd && t.themeEnd > tWeek ? t.themeEnd : weekEnd; // open-ended project shows from its start onward
      return tWeek <= weekEnd && spanEnd >= weekStart;
    }
    // weekly: the theme's week must equal the viewed week (compare by Monday)
    return getMonday(new Date(tWeek + 'T00:00:00')).getTime() === getMonday(new Date(weekStart + 'T00:00:00')).getTime();
  }

  // Weekly themes that slipped: their stamped week is before the viewed week,
  // not done, not a clean-migrated legacy theme. These demand a decision.
  // Is this one theme genuinely overdue (unfinished business)?
  // Shared by the Unfinished Business tray and the theme view's decide bar.
  function isThemeSlipped(t) {
    if (!t) return false;
    if (t.time || t.allDay) return false;
    if ((t.kind || 'weekly') !== 'weekly') return false;
    if (t.done) return false;
    if (t.migratedClean) return false;
    const tw = t.themeWeek || t.startDate;
    if (!tw) return false;
    const viewedMonday = fmtInput(getMonday(new Date(fmtInput(currentWeekStart) + 'T00:00:00')));
    const tMonday = fmtInput(getMonday(new Date(tw + 'T00:00:00')));
    if (tMonday >= viewedMonday) return false;
    // A theme with sessions booked is in motion, not slipped — recurring ones count for
    // any occurrence in the viewed week or later, so an ongoing practice never reads as unfinished.
    const sessions = sessionsForTheme(t.id);
    const weekDates = viewedWeekDates();
    const hasLiveSession = sessions.some(s => {
      if (s.repeat && s.repeat.freq && s.repeat.freq !== 'none') {
        return weekDates.some(d => occursOn(s, d)) || (s.startDate && s.startDate >= viewedMonday);
      }
      return s.startDate && s.startDate >= viewedMonday;
    });
    if (hasLiveSession) return false;
    return true;
  }

  function slippedThemes() {
    return tasks.filter(isThemeSlipped).sort(byPriority);
  }

  // Resolve a slipped theme: close it, push it to the viewed week, or make it a project
  function resolveSlipped(themeId, action) {
    const viewedMonday = fmtInput(getMonday(new Date(fmtInput(currentWeekStart) + 'T00:00:00')));
    setTasks(tasks.map(t => {
      if (t.id !== themeId) return t;
      if (action === 'close') return { ...t, done: true };
      if (action === 'push')  { return { ...t, themeWeek: viewedMonday, startDate: viewedMonday }; }
      if (action === 'project') return { ...t, kind: 'project', themeWeek: t.themeWeek || viewedMonday };
      return t;
    }));
  }

  // Defer a theme to a future week and capture why. The reason is appended to notes with a date.
  function deferTheme(themeId, weeksOut, reason) {
    const base = fmtInput(currentWeekStart);
    const d = new Date(base + 'T00:00:00');
    d.setDate(d.getDate() + weeksOut * 7);
    const targetWeek = fmtInput(getMonday(d));
    const stamp = new Date().toLocaleDateString('en-US',{month:'short',day:'numeric'});
    setTasks(tasks.map(t => {
      if (t.id !== themeId) return t;
      const line = reason ? `[Deferred ${stamp} → week of ${new Date(targetWeek+'T00:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric'})}] ${reason}` : '';
      const notes = line ? (t.notes ? `${t.notes}\n${line}` : line) : t.notes;
      return { ...t, kind: 'weekly', themeWeek: targetWeek, startDate: targetWeek, notes };
    }));
  }

  // ---- Node model helpers ----
  function childNodes(parentId) {
    return tasks.filter(t => t.parentId === parentId && !t.time && !t.allDay).slice().sort(byPriority);
  }
  // All scheduled sessions belonging to a node (its own sessions live as timed tasks with parentId === node.id)
  function nodeSessions(nodeId) {
    return tasks.filter(t => t.parentId === nodeId && (t.time || t.allDay)).slice()
      .sort((a,b) => (a.startDate||'').localeCompare(b.startDate||'') || (a.time||'').localeCompare(b.time||''));
  }
  // Every role worn anywhere in a node's subtree (self + descendant nodes + their sessions)
  function subtreeRoles(nodeId) {
    const acc = new Set();
    const walk = (id) => {
      const self = tasks.find(t => t.id === id);
      if (self) acc.add(self.role);
      tasks.filter(t => t.parentId === id).forEach(ch => { acc.add(ch.role); if (!ch.time && !ch.allDay) walk(ch.id); });
    };
    walk(nodeId);
    return [...acc].filter(Boolean);
  }
  // Count open leaves under a node (nodes with no open children, not done)
  function openLeafCount(nodeId) {
    let n = 0;
    const walk = (id) => {
      const kids = tasks.filter(t => t.parentId === id && !t.time && !t.allDay);
      if (kids.length === 0) { const self = tasks.find(t=>t.id===id); if (self && !self.done) n++; return; }
      kids.forEach(k => walk(k.id));
    };
    tasks.filter(t => t.parentId === nodeId && !t.time && !t.allDay).forEach(k => walk(k.id));
    return n;
  }

  // Add a child node under a parent (theme or node). Inherits parent's role by default.
  // Reparent an item. Guards against dropping an item into itself or its own subtree.
  function reparentItem(itemId, newParentId) {
    if (!itemId || itemId === newParentId) return;
    const sub = subtreeItemIds(itemId);
    if (sub.has(newParentId)) return; // would create a cycle
    setTasks(tasks.map(t => t.id === itemId ? { ...t, parentId: newParentId } : t));
  }

  function renameList(nodeId, name) {
    setTasks(tasks.map(t => t.id === nodeId ? { ...t, listName: name } : t));
  }

  function addChildNode(parentId, title) {
    const parent = tasks.find(t => t.id === parentId);
    if (!title.trim() || !parent) return;
    // Everything is a session; this one just has no time yet. Tag it to the theme
    // (or inherit the parent's theme tags if the parent is itself a session) so it
    // shows in the theme's unscheduled list and can be scheduled later.
    const parentIsTheme = parent.kind === 'weekly' || parent.kind === 'project' || parent.kind === 'standing';
    const themeIds = parentIsTheme ? [parentId] : (parent.themeIds || (parent.themeId ? [parent.themeId] : []));
    const node = {
      ...blankForm(parent.role), id: Date.now(), title: title.trim(),
      parentId: null,
      themeIds,
      time: '', endTime: '', duration: '', allDay: false,
      startDate: fmtInput(currentWeekStart), themeWeek: fmtInput(currentWeekStart),
      kind: undefined,
    };
    setTasks([...tasks, node]);
  }
  // Checklist ops operate on a node's checklist[] array
  function addListItem(nodeId, title) {
    if (!title.trim()) return;
    setTasks(tasks.map(t => t.id === nodeId
      ? { ...t, checklist: [...(t.checklist||[]), { id: Date.now(), title: title.trim(), done: false, date: '', sessionId: null }] }
      : t));
  }
  function toggleListItem(nodeId, itemId) {
    setTasks(tasks.map(t => t.id === nodeId
      ? { ...t, checklist: (t.checklist||[]).map(i => i.id === itemId ? { ...i, done: !i.done } : i) }
      : t));
  }
  function removeListItem(nodeId, itemId) {
    setTasks(tasks.map(t => t.id === nodeId
      ? { ...t, checklist: (t.checklist||[]).filter(i => i.id !== itemId) }
      : t));
  }

  function moveThemeWeek(themeId, deltaWeeks) {
    setTasks(tasks.map(t => {
      if (t.id !== themeId) return t;
      const base = t.themeWeek || fmtInput(getMonday(new Date(t.startDate || fmtInput(currentWeekStart))));
      const d = new Date(base + 'T00:00:00');
      d.setDate(d.getDate() + deltaWeeks * 7);
      const nw = fmtInput(getMonday(d));
      return { ...t, themeWeek: nw, startDate: nw, kind: t.kind || 'weekly' };
    }));
  }

  // Fold a scheduled session back into its theme as unscheduled work — a priority
  // waiting to be assigned. Keeps title, role, priority, location, notes, resources;
  // only the clock date/time are removed. If deltaWeeks is given, it parks in that
  // week's planning (e.g. push to next week); otherwise it stays in its current week.
  function unscheduleSession(sessionId, deltaWeeks) {
    setTasks(prev => prev.map(t => {
      if (t.id !== sessionId) return t;
      const base = t.startDate ? getMonday(new Date(t.startDate + 'T00:00:00')) : currentWeekStart;
      const d = new Date(base); d.setDate(d.getDate() + (deltaWeeks || 0) * 7);
      const wk = fmtInput(getMonday(d));
      return {
        ...t,
        time: '', endTime: '', duration: '', allDay: false,
        startDate: wk, endDate: '',
        themeWeek: wk,
        done: false,
        // if it was a recurring occurrence, folding back detaches it from the series
        repeat: undefined, skipDates: undefined,
      };
    }));
  }
  function pushSessionToWeek(sessionId) { unscheduleSession(sessionId, 1); }

  // Demote a theme to an unscheduled session filed under a parent theme. The thing
  // you thought was a whole project turns out to be one piece of a larger one.
  // Keeps title/role/priority/notes; moves any children (tagged sessions + list-items)
  // to the parent so nothing is orphaned; lands in the parent's "to assign" group.
  function convertThemeToSession(themeId, parentThemeId) {
    const theme = tasks.find(t => t.id === themeId);
    if (!theme) return;
    const treeIds = subtreeItemIds(themeId); // list-item descendants
    const wk = fmtInput(currentWeekStart);
    setTasks(prev => prev.map(t => {
      // The theme itself → an unscheduled session tagged to the parent theme.
      if (t.id === themeId) {
        return {
          ...t,
          kind: undefined, themeWeek: wk, themeEnd: '',
          time: '', endTime: '', duration: '', allDay: false,
          startDate: wk, endDate: '',
          parentId: null,
          themeIds: parentThemeId ? [parentThemeId] : [],
          themeId: undefined,
          done: false,
        };
      }
      // Sessions tagged to the old theme → retag to the parent.
      const ids = t.themeIds || (t.themeId ? [t.themeId] : []);
      if (ids.includes(themeId)) {
        const retagged = ids.filter(id => id !== themeId);
        if (parentThemeId && !retagged.includes(parentThemeId)) retagged.push(parentThemeId);
        return { ...t, themeIds: retagged, themeId: undefined };
      }
      // Direct list-item children of the old theme → reparent to the parent theme.
      if (t.parentId === themeId) {
        return { ...t, parentId: parentThemeId || null };
      }
      return t;
    }));
  }

  // Cycle a theme's kind: weekly → project → standing → weekly
  function cycleThemeKind(themeId) {
    const order = ['weekly', 'project', 'standing'];
    setTasks(tasks.map(t => {
      if (t.id !== themeId) return t;
      const cur = t.kind || 'weekly';
      const next = order[(order.indexOf(cur) + 1) % order.length];
      const upd = { ...t, kind: next };
      // when becoming a project, seed its start from the current stamped week if unset
      if (next === 'project' && !t.themeWeek) upd.themeWeek = fmtInput(currentWeekStart);
      return upd;
    }));
  }

  function taskColumnTasks() {
    let list = tasks.filter(searchMatch);
    if (taskColView === 'selected') list = list.filter(t => isRoleSelected(t.role));
    // The Sessions panel shows SESSIONS only — items with a scheduled time.
    // Themes (no time) live in the Themes panel, never here. All-day sessions count as sessions.
    if (taskColView === 'unscheduled') {
      // Unscheduled SESSIONS only: no time, not all-day, not done — and NOT a theme.
      // Themes (kind weekly/project/standing) have no time either, but they live in
      // the Themes panel, never here. This is what was leaking themes into this view.
      const isTheme = t => t.kind === 'weekly' || t.kind === 'project' || t.kind === 'standing';
      list = list.filter(t => !t.time && !t.allDay && !t.done && !isTheme(t));
    } else {
      // Active sessions only: scheduled, in the viewed week, and NOT done.
      // A completed session is archived out of the active panel — it shouldn't sit
      // in the working list (and must never read as "unscheduled").
      list = list.filter(t => (t.time || t.allDay) && !t.done && sessionInViewedWeek(t));
    }
    return list;
  }

  function renderTimeline() {
    const dateStr = timelineDay;
    const dObj = parseLocalDate(dateStr);
    const isToday = dateStr === fmtInput(new Date());
    const HOUR_W = 105; // px per hour horizontally
    const LANE_H = 84; // taller lanes
    const hoursArr = Array.from({length:24}, (_,h)=>h);

    // sessions for this day, grouped by role
    const daySessions = tasks.filter(t => t.time && occursOn(t, dateStr) && searchMatch(t));

    // vertical "now" line position
    // now-line removed; isToday still drives the Today badge

    // compute overlap stacking within a lane
    function layoutLane(sessions) {
      const evs = sessions.map(s => {
        const start = toMinutes(s.time);
        let end = s.endTime ? toMinutes(s.endTime) : (s.duration ? start+parseInt(s.duration,10) : start+60);
        if (end <= start) end = start+30;
        return { s, start, end };
      }).sort((a,b)=>a.start-b.start);
      // assign rows so overlapping sessions stack
      const rows = [];
      evs.forEach(ev => {
        let placed = false;
        for (let r=0;r<rows.length;r++){ if (ev.start >= rows[r]) { rows[r]=ev.end; ev.row=r; placed=true; break; } }
        if (!placed){ ev.row=rows.length; rows.push(ev.end); }
      });
      return { evs, rowCount: Math.max(1, rows.length) };
    }

    return (
      <div className="timeline-wrap">
      <div className="timeline-view">
        <div className="timeline-day-head">
          <h2>{dObj.toLocaleDateString('en-US',{weekday:'long', month:'long', day:'numeric'})}</h2>
          {isToday && <span className="timeline-today-badge">Today</span>}
        </div>
        {(() => {
          const allDayToday = tasks.filter(t => t.allDay && t.isBackground && isRoleSelected(t.role) && searchMatch(t) && t.startDate <= dateStr && (t.endDate||t.startDate) >= dateStr);
          if (allDayToday.length === 0) return null;
          return (
            <div className="timeline-allday">
              <span className="timeline-allday-label">all-day</span>
              <div className="timeline-allday-items">
                {allDayToday.map(t => (
                  <div key={t.id} className="timeline-allday-banner"
                    style={{ background: roleColor(t.role)+'22', borderLeft: `3px solid ${roleColor(t.role)}` }}
                    onClick={() => { setHoverTip(null); openSessionView(t, t.startDate); }}
                    onMouseEnter={(ev)=> setHoverTip({ x: ev.clientX, y: ev.clientY, title: t.title, time: `All day${t.location ? ` · ${t.location}` : ''}`, notes: t.notes, color: roleColor(t.role) })}
                    onMouseMove={(ev)=> setHoverTip(prev => prev ? { ...prev, x: ev.clientX, y: ev.clientY } : prev)}
                    onMouseLeave={()=> setHoverTip(null)}>
                    {t.done ? '✓ ' : ''}{t.title}
                  </div>
                ))}
              </div>
            </div>
          );
        })()}
        <div className="timeline-scroll" ref={timelineScrollRef} data-hourw={HOUR_W}>
          <div className="timeline-grid" style={{width: 150 + 24*HOUR_W}}>
            {/* hour ruler */}
            <div className="timeline-ruler">
              <div className="timeline-corner"></div>
              <div className="timeline-hours" style={{width: 24*HOUR_W}}>
                {hoursArr.map(h => (
                  <div key={h} className="timeline-hour" style={{width: HOUR_W}}>
                    {use24h ? `${String(h).padStart(2,'0')}:00` : (h===0?'12a':h<12?`${h}a`:h===12?'12p':`${h-12}p`)}
                  </div>
                ))}
              </div>
            </div>
            {/* role lanes — always rendered; mute/solo dim in place */}
            {roles.map(role => {
              const muted = mutedRoles.includes(role.id);
              const soloedAway = soloRole && soloRole !== role.id;
              const dimmed = muted || soloedAway;
              const laneSessions = dimmed ? [] : daySessions.filter(s => s.role === role.id);
              const { evs, rowCount } = layoutLane(laneSessions);
              const laneHeight = rowCount * (LANE_H - 12) + 12;
              const armed = armedRole === role.id;
              return (
                <div key={role.id} className={`timeline-lane${armed?' armed':''}${dimmed?' dimmed':''}`} style={{height: laneHeight}}>
                  <div className="timeline-lane-label" style={{borderLeftColor: role.color}}>
                    <div className="tl-lane-top">
                      <span className="role-dot" style={{background: role.color}}></span>
                      <span className="tl-lane-name">{role.label}</span>
                    </div>
                    <div className="msr">
                      <button className={`msr-btn ${muted?'on':''}`} title="Mute (hide this role's sessions)"
                        onClick={(e)=>{ e.stopPropagation(); setMutedRoles(muted ? mutedRoles.filter(r=>r!==role.id) : [...mutedRoles, role.id]); }}>M</button>
                      <button className={`msr-btn ${soloRole===role.id?'on':''}`} title="Solo (focus this role)"
                        onClick={(e)=>{ e.stopPropagation(); setSoloRole(soloRole===role.id ? null : role.id); }}>S</button>
                      <button className={`msr-btn rec ${armed?'armed':''}`} title="Record-arm, then click the lane to add a session"
                        onClick={(e)=>{ e.stopPropagation(); setArmedRole(armed ? null : role.id); setConductorMsg(null); }}>
                        <span className="rec-dot"></span>
                      </button>
                    </div>
                  </div>
                  <div className={`timeline-lane-track${armed?' armed':''}`} style={{width: 24*HOUR_W}}
                    onDragOver={(e) => { if (!dimmed) e.preventDefault(); }}
                    onDrop={(e) => {
                      if (dimmed) return;
                      e.preventDefault();
                      const id = Number(e.dataTransfer.getData('text/plain'));
                      if (!id) return;
                      const moving = tasks.find(t => Number(t.id) === id);
                      if (!moving) return;
                      const rect = e.currentTarget.getBoundingClientRect();
                      const x = e.clientX - rect.left;
                      let mins = Math.round((x / HOUR_W) * 60);
                      mins = Math.round(mins / gridSnap) * gridSnap;
                      mins = Math.max(0, Math.min(23*60+30, mins));
                      const dur = (moving.time && moving.endTime) ? (toMinutes(moving.endTime) - toMinutes(moving.time)) : (moving.duration ? parseInt(moving.duration,10) : 60);
                      // Conductor: block on conflict, ask to confirm
                      if (!moving.isBackground && !moving.allDay) {
                        const check = conductorCheck(role.id, dateStr, mins, dur, moving.id);
                        if (check.kind === 'conflict') {
                          const ok = window.confirm(`Conductor: this lands on "${check.conflictTitle}" (${check.conflictTime})${check.crossRole ? ', a different role' : ''}.\n\nDrop it here anyway?`);
                          if (!ok) return;
                        }
                      }
                      setHoverTip(null);
                      setTasks(prev => prev.map(t => {
                        if (Number(t.id) !== id) return t;
                        const newStart = minToHHMM(mins);
                        const upd = { ...t, role: role.id, startDate: dateStr, time: newStart };
                        if (t.endTime || t.duration) upd.endTime = minToHHMM(Math.min(24*60, mins + dur));
                        return upd;
                      }));
                    }}
                    onClick={(e) => {
                      if (armedRole !== role.id || dimmed) return;
                      const rect = e.currentTarget.getBoundingClientRect();
                      const x = e.clientX - rect.left;
                      let mins = Math.round((x / HOUR_W) * 60);
                      mins = Math.round(mins / gridSnap) * gridSnap;
                      mins = Math.max(0, Math.min(23*60+30, mins));
                      const dur = 60;
                      const check = conductorCheck(role.id, dateStr, mins, dur);
                      setConductorMsg({ role: role.id, ...check });
                      const startHHMM = minToHHMM(mins);
                      setEditingId(null);
                      setFormData({ ...blankForm(role.id), startDate: dateStr, time: (check.kind==='conflict' && check.free) ? check.free : startHHMM });
                      setShowModal(true);
                      setArmedRole(null);
                    }}
                    onDoubleClick={(e) => {
                      if (armedRole === role.id || dimmed) return;
                      const rect = e.currentTarget.getBoundingClientRect();
                      const x = e.clientX - rect.left;
                      let mins = Math.round((x / HOUR_W) * 60);
                      mins = Math.round(mins / gridSnap) * gridSnap;
                      setEditingId(null);
                      setFormData({ ...blankForm(role.id), startDate: dateStr, time: minToHHMM(Math.max(0,Math.min(23*60+30,mins))) });
                      setShowModal(true);
                    }}>
                    {/* all-day claims/backdrops for this role on this day, split horizontally */}
                    {(() => {
                      const ad = tasks.filter(t => t.allDay && t.role === role.id && searchMatch(t) && t.startDate <= dateStr && (t.endDate||t.startDate) >= dateStr);
                      if (ad.length === 0) return null;
                      const claims = ad.filter(t => !t.isBackground);
                      const backs = ad.filter(t => t.isBackground);
                      const hasClaim = claims.length > 0;
                      return (
                        <>
                          {hasClaim && <div className="allday-fill claim h half-top" style={{ '--ad-color': role.color }} title={claims.map(c=>c.title).join(', ')}><span className="allday-lane-label" style={{ left: dayStartHour*HOUR_W + 8 }} onClick={(e)=>{ e.stopPropagation(); openEdit(claims[0], claims[0].startDate); }}>{claims.map(c=>c.title).join(', ')}<span className="allday-lane-sub">All Day</span></span></div>}
                          {backs.length > 0 && <div className={`allday-fill backdrop h${hasClaim?' half-bottom':''}`} style={{ '--ad-color': role.color }} title={backs.map(b=>b.title).join(', ')}></div>}
                        </>
                      );
                    })()}
                    {/* hour gridlines */}
                    {(() => {
                      const lines = [];
                      const stepPx = (gridSnap/60)*HOUR_W;
                      const count = Math.floor((24*HOUR_W)/stepPx);
                      for (let k=0; k<=count; k++) {
                        const isHour = Math.abs((k*stepPx) % HOUR_W) < 0.5;
                        lines.push(<div key={k} className={`timeline-gridline${isHour?' hour':''}`} style={{left: k*stepPx}}></div>);
                      }
                      return lines;
                    })()}
                    {/* now line */}
                    {/* now-line removed per preference */}
                    {dimmed && <div className="lane-muted-tag">{muted ? 'muted' : 'soloed out'}</div>}
                    {/* clips */}
                    {evs.map(({s, start, end, row}) => {
                      const left = (start/60)*HOUR_W;
                      const width = Math.max(40, ((end-start)/60)*HOUR_W - 2);
                      const top = row*(LANE_H-12) + 4;
                      return (
                        <div key={s.id} className={`clip${(s.done || isSessionPast(s, dateStr)) ? ' done' : ''}${s.isBackground?' bg':''}`}
                          style={{ left, width, top, height: LANE_H-20,
                            '--role': role.color,
                            borderLeft: `4px solid ${role.color}`,
                            background: s.isBackground ? undefined : `color-mix(in oklab, ${role.color} 20%, #fff)` }}
                          draggable
                          onDragStart={(e)=>{ setHoverTip(null); handleDragStart(e,s,dateStr); }}
                          onMouseDown={()=> setHoverTip(null)}
                          onClick={(e)=>{ e.stopPropagation(); setHoverTip(null); openSessionView(s, s.startDate); }}
                          
                          onMouseMove={(e)=> setHoverTip(prev => prev ? { ...prev, x: e.clientX, y: e.clientY } : prev)}
                          onMouseLeave={()=> setHoverTip(null)}>
                          <div className="clip-title">{s.priority==='high'?<span className="ev-pr">▲ </span>:''}{s.repeat&&s.repeat.freq!=='none'?'🔁 ':''}{s.done?'✓ ':''}{s.title}</div>
                          <div className="clip-time">{fmtTime(s.time,use24h)}{s.endTime?`–${fmtTime(s.endTime,use24h)}`:''}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        {conductorMsg && (
          <div className={`conductor-bar ${conductorMsg.kind}`}>
            <span>{conductorMsg.kind==='clear' ? '✓ ' : '⚠ '}{conductorMsg.text}</span>
            {conductorMsg.kind==='conflict' && conductorMsg.free && (
              <button className="conductor-free" onClick={() => { setFormData(f => ({...f, time: conductorMsg.free})); }}>
                Use {fmtTime(conductorMsg.free, use24h)}
              </button>
            )}
            <button className="conductor-x" onClick={() => setConductorMsg(null)}>×</button>
          </div>
        )}
        <div className="timeline-hint">
          {armedRole ? '● Record-armed — click a spot in the armed lane to add a session there.' : 'Arm a track (R) then click its lane to add a session, or double-click any lane.'}
        </div>
      </div>
      <div className={`priority-section timeline-themes${isMobile ? ' mobile-drawer-right' : ''}${isMobile && mobileDrawer==='themes' ? ' open' : ''}`}>
        <div className="priority-header">Today's Themes</div>
        <div className="priority-list">
          {(() => {
            const dayThemes = themesForDay(dateStr).filter(({theme}) => searchMatch(theme));
            const order = { committed: 0, intended: 1, background: 2 };
            dayThemes.sort((a,b) => {
              const pa = PRIORITY_RANK[a.theme.priority] ?? 1;
              const pb = PRIORITY_RANK[b.theme.priority] ?? 1;
              if (pa !== pb) return pa - pb;
              return order[a.state]-order[b.state];
            });
            if (dayThemes.length === 0) return <div className="empty-state">No themes today</div>;
            return dayThemes.map(({theme, state}) => (
              <div key={theme.id} className={`priority-item tl-theme-${state}`} style={{borderLeftColor: roleColor(theme.role)}}
                onClick={() => setViewingThemeId(theme.id)}>
                <span className={`priority-label priority-${theme.priority}`}>{theme.priority}</span>
                <span className="priority-title">{theme.priority==='high'?'▲ ':''}{theme.title}</span>
                <div className="priority-meta">
                  <span className={`tl-state tl-state-${state}`}>{state}</span>
                  {sessionsForTheme(theme.id).length > 0 && <span className="theme-session-count"> · {sessionsForTheme(theme.id).length} session{sessionsForTheme(theme.id).length>1?'s':''}</span>}
                </div>
              </div>
            ));
          })()}
        </div>
        {(() => {
          const pct = dayCoverage(dateStr);
          const lit = Math.round((pct/100)*10);
          const segBand = (seg) => seg >= 8 ? 'red' : seg >= 6 ? 'amber' : 'green';
          const labelBand = pct >= 90 ? 'red' : pct > 60 ? 'amber' : 'green';
          return (
            <div className="tl-coverage-footer">
              <div className="tl-coverage-label">DAY BOOKED</div>
              <div className="tl-coverage-meter">
                <div className="coverage-leds">
                  {Array.from({length:10},(_,seg)=>(
                    <span key={seg} className={`led ${seg < lit ? 'on '+segBand(seg) : ''}`}></span>
                  ))}
                </div>
                <span className={`coverage-pct ${labelBand}`}>{pct}%</span>
              </div>
            </div>
          );
        })()}
      </div>
      </div>
    );
  }

  function renderMiniMonth() {
    const y = miniMonth.getFullYear(), m = miniMonth.getMonth();
    const first = new Date(y, m, 1).getDay();
    const offset = first === 0 ? 6 : first - 1;
    const dim = new Date(y, m+1, 0).getDate();
    const cells = [];
    for (let i=0;i<offset;i++) cells.push(<div key={'e'+i} className="mini-day empty"></div>);
    for (let d=1;d<=dim;d++) {
      const dateStr = `${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
      const has = tasks.some(t => t.startDate === dateStr && isRoleSelected(t.role));
      const isToday = dateStr === fmtInput(new Date());
      cells.push(
        <div key={d} className={`mini-day ${isToday?'today':''}`} onClick={() => setCurrentWeekStart(getMonday(new Date(y,m,d)))}>
          {d}{has && <span className="mini-dot"></span>}
        </div>
      );
    }
    return (
      <div className="mini-cal">
        <div className="mini-head">
          <button onClick={() => setMiniMonth(new Date(y, m-1))}>‹</button>
          <span>{miniMonth.toLocaleDateString('en-US',{month:'short',year:'numeric'})}</span>
          <button onClick={() => setMiniMonth(new Date(y, m+1))}>›</button>
        </div>
        <div className="mini-grid">
          {['M','T','W','T','F','S','S'].map((d,i)=><div key={i} className="mini-dow">{d}</div>)}
          {cells}
        </div>
      </div>
    );
  }

  return (
    <div className="app-container">
      {/* TOP BAR — full width */}
      <div className="header">
        <div className="brand"><h1>Cadence Studio</h1><div className="vegas-meter" aria-hidden="true">{Array.from({length:7},(_,i)=><span key={i} className="vegas-bar" style={{animationDelay: `${i*0.13}s`}}></span>)}</div></div>
        <div className="header-controls">
          <button className="btn-nav undo-btn" onClick={doUndo} title="Undo (⌘Z)">⟲</button>
          <button className="btn-nav undo-btn" onClick={doRedo} title="Redo (⌘⇧Z)">⟳</button>
          <button className="btn-nav hdr-export" onClick={exportData} title={exportStale ? 'Export your Cadence — you have changes since your last export' : 'Export your Cadence (backup / transfer)'}>⤓ Export{exportStale && <span className="stale-dot" />}</button>
          <label className="btn-nav hdr-import" title="Import a Cadence file (replaces this device's data)">⤒<input type="file" accept="application/json,.json" style={{display:'none'}} onChange={e => { if (e.target.files && e.target.files[0]) { importData(e.target.files[0]); e.target.value=''; } }} /></label>
          <div className="tb-sep"></div>
          <div className="view-toggle">
            <button className={`view-toggle-btn ${viewMode==='score'?'on':''}`} onClick={() => setViewMode('score')}>Score</button>
            <button className={`view-toggle-btn ${viewMode==='timeline'?'on':''}`} onClick={() => setViewMode('timeline')}>Timeline</button>
          </div>
          <div className="grid-group">
            <span className="start-tag">GRID</span>
            <div className="seg-toggle" title="Grid snap">
              {[15,30,60].map(g => (
                <button key={g} className={`seg-btn ${gridSnap===g?'on':''}`} onClick={() => setGridSnap(g)}>{g}m</button>
              ))}
            </div>
          </div>
          <div className="start-group" title="Day starts at">
            <span className="start-tag">START</span>
            <div className="start-wrap" title="Day starts at">
              <span className="start-display">{use24h ? `${String(dayStartHour).padStart(2,'0')}:00` : (dayStartHour===0?'12 AM':dayStartHour<12?`${dayStartHour} AM`:dayStartHour===12?'12 PM':`${dayStartHour-12} PM`)}</span>
              <span className="start-caret">▾</span>
              <select className="start-native" value={dayStartHour} onChange={e => setDayStartHour(parseInt(e.target.value,10))}>
                {Array.from({length:24},(_,h)=>(
                  <option key={h} value={h}>{use24h ? `${String(h).padStart(2,'0')}:00` : (h===0?'12 AM':h<12?`${h} AM`:h===12?'12 PM':`${h-12} PM`)}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="tb-sep"></div>
          {viewMode === 'score' ? (
            <>
              <button className="btn-nav" onClick={() => { const d=new Date(currentWeekStart); d.setDate(d.getDate()-7); setCurrentWeekStart(getMonday(d)); }}>‹</button>
              <button className="btn-nav" onClick={() => setCurrentWeekStart(getMonday(new Date()))}>Today</button>
              <button className="btn-nav" onClick={() => { const d=new Date(currentWeekStart); d.setDate(d.getDate()+7); setCurrentWeekStart(getMonday(d)); }}>›</button>
            </>
          ) : (
            <>
              <button className="btn-nav" onClick={() => setTimelineDay(addDays(timelineDay, -1))}>‹</button>
              <button className="btn-nav" onClick={() => setTimelineDay(fmtInput(new Date()))}>Today</button>
              <button className="btn-nav" onClick={() => setTimelineDay(addDays(timelineDay, 1))}>›</button>
            </>
          )}
          <button className="btn-nav" onClick={() => setUse24h(!use24h)} title="Toggle time format">{use24h ? '24h' : '12h'}</button>
          <div className="now-lcd" title="Now">
            <span className="now-dot"></span>
            <span className="now-time">{fmtTime(`${String(nowClock.getHours()).padStart(2,'0')}:${String(nowClock.getMinutes()).padStart(2,'0')}`, use24h)}</span>
            <span className="now-label">NOW</span>
          </div>
          <input className="search-box" placeholder="Search…" value={search} onChange={e => setSearch(e.target.value)} />
          <button className="btn-nav ai-toggle" onClick={() => setShowAI(!showAI)} title="Ask Cadence">✦ Ask Cadence</button>
        </div>
      </div>

      {/* BODY ROW */}
      {isMobile && (
        <div className="mobile-bar">
          <button className={`mbar-btn${mobileDrawer==='roles'?' on':''}`} onClick={() => setMobileDrawer(mobileDrawer==='roles'?null:'roles')}>☰ Roles</button>
          <button className={`mbar-btn${mobileDrawer==='sessions'?' on':''}`} onClick={() => setMobileDrawer(mobileDrawer==='sessions'?null:'sessions')}>Sessions</button>
          <button className={`mbar-btn${mobileDrawer==='themes'?' on':''}`} onClick={() => setMobileDrawer(mobileDrawer==='themes'?null:'themes')}>Themes</button>
        </div>
      )}
      <div className={`body-row${isMobile ? ' mobile' : ''}`}>
      {isMobile && mobileDrawer && <div className="mobile-scrim" onClick={() => setMobileDrawer(null)} />}
      {/* SIDEBAR */}
      <div className={`sidebar${isMobile ? ' mobile-drawer' : ''}${isMobile && mobileDrawer==='roles' ? ' open' : ''}`}>
        <div className="sidebar-top">
          <h2>Roles</h2>
          <button className="icon-btn settings-gear" onClick={() => { setSettingsTab('roles'); setShowSettings(true); }} title="Settings">⚙</button>
        </div>
        <div className="role-list">
          <button className={`role-item ${selectedRole==='all'?'active':''}`} onClick={() => setSelectedRole('all')} style={{borderLeftColor:'#999'}}>
            <span className="role-dot" style={{backgroundColor:'#999'}}></span> All Roles
          </button>
          {roles.map(role => (
            <div key={role.id} className={`role-item-wrap ${selectedRole===role.id?'active':''}`} style={{backgroundColor: selectedRole===role.id?`${role.color}30`:'transparent'}}>
              <button className="role-item-main" style={{borderLeftColor:role.color}} onClick={() => setSelectedRole(role.id)}>
                <span className="role-dot" style={{backgroundColor:role.color}}></span>{role.label}
              </button>
              <button className="role-info-btn" title="Open role details" onClick={(e) => { e.stopPropagation(); setProfileRoleId(role.id); }}>ⓘ</button>
            </div>
          ))}
        </div>

        <div className="sidebar-section">
          {renderMiniMonth()}
        </div>
        <div className="sidebar-section">
          <div className="rail-setting-label">World Clock</div>
          <div className="world-clock">
            {clockCities.map(c => {
              let timeStr = '', hour = null, dayTag = '';
              try {
                timeStr = clockNow.toLocaleTimeString('en-US', { timeZone: c.tz, hour: 'numeric', minute: '2-digit', hour12: !use24h });
                hour = parseInt(clockNow.toLocaleString('en-US', { timeZone: c.tz, hour: '2-digit', hour12: false }), 10);
                // Flag when their calendar day differs from yours — the thing that trips you up.
                const theirDay = clockNow.toLocaleDateString('en-US', { timeZone: c.tz, weekday: 'short' });
                const myDay = clockNow.toLocaleDateString('en-US', { weekday: 'short' });
                if (theirDay !== myDay) dayTag = theirDay;
              } catch { timeStr = '—'; }
              // Working hours 8–18 read normal; outside that is dimmed (don't ping them).
              const awake = hour !== null && hour >= 8 && hour < 18;
              return (
                <div key={c.id} className={`wc-row${awake ? '' : ' asleep'}`}>
                  <span className="wc-city">{c.label}</span>
                  <span className="wc-time">{timeStr}{dayTag && <span className="wc-day"> {dayTag}</span>}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* TASK COLUMN */}
      <div className={`task-column${isMobile ? ' mobile-drawer' : ''}${isMobile && mobileDrawer==='sessions' ? ' open' : ''}`}>
        {viewMode === 'timeline' ? (
          <>
            <div className="task-col-header">
              <strong>Today's Sessions</strong>
              <select value={timelineListView} onChange={e => setTimelineListView(e.target.value)} className="view-select">
                <option value="chrono">Chronological</option>
                <option value="byRole">By Role</option>
                <option value="byTheme">By Theme</option>
              </select>
            </div>
            <div className="task-col-body">
              {(() => {
                const dayS = tasks.filter(t => t.time && occursOn(t, timelineDay) && searchMatch(t));
                if (dayS.length === 0) return <div className="empty-state">No sessions today</div>;
                if (timelineListView === 'chrono') {
                  return dayS.slice().sort((a,b)=>(a.time||'').localeCompare(b.time||'')).map(t =>
                    <TaskChip key={t.id} t={t} color={roleColor(t.role)} use24h={use24h} onDragStart={handleDragStart} onClick={() => openSessionView(t, timelineDay)} />);
                }
                if (timelineListView === 'byRole') {
                  return roles.map(role => {
                    const rt = dayS.filter(t => t.role === role.id).sort((a,b)=>(a.time||'').localeCompare(b.time||''));
                    if (rt.length === 0) return null;
                    return <div key={role.id} className="task-group">
                      <div className="task-group-head" style={{color: role.color}}>{role.label}</div>
                      {rt.map(t => <TaskChip key={t.id} t={t} color={roleColor(t.role)} use24h={use24h} onDragStart={handleDragStart} onClick={() => openSessionView(t, timelineDay)} />)}
                    </div>;
                  });
                }
                // byTheme
                const themed = {};
                const noTheme = [];
                dayS.forEach(t => {
                  const ids = t.themeIds || (t.themeId ? [t.themeId] : []);
                  if (ids.length === 0) noTheme.push(t);
                  else ids.forEach(id => { (themed[id] = themed[id] || []).push(t); });
                });
                const out = Object.keys(themed).map(id => {
                  const th = getThemes().find(x => x.id === Number(id) || x.id === id);
                  return <div key={id} className="task-group">
                    <div className="task-group-head" style={{color: th ? roleColor(th.role) : '#888'}}>{th ? th.title : 'Theme'}</div>
                    {themed[id].sort((a,b)=>(a.time||'').localeCompare(b.time||'')).map(t => <TaskChip key={t.id+'-'+id} t={t} color={roleColor(t.role)} use24h={use24h} onDragStart={handleDragStart} onClick={() => openSessionView(t, timelineDay)} />)}
                  </div>;
                });
                if (noTheme.length) out.push(
                  <div key="none" className="task-group">
                    <div className="task-group-head" style={{color:'#aaa'}}>No theme</div>
                    {noTheme.sort((a,b)=>(a.time||'').localeCompare(b.time||'')).map(t => <TaskChip key={t.id} t={t} color={roleColor(t.role)} use24h={use24h} onDragStart={handleDragStart} onClick={() => openSessionView(t, timelineDay)} />)}
                  </div>
                );
                return out;
              })()}
            </div>
          </>
        ) : (
          <>
            <div className="task-col-header">
              <strong>Sessions</strong>
              <select value={taskColView} onChange={e => setTaskColView(e.target.value)} className="view-select">
                <option value="byRole">All by Role</option>
                <option value="selected">Selected Role</option>
                <option value="unscheduled">Unscheduled</option>
              </select>
            </div>
            <div className="task-col-body">
              {(() => {
                const slipped = slippedThemes();
                if (slipped.length === 0) return null;
                return (
                  <div className="unfinished-tray">
                    <div className="unfinished-head">
                      <span className="unfinished-title">Unfinished Business</span>
                      <span className="unfinished-count">{slipped.length}</span>
                    </div>
                    <div className="unfinished-sub">These slipped past their week. Close them out or move them forward.</div>
                    {slipped.map(t => (
                      <div key={t.id} className="unfinished-item" style={{borderLeftColor: roleColor(t.role)}}>
                        <div className="unfinished-item-title" onClick={() => setViewingThemeId(t.id)}>
                          <span className={`priority-label priority-${t.priority}`}>{t.priority}</span>
                          {t.title}
                        </div>
                        <div className="unfinished-item-meta">from week of {new Date((t.themeWeek||t.startDate)+'T00:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric'})}{(() => { const open = openLeafCount(t.id); return open > 0 ? ` · ${open} item${open>1?'s':''} still open` : ''; })()}</div>
                        <div className="unfinished-actions">
                          <button className="ub-btn close" onClick={() => resolveSlipped(t.id,'close')}>✓ Close out</button>
                          <button className="ub-btn push" onClick={() => setViewingThemeId(t.id)}>→ Decide now</button>
                          <button className="ub-btn project" onClick={() => resolveSlipped(t.id,'project')}>⇄ Make project</button>
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })()}
              {taskColView === 'byRole' ? (
                roles.map(role => {
                  const rt = taskColumnTasks().filter(t => t.role === role.id).slice().sort(byPriority);
                  if (rt.length === 0) return null;
                  return (
                    <div key={role.id} className="task-group">
                      <div className="task-group-head" style={{color: role.color}}>{role.label}</div>
                      {rt.map(t => <TaskChip key={t.id} t={t} color={roleColor(t.role)} use24h={use24h} onDragStart={handleDragStart} onClick={() => openSessionView(t)} />)}
                    </div>
                  );
                })
              ) : (
                taskColumnTasks().slice().sort(byPriority).map(t => <TaskChip key={t.id} t={t} color={roleColor(t.role)} use24h={use24h} onDragStart={handleDragStart} onClick={() => openSessionView(t)} />)
              )}
              {taskColumnTasks().length === 0 && <div className="empty-state">No sessions</div>}
            </div>
          </>
        )}
        <div className="task-col-footer">
          <button className="panel-add-btn" onClick={() => openModal(true)}>+Session</button>
          <button className="panel-add-btn" onClick={() => openModal(false)}>+Theme</button>
        </div>
      </div>

      {/* MAIN */}
      <div className="content">
        {viewMode === 'timeline' ? renderTimeline() : (
          <>
          <div className="calendar-container">
            <div className="week-header">
              <div className="time-header"></div>
              {days.map((day,i) => { const d=new Date(currentWeekStart); d.setDate(d.getDate()+i); const isToday=fmtInput(d)===fmtInput(new Date()); const mon=d.toLocaleDateString('en-US',{month:'short'}); return <div key={day} className={`day-header ${isToday?'today':''}`}>{day}<br/><small>{mon} {d.getDate()}</small></div>; })}
            </div>

            <div className="priority-band">
              {(() => {
                const weekDates = [0,1,2,3,4,5,6].map(i => { const d=new Date(currentWeekStart); d.setDate(d.getDate()+i); return fmtInput(d); });
                const MAX_ROWS = 5;
                return (
                  <>
                    <div className="priority-band-label" style={{gridColumn: 1, gridRow: '1 / -1'}} title="Themes">📌</div>
                    {weekDates.map((dateStr, i) => {
                      // themes present this day, filtered by selected role + search
                      let dayThemes = themesForDay(dateStr).filter(({theme}) => isRoleSelected(theme.role) && searchMatch(theme));
                      // order: high priority first, then committed/intended/background, then by name
                      const stateOrder = { committed: 0, intended: 1, background: 2 };
                      dayThemes.sort((a,b) => {
                        const pa = PRIORITY_RANK[a.theme.priority] ?? 1;
                        const pb = PRIORITY_RANK[b.theme.priority] ?? 1;
                        if (pa !== pb) return pa - pb;
                        return stateOrder[a.state]-stateOrder[b.state];
                      });
                      const shown = dayThemes.slice(0, MAX_ROWS);
                      const hidden = dayThemes.length - shown.length;
                      const hiddenThemeId = dayThemes.length > MAX_ROWS ? dayThemes[MAX_ROWS].theme.id : null;
                      return (
                        <div key={'col'+i} className="pband-col" style={{gridColumn: i+2, gridRow: '1 / -1'}}
                          onDragOver={(e) => e.preventDefault()}
                          onDrop={(e) => {
                            const raw = e.dataTransfer.getData('text/plain');
                            const id = Number(raw);
                            const dropped = tasks.find(t => t.id === id && !t.time);
                            if (dropped) { e.preventDefault(); addIntention(dropped.id, dateStr); }
                          }}>
                          {shown.map(({theme, state}) => (
                            <div key={theme.id}
                              className={`band-theme band-theme-${state}${theme.priority==='high'?' band-theme-high':''}`}
                              style={state === 'committed'
                                ? { background: roleColor(theme.role)+'22', borderLeft: `3px solid ${roleColor(theme.role)}` }
                                : state === 'intended'
                                ? { borderLeft: `3px dashed ${roleColor(theme.role)}`, background: roleColor(theme.role)+'0c' }
                                : { borderLeft: `2px solid ${roleColor(theme.role)}88` }}
                              onClick={(ev) => { ev.stopPropagation(); setHoverTip(null); setViewingThemeId(theme.id); }}
                              onMouseEnter={(ev)=> setHoverTip({ x: ev.clientX, y: ev.clientY, title: theme.title, time: `${roleLabel(theme.role)} · ${state === 'intended' ? 'Intended — no session yet' : state === 'background' ? 'Background theme' : 'Committed today'}`, notes: theme.notes, color: roleColor(theme.role) })}
                              onMouseMove={(ev)=> setHoverTip(prev => prev ? { ...prev, x: ev.clientX, y: ev.clientY } : prev)}
                              onMouseLeave={()=> setHoverTip(null)}>
                              {theme.priority==='high' && <span className="band-high-dot">▲</span>}
                              <span className="band-theme-text">{theme.title}</span>
                              {state === 'intended' && <span className="band-theme-nudge" title="Book a session">＋</span>}
                            </div>
                          ))}
                          {hidden > 0 && <div className="pri-overflow" onClick={() => hiddenThemeId && setViewingThemeId(hiddenThemeId)}>+{hidden} more</div>}
                        </div>
                      );
                    })}
                  </>
                );
              })()}
            </div>

            {(() => {
              const weekDates = [0,1,2,3,4,5,6].map(i => { const d=new Date(currentWeekStart); d.setDate(d.getDate()+i); return fmtInput(d); });
              const weekStart = weekDates[0], weekEnd = weekDates[6];
              const allDayItems = tasks.filter(t => t.allDay && isRoleSelected(t.role) && searchMatch(t) && (t.endDate||t.startDate) >= weekStart && t.startDate <= weekEnd);
              if (allDayItems.length === 0) return null;
              // assign rows so overlapping banners stack
              const placed = [];
              const rowsEnd = [];
              allDayItems.slice().sort((a,b)=>a.startDate.localeCompare(b.startDate)).forEach(t => {
                const s = t.startDate < weekStart ? 0 : weekDates.indexOf(t.startDate);
                const e = (t.endDate||t.startDate) > weekEnd ? 6 : weekDates.indexOf(t.endDate||t.startDate);
                let row = 0;
                while (rowsEnd[row] !== undefined && rowsEnd[row] >= s) row++;
                rowsEnd[row] = e;
                placed.push({ t, s, e, row });
              });
              const rowCount = rowsEnd.length;
              return (
                <div className="allday-strip" style={{ gridTemplateRows: `repeat(${rowCount}, 22px)` }}>
                  <div className="allday-label">all-day</div>
                  <div className="allday-track">
                    {placed.map(({t, s, e, row}) => (
                      <div key={t.id} className="allday-banner"
                        style={{ gridColumn: `${s+1} / ${e+2}`, gridRow: row+1, background: roleColor(t.role)+'22', borderLeft: `3px solid ${roleColor(t.role)}` }}
                        onClick={() => { setHoverTip(null); openSessionView(t, t.startDate); }}
                        onMouseEnter={(ev)=> setHoverTip({ x: ev.clientX, y: ev.clientY, title: t.title, time: `All day${t.endDate && t.endDate !== t.startDate ? ` · ${new Date(t.startDate+'T00:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric'})}–${new Date(t.endDate+'T00:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric'})}` : ''}${t.location ? ` · ${t.location}` : ''}`, notes: t.notes, color: roleColor(t.role) })}
                        onMouseMove={(ev)=> setHoverTip(prev => prev ? { ...prev, x: ev.clientX, y: ev.clientY } : prev)}
                        onMouseLeave={()=> setHoverTip(null)}>
                        {t.done ? '✓ ' : ''}{t.title}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}

            <div className="calendar-scroll" ref={calScrollRef}>
              <div className="calendar-body">
                {/* time labels column */}
                <div className="time-col">
                  {hours.map(hour => (
                    <div key={hour} className="time-label">{use24h ? String(hour).padStart(2,'0') : (hour===0?'12A':hour<12?hour+'A':hour===12?'12P':(hour-12)+'P')}</div>
                  ))}
                </div>
                {/* seven day columns */}
                {[0,1,2,3,4,5,6].map(dayIndex => {
                  const d=new Date(currentWeekStart); d.setDate(d.getDate()+dayIndex);
                  const dateStr=fmtInput(d);
                  // all timed events on this day
                  const allDay = tasks.filter(t => {
                    if (!isRoleSelected(t.role) || !t.time || !searchMatch(t)) return false;
                    return occursOn(t, dateStr);
                  });
                  const bgEvents = allDay.filter(t => t.isBackground);
                  const fgEvents = allDay.filter(t => !t.isBackground);
                  const layout = layoutDayEvents(fgEvents);
                  return (
                    <div key={dateStr} className="day-col"
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => {
                        // fallback: compute time from drop Y within the column, snapped to grid
                        const rect = e.currentTarget.getBoundingClientRect();
                        const y = e.clientY - rect.top;
                        const rawMin = (y / HOUR_PX) * 60;
                        const snapped = Math.max(0, Math.min(23*60+59, Math.floor(rawMin / gridSnap) * gridSnap));
                        handleDrop(e, dateStr, Math.floor(snapped/60), snapped);
                      }}>
                      {gridSnap < 60 && (
                        <div className="subgrid-overlay" style={{ backgroundSize: `100% ${(gridSnap/60)*HOUR_PX}px` }}></div>
                      )}
                      {/* all-day claim always takes the LEFT half (striped, permanent marker);
                          backdrop washes the remaining space so booked-over sessions stay visible */}
                      {(() => {
                        const ad = tasks.filter(t => t.allDay && isRoleSelected(t.role) && searchMatch(t) && t.startDate <= dateStr && (t.endDate||t.startDate) >= dateStr);
                        if (ad.length === 0) return null;
                        const claims = ad.filter(t => !t.isBackground);
                        const backs = ad.filter(t => t.isBackground);
                        const hasClaim = claims.length > 0;
                        return (
                          <>
                            {hasClaim && (
                              <div className="allday-fill claim half-left" style={{ '--ad-color': roleColor(claims[0].role) }} title={claims.map(c=>c.title).join(', ')}></div>
                            )}
                            {backs.length > 0 && (
                              <div className={`allday-fill backdrop${hasClaim?' half-right':''}`} style={{ '--ad-color': roleColor(backs[0].role) }} title={backs.map(b=>b.title).join(', ')}></div>
                            )}
                          </>
                        );
                      })()}
                      {/* background hour cells (clickable + drop target) */}
                      {hours.map(hour => (
                        <div key={hour} className="hour-cell"
                          onClick={(e) => {
                            const rect = e.currentTarget.getBoundingClientRect();
                            const frac = rect.height > 0 ? (e.clientY - rect.top) / rect.height : 0;
                            const raw = hour * 60 + frac * 60;
                            const snapped = Math.floor(raw / gridSnap) * gridSnap;
                            openModalAt(dateStr, null, snapped);
                          }}
                          onDragOver={(e) => e.preventDefault()}
                          onDrop={(e) => {
                            const rect = e.currentTarget.getBoundingClientRect();
                            // Use the block's TOP (cursor minus where it was grabbed),
                            // and snap to the NEAREST slot rather than always flooring.
                            const y = (e.clientY - dragGrabOffsetY.current) - rect.top;
                            const frac = rect.height > 0 ? y / rect.height : 0;
                            const snapped = Math.max(0, Math.round((hour * 60 + frac * 60) / gridSnap) * gridSnap);
                            handleDrop(e, dateStr, Math.floor(snapped/60), snapped);
                          }}></div>
                      ))}
                      {/* background band events (behind everything) */}
                      {bgEvents.map(t => {
                        const start = toMinutes(t.time);
                        let end = t.endTime ? toMinutes(t.endTime) : (t.duration ? start + parseInt(t.duration,10) : start + 60);
                        if (end <= start) end = start + 60;
                        const top = (start/60)*HOUR_PX;
                        const height = Math.max(24, ((end-start)/60)*HOUR_PX);
                        return (
                          <div key={t.id} className="bg-event"
                            style={{ top: top+'px', height: height+'px', background: roleColor(t.role)+'14', borderColor: roleColor(t.role)+'55', borderLeft: `4px solid ${roleColor(t.role)}` }}
                            onClick={(e) => { e.stopPropagation(); setHoverTip(null); openSessionView(t, dateStr); }}
                            
                            onMouseMove={(ev)=> setHoverTip(prev => prev ? { ...prev, x: ev.clientX, y: ev.clientY } : prev)}
                            onMouseLeave={()=> setHoverTip(null)}>
                            <div className="bg-event-label" style={{color: roleColor(t.role)}}>
                              {t.title} · {fmtTime(t.time, use24h)}{t.endTime?`–${fmtTime(t.endTime, use24h)}`:''}
                            </div>
                          </div>
                        );
                      })}
                      {/* foreground events, side-by-side columns when overlapping */}
                      {(() => {
                        // precompute background time ranges for this day
                        const bgRanges = bgEvents.map(b => {
                          const bs = toMinutes(b.time);
                          let be = b.endTime ? toMinutes(b.endTime) : (b.duration ? bs+parseInt(b.duration,10) : bs+60);
                          if (be <= bs) be = bs+60;
                          return [bs, be];
                        });
                        const BG_INSET = 12; // px the fg shifts right to reveal the bg stripe
                        return fgEvents.map(t => {
                          const lay = layout[t.id];
                          if (!lay) return null;
                          const top = (lay.start / 60) * HOUR_PX;
                          const height = Math.max(18, ((lay.end - lay.start) / 60) * HOUR_PX - 2);
                          const cols = lay.cols || 1;
                          const widthPct = 100 / cols;
                          const leftPct = lay.col * widthPct;
                          // does a background session overlap this event's time?
                          const overlapsBg = bgRanges.some(([bs,be]) => lay.start < be && bs < lay.end);
                          const inset = (lay.col === 0 && overlapsBg) ? BG_INSET : 0;
                          return (
                            <div key={t.id} className={`event${(t.done || isSessionPast(t, dateStr)) ? ' event-done' : ''}`}
                              style={{
                                top: top + 'px',
                                height: height + 'px',
                                left: `calc(${leftPct}% + ${1 + inset}px)`,
                                width: `calc(${widthPct}% - ${3 + inset}px)`,
                                zIndex: 5,
                                borderLeft: `4px solid ${roleColor(t.role)}`,
                                background: `color-mix(in oklab, ${roleColor(t.role)} 20%, #fff)`
                              }}
                              draggable
                              onDragStart={(e) => { setHoverTip(null); handleDragStart(e, t, dateStr); }}
                              onDragOver={(e) => e.preventDefault()}
                              onDrop={(e) => {
                                e.preventDefault(); e.stopPropagation();
                                const col = e.currentTarget.parentElement;
                                const rect = col.getBoundingClientRect();
                                const y = e.clientY - rect.top;
                                const rawMin = (y / HOUR_PX) * 60;
                                const snapped = Math.max(0, Math.min(23*60+59, Math.floor(rawMin / gridSnap) * gridSnap));
                                handleDrop(e, dateStr, Math.floor(snapped/60), snapped);
                              }}
                              onMouseDown={() => setHoverTip(null)}
                              onClick={(e) => { e.stopPropagation(); setHoverTip(null); openSessionView(t, dateStr); }}
                              onMouseEnter={(e)=> { if (cols > 1) setHoverTip({ x: e.clientX, y: e.clientY, title: t.title, time: `${fmtTime(t.time,use24h)}${t.endTime?`–${fmtTime(t.endTime,use24h)}`:''}`, notes: t.notes, color: roleColor(t.role) }); }}
                              onMouseMove={(e)=> { if (cols > 1) setHoverTip(prev => prev ? { ...prev, x: e.clientX, y: e.clientY } : prev); }}
                              onMouseLeave={()=> setHoverTip(null)}
                              onContextMenu={(e) => { e.preventDefault(); if (t.repeat && t.repeat.freq!=='none') { if (window.confirm(`Skip “${t.title}” on ${dateStr}? (keeps the rest of the series)`)) skipOccurrence(t.id, dateStr); } }}>
                              <div className="event-title">{t.priority==='high'?<span className="ev-pr">▲ </span>:''}{t.repeat && t.repeat.freq!=='none' ? '🔁 ' : ''}{t.done?'✓ ':''}{t.title}</div>
                            {(() => { const ids = t.themeIds || (t.themeId ? [t.themeId] : []); return ids.length > 0 ? <div className="event-themes">{ids.map(id => { const th = getThemes().find(x=>x.id===id); return th ? <span key={id} className="event-theme-dot" style={{background: roleColor(th.role)}} title={th.title}></span> : null; })}</div> : null; })()}
                            {(t.endTime || t.duration) && <div className="event-time">{fmtTime(t.time, use24h)}{t.endTime?`–${fmtTime(t.endTime, use24h)}`:''}</div>}
                          </div>
                        );
                        });
                      })()}
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="coverage-row">
              <div className="coverage-spacer"></div>
              {[0,1,2,3,4,5,6].map(i => {
                const d = new Date(currentWeekStart); d.setDate(d.getDate()+i);
                const pct = dayCoverage(fmtInput(d));
                const lit = Math.round((pct/100)*10);
                // per-segment band: 1-6 green, 7-8 amber, 9-10 red (VU-meter style)
                const segBand = (seg) => seg >= 8 ? 'red' : seg >= 6 ? 'amber' : 'green';
                const labelBand = pct >= 90 ? 'red' : pct > 60 ? 'amber' : 'green';
                return (
                  <div key={i} className="coverage-cell">
                    <div className="coverage-leds">
                      {Array.from({length:10},(_,seg)=>(
                        <span key={seg} className={`led ${seg < lit ? 'on '+segBand(seg) : ''}`}></span>
                      ))}
                    </div>
                    <span className={`coverage-pct ${labelBand}`}>{pct}%</span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className={`priority-section${isMobile ? ' mobile-drawer-right' : ''}${isMobile && mobileDrawer==='themes' ? ' open' : ''}`}>
            <div className="priority-header">
              <span>Themes</span>
              <select value={themesSort} onChange={e => setThemesSort(e.target.value)} className="view-select themes-sort">
                <option value="priority">By Priority</option>
                <option value="role">By Role</option>
                <option value="type">By Type</option>
              </select>
            </div>
            <div className="priority-list" onClick={() => openModal(false)}>
              {priorityTasks.length === 0 ? <div className="empty-state">No themes — click here to add one</div> :
                priorityTasks.map(t => (
                  <div key={t.id} className={`priority-item`} style={{borderLeftColor: roleColor(t.role)}}
                    draggable
                    onDragStart={(e) => handleDragStart(e, t)}
                    onClick={(e) => { e.stopPropagation(); setViewingThemeId(t.id); }}>
                    <div className="priority-toprow">
                      <span className={`priority-label priority-${t.priority}`}>{t.priority}</span>
                      <button className={`theme-kind-badge kind-${t.kind||'weekly'}`} onClick={(e)=>{ e.stopPropagation(); setViewingThemeId(t.id); }} title="Theme type — click to edit">
                        {(t.kind||'weekly')==='standing'?'STANDING':(t.kind||'weekly')==='project'?'PROJECT':'WEEKLY'}
                      </button>
                    </div>
                    <span className="priority-title">{t.title}</span>
                    <div className="priority-meta">
                      {(t.kind||'weekly')==='project'
                        ? `${new Date((t.themeWeek||t.startDate)+'T00:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric'})}${t.themeEnd ? ` – ${new Date(t.themeEnd+'T00:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric'})}` : ' →'}`
                        : (t.kind||'weekly')==='standing'
                          ? 'ongoing'
                          : `week of ${new Date((t.themeWeek||t.startDate)+'T00:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric'})}`}
                      {(() => {
                        const sess = sessionsForTheme(t.id);
                        const unsched = unscheduledForTheme(t.id);
                        const total = sess.length + unsched.length;
                        if (total === 0) return null;
                        return (
                          <span className="theme-session-count clickable"
                            onMouseEnter={(e)=>{ const r = e.currentTarget.getBoundingClientRect(); openSessionPanel(t.id, r); }}
                            onMouseLeave={scheduleClosePanel}>
                            {' · '}{total} session{total>1?'s':''} <span className="tsc-caret">▸</span>
                          </span>
                        );
                      })()}
                    </div>
                    {t.tags && t.tags.length>0 && <div className="tag-row">{t.tags.map((tg,i)=><span key={i} className="tag">{tg}</span>)}</div>}
                    <div className="theme-move-row">
                      {(t.kind||'weekly')==='weekly' ? (
                        <button className="theme-move-btn back" title="Pull back to previous week" onClick={(e)=>{ e.stopPropagation(); moveThemeWeek(t.id, -1); }}>
                          <span className="tmb-label">back</span><span className="tmb-arrow">←</span>
                        </button>
                      ) : <span className="tmb-spacer" />}
                      <button className="theme-move-btn kind-cycle" title="Change type (weekly → project → standing)" onClick={(e)=>{ e.stopPropagation(); cycleThemeKind(t.id); }}>
                        <span className="tmb-label">type</span><span className="tmb-arrow">⇄</span>
                      </button>
                      {(t.kind||'weekly')==='weekly' ? (
                        <button className="theme-move-btn push" title="Push to next week" onClick={(e)=>{ e.stopPropagation(); moveThemeWeek(t.id, 1); }}>
                          <span className="tmb-label">push</span><span className="tmb-arrow">→</span>
                        </button>
                      ) : <span className="tmb-spacer" />}
                    </div>
                  </div>
                ))
              }
            </div>
          </div>
          </>
          )}
        </div>
      </div>

      {/* TASK MODAL */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setShowModal(false)}>×</button>
            <h2 className="modal-header">{editingId ? 'Edit' : (formData.draftKind === 'theme' ? 'New Theme' : 'New Session')}</h2>
            <form onSubmit={saveTask}>
              <div className="form-group"><label>Title *</label><input type="text" value={formData.title} onChange={e => setFormData({...formData,title:e.target.value})} required autoFocus/></div>
              <div className="form-group"><label>Role</label><select value={formData.role} onChange={e => setFormData({...formData,role:e.target.value})}>{roles.map(r=><option key={r.id} value={r.id}>{r.label}</option>)}</select></div>
              <div className="form-group"><label>Priority</label><select value={formData.priority} onChange={e => setFormData({...formData,priority:e.target.value})}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select></div>
              {(formData.time || formData.allDay) && (
                <div className="form-group">
                  <label>Themes <span className="field-hint-inline">(a session can serve more than one)</span></label>
                  {formData.themeIds.length > 0 && (
                    <div className="theme-chips">
                      {formData.themeIds.map(id => {
                        const th = getThemes().find(x => x.id === id);
                        if (!th) return null;
                        return (
                          <span key={id} className="theme-chip" style={{background: roleColor(th.role)+'22', borderColor: roleColor(th.role)}}>
                            {th.title}
                            <button type="button" className="theme-chip-x" onClick={() => setFormData({...formData, themeIds: formData.themeIds.filter(x => x !== id)})}>×</button>
                          </span>
                        );
                      })}
                    </div>
                  )}
                  <div className="theme-search-wrap">
                    <input type="text" className="theme-search" value={themeSearch}
                      placeholder="Type to find a theme, or add a new one…"
                      onChange={e => setThemeSearch(e.target.value)}
                      onFocus={() => setThemeSearchFocused(true)}
                      onBlur={() => setTimeout(() => setThemeSearchFocused(false), 150)} />
                    {themeSearchFocused && (() => {
                      const q = themeSearch.trim().toLowerCase();
                      const matches = getThemes()
                        .filter(th => !formData.themeIds.includes(th.id))
                        .filter(th => !q || (th.title || '').toLowerCase().includes(q))
                        .slice(0, 8);
                      const exact = getThemes().some(th => (th.title || '').trim().toLowerCase() === q);
                      return (
                        <div className="theme-results">
                          {matches.map(th => (
                            <div key={th.id} className="theme-result" onMouseDown={() => {
                              if (!formData.themeIds.includes(th.id)) setFormData({...formData, themeIds: [...formData.themeIds, th.id]});
                              setThemeSearch('');
                            }}>
                              <span className="tr-dot" style={{background: roleColor(th.role)}}></span>{th.title}
                            </div>
                          ))}
                          {q && !exact && (
                            <div className="theme-result new" onMouseDown={() => {
                              const newTheme = { id: Date.now()+5, title: themeSearch.trim(), role: formData.role, priority: 'medium', time: '', startDate: formData.startDate || fmtInput(currentWeekStart), endDate: '', notes: '', links: [], tags: [], themeIds: [], done: false, kind: 'weekly', themeWeek: fmtInput(currentWeekStart) };
                              setTasks(prev => [...prev, newTheme]);
                              setFormData({...formData, themeIds: [...formData.themeIds, newTheme.id]});
                              setThemeSearch('');
                            }}>＋ Create theme “{themeSearch.trim()}”</div>
                          )}
                          {matches.length === 0 && !q && <div className="theme-noresult">Start typing to search your themes</div>}
                        </div>
                      );
                    })()}
                  </div>
                </div>
              )}
              {(() => {
                // Theme-only fields (type, complete) show ONLY for real themes — never
                // for a session, even an unscheduled one. A session isn't weekly/standing/project.
                const isThemeDraft = formData.draftKind === 'theme';
                const taggedToTheme = (formData.themeIds && formData.themeIds.length > 0) || formData.themeId != null;
                const existingTheme = editingId && (() => { const o = tasks.find(t=>t.id===editingId); return o && (o.kind==='weekly'||o.kind==='project'||o.kind==='standing'); })();
                const isTheme = (isThemeDraft || existingTheme) && !taggedToTheme && !formData.time && !formData.allDay;
                if (!isTheme) return null;
                return (
                <div className="form-group theme-type-group">
                  <label>Theme type</label>
                  <div className="theme-type-seg">
                    {[['standing','Standing','always present'],['weekly','Weekly','this week\u2019s priority'],['project','Project','spans dates']].map(([k,lbl,hint]) => (
                      <button type="button" key={k} className={`theme-type-btn ${(formData.kind||'weekly')===k?'on':''}`}
                        onClick={() => setFormData({...formData, kind: k, themeWeek: k==='weekly'&&!formData.themeWeek ? fmtInput(currentWeekStart) : formData.themeWeek})}>
                        <strong>{lbl}</strong><span>{hint}</span>
                      </button>
                    ))}
                  </div>
                  {(formData.kind||'weekly') === 'project' && (
                    <div className="theme-project-dates">
                      <div className="tpd-field"><label>Starts (week of)</label>
                        <input type="date" value={formData.themeWeek || ''} onChange={e => setFormData({...formData, themeWeek: e.target.value ? fmtInput(getMonday(new Date(e.target.value+'T00:00:00'))) : ''})} />
                      </div>
                      <div className="tpd-field"><label>Ends (optional)</label>
                        <input type="date" value={formData.themeEnd || ''} onChange={e => setFormData({...formData, themeEnd: e.target.value})} />
                      </div>
                    </div>
                  )}
                </div>
                );
              })()}
              {(() => {
                const isThemeDraft = formData.draftKind === 'theme';
                const taggedToTheme = (formData.themeIds && formData.themeIds.length > 0) || formData.themeId != null;
                const existingTheme = editingId && (() => { const o = tasks.find(t=>t.id===editingId); return o && (o.kind==='weekly'||o.kind==='project'||o.kind==='standing'); })();
                const isTheme = (isThemeDraft || existingTheme) && !taggedToTheme && !formData.time && !formData.allDay;
                if (!isTheme) return null;
                return (
                <div className="form-group done-toggle">
                  <label className="checkbox-label">
                    <input type="checkbox" checked={formData.done} onChange={e => setFormData({...formData, done: e.target.checked})} />
                    Mark this theme complete (finished — stops it appearing as unfinished)
                  </label>
                </div>
                );
              })()}
              <div className="form-group bg-toggle">
                <label className="checkbox-label">
                  <input type="checkbox" checked={formData.isBackground} onChange={e => setFormData({...formData, isBackground: e.target.checked})} />
                  Background event (runs behind your schedule — like camp, travel, or an out-of-office block)
                </label>
              </div>
              <div className="form-group bg-toggle">
                <label className="checkbox-label">
                  <input type="checkbox" checked={formData.allDay} onChange={e => setFormData({...formData, allDay: e.target.checked})} />
                  All day (claims the whole day with no set time; the Conductor asks before booking over it. Check Background for a passive backdrop like a trip or holiday.)
                </label>
              </div>
              <div className="form-row">
                <div className="form-group"><label>Start Date <span className="field-hint-inline">(leave blank for unscheduled)</span></label>
                  <input type="date" value={formData.startDate} onChange={e => {
                    const ns = e.target.value;
                    let ne = formData.endDate;
                    if (ns && formData.startDate && formData.endDate) {
                      const spanDays = Math.round((new Date(formData.endDate+'T00:00:00') - new Date(formData.startDate+'T00:00:00')) / 86400000);
                      const d = new Date(ns+'T00:00:00'); d.setDate(d.getDate() + Math.max(0, spanDays));
                      ne = fmtInput(d);
                    } else if (ns && formData.endDate && formData.endDate < ns) {
                      ne = ns;
                    }
                    setFormData({...formData, startDate: ns, endDate: ne});
                  }} />
                </div>
                <div className="form-group"><label>End Date <span className="field-hint-inline">(optional)</span></label><input type="date" min={formData.startDate || undefined} value={formData.endDate} onChange={e => setFormData({...formData,endDate:e.target.value})}/></div>
              </div>
              {!formData.allDay && (
              <>
              <div className="form-row">
                <div className="form-group">
                  <label>Start Time</label>
                  <TimeEntry value={formData.time} use24h={use24h} onChange={v => {
                    let ne = formData.endTime;
                    if (v && formData.time && formData.endTime) {
                      // Both were set: preserve the existing duration as start shifts.
                      const dur = toMinutes(formData.endTime) - toMinutes(formData.time);
                      if (dur > 0) ne = minToHHMM(toMinutes(v) + dur);
                    } else if (v && !formData.endTime && !formData.duration) {
                      // Fresh start time, no end yet: default to one hour later.
                      ne = minToHHMM(Math.min(24*60 - 1, toMinutes(v) + 60));
                    }
                    setFormData({...formData, time: v, endTime: ne});
                  }} />
                </div>
                <div className="form-group">
                  <label>End Time</label>
                  <TimeEntry value={formData.endTime} use24h={use24h} startTime={formData.time} onChange={v => setFormData({...formData, endTime: v, duration: v ? '' : formData.duration})} />
                </div>
              </div>
              <div className="form-group"><label>Duration (minutes, alternative to end time)</label><input type="number" value={formData.duration} onChange={e => setFormData({...formData, duration: e.target.value, endTime: e.target.value ? '' : formData.endTime})} placeholder="e.g. 90"/></div>
              <div className="form-group loc-group">
                <label>Location (optional)</label>
                <input type="text" value={formData.location}
                  onChange={e => setFormData({...formData, location: e.target.value})}
                  onFocus={() => setLocFocused(true)}
                  onBlur={() => setTimeout(() => setLocFocused(false), 150)}
                  placeholder="A place, an online meeting, or leave blank" />
                {locFocused && locationSuggestions(formData.location, formData.title).length > 0 && (
                  <div className="loc-suggest">
                    {locationSuggestions(formData.location, formData.title).map((loc, i) => (
                      <div key={i} className="loc-suggest-item" onMouseDown={() => { setFormData({...formData, location: loc}); setLocFocused(false); }}>
                        📍 {loc}
                      </div>
                    ))}
                  </div>
                )}
              </div>
              </>
              )}
              <div className="form-group"><label>Tags (comma-separated)</label><input type="text" value={formData.tags} onChange={e => setFormData({...formData,tags:e.target.value})} placeholder="release, urgent"/></div>
              <div className="form-group"><label>Notes <span className="field-hint-inline">**bold** *italic* &nbsp;- bullet&nbsp; 1. numbered</span></label><textarea value={formData.notes} onChange={e => setFormData({...formData,notes:e.target.value})} rows="3"/></div>
              <div className="form-group">
                <label>Resources</label>
                {/* attached library references */}
                {(formData.resourceRefs || []).map((ref, i) => {
                  const res = resolveResourceRef(ref);
                  return (
                    <div key={i} className={`res-row attached${res._live?'':' dead'}`}>
                      <div className="res-row-main">
                        <div className="res-row-name">{res.name || res.link || 'Untitled'}{res._live && res._roleLabel && <span className="res-src"> · {res._roleLabel}</span>}{!res._live && <span className="res-src"> · source removed</span>}</div>
                        {res._live && res.description && <div className="res-row-desc">{res.description}</div>}
                        {res._live && <div className="res-row-contacts">
                          {res.link && <a href={res.link.startsWith('http')?res.link:`https://${res.link}`} target="_blank" rel="noopener noreferrer">{res.link.replace(/^https?:\/\//,'').replace(/^www\./,'').slice(0,30)}</a>}
                          {res.phone && <span>{res.phone}</span>}
                          {res.email && <a href={`mailto:${res.email}`}>{res.email}</a>}
                        </div>}
                      </div>
                      <button type="button" className="res-detach" title="Detach (keeps the original)" onClick={() => setFormData({...formData, resourceRefs: formData.resourceRefs.filter((_,j)=>j!==i)})}>×</button>
                    </div>
                  );
                })}
                {/* local one-off resources */}
                {(formData.localResources || []).map((entry) => (
                  editingLocalRes === entry.id ? (
                    <div key={entry.id} className="res-edit">
                      <input className="res-field" placeholder="Name (e.g. Google Meet)" value={entry.name} autoFocus onChange={e => setFormData({...formData, localResources: formData.localResources.map(r=>r.id===entry.id?{...r,name:e.target.value}:r)})} />
                      <input className="res-field" placeholder="Link (optional)" value={entry.link} onChange={e => setFormData({...formData, localResources: formData.localResources.map(r=>r.id===entry.id?{...r,link:e.target.value}:r)})} />
                      <div className="res-two">
                        <input className="res-field" placeholder="Phone (optional)" value={entry.phone} onChange={e => setFormData({...formData, localResources: formData.localResources.map(r=>r.id===entry.id?{...r,phone:e.target.value}:r)})} />
                        <input className="res-field" placeholder="Email (optional)" value={entry.email} onChange={e => setFormData({...formData, localResources: formData.localResources.map(r=>r.id===entry.id?{...r,email:e.target.value}:r)})} />
                      </div>
                      <input className="res-field" placeholder="Description" value={entry.description} onChange={e => setFormData({...formData, localResources: formData.localResources.map(r=>r.id===entry.id?{...r,description:e.target.value}:r)})} />
                      <textarea className="res-field" rows="2" placeholder="Notes (dial-in, passcode, anything)" value={entry.notes} onChange={e => setFormData({...formData, localResources: formData.localResources.map(r=>r.id===entry.id?{...r,notes:e.target.value}:r)})} />
                      <div className="res-edit-actions">
                        <button type="button" className="btn-primary sm" onClick={() => setEditingLocalRes(null)}>Done</button>
                        <button type="button" className="res-remove" onClick={() => { setFormData({...formData, localResources: formData.localResources.filter(r=>r.id!==entry.id)}); setEditingLocalRes(null); }}>Delete</button>
                      </div>
                    </div>
                  ) : (
                    <div key={entry.id} className="res-row" onClick={() => setEditingLocalRes(entry.id)}>
                      <div className="res-row-main">
                        <div className="res-row-name">{entry.name || entry.link || 'Untitled'}<span className="res-src"> · this session</span></div>
                        {entry.description && <div className="res-row-desc">{entry.description}</div>}
                        <div className="res-row-contacts">
                          {entry.link && <a href={entry.link.startsWith('http')?entry.link:`https://${entry.link}`} target="_blank" rel="noopener noreferrer" onClick={e=>e.stopPropagation()}>{entry.link.replace(/^https?:\/\//,'').replace(/^www\./,'').slice(0,30)}</a>}
                          {entry.phone && <span>{entry.phone}</span>}
                          {entry.email && <a href={`mailto:${entry.email}`} onClick={e=>e.stopPropagation()}>{entry.email}</a>}
                        </div>
                      </div>
                      <span className="res-row-edit">Edit</span>
                    </div>
                  )
                ))}
                {/* search library + add local */}
                <div className="res-attach">
                  <input type="text" className="res-search" value={resSearch} placeholder="Search resources to attach…" onChange={e => setResSearch(e.target.value)} />
                  {resSearch.trim() && (
                    <div className="res-results">
                      {searchResourceLibrary(resSearch).map((m, i) => (
                        <div key={i} className="res-result" onClick={() => {
                          const already = (formData.resourceRefs||[]).some(r => r.roleId===m.roleId && r.entryId===m.entry.id);
                          if (!already) setFormData({...formData, resourceRefs: [...(formData.resourceRefs||[]), { roleId: m.roleId, entryId: m.entry.id, name: m.entry.name }]});
                          setResSearch('');
                        }}>
                          <span className="rr-name">{m.entry.name || m.entry.link}</span>
                          <span className="rr-src">{m.roleLabel}</span>
                        </div>
                      ))}
                      {searchResourceLibrary(resSearch).length === 0 && <div className="res-noresult">No match in the library</div>}
                    </div>
                  )}
                  <button type="button" className="res-add-local" onClick={() => { const id = Date.now(); setFormData({...formData, localResources: [...(formData.localResources||[]), { id, name: resSearch.trim(), link:'', phone:'', email:'', description:'', notes:'' }]}); setResSearch(''); setEditingLocalRes(id); }}>+ Add a resource just for this session</button>
                </div>
              </div>
              <div className="form-group">
                <label>Reminder {notifPermission !== 'granted' && <button type="button" className="link-btn" onClick={requestNotifications}>enable notifications</button>}</label>
                <div className="reminder-row">
                  <input type="date" value={formData.reminderDate} onChange={e => setFormData({...formData, reminderDate: e.target.value})} />
                  <TimeEntry value={formData.reminderTime} use24h={use24h} onChange={v => setFormData({...formData, reminderTime: v})} />
                </div>
                {notifPermission === 'granted' ? <small className="field-hint">You'll get a pop-up and a desktop notification at this time (while the app is open).</small> : <small className="field-hint">Pop-up reminders work now. Click "enable notifications" for desktop alerts too.</small>}
              </div>

              <div className="form-group repeat-group">
                <label>Repeat</label>
                <select value={formData.repeatFreq === 'weekly' && String(formData.repeatInterval) === '2' ? 'biweekly' : formData.repeatFreq}
                  onChange={e => {
                    const v = e.target.value;
                    if (v === 'biweekly') setFormData({...formData, repeatFreq: 'weekly', repeatInterval: 2});
                    else setFormData({...formData, repeatFreq: v, repeatInterval: v === 'weekly' && String(formData.repeatInterval) === '2' ? 1 : formData.repeatInterval});
                  }}>
                  <option value="none">Does not repeat</option>
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                  <option value="biweekly">Biweekly (every 2 weeks)</option>
                  <option value="monthly">Monthly</option>
                  <option value="yearly">Yearly</option>
                </select>

                {formData.repeatFreq !== 'none' && (
                  <div className="repeat-detail">
                    <div className="repeat-interval-row">
                      <span>Every</span>
                      <input type="number" min="1" value={formData.repeatInterval} onChange={e => setFormData({...formData, repeatInterval: e.target.value})} className="repeat-interval-input" />
                      <span>{formData.repeatFreq === 'daily' ? 'day(s)' : formData.repeatFreq === 'weekly' ? 'week(s)' : formData.repeatFreq === 'monthly' ? 'month(s)' : 'year(s)'}</span>
                    </div>

                    {formData.repeatFreq === 'weekly' && (
                      <div className="weekday-picker">
                        {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map((d, i) => (
                          <button type="button" key={i}
                            className={`weekday-btn ${formData.repeatWeekdays.includes(i) ? 'on' : ''}`}
                            onClick={() => {
                              const wd = formData.repeatWeekdays.includes(i)
                                ? formData.repeatWeekdays.filter(x => x !== i)
                                : [...formData.repeatWeekdays, i];
                              setFormData({...formData, repeatWeekdays: wd});
                            }}>{d[0]}</button>
                        ))}
                      </div>
                    )}

                    {formData.repeatFreq === 'monthly' && formData.startDate && (() => {
                      const d = new Date(formData.startDate + 'T00:00:00');
                      const ordinals = ['first','second','third','fourth','fifth'];
                      const week = Math.floor((d.getDate() - 1) / 7);
                      const nextWeek = new Date(d); nextWeek.setDate(d.getDate() + 7);
                      const isLast = nextWeek.getMonth() !== d.getMonth();
                      const wdName = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][d.getDay()];
                      const ordLabel = isLast && week >= 3 ? `last ${wdName}` : `${ordinals[week]} ${wdName}`;
                      return (
                        <div className="monthly-mode">
                          <label className="monthly-mode-opt">
                            <input type="radio" name="monthlyMode" checked={formData.repeatMonthlyMode !== 'weekday'} onChange={() => setFormData({...formData, repeatMonthlyMode: 'date'})} />
                            <span>On day {d.getDate()}</span>
                          </label>
                          <label className="monthly-mode-opt">
                            <input type="radio" name="monthlyMode" checked={formData.repeatMonthlyMode === 'weekday'} onChange={() => setFormData({...formData, repeatMonthlyMode: 'weekday'})} />
                            <span>On the {ordLabel}</span>
                          </label>
                        </div>
                      );
                    })()}
                    <div className="repeat-end">
                      <label className="repeat-end-label">Ends</label>
                      <select value={formData.repeatEndType} onChange={e => setFormData({...formData, repeatEndType: e.target.value})}>
                        <option value="never">Never</option>
                        <option value="date">On date</option>
                        <option value="count">After N times</option>
                      </select>
                      {formData.repeatEndType === 'date' && (
                        <input type="date" value={formData.repeatEndDate} onChange={e => setFormData({...formData, repeatEndDate: e.target.value})} />
                      )}
                      {formData.repeatEndType === 'count' && (
                        <span className="repeat-count-row">
                          <input type="number" min="1" value={formData.repeatEndCount} onChange={e => setFormData({...formData, repeatEndCount: e.target.value})} className="repeat-interval-input" />
                          <span>times</span>
                        </span>
                      )}
                    </div>
                    <small className="field-hint">When you edit or delete a repeating session, you'll choose: this one, this and following, or all. Right-click a session to skip a single date.</small>
                  </div>
                )}
              </div>
              <div className="modal-actions">
                {editingId && <button type="button" className="btn-danger" onClick={requestDelete}>Delete</button>}
                <button type="button" className="btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
                <button type="submit" className="btn-primary" style={{width:'auto'}}>Save</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ROLE MODAL */}
      {showSettings && (
        <div className="modal-overlay" onClick={() => setShowSettings(false)}>
          <div className="modal-content settings-modal" onClick={e => e.stopPropagation()}>
            <div className="sv-head">
              <h2 className="sv-title">Settings</h2>
              <button className="sv-close" onClick={() => setShowSettings(false)}>×</button>
            </div>

            <div className="settings-tabs">
              {[['roles','Roles'],['display','Display'],['clock','World Clock'],['profile','Profile'],['backup','Backup']].map(([k,lbl]) => (
                <button key={k} className={`settings-tab${settingsTab===k?' on':''}`} onClick={() => setSettingsTab(k)}>{lbl}</button>
              ))}
            </div>

            <div className="settings-body">
              {settingsTab === 'roles' && (
                <div className="settings-group">
                  <label className="settings-label">Your roles ({roles.length}/15)</label>
                  {roles.map((r, i) => (
                    <div key={r.id} className="role-edit-card">
                      <div className="role-edit-top">
                        <div className="role-reorder">
                          <button className="reorder-btn" title="Move up" disabled={i===0} onClick={() => { if(i>0){ const n=[...roles]; [n[i-1],n[i]]=[n[i],n[i-1]]; setRoles(n); } }}>▲</button>
                          <button className="reorder-btn" title="Move down" disabled={i===roles.length-1} onClick={() => { if(i<roles.length-1){ const n=[...roles]; [n[i+1],n[i]]=[n[i],n[i+1]]; setRoles(n); } }}>▼</button>
                        </div>
                        <input type="text" value={r.label} onChange={e => setRoles(roles.map((x,xi)=>xi===i?{...x,label:e.target.value}:x))} />
                        <button className="btn-secondary sm" title="Open role details & resources" onClick={() => { setShowSettings(false); setProfileRoleId(r.id); }}>Details</button>
                        <button className="btn-danger sm" title="Delete role" onClick={() => setRoles(roles.filter((_,xi)=>xi!==i))}>×</button>
                      </div>
                      <div className="color-picks">
                        {COLOR_CHOICES.map(c => (
                          <span key={c} className={`color-pick ${r.color===c?'sel':''}`} style={{background:c}} onClick={() => setRoles(roles.map((x,xi)=>xi===i?{...x,color:c}:x))}></span>
                        ))}
                      </div>
                    </div>
                  ))}
                  {roles.length < 15 && (
                    <button className="btn-secondary" style={{marginTop:'12px'}} onClick={() => setRoles([...roles, { id:'role'+Date.now(), label:'New Role', color: COLOR_CHOICES[roles.length % COLOR_CHOICES.length] }])}>+ Add Role</button>
                  )}
                </div>
              )}

              {settingsTab === 'display' && (
                <div className="settings-group">
                  <label className="settings-label">Density</label>
                  <div className="rail-density">
                    {[['airy','Airy'],['balanced','Balanced'],['compact','Compact']].map(([d,lbl]) => (
                      <button key={d} className={`rail-density-btn ${density===d?'on':''}`} onClick={() => setDensity(d)}>{lbl}</button>
                    ))}
                  </div>
                </div>
              )}

              {settingsTab === 'clock' && (
                <div className="settings-group">
                  <label className="settings-label">World Clock <span className="field-hint-inline">(shows in the left rail)</span></label>
                  {clockCities.map((c, i) => (
                    <div key={c.id} className="clock-edit-row" draggable
                      onDragStart={e => { e.dataTransfer.setData('text/plain', String(i)); e.dataTransfer.effectAllowed = 'move'; }}
                      onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }}
                      onDrop={e => {
                        e.preventDefault();
                        const from = parseInt(e.dataTransfer.getData('text/plain'), 10);
                        if (Number.isNaN(from) || from === i) return;
                        setClockCities(cs => { const n = [...cs]; const [moved] = n.splice(from, 1); n.splice(i, 0, moved); return n; });
                      }}>
                      <span className="clock-drag" title="Drag to reorder">⠿</span>
                      <input type="text" className="clock-city-input" value={c.label} placeholder="City"
                        onChange={e => setClockCities(cs => cs.map(x => x.id===c.id ? {...x, label: e.target.value} : x))} />
                      <select className="clock-tz-select" value={c.tz}
                        onChange={e => setClockCities(cs => cs.map(x => x.id===c.id ? {...x, tz: e.target.value} : x))}>
                        {TIMEZONES.map(tz => <option key={tz} value={tz}>{tz.replace(/_/g,' ')}</option>)}
                      </select>
                      <button className="clock-remove" title="Remove" onClick={() => setClockCities(cs => cs.filter(x => x.id !== c.id))}>×</button>
                    </div>
                  ))}
                  {clockCities.length < 6 && (
                    <button className="clock-add" onClick={() => setClockCities(cs => [...cs, { id: Date.now(), label: '', tz: 'America/New_York' }])}>+ Add city</button>
                  )}
                  <div className="clock-hint">Drag ⠿ to reorder. Cities dim outside their working hours (8am–6pm local), so a glance tells you whether it's a reasonable time to reach someone.</div>
                </div>
              )}

              {settingsTab === 'profile' && (
                <div className="settings-group">
                  <label className="settings-label">You</label>
                  <div className="form-group">
                    <label>Name</label>
                    <input type="text" value={profile.name} placeholder="What should Cadence call you?"
                      onChange={e => setProfile(p => ({...p, name: e.target.value}))} />
                  </div>
                  <div className="form-row">
                    <div className="form-group">
                      <label>Working hours start</label>
                      <input type="time" value={profile.workStart} onChange={e => setProfile(p => ({...p, workStart: e.target.value}))} />
                    </div>
                    <div className="form-group">
                      <label>Working hours end</label>
                      <input type="time" value={profile.workEnd} onChange={e => setProfile(p => ({...p, workEnd: e.target.value}))} />
                    </div>
                  </div>
                  <div className="form-group">
                    <label>Home timezone <span className="field-hint-inline">(blank = your computer's)</span></label>
                    <select value={profile.homeTz} onChange={e => setProfile(p => ({...p, homeTz: e.target.value}))}>
                      <option value="">Use my computer's timezone</option>
                      {TIMEZONES.map(tz => <option key={tz} value={tz}>{tz.replace(/_/g,' ')}</option>)}
                    </select>
                  </div>

                  <label className="settings-label" style={{marginTop:'18px'}}>How you plan</label>
                  <div className="form-group">
                    <label>Planning instructions <span className="field-hint-inline">(Ask Cadence will use these)</span></label>
                    <textarea rows="5" value={profile.instructions}
                      placeholder={"How you like to work. For example:\n- Don't book me before 9am\n- Keep Fridays light\n- I do deep work in the morning; put admin after lunch\n- Guangzhou calls go late evening, not early morning"}
                      onChange={e => setProfile(p => ({...p, instructions: e.target.value}))} />
                    <div className="settings-hint">
                      These are your standing preferences about scheduling and planning. As Ask
                      Cadence grows, it'll lean on these so you don't have to repeat yourself.
                    </div>
                  </div>

                  <div className="sp-note" style={{marginTop:'14px'}}>Each role's own resources and context live under its <strong>Details</strong> button, on the Roles tab.</div>
                </div>
              )}

              {settingsTab === 'backup' && (
                <div className="settings-group">
                  <label className="settings-label">Backup & transfer</label>
                  <div className="backup-intro">
                    Cadence stores everything on this device only. Export a file to keep a
                    backup, or to carry your planner to another device (Quick Share, AirDrop,
                    or a shared folder), then import it there.
                  </div>

                  <div className="backup-block">
                    <div className="backup-block-head">Export</div>
                    <div className="backup-block-body">
                      Download everything as a single file.
                      {lastExport && <span className="backup-last"> Last export: {new Date(lastExport).toLocaleString('en-US',{dateStyle:'medium',timeStyle:'short'})}.</span>}
                    </div>
                    <button className="btn-primary" style={{width:'auto'}} onClick={exportData}>⤓ Export Cadence</button>
                  </div>

                  <div className="backup-block">
                    <div className="backup-block-head">Import</div>
                    <div className="backup-block-body">
                      Load a Cadence file. This <strong>replaces</strong> everything on this
                      device — your current data is saved to a backup file first, automatically.
                    </div>
                    <label className="btn-secondary backup-import-btn">
                      ⤒ Import Cadence…
                      <input type="file" accept="application/json,.json" style={{display:'none'}}
                        onChange={e => { if (e.target.files && e.target.files[0]) { importData(e.target.files[0]); e.target.value=''; } }} />
                    </label>
                    {importErr && <div className="backup-err">{importErr}</div>}
                  </div>

                  <div className="sp-note">Tip: whichever device you edited last is the one to export <em>from</em>. Importing overwrites, so it doesn't merge two devices — carry the freshest copy across.</div>
                </div>
              )}
            </div>

            <div className="sv-actions">
              <button className="btn-primary" style={{width:'auto'}} onClick={() => setShowSettings(false)}>Done</button>
            </div>
          </div>
        </div>
      )}


      {/* ROLE PROFILE MODAL */}
      {profileRoleId && (() => {
        const role = roles.find(r => r.id === profileRoleId);
        if (!role) return null;
        return (
          <div className="modal-overlay" onClick={() => setProfileRoleId(null)}>
            <div className="modal-content profile-modal" onClick={e => e.stopPropagation()}>
              <button className="modal-close" onClick={() => setProfileRoleId(null)}>×</button>
              <h2 className="modal-header"><span className="role-dot" style={{backgroundColor: role.color, marginRight: 8}}></span>{role.label} <span className="modal-subtle">Details</span></h2>

              <div className="form-group">
                <label>Description</label>
                <textarea rows="2" value={role.description || ''} placeholder="What this role is about…"
                  onChange={e => updateRole(role.id, { description: e.target.value })} />
              </div>

              <div className="form-group">
                <label>Notes</label>
                <textarea rows="5" value={role.notes || ''} placeholder="Ongoing notes, context, reminders for this role…"
                  onChange={e => updateRole(role.id, { notes: e.target.value })} />
              </div>

              <div className="form-group">
                <label>Planning instructions <span className="field-hint-inline">(Ask Cadence will use these for this role)</span></label>
                <textarea rows="3" value={role.instructions || ''}
                  placeholder={"How this role should be scheduled. For example:\n- iCON calls with Guangzhou go after 8pm\n- Never book this role on weekends"}
                  onChange={e => updateRole(role.id, { instructions: e.target.value })} />
              </div>

              <div className="form-group">
                <label>Key Contacts</label>
                <textarea rows="3" value={role.contacts || ''} placeholder="Name — email / phone / role (one per line)"
                  onChange={e => updateRole(role.id, { contacts: e.target.value })} />
              </div>

              <div className="form-group">
                <label>Resources</label>
                {interviewRole && interviewRole.id === role.id ? (() => {
                  const set = interviewSetForRole(role);
                  const q = set.questions[interviewStep];
                  return (
                    <div className="interview-panel">
                      <div className="interview-head">
                        <span className="interview-title">✦ Cadence · {set.label}</span>
                        <span className="interview-progress">{interviewStep+1} of {set.questions.length}</span>
                      </div>
                      <div className="interview-q">{q.prompt}</div>
                      <input className="res-field" autoFocus value={interviewAnswer} placeholder="Your answer (or skip)"
                        onChange={e => setInterviewAnswer(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') interviewNext(); }} />
                      <div className="interview-actions">
                        {interviewStep > 0 && <button type="button" className="interview-skip" onClick={interviewBack}>← Back</button>}
                        <button type="button" className="btn-primary sm" onClick={interviewNext}>{interviewStep+1 >= set.questions.length ? 'Finish' : 'Next'}</button>
                        <button type="button" className="interview-skip" onClick={interviewSkip}>Skip</button>
                        <button type="button" className="interview-skip" onClick={() => { const answers = { ...interviewAnswers, [interviewStep]: interviewAnswer }; endInterview(true, answers); }}>Stop &amp; save</button>
                      </div>
                      <div className="interview-hint">{q.target === 'description' ? "This one describes the role — it goes into the Description." : 'Each answer becomes a resource you can flesh out below.'}</div>
                    </div>
                  );
                })() : (
                  <button type="button" className="interview-start" onClick={() => startInterview(role)}>✦ Let Cadence interview you to stock this role</button>
                )}
                <div className="res-list">
                  {roleResourceList(role).map(entry => (
                    editingResourceId === entry.id ? (
                      <div key={entry.id} className="res-edit">
                        <input className="res-field" placeholder="Name (e.g. Easy Song)" value={entry.name} onChange={e => updateRoleResource(role.id, entry.id, { name: e.target.value })} autoFocus />
                        <input className="res-field" placeholder="Link (optional)" value={entry.link} onChange={e => updateRoleResource(role.id, entry.id, { link: e.target.value })} />
                        <div className="res-two">
                          <input className="res-field" placeholder="Phone (optional)" value={entry.phone} onChange={e => updateRoleResource(role.id, entry.id, { phone: e.target.value })} />
                          <input className="res-field" placeholder="Email (optional)" value={entry.email} onChange={e => updateRoleResource(role.id, entry.id, { email: e.target.value })} />
                        </div>
                        <input className="res-field" placeholder="Description (what it's for)" value={entry.description} onChange={e => updateRoleResource(role.id, entry.id, { description: e.target.value })} />
                        <textarea className="res-field" rows="2" placeholder="Notes (account, contact, anything)" value={entry.notes} onChange={e => updateRoleResource(role.id, entry.id, { notes: e.target.value })} />
                        <div className="res-edit-actions">
                          <button className="btn-primary sm" onClick={() => setEditingResourceId(null)}>Done</button>
                          <button className="res-remove" onClick={() => { removeRoleResource(role.id, entry.id); setEditingResourceId(null); }}>Delete</button>
                        </div>
                      </div>
                    ) : (
                      <div key={entry.id} className="res-row" onClick={() => setEditingResourceId(entry.id)}
                        draggable
                        onDragStart={e => { e.dataTransfer.setData('application/x-cadence-res', String(entry.id)); }}
                        onDragOver={e => { if ([...e.dataTransfer.types].includes('application/x-cadence-res')) e.preventDefault(); }}
                        onDrop={e => { const id = e.dataTransfer.getData('application/x-cadence-res'); if (id) { e.preventDefault(); reorderRoleResource(role.id, Number(id), entry.id); } }}>
                        <span className="res-drag" title="Drag to reorder">⠿</span>
                        <div className="res-row-main">
                          <div className="res-row-name">{entry.name || entry.link || 'Untitled resource'}</div>
                          {entry.description && <div className="res-row-desc">{entry.description}</div>}
                          <div className="res-row-contacts">
                            {entry.link && <a href={entry.link.startsWith('http')?entry.link:`https://${entry.link}`} target="_blank" rel="noopener noreferrer" onClick={e=>e.stopPropagation()}>{entry.link.replace(/^https?:\/\//,'').replace(/^www\./,'').slice(0,32)}</a>}
                            {entry.phone && <span>{entry.phone}</span>}
                            {entry.email && <a href={`mailto:${entry.email}`} onClick={e=>e.stopPropagation()}>{entry.email}</a>}
                          </div>
                        </div>
                        <span className="res-row-edit">Edit</span>
                      </div>
                    )
                  ))}
                </div>
                <div className="res-add-row">
                  <input type="text" value={newResourceName} placeholder="New resource name…"
                    onChange={e => setNewResourceName(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && newResourceName.trim()) { addRoleResource(role.id, { name: newResourceName.trim() }); setNewResourceName(''); } }} />
                  <button className="node-add-btn" onClick={() => { if (newResourceName.trim()) { addRoleResource(role.id, { name: newResourceName.trim() }); setNewResourceName(''); } }}>+ Add</button>
                </div>
              </div>

              <div className="form-group">
                <label>Files / Documents (names &amp; locations)</label>
                <textarea rows="3" value={role.files || ''} placeholder="e.g. Contract_v3.pdf — Dropbox/Steffanie/Legal"
                  onChange={e => updateRole(role.id, { files: e.target.value })} />
                <small className="field-hint">This stores file names and where to find them, not the files themselves.</small>
              </div>

              <div className="modal-actions">
                <button className="btn-primary" style={{width:'auto'}} onClick={() => setProfileRoleId(null)}>Done</button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* AI PANEL */}
      {showAI && (
        <AIPanel
          roles={roles}
          weekContext={buildWeekContext()}
          onAddTasks={addTasksFromAI}
          onClose={() => setShowAI(false)}
        />
      )}

      {/* REPEAT EDIT SCOPE MODAL */}
      {pendingSave && (
        <div className="modal-overlay" onClick={() => setPendingSave(null)}>
          <div className="modal-content scope-modal" onClick={e => e.stopPropagation()}>
            {pendingSave.kind === 'span' ? (
              <>
                <h2 className="modal-header">Edit multi-day session</h2>
                <p className="scope-text">“{pendingSave.original.title}” runs across several days. Apply your time change to:</p>
                <div className="scope-options">
                  <button className="scope-btn" onClick={() => applySaveScope('this')}>
                    <strong>Just this day</strong>
                    <span>Split {pendingSave.occ} out as its own session</span>
                  </button>
                  <button className="scope-btn" onClick={() => applySaveScope('all')}>
                    <strong>The whole session</strong>
                    <span>Move every day of this session</span>
                  </button>
                </div>
              </>
            ) : (
              <>
                <h2 className="modal-header">{pendingSave.fromDrag ? 'Move repeating session' : 'Edit repeating session'}</h2>
                <p className="scope-text">This is part of a repeating series. {pendingSave.fromDrag ? 'Move:' : 'Apply your changes to:'}</p>
                <div className="scope-options">
                  <button className="scope-btn" onClick={() => applySaveScope('this')}>
                    <strong>{pendingSave.fromDrag ? 'Just this one' : 'This session'}</strong>
                    <span>Only the occurrence on {pendingSave.occ}</span>
                  </button>
                  <button className="scope-btn" onClick={() => applySaveScope('following')}>
                    <strong>This and following sessions</strong>
                    <span>This occurrence and all future ones</span>
                  </button>
                  <button className="scope-btn" onClick={() => applySaveScope('all')}>
                    <strong>{pendingSave.fromDrag ? 'The whole series' : 'All sessions'}</strong>
                    <span>{pendingSave.fromDrag ? 'Shift every occurrence by the same move' : 'Every occurrence in the series'}</span>
                  </button>
                </div>
              </>
            )}
            <button className="btn-secondary" onClick={() => setPendingSave(null)}>Cancel</button>
          </div>
        </div>
      )}

      {/* REPEAT DELETE SCOPE MODAL */}
      {pendingDelete && (
        <div className="modal-overlay" onClick={() => setPendingDelete(null)}>
          <div className="modal-content scope-modal" onClick={e => e.stopPropagation()}>
            <h2 className="modal-header">Delete repeating session</h2>
            <p className="scope-text">This is part of a repeating series. Delete:</p>
            <div className="scope-options">
              <button className="scope-btn" onClick={() => applyDeleteScope('this')}>
                <strong>This session</strong>
                <span>Only the occurrence on {pendingDelete.occ}</span>
              </button>
              <button className="scope-btn" onClick={() => applyDeleteScope('following')}>
                <strong>This and following sessions</strong>
                <span>This occurrence and all future ones</span>
              </button>
              <button className="scope-btn scope-btn-danger" onClick={() => applyDeleteScope('all')}>
                <strong>All sessions</strong>
                <span>The entire series</span>
              </button>
            </div>
            <button className="btn-secondary" onClick={() => setPendingDelete(null)}>Cancel</button>
          </div>
        </div>
      )}

      {/* THEME VIEW */}
      {viewingThemeId && nodePath.length === 0 && (() => {
        const theme = tasks.find(t => t.id === viewingThemeId);
        if (!theme) return null;
        const sessions = sessionsForTheme(viewingThemeId).slice().sort((a,b) => (a.startDate+a.time).localeCompare(b.startDate+b.time));
        const todayStr = fmtInput(new Date());
        const upcoming = sessions.filter(s => !s.done && (s.endDate||s.startDate) >= todayStr);
        const past = sessions.filter(s => s.done || (s.endDate||s.startDate) < todayStr);
        return (
          <div className="modal-overlay" onClick={() => setViewingThemeId(null)}>
            <div className="modal-content theme-view" onClick={e => e.stopPropagation()}>
              <button className="modal-close" onClick={() => setViewingThemeId(null)}>×</button>
              <h2 className="modal-header"><span className="role-dot" style={{backgroundColor: roleColor(theme.role), marginRight:8}}></span>{theme.title}</h2>
              {(() => {
                const roleIds = [...new Set([theme.role, ...sessions.map(s => s.role)])].filter(Boolean);
                if (roleIds.length <= 1) return null;
                return (
                  <div className="theme-roles-involved">
                    <span className="tri-label">Roles involved</span>
                    <div className="tri-chips">
                      {roleIds.map(rid => (
                        <span key={rid} className={`tri-chip${rid===theme.role?' primary':''}`}>
                          <span className="role-dot" style={{background: roleColor(rid)}}></span>{roleLabel(rid)}{rid===theme.role?' · primary':''}
                        </span>
                      ))}
                    </div>
                  </div>
                );
              })()}

              <div className="theme-actionrow">
                <button className="node-act" onClick={() => { const th = tasks.find(t=>t.id===theme.id); setViewingThemeId(null); openEdit(th); }}>Edit details</button>
                <button className="node-act" onClick={() => setConvertingTheme(convertingTheme === theme.id ? null : theme.id)} title="This is really a piece of a larger theme — demote it to an unscheduled session under that theme">⇩ Convert to session</button>
              </div>

              {convertingTheme === theme.id && (() => {
                const parents = getThemes().filter(x => x.id !== theme.id);
                return (
                  <div className="convert-panel">
                    <div className="convert-hint">File “{theme.title}” under which theme? It becomes an unscheduled session there, and anything under it moves along too.</div>
                    <div className="convert-list">
                      {parents.length === 0 && <div className="convert-empty">No other themes to file under.</div>}
                      {parents.map(p => (
                        <button key={p.id} className="convert-opt" onClick={() => {
                          convertThemeToSession(theme.id, p.id);
                          setConvertingTheme(null);
                          setViewingThemeId(p.id); // jump to the parent so you see it landed
                        }}>
                          <span className="role-dot" style={{background: roleColor(p.role)}}></span>{p.title}
                        </button>
                      ))}
                    </div>
                    <button className="convert-cancel" onClick={() => setConvertingTheme(null)}>Cancel</button>
                  </div>
                );
              })()}

              {isThemeSlipped(theme) && (
              <div className="decide-bar">
                <div className="decide-head">What's the plan?</div>
                <div className="decide-actions">
                  <button className="decide-btn act" onClick={() => {
                    setViewingThemeId(null);
                    setEditingId(null);
                    // Carry the theme's name across — you're booking time FOR this thing,
                    // so the session should arrive named, not blank.
                    setFormData({ ...blankForm(theme.role), title: theme.title || '', startDate: fmtInput(new Date()), time: '09:00', draftKind: 'session', kind: undefined, themeIds: [theme.id] });
                    setShowModal(true);
                  }}>Book time for this</button>
                  <button className="decide-btn defer" onClick={() => setDeferOpen(!deferOpen)}>Defer…</button>
                  <button className="decide-btn drop" onClick={() => { if (window.confirm(`Drop “${theme.title}”? This marks it complete and clears it.`)) { setTasks(tasks.map(t => t.id===theme.id ? {...t, done:true} : t)); setViewingThemeId(null); } }}>Drop it</button>
                </div>
                {deferOpen && (
                  <div className="defer-panel">
                    <div className="defer-when">
                      {[[1,'1 week'],[2,'2 weeks'],[4,'1 month']].map(([w,lbl]) => (
                        <button key={w} className={`defer-wk ${deferWeeks===w?'on':''}`} onClick={() => setDeferWeeks(w)}>{lbl}</button>
                      ))}
                    </div>
                    <input className="defer-reason" type="text" value={deferReason} placeholder="Why defer? (optional but useful later)" onChange={e => setDeferReason(e.target.value)} />
                    <button className="defer-confirm" onClick={() => { deferTheme(theme.id, deferWeeks, deferReason.trim()); setViewingThemeId(null); }}>Defer {deferWeeks===4?'1 month':deferWeeks+' week'+(deferWeeks>1?'s':'')} →</button>
                  </div>
                )}
                <div className="decide-hint">This slipped its week. Book it, defer it with a reason, or drop it. Just don’t leave it sitting.</div>
              </div>
              )}

              <div className="form-group">
                <label>Description {theme.notes && !editingThemeDesc && <button className="link-btn desc-edit" onClick={() => setEditingThemeDesc(true)}>Edit</button>}</label>
                {editingThemeDesc || !theme.notes ? (
                  <textarea rows="3" value={theme.notes || ''} placeholder="What is this theme about? Goals, scope, links…"
                    autoFocus={editingThemeDesc}
                    onBlur={() => setEditingThemeDesc(false)}
                    onChange={e => setTasks(tasks.map(t => t.id === theme.id ? {...t, notes: e.target.value} : t))} />
                ) : (
                  <div className="theme-desc-rendered" onClick={() => setEditingThemeDesc(true)}>{renderMarkdown(theme.notes)}</div>
                )}
              </div>

              <div className="theme-roster">
                <div className="theme-roster-head">
                  <span>Sessions ({sessions.length + unscheduledForTheme(viewingThemeId).length})</span>
                  <button className="btn-secondary sm" onClick={() => {
                    setViewingThemeId(null);
                    setEditingId(null);
                    // One "Add session". No time by default — it's an unscheduled session
                    // until you give it a time. Time and duration are optional in the editor.
                    setFormData({ ...blankForm(theme.role), startDate: '', endDate: '', themeWeek: '', time: '', endTime: '', duration: '', draftKind: 'session', kind: undefined, themeIds: [theme.id] });
                    setShowModal(true);
                  }}>+ Session</button>
                </div>

                {sessions.length === 0 && unscheduledForTheme(viewingThemeId).length === 0 && <div className="theme-empty">No sessions yet. Add one to start scheduling work on this theme.</div>}

                {(() => {
                  const unsched = unscheduledForTheme(viewingThemeId);
                  if (unsched.length === 0) return null;
                  return (
                    <>
                      <div className="theme-group-label unsched-label">Unscheduled · to assign</div>
                      {unsched.map(s => (
                        <div key={s.id} className="theme-session-row unsched-row" onClick={() => { setViewingThemeId(null); openEdit(s, s.startDate); }}>
                          <span className="unsched-dot" style={{background: roleColor(s.role)}} title={roleLabel(s.role)}></span>
                          <div className="theme-session-main">
                            <div className="theme-session-title">{s.title}</div>
                            <div className="theme-session-when unsched-when">Needs a time{s.priority && s.priority !== 'medium' ? ` · ${s.priority}` : ''}{s.location ? ` · 📍 ${s.location}` : ''}</div>
                          </div>
                          <button className="unsched-schedule" title="Give this a time" onClick={(e)=>{ e.stopPropagation(); setViewingThemeId(null); openEdit(s, s.startDate); }}>Schedule</button>
                        </div>
                      ))}
                    </>
                  );
                })()}

                {upcoming.length > 0 && <div className="theme-group-label">Upcoming</div>}
                {upcoming.map(s => (
                  <div key={s.id} className="theme-session-row" onClick={() => { setViewingThemeId(null); openEdit(s, s.startDate); }}>
                    <input type="checkbox" checked={!!s.done} onClick={e=>e.stopPropagation()} onChange={e => { e.stopPropagation(); setTasks(tasks.map(t => t.id===s.id ? {...t, done: e.target.checked} : t)); }} />
                    <div className="theme-session-main">
                      <div className="theme-session-title"><span className="session-role-dot" style={{background: roleColor(s.role)}} title={roleLabel(s.role)}></span>{s.title}</div>
                      <div className="theme-session-when">{new Date(s.startDate).toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'})} · {fmtTime(s.time, use24h)}{s.endTime?`–${fmtTime(s.endTime,use24h)}`:''}{(() => { const p = s.parentId && s.parentId !== theme.id ? tasks.find(t=>t.id===s.parentId) : null; return p ? <span className="session-under"> · under {p.title}</span> : null; })()}</div>
                      {s.links && <div className="session-row-links">{linkifyNotes(Array.isArray(s.links) ? s.links.join('  ') : s.links)}</div>}
                      {s.location && <div className="session-row-loc">📍 {linkifyNotes(s.location)}</div>}
                    </div>
                  </div>
                ))}

                {past.length > 0 && <div className="theme-group-label">Done / Past</div>}
                {past.map(s => (
                  <div key={s.id} className="theme-session-row done" onClick={() => { setViewingThemeId(null); openEdit(s, s.startDate); }}>
                    <input type="checkbox" checked={!!s.done} onClick={e=>e.stopPropagation()} onChange={e => { e.stopPropagation(); setTasks(tasks.map(t => t.id===s.id ? {...t, done: e.target.checked} : t)); }} />
                    <div className="theme-session-main">
                      <div className="theme-session-title"><span className="session-role-dot" style={{background: roleColor(s.role)}} title={roleLabel(s.role)}></span>{s.title}</div>
                      <div className="theme-session-when">{new Date(s.startDate).toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'})} · {fmtTime(s.time, use24h)}{s.endTime?`–${fmtTime(s.endTime,use24h)}`:''}</div>
                    </div>
                  </div>
                ))}

                {sessions.length > 0 && upcoming.length === 0 && (
                  <div className="theme-gap-note">No upcoming sessions — book one to keep moving.</div>
                )}
              </div>

              <div className="modal-actions theme-view-actions">
                <button className="btn-danger" onClick={() => {
                  const linked = sessionsForTheme(theme.id);
                  const msg = linked.length > 0
                    ? `Delete “${theme.title}”? It has ${linked.length} session${linked.length>1?'s':''} attached. The theme will be removed; its sessions will stay on your calendar but lose the theme tag.`
                    : `Delete “${theme.title}”? This removes the theme.`;
                  if (window.confirm(msg)) {
                    setTasks(prev => prev
                      .filter(t => t.id !== theme.id)
                      .map(t => {
                        const ids = t.themeIds || (t.themeId ? [t.themeId] : []);
                        if (ids.includes(theme.id)) return { ...t, themeIds: ids.filter(id => id !== theme.id), themeId: undefined };
                        return t;
                      }));
                    setIntentions(prev => prev.filter(i => i.themeId !== theme.id));
                    setViewingThemeId(null);
                  }
                }}>Delete</button>
                <button className="btn-secondary" onClick={() => { const th = tasks.find(t=>t.id===viewingThemeId); setViewingThemeId(null); openEdit(th); }}>Edit theme details</button>
                <button className="btn-secondary" onClick={() => setViewingThemeId(null)}>Cancel</button>
                <button className="btn-primary" style={{width:'auto'}} onClick={() => setViewingThemeId(null)}>Save</button>
              </div>
              <div className="theme-intend-row">
                <label>Intended days (no session yet):</label>
                {intentions.filter(i => i.themeId === theme.id).length > 0 && (
                  <div className="intend-chips">
                    {intentions.filter(i => i.themeId === theme.id).sort((a,b)=>a.date.localeCompare(b.date)).map(i => (
                      <span key={i.date} className="intend-chip">
                        {new Date(i.date).toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'})}
                        <button type="button" className="intend-chip-x" onClick={() => removeIntention(theme.id, i.date)}>×</button>
                      </span>
                    ))}
                  </div>
                )}
                <input type="date" value="" onChange={e => { if (e.target.value) { addIntention(theme.id, e.target.value); } }} />
                <div className="intend-ask">
                  <button type="button" className="intend-ask-btn" onClick={() => setIntentSuggestion(suggestIntentDay())}>✦ Ask Cadence for a day</button>
                  {intentSuggestion && (
                    <div className="intend-suggestion">
                      <span>Your most open day this week is <strong>{new Date(intentSuggestion.date+'T00:00:00').toLocaleDateString('en-US',{weekday:'long',month:'short',day:'numeric'})}</strong> ({intentSuggestion.load}% booked).</span>
                      <div className="intend-suggestion-actions">
                        <button type="button" className="isa-accept" onClick={() => { addIntention(theme.id, intentSuggestion.date); setIntentSuggestion(null); }}>Intend that day</button>
                        <button type="button" className="isa-dismiss" onClick={() => setIntentSuggestion(null)}>Not that</button>
                      </div>
                    </div>
                  )}
                </div>
                <small className="field-hint">Adds the theme to that day in the band with a nudge to book a session.</small>
              </div>
            </div>
          </div>
        );
      })()}

      {/* NODE VIEW — swaps in when drilling into a subtask; breadcrumb back to theme */}
      {viewingThemeId && nodePath.length > 0 && (() => {
        const nodeId = nodePath[nodePath.length - 1];
        const node = tasks.find(t => t.id === nodeId);
        if (!node) return null;
        const theme = tasks.find(t => t.id === viewingThemeId);
        const kids = childNodes(nodeId);
        const sess = nodeSessions(nodeId);
        const list = node.checklist || [];
        const roleIds = subtreeRoles(nodeId);
        // breadcrumb labels
        const crumbs = [{ id: viewingThemeId, title: theme ? theme.title : 'Theme' },
          ...nodePath.map(id => { const n = tasks.find(t=>t.id===id); return { id, title: n ? n.title : '…' }; })];
        return (
          <div className="modal-overlay" onClick={() => setViewingThemeId(null)}>
            <div className="modal-content theme-view node-view" onClick={e => e.stopPropagation()}>
              <button className="modal-close" onClick={() => setViewingThemeId(null)}>×</button>
              <div className="node-breadcrumb">
                {crumbs.map((c, i) => (
                  <span key={c.id}>
                    <button className="crumb" onClick={() => { if (i === 0) setNodePath([]); else setNodePath(nodePath.slice(0, i)); }}
                      onDragOver={e => { if ([...e.dataTransfer.types].includes('application/x-cadence-item')) e.preventDefault(); }}
                      onDrop={e => { const id = e.dataTransfer.getData('application/x-cadence-item'); if (id) { e.preventDefault(); reparentItem(Number(id), c.id); } }}>{c.title}</button>
                    {i < crumbs.length - 1 && <span className="crumb-sep">›</span>}
                  </span>
                ))}
              </div>
              <h2 className="modal-header"><span className="role-dot" style={{backgroundColor: roleColor(node.role), marginRight:8}}></span>{node.title}</h2>

              {roleIds.length > 1 && (
                <div className="theme-roles-involved">
                  <span className="tri-label">Roles involved</span>
                  <div className="tri-chips">
                    {roleIds.map(rid => (
                      <span key={rid} className={`tri-chip${rid===node.role?' primary':''}`}>
                        <span className="role-dot" style={{background: roleColor(rid)}}></span>{roleLabel(rid)}{rid===node.role?' · primary':''}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div className="node-actionrow">
                <button className="node-act" onClick={() => { setViewingThemeId(null); setNodePath([]); setEditingId(null); setFormData({ ...blankForm(node.role), title: node.title || '', startDate: fmtInput(new Date()), time: '09:00', parentId: node.id }); setShowModal(true); }}>+ Session</button>
                <button className="node-act" onClick={() => { const th = tasks.find(t=>t.id===nodeId); setViewingThemeId(null); setNodePath([]); openEdit(th); }}>Edit details</button>
                <label className="node-done-check"><input type="checkbox" checked={!!node.done} onChange={e => setTasks(tasks.map(t=>t.id===nodeId?{...t,done:e.target.checked}:t))} /> Done</label>
              </div>

              {node.notes && <div className="node-desc">{linkifyNotes(node.notes)}</div>}

              {/* List (child items, each openable, schedulable, nestable) */}
              <div className="node-children">
                <div className="node-children-head"
                  onDragOver={e => { if ([...e.dataTransfer.types].includes('application/x-cadence-item')) e.preventDefault(); }}
                  onDrop={e => { const id = e.dataTransfer.getData('application/x-cadence-item'); if (id) { e.preventDefault(); reparentItem(Number(id), nodeId); } }}>
                  {editingListName ? (
                    <input className="list-name-input" autoFocus defaultValue={node.listName || ''} placeholder="List"
                      onBlur={e => { renameList(nodeId, e.target.value.trim()); setEditingListName(false); }}
                      onKeyDown={e => { if(e.key==='Enter'){ renameList(nodeId, e.target.value.trim()); setEditingListName(false); } if(e.key==='Escape'){ setEditingListName(false); } }} />
                  ) : (
                    <span className="list-name" onClick={() => setEditingListName(true)} title="Click to rename">{node.listName || 'List'} ({kids.length})<span className="list-rename-hint"> ← click to rename</span></span>
                  )}
                </div>
                {kids.map(ch => {
                  const k2 = childNodes(ch.id).length, s2 = nodeSessions(ch.id).length;
                  return (
                    <div key={ch.id} className="node-row" style={{borderLeftColor: roleColor(ch.role)}} onClick={() => setNodePath([...nodePath, ch.id])}
                      draggable
                      onDragStart={e => { e.stopPropagation(); e.dataTransfer.setData('application/x-cadence-item', String(ch.id)); }}
                      onDragOver={e => { if ([...e.dataTransfer.types].includes('application/x-cadence-item')) e.preventDefault(); }}
                      onDrop={e => { const id = e.dataTransfer.getData('application/x-cadence-item'); if (id) { e.preventDefault(); e.stopPropagation(); reparentItem(Number(id), ch.id); } }}>
                      <input type="checkbox" checked={!!ch.done} onClick={e=>e.stopPropagation()} onChange={e=>{ e.stopPropagation(); setTasks(tasks.map(t=>t.id===ch.id?{...t,done:e.target.checked}:t)); }} />
                      <div className="node-row-main">
                        <div className={`node-row-title${ch.done?' done':''}`}><span className="session-role-dot" style={{background: roleColor(ch.role)}}></span>{ch.title}</div>
                        <div className="node-row-meta">
                          {k2>0 && <span>{ch.listName ? `${ch.listName}: ` : ''}{k2} item{k2>1?'s':''}</span>}
                          {s2>0 && <span>{s2} session{s2>1?'s':''}</span>}
                          {k2===0&&s2===0 && <span>empty</span>}
                        </div>
                      </div>
                      <button className="node-clock" title="Schedule this as a session" onClick={e=>{ e.stopPropagation(); setViewingThemeId(null); setNodePath([]); setEditingId(null); setFormData({ ...blankForm(ch.role), title: ch.title, startDate: fmtInput(new Date()), time: '09:00', parentId: ch.id }); setShowModal(true); }}>◷</button>
                      <span className="node-row-arrow">›</span>
                    </div>
                  );
                })}
                <div className="node-add-row">
                  <input type="text" value={newChildTitle} placeholder="Add an item…"
                    onChange={e=>setNewChildTitle(e.target.value)}
                    onKeyDown={e=>{ if(e.key==='Enter' && newChildTitle.trim()){ addChildNode(nodeId, newChildTitle); setNewChildTitle(''); } }} />
                  <button className="node-add-btn" onClick={()=>{ if(newChildTitle.trim()){ addChildNode(nodeId, newChildTitle); setNewChildTitle(''); } }}>+ Add</button>
                </div>
              </div>

              {/* Sessions on this node */}
              {sess.length > 0 && (
                <div className="theme-roster">
                  <div className="theme-roster-head"><span>Sessions ({sess.length})</span></div>
                  {sess.map(s => (
                    <div key={s.id} className="theme-session-row" onClick={() => { setViewingThemeId(null); setNodePath([]); openEdit(s, s.startDate); }}>
                      <input type="checkbox" checked={!!s.done} onClick={e=>e.stopPropagation()} onChange={e=>{ e.stopPropagation(); setTasks(tasks.map(t=>t.id===s.id?{...t,done:e.target.checked}:t)); }} />
                      <div className="theme-session-main">
                        <div className="theme-session-title"><span className="session-role-dot" style={{background: roleColor(s.role)}}></span>{s.title}</div>
                        <div className="theme-session-when">{new Date(s.startDate).toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'})} · {fmtTime(s.time, use24h)}{s.endTime?`–${fmtTime(s.endTime,use24h)}`:''}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* FLOATING HOVER TIP (cursor-positioned, escapes all containers) */}
      {sessionPanel && (() => {
        const allSess = sessionsForTheme(sessionPanel.themeId).slice();
        const isDone = (s) => s.done || isSessionPast(s, s.startDate);
        const activeSess = allSess.filter(s => !isDone(s)).sort((a,b)=>(a.startDate+(a.time||'')).localeCompare(b.startDate+(b.time||'')));
        const doneSess = allSess.filter(isDone).sort((a,b)=>(b.startDate+(b.time||'')).localeCompare(a.startDate+(a.time||'')));
        const unsched = unscheduledForTheme(sessionPanel.themeId);
        if (activeSess.length + doneSess.length + unsched.length === 0) return null;
        const PW = 260;
        const vw = typeof window !== 'undefined' ? window.innerWidth : 1200;
        let left = sessionPanel.rect.left - PW - 10; // prefer to the LEFT (Themes rail is on the right)
        if (left < 8) left = Math.min(vw - PW - 8, sessionPanel.rect.left + 10);
        let top = sessionPanel.rect.top - 4;
        const vh = typeof window !== 'undefined' ? window.innerHeight : 800;
        if (top + 300 > vh) top = Math.max(8, vh - 320);
        const row = (s, faded) => (
          <button key={s.id} className={`sp-item${faded ? ' sp-done' : ''}`} onClick={() => { setSessionPanel(null); openSessionView(s, s.startDate); }}>
            <span className="sp-dot" style={{background: roleColor(s.role)}}></span>
            <span className="sp-title">{s.title}</span>
            <span className={`sp-when${!s.allDay && !s.time ? ' sp-unsched' : ''}`}>{s.allDay ? 'all day' : (s.time ? fmtTime(s.time, use24h) : 'unscheduled')}</span>
          </button>
        );
        return (
          <div className="session-panel" style={{ left, top }}
            onMouseEnter={keepPanelOpen} onMouseLeave={scheduleClosePanel}>
            <div className="sp-head">Sessions</div>
            <div className="sp-list">
              {activeSess.map(s => row(s, false))}
              {unsched.map(s => row(s, false))}
              {doneSess.length > 0 && <div className="sp-divider">Done / Past</div>}
              {doneSess.map(s => row(s, true))}
            </div>
          </div>
        );
      })()}

      {hoverTip && (() => {
        const TIP_W = 230, TIP_H = 96;
        const vw = typeof window !== 'undefined' ? window.innerWidth : 1200;
        const vh = typeof window !== 'undefined' ? window.innerHeight : 800;
        let x = hoverTip.x + 14, y = hoverTip.y + 14;
        if (x + TIP_W > vw) x = hoverTip.x - TIP_W - 14;
        if (y + TIP_H > vh) y = vh - TIP_H - 10;
        if (x < 6) x = 6;
        const rc = hoverTip.color || 'var(--accent)';
        return (
          <div className="float-tip" style={{ left: x, top: y, background: `color-mix(in oklab, ${rc} 18%, var(--raised))`, borderLeft: `4px solid ${rc}` }}>
            <div className="event-tip-title">{hoverTip.title}</div>
            {hoverTip.time && <div className="event-tip-time">{hoverTip.time}</div>}
            {hoverTip.notes && <div className="event-tip-notes">{hoverTip.notes}</div>}
          </div>
        );
      })()}

      {/* POPUP REMINDER */}
      {viewingSession && (() => {
        const t = viewingSession.task;
        const vd = viewingSession.date;
        const themeList = (t.themeIds || (t.themeId ? [t.themeId] : [])).map(id => getThemes().find(x => x.id === id)).filter(Boolean);
        const localRes = t.localResources || [];
        const refRes = (t.resourceRefs || []).map(r => resolveResourceRef(r));
        const endLabel = t.endTime ? fmtTime(t.endTime, use24h) : (t.duration ? fmtTime(minToHHMM(toMinutes(t.time) + parseInt(t.duration,10)), use24h) : '');
        return (
          <div className="modal-overlay" onClick={() => setViewingSession(null)}>
            <div className="modal-content session-view" onClick={e => e.stopPropagation()} style={{borderTop: `4px solid ${roleColor(t.role)}`}}>
              <div className="sv-head">
                <div className="sv-titlewrap">
                  <span className="sv-role-dot" style={{background: roleColor(t.role)}}></span>
                  <h2 className="sv-title">{t.title}</h2>
                </div>
                <button className="sv-close" onClick={() => setViewingSession(null)}>×</button>
              </div>

              <div className="sv-when">
                {t.allDay ? 'All day' : (t.time ? `${new Date(vd+'T00:00:00').toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric'})} · ${fmtTime(t.time, use24h)}${endLabel?`–${endLabel}`:''}` : new Date(vd+'T00:00:00').toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric'}))}
                {t.repeat && t.repeat.freq && t.repeat.freq !== 'none' && <span className="sv-repeat"> · repeats</span>}
              </div>

              <div className="sv-meta">
                <span className="sv-chip" style={{'--rc': roleColor(t.role)}}>{roleLabel(t.role)}</span>
                <span className={`sv-chip pri-${t.priority}`}>{t.priority}</span>
                {t.isBackground && <span className="sv-chip">background</span>}
              </div>

              {t.location && (
                <div className="sv-field">
                  <div className="sv-label">Location</div>
                  <div className="sv-value">📍 {linkifyNotes(t.location)}</div>
                </div>
              )}

              {themeList.length > 0 && (
                <div className="sv-field">
                  <div className="sv-label">Theme{themeList.length>1?'s':''}</div>
                  <div className="sv-themes">
                    {themeList.map(th => (
                      <button key={th.id} className="sv-theme-chip" style={{'--rc': roleColor(th.role)}}
                        onClick={() => { setViewingSession(null); setViewingThemeId(th.id); }}>{th.title}</button>
                    ))}
                  </div>
                </div>
              )}

              {(localRes.length > 0 || refRes.length > 0) && (
                <div className="sv-field">
                  <div className="sv-label">Resources</div>
                  <div className="sv-reslist">
                    {refRes.map((r,i) => (
                      <div key={'r'+i} className={`sv-res${r._live?'':' dead'}`}>
                        <div className="sv-res-name">{r.name || r.link || 'Untitled'}{!r._live && <span className="sv-res-tag"> · source removed</span>}</div>
                        {r._live && <div className="sv-res-contacts">
                          {r.link && linkifyNotes(r.link)}
                          {r.phone && <span> {r.phone}</span>}
                          {r.email && <a href={`mailto:${r.email}`}>{r.email}</a>}
                        </div>}
                      </div>
                    ))}
                    {localRes.map((r,i) => (
                      <div key={'l'+i} className="sv-res">
                        <div className="sv-res-name">{r.name || r.link || 'Untitled'}</div>
                        <div className="sv-res-contacts">
                          {r.link && linkifyNotes(r.link)}
                          {r.phone && <span> {r.phone}</span>}
                          {r.email && <a href={`mailto:${r.email}`}>{r.email}</a>}
                        </div>
                        {r.notes && <div className="sv-res-notes">{linkifyNotes(r.notes)}</div>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {t.notes && (
                <div className="sv-field">
                  <div className="sv-label">Notes</div>
                  <div className="sv-value sv-notes">{renderMarkdown(t.notes)}</div>
                </div>
              )}

              <div className="sv-actions">
                <button className="btn-primary" onClick={() => { const task = viewingSession.task; const date = viewingSession.date; setViewingSession(null); openEdit(task, date); }}>✎ Edit</button>
                {t.time && !t.allDay && (
                  <>
                    <button className="btn-secondary" title="Move to next week's planning, without a set time" onClick={() => { pushSessionToWeek(t.id); setViewingSession(null); }}>→ Push to next week</button>
                    <button className="btn-secondary" title={themeList.length ? 'Fold back into its theme as unscheduled' : 'Remove the time; keep as unscheduled work'} onClick={() => { unscheduleSession(t.id); setViewingSession(null); }}>↩ Unschedule</button>
                  </>
                )}
                <button className="btn-secondary" onClick={() => {
                  setTasks(prev => prev.map(x => x.id === t.id ? { ...x, done: !x.done } : x));
                  setViewingSession(vs => vs ? { ...vs, task: { ...vs.task, done: !vs.task.done } } : vs);
                }}>{t.done ? '↺ Mark not done' : '✓ Mark done'}</button>
                <button className="btn-secondary" onClick={() => setViewingSession(null)}>Close</button>
              </div>
            </div>
          </div>
        );
      })()}

      {popupReminder && (
        <div className="reminder-popup">
          <div className="reminder-popup-inner" style={{borderLeftColor: roleColor(popupReminder.role)}}>
            <div className="reminder-popup-head">🔔 Reminder</div>
            <div className="reminder-popup-title">{popupReminder.title}</div>
            {popupReminder.notes && <div className="reminder-popup-notes">{linkifyNotes(popupReminder.notes)}</div>}
            {popupReminder.location && <div className="reminder-popup-loc">📍 {linkifyNotes(popupReminder.location)}</div>}
            {popupReminder.startDate && <div className="reminder-popup-date">Due {popupReminder.startDate}{popupReminder.time ? ` at ${fmtTime(popupReminder.time, use24h)}` : ''}</div>}
            <div className="reminder-popup-actions">
              <button className="btn-secondary sm" onClick={() => { openEdit(popupReminder); setPopupReminder(null); }}>Open</button>
              <button className="btn-primary sm" onClick={() => setPopupReminder(null)}>Dismiss</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function TimeEntry({ value, use24h, onChange, startTime }) {
  const parts = splitTime(value, use24h);
  const update = (field, v) => {
    const next = { ...parts, [field]: v };
    let built = buildTime(next.hour, next.minute, next.ampm, use24h);
    // If this is an end time (startTime given), not 24h, and the user just set the
    // hour/minute (not the AM/PM), and the built end lands before the start, assume
    // they mean later the same day and flip to PM — the calendar-app convention.
    if (built && startTime && !use24h && field !== 'ampm' && parts.ampm === 'AM') {
      const toMin = s => { const [h,m] = s.split(':').map(Number); return h*60 + m; };
      if (toMin(built) < toMin(startTime)) {
        const pm = buildTime(next.hour, next.minute, 'PM', use24h);
        if (toMin(pm) >= toMin(startTime)) built = pm;
      }
    }
    onChange(built);
  };
  const clear = () => onChange('');
  return (
    <div className="time-entry">
      <input type="number" className="te-hour" placeholder="--" min={use24h?0:1} max={use24h?23:12}
        value={parts.hour} onFocus={e => e.target.select()} onChange={e => update('hour', e.target.value)} />
      <span className="te-colon">:</span>
      <input type="number" className="te-min" placeholder="00" min={0} max={59} step={5}
        value={parts.minute} onFocus={e => e.target.select()} onChange={e => update('minute', e.target.value)} />
      {!use24h && (
        <select className="te-ampm" value={parts.ampm} onChange={e => update('ampm', e.target.value)}>
          <option>AM</option><option>PM</option>
        </select>
      )}
      {value && <button type="button" className="te-clear" onClick={clear} title="Clear">×</button>}
    </div>
  );
}

// Full detail on hover: title, when (start–end), and location if set. The chip
// itself only has room for the start time, which is what matters at a glance.
function chipTooltip(t, use24h) {
  const lines = [t.title];
  let when = '';
  if (t.startDate) {
    when = new Date(t.startDate + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  }
  if (t.allDay) {
    when = when ? `${when} · all day` : 'all day';
  } else if (t.time) {
    const span = t.endTime ? `${fmtTime(t.time, use24h)} – ${fmtTime(t.endTime, use24h)}` : fmtTime(t.time, use24h);
    when = when ? `${when} · ${span}` : span;
  } else if (!t.startDate) {
    when = 'Unscheduled — no date or time yet';
  }
  if (when) lines.push(when);
  if (t.location) lines.push(`📍 ${t.location}`);
  if (t.priority && t.priority !== 'medium') lines.push(`Priority: ${t.priority}`);
  return lines.join('\n');
}

function TaskChip({ t, color, use24h, onDragStart, onClick }) {
  return (
    <div className="task-chip" style={{borderLeftColor: color}}
      draggable
      title={chipTooltip(t, use24h)}
      onDragStart={(e) => onDragStart(e, t)}
      onClick={onClick}>
      <div className="task-chip-toprow">
        <span className={`priority-label priority-${t.priority}`}>{t.priority}</span>
        <span className="task-chip-time">
          {t.allDay ? 'all day' : (t.time ? fmtTime(t.time, use24h) : 'unscheduled')}
        </span>
      </div>
      <div className="task-chip-title">{t.title}</div>
      {t.startDate && (
        <div className="task-chip-date">
          {new Date(t.startDate + 'T00:00:00').toLocaleDateString('en-US',{weekday:'short', month:'short', day:'numeric'})}
        </div>
      )}
    </div>
  );
}

export default App;
