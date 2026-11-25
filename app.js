'use strict';

// ---------- Хранилище ----------
const STORAGE_KEY = 'zadachnik.tasks.v1';

function loadTasks() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; } catch { return []; }
}
function saveTasks() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks)); } catch {}
}
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

let tasks = loadTasks();
let view = 'active';   // 'active' | 'done'
let filter = 'all';    // 'all' | 'in_progress' | 'todo'
let editingId = null;

// ---------- Даты и приоритет ----------
const DAY = 86400000;
const MONTHS = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
const WEEKDAYS = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];

const toISODate = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const parseDate = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const startOfToday = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };

// Момент дедлайна: дата + время, либо конец дня
function dueTs(t) {
  if (!t.due) return Infinity;
  const d = parseDate(t.due);
  if (t.time) { const [h, m] = t.time.split(':').map(Number); d.setHours(h, m); }
  else d.setHours(23, 59, 59);
  return d.getTime();
}
const daysLeft = t => Math.round((parseDate(t.due) - startOfToday()) / DAY);

// Уровень срочности — он и есть приоритет задачи
function urgency(t) {
  if (!t.due) return 'none';
  if (dueTs(t) < Date.now()) return 'overdue';
  const d = daysLeft(t);
  if (d === 0) return 'today';
  if (d <= 2) return 'soon';
  if (d <= 7) return 'week';
  return 'later';
}

const GROUPS = {
  overdue: 'Просрочено',
  today: 'Сегодня',
  tomorrow: 'Завтра',
  week: 'Ближайшие 7 дней',
  later: 'Позже',
  none: 'Без срока',
};
function groupOf(t) {
  if (!t.due) return 'none';
  if (dueTs(t) < Date.now()) return 'overdue';
  const d = daysLeft(t);
  if (d === 0) return 'today';
  if (d === 1) return 'tomorrow';
  if (d <= 7) return 'week';
  return 'later';
}
const GROUP_COLOR = { overdue: 'overdue', today: 'today', tomorrow: 'soon', week: 'week', later: 'later', none: 'none' };

function fmtDate(d) { return `${d.getDate()} ${MONTHS[d.getMonth()]}, ${WEEKDAYS[d.getDay()]}`; }

function dueLabel(t) {
  if (!t.due) return 'Без срока';
  const d = daysLeft(t);
  const time = t.time ? `, ${t.time}` : '';
  if (dueTs(t) < Date.now()) {
    if (d === 0) return `Просрочено · сегодня${time}`;
    return `Просрочено на ${-d} дн.`;
  }
  if (d === 0) return `Сегодня${time}`;
  if (d === 1) return `Завтра${time}`;
  return `${fmtDate(parseDate(t.due))}${time} · через ${d} дн.`;
}

function byPriority(a, b) {
  return dueTs(a) - dueTs(b)
    || (b.status === 'in_progress') - (a.status === 'in_progress')
    || a.createdAt - b.createdAt;
}

// ---------- Рендер ----------
const $ = s => document.querySelector(s);
const esc = s => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const ICON_CHECK = '<svg viewBox="0 0 24 24" width="16" height="16"><path d="M5 12.5l4.5 4.5L19 7.5" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>';
const ICON_PLAY = '<svg viewBox="0 0 24 24" width="22" height="22"><path d="M8 5.5v13l10.5-6.5z" fill="currentColor"/></svg>';
const ICON_PAUSE = '<svg viewBox="0 0 24 24" width="22" height="22"><path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" fill="currentColor"/></svg>';

function taskHTML(t) {
  const done = t.status === 'done';
  const urg = done ? 'later' : urgency(t);
  const meta = done
    ? `<span>Выполнено ${fmtDate(new Date(t.doneAt))}</span>${t.due ? `<span>· срок ${fmtDate(parseDate(t.due))}</span>` : ''}`
    : `<span class="due">${dueLabel(t)}</span>${t.status === 'in_progress' ? '<span class="badge">В работе</span>' : ''}`;
  const progBtn = done ? '' :
    `<button class="prog" data-act="progress" aria-label="${t.status === 'in_progress' ? 'Пауза' : 'Взять в работу'}">${t.status === 'in_progress' ? ICON_PAUSE : ICON_PLAY}</button>`;
  return `
    <li class="task u-${urg} ${done ? 'is-done' : ''} ${t.status === 'in_progress' ? 'is-progress' : ''}" data-id="${t.id}">
      <button class="check" data-act="toggle" aria-label="${done ? 'Вернуть в работу' : 'Выполнено'}">${ICON_CHECK}</button>
      <div class="body" data-act="edit">
        <div class="title">${esc(t.title)}</div>
        ${t.notes ? `<div class="notes">${esc(t.notes)}</div>` : ''}
        <div class="meta">${meta}</div>
      </div>
      ${progBtn}
    </li>`;
}

