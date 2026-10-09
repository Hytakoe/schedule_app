/* ============================================================================
   «Мои смены 🐾» — iOS-style PWA-календарь рабочих смен (React + Vite)
   Нежная версия с котиками и лапками — сделано с любовью для любимой девушки.
   ----------------------------------------------------------------------------
   Установка: заменить содержимое src/App.jsx этим кодом (остальные файлы
   шаблона Vite не трогать). npm install && npm run dev
   ========================================================================== */

import { useEffect, useMemo, useState } from 'react';

/* ----------------------------- Константы -------------------------------- */

const STORAGE_KEY = 'schedule_app_data_v1';

const MONTHS_RU = ['Январь','Февраль','Март','Апрель','Май','Июнь',
  'Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];
const WEEKDAYS_RU = ['Пн','Вт','Ср','Чт','Пт','Сб','Вс'];
const WD_SHORT = ['вс','пн','вт','ср','чт','пт','сб'];

const DEMO = `Неделя 1
03.10.2026 | 12:00–16:00
04.10.2026 | 12:00–20:00
Всего часов: 12 ч 0 м

Неделя 2
05.10.2026 | 16:00–20:00
06.10.2026 | 12:00–20:00
08.10.2026 | 12:00–20:00
09.10.2026 | 12:00–16:00
10.10.2026 | 12:00–20:00
Всего часов: 32 ч 0 м`;

/* ----------------------------- Утилиты ---------------------------------- */

const pad2 = (n) => String(n).padStart(2, '0');
const toMin = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
const diffMin = (s, e) => { let d = toMin(e) - toMin(s); if (d <= 0) d += 1440; return d; };

const isoOf = (date) => `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
const isoToDate = (iso) => { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d); };

const fmtDur = (min) => {
  const h = Math.floor(min / 60), m = min % 60;
  return m ? `${h} ч ${m} м` : `${h} ч`;
};
const fmtChip = (min) => {
  const h = Math.floor(min / 60), m = min % 60;
  return m ? `${h}ч${pad2(m)}` : `${h}ч`;
};
const fmtShort = (iso) => { const [y, m, d] = iso.split('-'); return `${d}.${m}.${y}`; };
const wdShort = (iso) => WD_SHORT[isoToDate(iso).getDay()];
const fmtFull = (iso) => {
  const s = isoToDate(iso).toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  return s.charAt(0).toUpperCase() + s.slice(1);
};

/* Настроение котика зависит от длительности смены */
const catMood = (min) => {
  if (min <= 0) return 'Смены нет — киса сладко спит...';
  if (min < 6 * 60) return 'Лёгкая смена — киса мурчит и довольна =^･ω･^=';
  if (min <= 8 * 60) return 'Нормальная смена — мурчание стабильное 🐾';
  return 'Долгая смена — срочно нужны обнимашки и вкусняшка! 💗';
};

/* ----------------------------- Парсинг текста ---------------------------- */

function parseSchedule(text) {
  const lineDate = /(\d{1,2})\.(\d{1,2})\.(\d{4})\s*\|\s*(\d{1,2}:\d{2})\s*[-–—]\s*(\d{1,2}:\d{2})/;
  const lineWeek = /^недел[яи]\s*(\d+)/i;
  const lineTotal = /всего часов\s*:\s*(\d+)\s*ч\s*(\d+)\s*м/i;

  const weeks = [];
  const events = [];
  let current = null;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;

    const wm = line.match(lineWeek);
    if (wm) {
      current = { label: `Неделя ${wm[1]}`, items: [], totalLabel: null, totalMinutes: null };
      weeks.push(current);
      continue;
    }
    const tm = line.match(lineTotal);
    if (tm && current) {
      current.totalMinutes = Number(tm[1]) * 60 + Number(tm[2]);
      current.totalLabel = `${tm[1]} ч ${tm[2]} м`;
      continue;
    }
    const dm = line.match(lineDate);
    if (dm) {
      const [, d, mo, y, s, e] = dm;
      if (!current) {
        current = { label: 'Без недели', items: [], totalLabel: null, totalMinutes: null };
        weeks.push(current);
      }
      const dateISO = `${y}-${pad2(Number(mo))}-${pad2(Number(d))}`;
      const ev = {
        id: `${dateISO}_${s}_${e}_${events.length}`,
        dateISO, start: s, end: e,
        minutes: diffMin(s, e),
        week: current.label,
      };
      events.push(ev);
      current.items.push(ev);
    }
  }
  return { events, weeks };
}

/* ----------------------------- Экспорт .ics ------------------------------ */

const icsEsc = (s) => String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');

function icsLocal(iso, time) {
  const d = isoToDate(iso);
  const [h, mi] = time.split(':').map(Number);
  return `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}T${pad2(h)}${pad2(mi)}00`;
}

function buildICS(events) {
  const now = new Date();
  const dtstamp = `${now.getUTCFullYear()}${pad2(now.getUTCMonth() + 1)}${pad2(now.getUTCDate())}T${pad2(now.getUTCHours())}${pad2(now.getUTCMinutes())}${pad2(now.getUTCSeconds())}Z`;
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//schedule-app//RU', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH'];
  for (const ev of events) {
    lines.push(
        'BEGIN:VEVENT',
        `UID:${ev.id}@schedule-app`,
        `DTSTAMP:${dtstamp}`,
        `DTSTART:${icsLocal(ev.dateISO, ev.start)}`,
        `DTEND:${icsLocal(ev.dateISO, ev.end)}`,
        `SUMMARY:${icsEsc(`Смена ${ev.start}–${ev.end} (${fmtDur(ev.minutes)}) 🐾`)}`,
        `DESCRIPTION:${icsEsc(ev.week)}`,
        'END:VEVENT'
    );
  }
  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}

function downloadICS(events, name) {
  const blob = new Blob([buildICS(events)], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* --------------------- Ленивая инициализация состояния ------------------- */

function loadInitial() {
  const today = new Date();
  const fallback = {
    data: { events: [], weeks: [] },
    raw: '',
    cursor: { y: today.getFullYear(), m: today.getMonth() },
  };
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if (saved && Array.isArray(saved.events) && saved.events.length) {
      const d0 = isoToDate(saved.events[0].dateISO);
      return {
        data: { events: saved.events, weeks: saved.weeks || [] },
        raw: saved.raw || '',
        cursor: { y: d0.getFullYear(), m: d0.getMonth() },
      };
    }
  } catch { /* игнорируем повреждённые данные */ }
  return fallback;
}

/* ------------------------- Няшные SVG-декорации --------------------------- */

const CatFace = ({ size = 28, className = '' }) => (
    <svg className={className} width={size} height={size} viewBox="0 0 64 64" fill="none"
         stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M14 28 L10 10 L25 19" />
      <path d="M50 28 L54 10 L39 19" />
      <path d="M32 15 C45 15 52 25 52 36 C52 47 43 53 32 53 C21 53 12 47 12 36 C12 25 19 15 32 15 Z" />
      <path d="M23 33 q3 3 6 0" />
      <path d="M35 33 q3 3 6 0" />
      <path d="M31 38.5 l2 0 l-1 1.8 z" fill="currentColor" strokeWidth="1" />
      <path d="M28 42 q2 2.5 4 0 q2 2.5 4 0" strokeWidth="2.4" />
      <path d="M2 36 h8 M2 42 h8 M54 36 h8 M54 42 h8" strokeWidth="2" />
    </svg>
);

const Paw = ({ size = 14, className = '' }) => (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <ellipse cx="5.5" cy="8.5" rx="2.2" ry="2.9" />
      <ellipse cx="9.8" cy="5.8" rx="2.2" ry="2.9" />
      <ellipse cx="14.2" cy="5.8" rx="2.2" ry="2.9" />
      <ellipse cx="18.5" cy="8.5" rx="2.2" ry="2.9" />
      <path d="M12 10.5c-3.8 0-6.8 3-6.8 5.6 0 1.9 1.5 3.2 3.4 3.2 1.2 0 2.2-.5 3.4-.5s2.2.5 3.4.5c1.9 0 3.4-1.3 3.4-3.2 0-2.6-3-5.6-6.8-5.6z" />
    </svg>
);

const PawTrail = ({ className = '' }) => (
    <div className={'paw-trail ' + className} aria-hidden="true">
      <Paw size={11} /><Paw size={13} /><Paw size={11} />
    </div>
);

const ShareIcon = (
    <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3v12" />
      <path d="M8 7l4-4 4 4" />
      <path d="M5 11v9h14v-9" />
    </svg>
);

/* ----------------------------- Стили (iOS + няша) ------------------------ */

const CSS = `
* { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
:root { color-scheme: light; }
html { background: #f3dfe5; }
html, body { margin: 0; padding: 0; }
body {
  display: block; place-items: normal; min-width: 0; min-height: 0;
  background: #f3dfe5; color: #4a2b34;
  font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
}
#root { width: 100%; max-width: none; margin: 0; padding: 0; text-align: left; }

.app {
  --accent: #ff6b95;
  --accent-deep: #d6336c;
  --accent-soft: rgba(255,107,149,.14);
  --bg: #fff6f8;
  --text: #4a2b34;
  --muted: #b08391;
  max-width: 430px; margin: 0 auto; min-height: 100dvh;
  background: var(--bg); position: relative; display: flex; flex-direction: column;
  color: var(--text);
  box-shadow: 0 0 32px rgba(214,51,108,.15);
}

.hdr {
  position: sticky; top: 0; z-index: 20;
  background: rgba(255,246,248,.92);
  backdrop-filter: saturate(180%) blur(20px);
  -webkit-backdrop-filter: saturate(180%) blur(20px);
  padding: calc(10px + env(safe-area-inset-top)) 16px 10px;
  border-bottom: .5px solid rgba(214,51,108,.12);
}
.hdr-top { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.title-row { display: flex; align-items: center; gap: 10px; }
.cat-header { color: var(--accent); animation: wiggle 5s ease-in-out infinite; flex: none; }
.title { margin: 0; font-size: 28px; line-height: 34px; font-weight: 700; color: var(--text); }
.subtitle { margin-top: 2px; font-size: 13px; color: var(--muted); display: flex; align-items: center; gap: 5px; }
.subtitle .inline-paw { color: var(--accent); opacity: .7; }
.icon-btn {
  width: 40px; height: 40px; padding: 0; border: 0; border-radius: 50%;
  background: var(--accent-soft); color: var(--accent-deep);
  display: flex; align-items: center; justify-content: center; cursor: pointer; flex: none;
}
.icon-btn:disabled { opacity: .35; cursor: default; }
.icon-btn:not(:disabled):active { transform: scale(.94); }

.seg { margin-top: 10px; display: flex; background: rgba(214,51,108,.10); border-radius: 9px; padding: 2px; }
.seg-btn {
  flex: 1; border: 0; padding: 7px 0; background: transparent; border-radius: 7px;
  font-size: 13px; font-weight: 600; color: var(--text); cursor: pointer; font-family: inherit;
}
.seg-btn.on { background: #fff; box-shadow: 0 1px 4px rgba(214,51,108,.18), 0 0 1px rgba(214,51,108,.2); }

.content { flex: 1; padding: 12px 16px calc(24px + env(safe-area-inset-bottom)); }

.month-nav { display: flex; align-items: center; gap: 6px; margin: 2px 0 10px; }
.nav-btn {
  border: 0; padding: 0; background: transparent; color: var(--accent);
  font-size: 26px; line-height: 1; width: 36px; height: 36px; cursor: pointer; border-radius: 50%;
}
.nav-btn:active { background: var(--accent-soft); }
.month-label { flex: 1; text-align: center; font-size: 17px; font-weight: 600; }
.today-btn {
  border: 0; background: transparent; color: var(--accent); font-size: 15px; font-weight: 600;
  cursor: pointer; padding: 6px 8px; border-radius: 8px; font-family: inherit;
}
.today-btn:active { background: var(--accent-soft); }

.month-card { background: #fff; border-radius: 16px; padding: 12px 8px; box-shadow: 0 1px 3px rgba(214,51,108,.08); position: relative; overflow: hidden; }
.month-card .paw-trail { position: absolute; bottom: 6px; right: 10px; opacity: .14; }
.wd-row, .grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 4px 2px; }
.wd { text-align: center; font-size: 11px; font-weight: 600; color: var(--muted); text-transform: uppercase; padding: 4px 0; }
.day {
  border: 0; background: transparent; border-radius: 12px; min-height: 52px; padding: 4px 0;
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 3px;
  font-family: inherit; cursor: default; color: var(--text);
}
.day.clickable { cursor: pointer; }
.day.clickable:active { background: var(--accent-soft); }
.day.out .num { color: #e3c6cf; }
.day.out .chip { opacity: .4; }
.num {
  font-size: 17px; font-weight: 500; min-width: 28px; height: 28px;
  display: inline-flex; align-items: center; justify-content: center; border-radius: 50%;
}
.day.today .num { background: var(--accent); color: #fff; font-weight: 600; }
.chip { font-size: 11px; font-weight: 600; color: var(--accent-deep); background: var(--accent-soft); border-radius: 8px; padding: 1px 6px; line-height: 16px; }
.stats-line { text-align: center; color: var(--muted); font-size: 13px; margin: 12px 0 4px; display: flex; align-items: center; justify-content: center; gap: 6px; }
.stats-line .inline-paw { color: var(--accent); opacity: .6; }

.empty { background: #fff; border-radius: 16px; padding: 24px 20px; text-align: center; color: var(--muted); font-size: 15px; margin-top: 12px; }
.empty .btn { margin-top: 14px; }
.sleep-row { display: flex; align-items: flex-end; justify-content: center; gap: 5px; margin-bottom: 10px; }
.sleep-row .cat { color: var(--accent); transform: rotate(-6deg); }
.z { color: #d6a1b0; font-weight: 700; animation: zfloat 2.2s ease-in-out infinite; }
.z1 { font-size: 12px; }
.z2 { font-size: 15px; animation-delay: .4s; }
.z3 { font-size: 18px; animation-delay: .8s; }

.week-card { background: #fff; border-radius: 16px; padding: 6px 16px 12px; margin-bottom: 12px; box-shadow: 0 1px 3px rgba(214,51,108,.08); }
.week-head { display: flex; justify-content: space-between; align-items: center; padding: 12px 0 8px; font-size: 17px; font-weight: 700; }
.week-total { font-size: 13px; font-weight: 600; color: var(--accent-deep); background: var(--accent-soft); padding: 3px 10px; border-radius: 10px; }
.week-row { display: flex; align-items: center; gap: 8px; padding: 10px 0; border-top: .5px solid rgba(214,51,108,.10); font-size: 15px; }
.row-paw { color: #eec3d0; flex: none; }
.wr-date { flex: 1; }
.wr-time { color: var(--muted); font-variant-numeric: tabular-nums; }
.wr-dur { min-width: 56px; text-align: right; font-weight: 600; font-variant-numeric: tabular-nums; }
.week-warn { margin-top: 8px; font-size: 13px; color: #d70015; background: rgba(255,59,48,.1); border-radius: 10px; padding: 8px 10px; }

.card { background: #fff; border-radius: 16px; padding: 16px; box-shadow: 0 1px 3px rgba(214,51,108,.08); }
textarea {
  width: 100%; min-height: 220px; border: 0; resize: vertical;
  background: #fdf0f4; border-radius: 12px; padding: 12px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 13px; line-height: 1.5; color: var(--text); outline: none;
}
textarea:focus { background: #fbeaf0; box-shadow: 0 0 0 2px rgba(255,107,149,.45); }
.btn-row { display: flex; gap: 8px; margin: 12px 0; flex-wrap: wrap; }
.btn { border: 0; border-radius: 12px; font-size: 15px; font-weight: 600; cursor: pointer; padding: 10px 14px; font-family: inherit; }
.btn:active { transform: scale(.97); }
.btn.secondary { background: rgba(214,51,108,.10); color: var(--accent-deep); flex: 1; }
.btn.primary { background: var(--accent); color: #fff; width: 100%; padding: 13px; font-size: 17px; }
.btn.danger { color: #d70015; }
.btn.ghost-danger { background: transparent; color: #d70015; width: 100%; margin-top: 12px; }
.btn.wide { width: 100%; margin-top: 8px; }
.msg { margin-top: 12px; border-radius: 12px; padding: 10px 12px; font-size: 14px; }
.msg.ok { background: var(--accent-soft); color: var(--accent-deep); }
.msg.err { background: rgba(255,59,48,.12); color: #d70015; }

.foot {
  display: flex; align-items: center; justify-content: center; gap: 8px;
  color: #c98b9b; font-size: 12px; padding: 6px 0 2px; opacity: .85;
}
.foot .heart { color: var(--accent); }

.backdrop { position: fixed; inset: 0; background: rgba(74,43,52,.4); opacity: 0; transition: opacity .32s ease; z-index: 40; }
.backdrop.shown { opacity: 1; }
.sheet {
  position: fixed; left: 50%; bottom: 0; transform: translate(-50%, 105%);
  width: min(430px, 100vw); max-height: 75dvh; overflow-y: auto;
  background: var(--bg); border-radius: 20px 20px 0 0; z-index: 50;
  padding: 6px 16px calc(16px + env(safe-area-inset-bottom));
  transition: transform .38s cubic-bezier(.32,.72,0,1);
  box-shadow: 0 -8px 40px rgba(214,51,108,.25);
}
.sheet.shown { transform: translate(-50%, 0); }
.grabber { width: 36px; height: 5px; border-radius: 3px; background: rgba(214,51,108,.25); margin: 6px auto 10px; }
.sheet-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; margin-bottom: 10px; }
.sheet-date { font-size: 20px; font-weight: 700; }
.sheet-week { font-size: 13px; color: var(--muted); margin-top: 2px; display: flex; align-items: center; gap: 5px; }
.sheet-week .inline-paw { color: var(--accent); opacity: .7; }
.sheet-close {
  border: 0; padding: 0; width: 30px; height: 30px; border-radius: 50%;
  background: rgba(214,51,108,.12); color: var(--muted); font-size: 14px; cursor: pointer; flex: none; margin-top: 2px;
}
.sheet-mood {
  display: flex; align-items: center; justify-content: center; gap: 7px;
  color: #b76e86; font-size: 13px; margin: 0 0 12px; text-align: center;
}
.sheet-mood .cat { color: var(--accent); flex: none; }
.shift-card {
  background: #fff; border-radius: 14px; padding: 14px 16px; margin-bottom: 8px;
  display: flex; align-items: center; justify-content: space-between;
  box-shadow: 0 1px 3px rgba(214,51,108,.08);
}
.shift-time { font-size: 20px; font-weight: 600; font-variant-numeric: tabular-nums; }
.shift-dur { font-size: 14px; font-weight: 600; color: var(--accent-deep); background: var(--accent-soft); padding: 4px 10px; border-radius: 10px; }
.sheet-total { text-align: center; color: var(--muted); font-size: 13px; margin: 6px 0 12px; }

.paw-trail { display: flex; gap: 7px; align-items: center; color: var(--accent); pointer-events: none; }
.paw-trail svg:nth-child(1) { transform: rotate(-18deg) translateY(2px); animation: pawFloat 3s ease-in-out infinite; }
.paw-trail svg:nth-child(2) { transform: rotate(6deg) translateY(-3px); animation: pawFloat 3s ease-in-out .5s infinite; }
.paw-trail svg:nth-child(3) { transform: rotate(-8deg) translateY(1px); animation: pawFloat 3s ease-in-out 1s infinite; }

@keyframes wiggle { 0%,100% { transform: rotate(0deg); } 25% { transform: rotate(-5deg); } 75% { transform: rotate(5deg); } }
@keyframes pawFloat { 0%,100% { translate: 0 0; } 50% { translate: 0 -3px; } }
@keyframes zfloat { 0% { transform: translateY(3px); opacity: 0; } 30% { opacity: 1; } 100% { transform: translateY(-12px); opacity: 0; } }
`;

/* ============================== Приложение =============================== */

export default function App() {
  /* Ленивая инициализация: читаем localStorage один раз при монтировании,
     без вызова setState внутри useEffect (требование ESLint). */
  const initial = useState(loadInitial)[0];

  const [view, setView] = useState('cal');           // 'cal' | 'weeks' | 'input'
  const [raw, setRaw] = useState(initial.raw);
  const [data, setData] = useState(initial.data);
  const [msg, setMsg] = useState(null);              // { type: 'ok'|'err', text }

  const today = new Date();
  const todayISO = isoOf(today);
  const [cursor, setCursor] = useState(initial.cursor);

  const [sheetDate, setSheetDate] = useState(null);
  const [sheetShown, setSheetShown] = useState(false);

  /* Мета-теги iOS PWA + заголовок (только DOM-мутации, без setState) */
  useEffect(() => {
    document.title = 'Мои смены 🐾';
    const setMeta = (name, content) => {
      let el = document.querySelector(`meta[name="${name}"]`);
      if (!el) { el = document.createElement('meta'); el.setAttribute('name', name); document.head.appendChild(el); }
      el.setAttribute('content', content);
    };
    setMeta('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover');
    setMeta('theme-color', '#fff6f8');
    setMeta('apple-mobile-web-app-capable', 'yes');
    setMeta('mobile-web-app-capable', 'yes');
    setMeta('apple-mobile-web-app-status-bar-style', 'default');
    setMeta('apple-mobile-web-app-title', 'Смены 🐾');
  }, []);

  /* Блокировка скролла под шторкой (только DOM-мутация, без setState) */
  useEffect(() => {
    document.body.style.overflow = sheetDate ? 'hidden' : '';
  }, [sheetDate]);

  const byDate = useMemo(() => {
    const map = new Map();
    for (const ev of data.events) {
      if (!map.has(ev.dateISO)) map.set(ev.dateISO, []);
      map.get(ev.dateISO).push(ev);
    }
    return map;
  }, [data.events]);

  const matrix = useMemo(() => {
    const first = new Date(cursor.y, cursor.m, 1);
    const offset = (first.getDay() + 6) % 7;
    const last = new Date(cursor.y, cursor.m + 1, 0);
    const d = new Date(cursor.y, cursor.m, 1 - offset);
    const rows = [];
    while (d <= last) {
      const row = [];
      for (let i = 0; i < 7; i++) { row.push(new Date(d)); d.setDate(d.getDate() + 1); }
      rows.push(row);
    }
    return rows;
  }, [cursor]);

  const monthStats = useMemo(() => {
    let count = 0, min = 0;
    for (const ev of data.events) {
      const d = isoToDate(ev.dateISO);
      if (d.getFullYear() === cursor.y && d.getMonth() === cursor.m) { count++; min += ev.minutes; }
    }
    return { count, min };
  }, [data.events, cursor]);

  const totalAll = useMemo(() => data.events.reduce((s, e) => s + e.minutes, 0), [data.events]);

  const shiftMonth = (delta) => setCursor((c) => {
    const d = new Date(c.y, c.m + delta, 1);
    return { y: d.getFullYear(), m: d.getMonth() };
  });

  const openSheet = (iso) => {
    setSheetDate(iso);
    requestAnimationFrame(() => requestAnimationFrame(() => setSheetShown(true)));
  };
  const closeSheet = () => {
    setSheetShown(false);
    setTimeout(() => setSheetDate(null), 340);
  };

  const handleParse = () => {
    const res = parseSchedule(raw);
    if (!res.events.length) {
      setMsg({ type: 'err', text: 'Киса не смогла разобрать текст 🙀 Нужны строки вида «ДД.ММ.ГГГГ | ЧЧ:ЧЧ–ЧЧ:ЧЧ»' });
      return;
    }
    setData(res);
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...res, raw }));
    const d0 = isoToDate(res.events[0].dateISO);
    setCursor({ y: d0.getFullYear(), m: d0.getMonth() });
    setMsg({ type: 'ok', text: `Мур! Сохранено: смен — ${res.events.length}, недель — ${res.weeks.length} (${fmtDur(res.events.reduce((s, e) => s + e.minutes, 0))}) 🐾` });
    setView('cal');
  };

  const handleClear = () => {
    localStorage.removeItem(STORAGE_KEY);
    setData({ events: [], weeks: [] });
    setMsg({ type: 'ok', text: 'Сохранённые данные удалены. Котик всё простил =^･ω･^=' });
  };

  const pasteClipboard = async () => {
    try {
      const t = await navigator.clipboard.readText();
      if (t) { setRaw(t); setMsg({ type: 'ok', text: 'Текст вставлен из буфера обмена 🐾' }); }
      else setMsg({ type: 'err', text: 'Буфер обмена пуст' });
    } catch {
      setMsg({ type: 'err', text: 'Браузер не дал доступ к буферу — вставьте текст вручную (долгое нажатие → Вставить)' });
    }
  };

  const exportAll = () => {
    if (!data.events.length) return;
    downloadICS(data.events, `smeny_${data.events[0].dateISO}_${data.events[data.events.length - 1].dateISO}.ics`);
  };

  const weekSum = (w) => w.items.reduce((s, e) => s + e.minutes, 0);
  const dayEvents = sheetDate ? (byDate.get(sheetDate) || []) : [];
  const dayMin = dayEvents.reduce((s, e) => s + e.minutes, 0);

  /* ------------------------------- Разметка ------------------------------ */

  return (
      <div className="app">
        <style>{CSS}</style>

        <header className="hdr">
          <div className="hdr-top">
            <div>
              <div className="title-row">
                <CatFace size={32} className="cat-header" />
                <h1 className="title">Мои смены</h1>
              </div>
              <div className="subtitle">
                {data.events.length ? `${data.events.length} смен · ${fmtDur(totalAll)}` : 'расписание из текста'}
                <Paw size={11} className="inline-paw" />
              </div>
            </div>
            <button className="icon-btn" disabled={!data.events.length} onClick={exportAll} title="Экспорт всех смен в .ics">
              {ShareIcon}
            </button>
          </div>
          <div className="seg">
            {[['cal', 'Календарь'], ['weeks', 'Недели'], ['input', 'Ввод']].map(([k, label]) => (
                <button key={k} className={'seg-btn' + (view === k ? ' on' : '')} onClick={() => setView(k)}>
                  {label}
                </button>
            ))}
          </div>
        </header>

        {view === 'cal' && (
            <main className="content">
              <div className="month-nav">
                <button className="nav-btn" onClick={() => shiftMonth(-1)} aria-label="Предыдущий месяц">‹</button>
                <div className="month-label">{MONTHS_RU[cursor.m]} {cursor.y}</div>
                <button className="nav-btn" onClick={() => shiftMonth(1)} aria-label="Следующий месяц">›</button>
                <button className="today-btn" onClick={() => setCursor({ y: today.getFullYear(), m: today.getMonth() })}>
                  Сегодня
                </button>
              </div>

              <div className="month-card">
                <div className="wd-row">
                  {WEEKDAYS_RU.map((w) => <div key={w} className="wd">{w}</div>)}
                </div>
                <div className="grid">
                  {matrix.map((row, ri) => row.map((d, di) => {
                    const iso = isoOf(d);
                    const evs = byDate.get(iso) || [];
                    const min = evs.reduce((s, e) => s + e.minutes, 0);
                    const inMonth = d.getMonth() === cursor.m;
                    const cls = 'day' + (inMonth ? '' : ' out') + (iso === todayISO ? ' today' : '') + (evs.length ? ' clickable' : '');
                    return (
                        <button key={`${ri}-${di}`} className={cls}
                                onClick={evs.length ? () => openSheet(iso) : undefined}>
                          <span className="num">{d.getDate()}</span>
                          {evs.length > 0 && <span className="chip">{fmtChip(min)}</span>}
                        </button>
                    );
                  }))}
                </div>
                <PawTrail />
              </div>

              <div className="stats-line">
                <Paw size={11} className="inline-paw" />
                {MONTHS_RU[cursor.m]} {cursor.y}: {monthStats.count} смен · {fmtDur(monthStats.min)}
                <Paw size={11} className="inline-paw" />
              </div>

              {!data.events.length && (
                  <div className="empty">
                    <div className="sleep-row">
                      <CatFace size={72} className="cat" />
                      <span className="z z1">z</span>
                      <span className="z z2">z</span>
                      <span className="z z3">z</span>
                    </div>
                    Пока нет смен… Котик спит и ждёт расписание 🐾
                    <br />
                    <button className="btn primary" onClick={() => setView('input')}>Ввести расписание</button>
                  </div>
              )}
            </main>
        )}

        {view === 'weeks' && (
            <main className="content">
              {data.weeks.map((w, wi) => (
                  <section className="week-card" key={wi}>
                    <div className="week-head">
                      <span>{w.label}</span>
                      <span className="week-total">{fmtDur(weekSum(w))}</span>
                    </div>
                    {w.items.map((ev) => (
                        <div className="week-row" key={ev.id}>
                          <Paw size={12} className="row-paw" />
                          <span className="wr-date">{fmtShort(ev.dateISO)}, {wdShort(ev.dateISO)}</span>
                          <span className="wr-time">{ev.start}–{ev.end}</span>
                          <span className="wr-dur">{fmtDur(ev.minutes)}</span>
                        </div>
                    ))}
                    {w.totalMinutes !== null && w.totalMinutes !== weekSum(w) && (
                        <div className="week-warn">В файле указано: {w.totalLabel} — расходится с расчётом: {fmtDur(weekSum(w))}</div>
                    )}
                  </section>
              ))}
              {!data.weeks.length && (
                  <div className="empty">
                    <div className="sleep-row">
                      <CatFace size={56} className="cat" />
                      <span className="z z2">z</span>
                      <span className="z z3">z</span>
                    </div>
                    Нет данных по неделям.
                    <br />
                    <button className="btn primary" onClick={() => setView('input')}>Ввести расписание</button>
                  </div>
              )}
            </main>
        )}

        {view === 'input' && (
            <main className="content">
              <div className="card">
            <textarea
                value={raw}
                onChange={(e) => setRaw(e.target.value)}
                spellCheck={false}
                placeholder={'Неделя 1\n03.10.2026 | 12:00–16:00\n04.10.2026 | 12:00–20:00\nВсего часов: 12 ч 0 м'}
            />
                <div className="btn-row">
                  <button className="btn secondary" onClick={pasteClipboard}>Вставить</button>
                  <button className="btn secondary" onClick={() => setRaw(DEMO)}>Пример</button>
                  <button className="btn secondary danger" onClick={() => { setRaw(''); setMsg(null); }}>Очистить</button>
                </div>
                <button className="btn primary" onClick={handleParse}>Разобрать и сохранить 🐾</button>
                {msg && <div className={'msg ' + msg.type}>{msg.text}</div>}
                {data.events.length > 0 && (
                    <button className="btn ghost-danger" onClick={handleClear}>Удалить сохранённые данные</button>
                )}
              </div>
            </main>
        )}

        <footer className="foot">
          <Paw size={11} />
          <span>сделано с <span className="heart">♥</span> и мурчанием для самой лучшей</span>
          <Paw size={11} />
        </footer>

        {/* Bottom sheet с деталями дня */}
        <div className={'backdrop' + (sheetShown ? ' shown' : '')}
             onClick={closeSheet}
             style={{ pointerEvents: sheetDate ? 'auto' : 'none' }} />
        {sheetDate && (
            <div className={'sheet' + (sheetShown ? ' shown' : '')}>
              <div className="grabber" />
              <div className="sheet-head">
                <div>
                  <div className="sheet-date">{fmtFull(sheetDate)}</div>
                  <div className="sheet-week">
                    {dayEvents[0] ? dayEvents[0].week : ''}
                    <Paw size={11} className="inline-paw" />
                  </div>
                </div>
                <button className="sheet-close" onClick={closeSheet} aria-label="Закрыть">✕</button>
              </div>
              <div className="sheet-mood">
                <CatFace size={20} className="cat" />
                {catMood(dayMin)}
              </div>
              {dayEvents.map((ev) => (
                  <div className="shift-card" key={ev.id}>
                    <div className="shift-time">{ev.start}–{ev.end}</div>
                    <div className="shift-dur">{fmtDur(ev.minutes)}</div>
                  </div>
              ))}
              <div className="sheet-total">Итого за день: {fmtDur(dayMin)}</div>
              <button className="btn primary" onClick={() => downloadICS(dayEvents, `smena_${sheetDate}.ics`)}>
                Добавить день в календарь (.ics)
              </button>
              <button className="btn secondary wide" onClick={closeSheet}>Готово</button>
            </div>
        )}
      </div>
  );
}