function renderGroups(groups) {
  return groups.map(([key, title, items, color]) => `
    <section>
      <h3 class="group-title g-${key}" style="--c: var(--u-${color})"><span class="dot"></span>${title}<span class="count">${items.length}</span></h3>
      <ul class="tasks">${items.map(taskHTML).join('')}</ul>
    </section>`).join('');
}

function render() {
  const active = tasks.filter(t => t.status !== 'done');
  const done = tasks.filter(t => t.status === 'done');
  const overdue = active.filter(t => urgency(t) === 'overdue').length;
  const inProgress = active.filter(t => t.status === 'in_progress').length;

  $('#activeCount').textContent = overdue || '';
  $('#doneCount').textContent = done.length || '';
  document.querySelectorAll('.tab').forEach(b => b.classList.toggle('active', b.dataset.view === view));
  $('#filters').hidden = view !== 'active';
  $('#clearDone').hidden = view !== 'done' || !done.length;
  $('#addBtn').hidden = view !== 'active';

  const list = $('#list');

  if (view === 'active') {
    $('#screenTitle').textContent = 'Задачи';
    $('#stats').innerHTML = active.length
      ? `${active.length} активн. · ${inProgress} в работе${overdue ? ` · <b>${overdue} просрочено</b>` : ''}`
      : 'Нет активных задач';
    document.querySelectorAll('#filters .chip').forEach(c => c.classList.toggle('active', c.dataset.filter === filter));

    const shown = active.filter(t => filter === 'all' || t.status === filter).sort(byPriority);
    if (!shown.length) {
      list.innerHTML = `<div class="empty"><div class="big">${active.length ? '🔍' : '🎉'}</div>${active.length ? 'В этом фильтре пусто' : 'Всё сделано! Нажмите «+», чтобы добавить задачу'}</div>`;
      return;
    }
    const buckets = {};
    shown.forEach(t => (buckets[groupOf(t)] ||= []).push(t));
    list.innerHTML = renderGroups(Object.keys(GROUPS).filter(k => buckets[k]).map(k => [k, GROUPS[k], buckets[k], GROUP_COLOR[k]]));
  } else {
    $('#screenTitle').textContent = 'Выполненные';
    $('#stats').textContent = done.length ? `Всего выполнено: ${done.length}` : '';
    if (!done.length) {
      list.innerHTML = '<div class="empty"><div class="big">📋</div>Здесь появятся выполненные задачи</div>';
      return;
    }
    // Группируем по дню выполнения, свежие сверху
    const today = startOfToday().getTime();
    const groups = [];
    done.sort((a, b) => b.doneAt - a.doneAt).forEach(t => {
      const day = new Date(t.doneAt); day.setHours(0, 0, 0, 0);
      const diff = Math.round((today - day.getTime()) / DAY);
      const title = diff === 0 ? 'Сегодня' : diff === 1 ? 'Вчера' : fmtDate(day);
      const last = groups[groups.length - 1];
      if (last && last[1] === title) last[2].push(t);
      else groups.push(['done', title, [t], 'later']);
    });
    list.innerHTML = renderGroups(groups);
  }
}

// ---------- Действия ----------
let undoSnapshot = null;
let toastTimer = null;

function showToast(text, snapshot) {
  undoSnapshot = snapshot;
  $('#toastText').textContent = text;
  $('#toastUndo').hidden = !snapshot;
  $('#toast').hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { $('#toast').hidden = true; undoSnapshot = null; }, 4000);
}

function commit() { saveTasks(); render(); }
const snapshot = () => JSON.parse(JSON.stringify(tasks));

function setStatus(t, status) {
  t.status = status;
  t.doneAt = status === 'done' ? Date.now() : null;
}

$('#list').addEventListener('click', e => {
  const el = e.target.closest('[data-act]');
  if (!el) return;
  const t = tasks.find(x => x.id === el.closest('.task').dataset.id);
  if (!t) return;
  const act = el.dataset.act;

  if (act === 'toggle') {
    const snap = snapshot();
    if (t.status === 'done') { setStatus(t, 'todo'); showToast('Задача возвращена', snap); }
    else { setStatus(t, 'done'); showToast('Задача выполнена ✓', snap); }
    if (navigator.vibrate) navigator.vibrate(10);
    commit();
  } else if (act === 'progress') {
    setStatus(t, t.status === 'in_progress' ? 'todo' : 'in_progress');
    commit();
  } else if (act === 'edit') {
    openSheet(t);
  }
});

$('#toastUndo').addEventListener('click', () => {
  if (undoSnapshot) { tasks = undoSnapshot; undoSnapshot = null; commit(); }
  $('#toast').hidden = true;
});

document.querySelectorAll('.tab').forEach(b => b.addEventListener('click', () => {
  view = b.dataset.view; render(); window.scrollTo({ top: 0 });
}));
$('#filters').addEventListener('click', e => {
  const c = e.target.closest('.chip'); if (!c) return;
  filter = c.dataset.filter; render();
});
$('#clearDone').addEventListener('click', () => {
  const n = tasks.filter(t => t.status === 'done').length;
  if (!confirm(`Удалить все выполненные задачи (${n})?`)) return;
  const snap = snapshot();
  tasks = tasks.filter(t => t.status !== 'done');
  commit();
  showToast('Выполненные удалены', snap);
});

// ---------- Форма ----------
const form = $('#sheet');
let formStatus = 'todo';

function setFormStatus(s) {
  formStatus = s;
  document.querySelectorAll('#statusSeg button').forEach(b => b.classList.toggle('active', b.dataset.status === s));
}
function markQuickDate() {
  const due = form.due.value;
  document.querySelectorAll('#quickDates .chip').forEach(c => {
    const v = c.dataset.days === '' ? '' : toISODate(new Date(startOfToday().getTime() + Number(c.dataset.days) * DAY));
    c.classList.toggle('active', v === due);
  });
}

function openSheet(t = null) {
  editingId = t ? t.id : null;
  $('#sheetTitle').textContent = t ? 'Задача' : 'Новая задача';
  form.title.value = t ? t.title : '';
  form.notes.value = t ? (t.notes || '') : '';
  form.due.value = t ? (t.due || '') : toISODate(new Date());
  form.time.value = t ? (t.time || '') : '';
  setFormStatus(t ? t.status : 'todo');
  markQuickDate();
  $('#deleteBtn').hidden = !t;
  $('#backdrop').hidden = false;
  form.hidden = false;
  if (!t) setTimeout(() => form.title.focus(), 250);
}
function closeSheet() {
  form.hidden = true;
  $('#backdrop').hidden = true;
  editingId = null;
}

$('#addBtn').addEventListener('click', () => openSheet());
$('#closeSheet').addEventListener('click', closeSheet);
$('#backdrop').addEventListener('click', closeSheet);
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !form.hidden) closeSheet(); });

$('#quickDates').addEventListener('click', e => {
  const c = e.target.closest('.chip'); if (!c) return;
  form.due.value = c.dataset.days === '' ? '' : toISODate(new Date(startOfToday().getTime() + Number(c.dataset.days) * DAY));
  if (!form.due.value) form.time.value = '';
  markQuickDate();
});
form.due.addEventListener('change', markQuickDate);
$('#statusSeg').addEventListener('click', e => {
  const b = e.target.closest('button'); if (b) setFormStatus(b.dataset.status);
});

form.addEventListener('submit', e => {
  e.preventDefault();
  const title = form.title.value.trim();
  if (!title) return;
  const data = {
    title,
    notes: form.notes.value.trim(),
    due: form.due.value || null,
    time: form.due.value ? (form.time.value || null) : null,
  };
  if (editingId) {
    const t = tasks.find(x => x.id === editingId);
    Object.assign(t, data);
    if (t.status !== formStatus) setStatus(t, formStatus);
  } else {
    const t = { id: uid(), createdAt: Date.now(), ...data };
    setStatus(t, formStatus);
    tasks.push(t);
  }
  closeSheet();
  commit();
});

$('#deleteBtn').addEventListener('click', () => {
  const snap = snapshot();
  tasks = tasks.filter(t => t.id !== editingId);
  closeSheet();
  commit();
  showToast('Задача удалена', snap);
});

// ---------- Старт ----------
// Обновляем метки «сегодня/просрочено» раз в минуту и при возврате в приложение
setInterval(render, 60000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) render(); });
render();

if ('serviceWorker' in navigator && window.isSecureContext) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

// Просим браузер не стирать задачи при нехватке места на устройстве
if (navigator.storage && navigator.storage.persist) {
  navigator.storage.persist().catch(() => {});
}
