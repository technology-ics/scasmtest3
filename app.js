/* SCS ASM 2026 interactive scientific programme. Vanilla JS, no dependencies. */
(function () {
  'use strict';
  const D = window.SCSData;
  if (!D) throw new Error('data.js must be loaded before app.js');
  const $ = id => document.getElementById(id);
  const els = {
    search: $('search-input'), searchForm: $('search-form'), clearSearch: $('clear-search'),
    track: $('track-filter'), room: $('room-filter'), type: $('type-filter'),
    clear: $('clear-filters'), chips: $('active-filters'), tabs: $('day-buttons'),
    count: $('result-count'), output: $('programme-output'),
    agenda: $('agenda-button'), timetable: $('timetable-button'),
    refresh: $('refresh-button'), notice: $('data-notice'),
    dialog: $('detail-dialog'), close: $('close-dialog'), content: $('dialog-content')
  };
  let dataset = null;
  let requestNumber = 0;
  let activeRequest = null;
  let searchTimer = 0;
  let openedInApp = false;
  let lastTrigger = null;
  const mobileRooms = new Map();
  let scrollBeforeDialog = 0;
  let state = readURL();

  const html = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const time = m => Number.isInteger(m) ? D.displayTime(m) : 'Time not specified';
  const timeSpan = (start, end) => start === null && end === null ? 'Time not specified' : `${start === null ? '—' : time(start)}${end === null ? '' : ' – ' + time(end)}`;
  const normalizeQuery = q => D.searchText(q).trim();
  const findSession = id => dataset?.sessionById.get(id);
  const findSpeaker = id => dataset?.speakerById.get(id);
  const hasQuery = () => !!normalizeQuery(state.q);
  const viewingDay = () => state.day === 'all' ? '' : (state.day || (!hasQuery() && dataset?.dates[0]) || '');
  const trackClass = value => /^\d+$/.test(value) && Number(value) >= 1 && Number(value) <= 5 ? `track-${Number(value)}` : '';
  const getDate = date => D.displayDate(date);

  function readURL() {
    const params = new URLSearchParams(location.search);
    return {
      q: params.get('q') || '', day: params.get('day') || '',
      track: params.get('track') || '', room: params.get('room') || '',
      type: params.get('type') || '', view: params.get('view') === 'timetable' ? 'timetable' : 'agenda',
      session: params.get('session') || '', speaker: params.get('speaker') || ''
    };
  }
  function urlFor(next) {
    const url = new URL(location.href);
    // Keep unrelated hosting parameters; only manage our own keys.
    for (const key of ['q','day','track','room','type','view','session','speaker']) url.searchParams.delete(key);
    for (const key of ['q','day','track','room','type','session','speaker']) if (next[key]) url.searchParams.set(key, next[key]);
    if (next.view !== 'agenda') url.searchParams.set('view', next.view);
    return url.pathname + url.search + url.hash;
  }
  function change(partial, mode = 'push') {
    const onlyDetail = Object.keys(partial).every(key => key === 'session' || key === 'speaker');
    state = { ...state, ...partial };
    history[mode === 'replace' ? 'replaceState' : 'pushState']({ scs: true }, '', urlFor(state));
    if (onlyDetail) syncDialog();
    else render();
  }
  function syncControls() {
    if (els.search.value !== state.q) els.search.value = state.q;
    els.clearSearch.hidden = !state.q;
    for (const key of ['track','room','type']) if (els[key].value !== state[key]) els[key].value = state[key];
    els.agenda.classList.toggle('is-active', state.view === 'agenda');
    els.timetable.classList.toggle('is-active', state.view === 'timetable');
    els.agenda.setAttribute('aria-pressed', String(state.view === 'agenda'));
    els.timetable.setAttribute('aria-pressed', String(state.view === 'timetable'));
  }
  function options(select, options, label, includeBlank) {
    select.replaceChildren();
    select.add(new Option(label, ''));
    options.forEach(option => {
      if (option) select.add(new Option(option, option));
      else if (includeBlank) select.add(new Option('Not assigned', '__blank__'));
    });
  }
  function initFilters() {
    options(els.track, dataset.tracks, 'All tracks', true);
    options(els.room, dataset.rooms, 'All rooms', true);
    options(els.type, dataset.types.filter(Boolean), 'All types', false);
  }
  function dayButtons() {
    const day = viewingDay();
    const dates = dataset?.dates || D.CONFIG.conferenceDates;
    const allActive = !day;
    const allTab = `<button type="button" class="day-tab ${allActive ? 'is-active' : ''}" data-day="all" aria-pressed="${allActive}">All days<small>Entire programme</small></button>`;
    els.tabs.innerHTML = allTab + dates.map(date => {
      const active = day === date;
      const [year, month, dayNum] = date.split('-').map(Number);
      const weekday = new Intl.DateTimeFormat('en-SG',{ weekday: 'long', timeZone:'UTC' }).format(new Date(Date.UTC(year,month-1,dayNum)));
      return `<button type="button" class="day-tab ${active ? 'is-active' : ''}" data-day="${html(date)}" aria-pressed="${active}">${html(weekday)}<small>${dayNum} April ${year}</small></button>`;
    }).join('');
  }
  function filterChips() {
    const labels = [
      ['q', 'Search: ' + state.q], ['day', 'Day: ' + (state.day === 'all' ? 'All days' : (state.day ? getDate(state.day) : ''))],
      ['track', 'Track: ' + (state.track === '__blank__' ? 'Not assigned' : state.track)],
      ['room', 'Room: ' + (state.room === '__blank__' ? 'Not assigned' : state.room)],
      ['type', 'Type: ' + state.type]
    ].filter(([key]) => !!state[key]);
    els.chips.hidden = !labels.length;
    els.chips.innerHTML = labels.map(([key,label]) => `<button class="filter-chip" type="button" data-remove="${key}" aria-label="Remove ${html(label)} filter"><span>${html(label)}</span><strong aria-hidden="true">×</strong></button>`).join('');
  }
  function fieldMatches(actual, expected) {
    if (!expected) return true;
    return expected === '__blank__' ? !actual : actual === expected;
  }
  function matchingSessions() {
    const query = normalizeQuery(state.q);
    const date = viewingDay();
    return dataset.sessions.filter(session =>
      (!date || session.date === date) &&
      fieldMatches(session.track, state.track) &&
      fieldMatches(session.room, state.room) &&
      (!state.type || session.presentations.some(p => p.type === state.type)) &&
      (!query || session.searchIndex.includes(query))
    );
  }
  function highlight(value) {
    const original = String(value ?? '');
    const query = normalizeQuery(state.q);
    if (!query) return html(original);
    // Normalize one code point at a time to retain offsets into the unmodified source.
    let normalized = ''; const startAt = [], endAt = [];
    for (const char of original) {
      const pos = endAt.length ? endAt[endAt.length - 1] : 0;
      const folded = D.searchText(char);
      for (let i = 0; i < folded.length; i++) { normalized += folded[i]; startAt.push(pos); endAt.push(pos + char.length); }
      if (!folded.length && endAt.length) endAt[endAt.length - 1] = pos + char.length;
    }
    const position = normalized.indexOf(query);
    if (position < 0) return html(original);
    const start = startAt[position], end = endAt[position + query.length - 1];
    return html(original.slice(0,start)) + '<mark>' + html(original.slice(start,end)) + '</mark>' + html(original.slice(end));
  }
  function heading(date, length) {
    return `<div class="day-heading"><h3>${html(getDate(date))}</h3><span class="line" aria-hidden="true"></span><span class="day-count">${length} session${length !== 1 ? 's' : ''}</span></div>`;
  }
  function sessionCard(session) {
    return `<article class="session-card ${trackClass(session.track)}">
      <span class="card-accent" aria-hidden="true"></span>
      <div class="card-time"><strong>${session.start === null ? 'TBC' : html(time(session.start))}</strong><span>${session.end === null ? '' : 'to ' + html(time(session.end))}</span></div>
      <button class="session-open" type="button" data-session="${html(session.id)}" aria-label="Open ${html(session.name)}, ${html(timeSpan(session.start,session.end))}">
        <span class="session-card-main"><strong class="session-name">${highlight(session.name)}</strong><span class="session-meta">${session.room ? `<span>⌖ ${highlight(session.room)}</span>` : '<span>Room not assigned</span>'}${session.track ? `<span>Track ${html(session.track)}</span>` : ''}<span>${session.presentations.length} contribution${session.presentations.length === 1 ? '' : 's'}</span></span></span>
        <span class="arrow" aria-hidden="true">↗</span>
      </button></article>`;
  }
  function renderAgenda(sessions) {
    const groups = new Map();
    sessions.forEach(s => { if (!groups.has(s.date)) groups.set(s.date,[]); groups.get(s.date).push(s); });
    return Array.from(groups, ([date,items]) => heading(date,items.length) + `<div class="agenda-list">${items.map(sessionCard).join('')}</div>`).join('');
  }
  function overlappingSlots(sessions) {
    // Partition interval graphs into overlap clusters; assign each a genuine horizontal lane.
    const sorted = sessions.slice().sort((a,b)=>a.start-b.start || a.end-b.end || a.name.localeCompare(b.name));
    let active = [], cluster = [], all = [];
    const completeCluster = () => {
      if (!cluster.length) return;
      const ends = [];
      const assigned = cluster.map(s => {
        let lane = ends.findIndex(t => t <= s.start);
        if (lane < 0) lane = ends.length;
        ends[lane] = s.end;
        return { session: s, lane };
      });
      assigned.forEach(x => all.push({ ...x, count: ends.length }));
      cluster = [];
    };
    for (const item of sorted) {
      active = active.filter(x => x.end > item.start);
      if (!active.length) completeCluster();
      cluster.push(item); active.push(item);
    }
    completeCluster();
    return all;
  }
  function renderTimeDay(day, sessions) {
    const usable = sessions.filter(s => s.start !== null && s.end !== null && s.end > s.start);
    const untimed = sessions.filter(s => !usable.includes(s));
    if (!usable.length) return `${heading(day,sessions.length)}<p class="untimed-note">These sessions have no usable time interval; shown as an agenda.</p><div class="agenda-list">${untimed.map(sessionCard).join('')}</div>`;
    const rooms = [...new Set(usable.map(s => s.room || 'Room not assigned'))].sort((a,b)=>a.localeCompare(b,undefined,{numeric:true}));
    const start = Math.floor(Math.min(...usable.map(s => s.start))/30)*30;
    const end = Math.ceil(Math.max(...usable.map(s => s.end))/30)*30;
    const pixelsPerMinute = 1.5;
    const height = (end-start)*pixelsPerMinute;
    const storedRoom = mobileRooms.get(day);
    const roomChosen = rooms.includes(storedRoom) ? storedRoom : rooms[0];
    const hours = [];
    for (let m = Math.ceil(start/60)*60; m <= end; m += 60) hours.push(`<span class="hour-tick" style="top:${(m-start)*pixelsPerMinute}px">${html(time(m))}</span>`);
    const selector = `<div class="mobile-room-picker"><label for="mobile-room-${html(day)}">Show room</label><select id="mobile-room-${html(day)}" data-room-day="${html(day)}">${rooms.map(room=>`<option value="${html(room)}" ${room === roomChosen ? 'selected' : ''}>${html(room)}</option>`).join('')}</select></div>`;
    const headers = rooms.map(room=>`<div class="room-header ${room===roomChosen ? 'mobile-selected' : ''}">${html(room)}</div>`).join('');
    const lanes = rooms.map(room => {
      const slots = overlappingSlots(usable.filter(s => (s.room || 'Room not assigned') === room));
      return `<div class="lane ${room===roomChosen ? 'mobile-selected' : ''}">${slots.map(({session:s,lane,count})=>{
        const top = (s.start-start)*pixelsPerMinute, h = (s.end-s.start)*pixelsPerMinute;
        return `<button type="button" class="slot ${trackClass(s.track)} ${h<55?'slot--compact':''}" data-session="${html(s.id)}" title="${html(s.name)} · ${html(timeSpan(s.start,s.end))}" aria-label="${html(s.name)}, ${html(timeSpan(s.start,s.end))}, ${html(room)}" style="top:${top}px;height:${h}px;left:calc(${lane*100/count}% + 2px);width:calc(${100/count}% - 4px)"><span class="slot-time">${html(time(s.start))}–${html(time(s.end))}</span><strong>${highlight(s.name)}</strong></button>`;
      }).join('')}</div>`;
    }).join('');
    return `${heading(day,sessions.length)}<div class="timetable-intro"><span>Actual session durations · sessions sharing a room appear side by side</span>${selector}</div>
      <div class="timetable-scroller" tabindex="0" aria-label="Timetable for ${html(getDate(day))}; horizontally scroll on desktop to view rooms">
      <div class="timetable" style="--room-count:${rooms.length};--timeline-height:${height}px;--hour-height:${60*pixelsPerMinute}px">
        <div class="timetable-headers"><span class="time-header">SGT</span>${headers}</div>
        <div class="timeline-body"><div class="hour-column">${hours.join('')}</div>${lanes}</div>
      </div></div>${untimed.length ? `<p class="untimed-note">${untimed.length} session${untimed.length===1?'':'s'} without valid start/end times (shown below).</p><div class="agenda-list">${untimed.map(sessionCard).join('')}</div>` : ''}`;
  }
  function renderTimetable(sessions) {
    const groups = new Map();
    sessions.forEach(s=> { if (!groups.has(s.date)) groups.set(s.date,[]); groups.get(s.date).push(s); });
    return Array.from(groups, ([date,items]) => renderTimeDay(date,items)).join('');
  }
  function showNotice(message, type = '') {
    els.notice.hidden = !message;
    els.notice.className = 'data-notice ' + type;
    els.notice.textContent = message;
  }
  function clearAll() {
    change({q:'',day:'',track:'',room:'',type:'',session:'',speaker:''});
  }
  function renderSpeakerMatches() {
    const q = normalizeQuery(state.q);
    if (!q || q.length < 2) return '';
    const speakers = dataset.speakers.filter(p => D.searchText(p.name).includes(q));
    if (!speakers.length) return '';
    const top = speakers.slice(0, 10);
    return `<section class="speaker-results" aria-label="Matching speakers"><div class="speaker-results-top"><strong>Matching speakers</strong><span>${speakers.length} found</span></div><div class="speaker-results-list">${top.map(p =>
      `<button type="button" data-speaker="${html(p.id)}" class="speaker-result"><strong>${highlight(p.name)}</strong><span>${p.contributions.length} contribution${p.contributions.length === 1 ? '' : 's'} · ${html(p.organization || 'No affiliation provided')}</span></button>`
    ).join('')}</div>${speakers.length > 10 ? '<p class="speaker-results-more">Refine your search to see more speakers.</p>' : ''}</section>`;
  }
  function render() {
    const focused = document.activeElement;
    const focusedDay = focused?.dataset?.day;
    const focusClearedChip = focused?.hasAttribute('data-remove') || focused?.hasAttribute('data-clear-all');
    syncControls();
    dayButtons();
    filterChips();
    if (!dataset) { syncDialog(); return; }
    const matches = matchingSessions();
    const daySuffix = viewingDay() ? ' on ' + getDate(viewingDay()) : ' across all days';
    els.count.innerHTML = `<strong>${matches.length}</strong> of ${dataset.sessions.length} sessions${html(daySuffix)}`;
    els.output.setAttribute('aria-busy','false');
    if (!matches.length) els.output.innerHTML = `<div class="empty-state"><strong>No sessions match these filters</strong><p>Try a different speaker name, topic, track or day.</p><button type="button" class="detail-action" data-clear-all>Clear all filters</button></div>`;
    else els.output.innerHTML = renderSpeakerMatches() + (state.view === 'agenda' ? renderAgenda(matches) : renderTimetable(matches));
    syncDialog();
    // Rebuilding day tabs or active chips must not strand keyboard focus.
    if (focusedDay !== undefined) {
      const nextTab = Array.from(els.tabs.querySelectorAll('[data-day]')).find(button => button.dataset.day === focusedDay);
      nextTab?.focus({preventScroll:true});
    } else if (focusClearedChip) els.clear.focus({preventScroll:true});
  }
  function sanitizedDescription(source) {
    // Strict allowlist: only source <br> tags are interpreted as new lines. All other
    // markup is displayed as text; no source HTML or attributes can become DOM elements.
    const lines = String(source || '').replace(/<br\s*\/?>/gi, '\n').replace(/<\/p\s*>/gi,'\n')
      .replace(/<p(?:\s[^>]*)?>/gi,'').split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
    return lines.map(x=>`<p>${html(x)}</p>`).join('');
  }
  function presentationHTML(p) {
    const speaker = p.speakerId ? `<button type="button" class="speaker-link" data-speaker="${html(p.speakerId)}" aria-label="View all contributions by ${html(p.speakerName)}">${highlight(p.speakerName)}</button>` : '';
    return `<div class="presentation"><div class="presentation-time">${p.start === null ? 'Time TBC' : html(time(p.start))}${p.end === null ? '' : `<div class="time-end">to ${html(time(p.end))}</div>`}</div>
      <div class="presentation-main"><div class="presentation-title">${p.title ? highlight(p.title) : (p.type ? html(p.type) : 'Conference role / contribution')}</div>
      ${p.type ? `<span class="presentation-type">${html(p.type)}</span>` : ''}
      ${speaker ? `<div>${speaker}</div>` : ''}${p.organization ? `<div class="speaker-org">${highlight(p.organization)}</div>` : ''}</div></div>`;
  }
  function sessionDetails(s) {
    const description = sanitizedDescription(s.details);
    const target = urlFor({ ...state, session:s.id, speaker:'' });
    const shareURL = location.origin === 'null' ? target : new URL(target, location.origin).href;
    return `<p class="detail-label">${s.code ? html(s.code) + ' · ' : ''}Session details</p><h2 id="dialog-title">${highlight(s.name)}</h2>
      <div class="detail-facts"><span>▦ ${html(getDate(s.date))}</span><span>◷ ${html(timeSpan(s.start,s.end))} SGT</span>
      <span>⌖ ${html(s.room || 'Room not assigned')}</span>${s.track ? `<span>Track ${html(s.track)}</span>` : ''}</div>
      ${description ? `<h3 class="detail-section-title">About this session</h3><div class="detail-description">${description}</div>` : ''}
      <h3 class="detail-section-title">Presentations &amp; roles (${s.presentations.length})</h3>
      <div class="presentations-list">${s.presentations.map(presentationHTML).join('')}</div>
      <div class="detail-footer"><button class="detail-action" data-share="${html(shareURL)}" type="button">Copy session link</button><button class="detail-action secondary" data-print type="button">Print details</button></div>`;
  }
  function speakerDetails(p) {
    return `<p class="detail-label">Speaker profile</p><h2 id="dialog-title">${html(p.name)}</h2><p class="speaker-subtitle">${html(p.organization || 'Affiliation not provided')}</p>
      <h3 class="detail-section-title">Conference contributions (${p.contributions.length})</h3>
      ${p.contributions.map(c => {
        const s = findSession(c.sessionId);
        return `<div class="speaker-appearance"><span class="detail-label">${html(getDate(s.date))} · ${html(timeSpan(c.start,c.end))}</span>
          <h3><button type="button" class="inline-session-link" data-session="${html(s.id)}">${html(s.name)}</button></h3>
          <p>${html(c.title || c.type || 'Conference role / contribution')}${c.type ? ' · '+html(c.type) : ''}</p>
          <p>${html(s.room || 'Room not assigned')}</p></div>`;
      }).join('')}`;
  }
  function syncDialog() {
    const s = findSession(state.session), p = findSpeaker(state.speaker);
    if (!s && !p) {
      if (els.dialog.open) { els.dialog.close(); requestAnimationFrame(()=> lastTrigger?.isConnected && lastTrigger.focus({preventScroll:true})); }
      return;
    }
    els.content.innerHTML = s ? sessionDetails(s) : speakerDetails(p);
    if (!els.dialog.open) {
      scrollBeforeDialog = window.scrollY;
      els.dialog.showModal();
      els.close.focus({preventScroll:true});
    } else {
      els.close.focus({preventScroll:true});
      els.content.scrollTop = 0;
    }
  }
  function openDetail(type, id, trigger) {
    if (!dataset || (type === 'session' && !findSession(id)) || (type === 'speaker' && !findSpeaker(id))) return;
    if (!els.dialog.open) lastTrigger = trigger || document.activeElement;
    openedInApp = true;
    change(type === 'session' ? { session:id, speaker:'' } : { speaker:id, session:'' });
  }
  function closeDetail() {
    if (!state.session && !state.speaker) return;
    if (openedInApp && history.length > 1) {
      openedInApp = false;
      history.back();
    } else {
      change({session:'',speaker:''},'replace');
    }
  }
  async function fetchCSV(url, signal) {
    const address = new URL(url, location.href);
    address.searchParams.set('_scs_refresh', String(Date.now()));
    const response = await fetch(address.href, { signal, mode:'cors', cache:'no-store' });
    if (!response.ok) throw new Error(`Google Sheets returned HTTP ${response.status}.`);
    const text = await response.text();
    if (!text.trim()) throw new Error('The published CSV is empty.');
    return text;
  }
  async function loadProgramme() {
    const id = ++requestNumber;
    if (activeRequest) activeRequest.abort();
    activeRequest = new AbortController();
    els.refresh.disabled = true;
    showNotice('');
    if (!dataset) {
      els.output.setAttribute('aria-busy','true');
      els.output.innerHTML = '<div class="loading-state"><span class="spinner" aria-hidden="true"></span><strong>Loading programme…</strong><p>Fetching the published Google Sheet.</p></div>';
    }
    let source = 'live';
    try {
      let csv;
      try { csv = await fetchCSV(D.CONFIG.csvUrl, activeRequest.signal); }
      catch (liveError) {
        if (!D.CONFIG.snapshotUrl || activeRequest.signal.aborted) throw liveError;
        source = 'snapshot';
        csv = await fetchCSV(D.CONFIG.snapshotUrl, activeRequest.signal);
      }
      if (id !== requestNumber) return;
      const mapped = D.mapRecords(D.parseCSV(csv));
      const result = D.normalizeRecords(mapped.records,mapped.warnings);
      if (!result.sessions.length) throw new Error('No usable sessions were found. Check the spreadsheet headers and dates.');
      dataset = result;
      initFilters();
      if (source === 'snapshot') showNotice('Live Google Sheets could not be reached. This programme is showing an administrator-provided static snapshot, not guaranteed to be current.');
      else if (result.rejected.length) showNotice(`${result.rejected.length} incomplete row(s) were skipped. Please check the source spreadsheet.`);
      else if (result.collisions.length) showNotice(`${result.collisions.length} same-room scheduling conflict(s) are present in the spreadsheet; sessions are displayed as provided.`);
      render();
      console.info('[SCS ASM 2026] data loaded', { source, ...result.stats, schedulingConflicts:result.collisions, warnings:result.warnings, rejected:result.rejected });
    } catch (error) {
      if (id !== requestNumber || error.name === 'AbortError') return;
      console.error('[SCS ASM 2026] data load failed',error);
      showNotice(`Unable to load the live conference programme. ${error.message} Check internet access, Google Sheets publishing and CORS permissions; then select Refresh programme.`, 'error');
      if (!dataset) {
        els.output.setAttribute('aria-busy','false');
        els.output.innerHTML = `<div class="empty-state"><strong>Programme unavailable</strong><p>We couldn't fetch the published spreadsheet. No offline schedule has been substituted.</p><button type="button" class="detail-action" data-retry>Try again</button></div>`;
        els.count.textContent = 'Live data unavailable';
      }
    } finally {
      if (id === requestNumber) { els.refresh.disabled = false; activeRequest = null; }
    }
  }

  els.searchForm.addEventListener('submit', event=>event.preventDefault());
  els.search.addEventListener('input', () => {
    clearTimeout(searchTimer);
    const q = els.search.value;
    els.clearSearch.hidden = !q;
    searchTimer = setTimeout(() => change({q},'replace'), 140);
  });
  els.clearSearch.addEventListener('click', () => { clearTimeout(searchTimer); change({q:''}); els.search.focus(); });
  for (const key of ['track','room','type']) els[key].addEventListener('change',()=>change({[key]:els[key].value}));
  els.clear.addEventListener('click',clearAll);
  els.refresh.addEventListener('click',loadProgramme);
  els.agenda.addEventListener('click',()=>change({view:'agenda'}));
  els.timetable.addEventListener('click',()=>change({view:'timetable'}));
  els.tabs.addEventListener('click',event=> {
    const button = event.target.closest('[data-day]');
    if (button) { change({day:button.dataset.day}); }
  });
  els.chips.addEventListener('click',event => {
    const button = event.target.closest('[data-remove]');
    if (button) change({[button.dataset.remove]:''});
  });
  els.output.addEventListener('click',event=> {
    const button = event.target.closest('[data-session], [data-speaker], [data-clear-all], [data-retry]');
    if (!button) return;
    if (button.hasAttribute('data-session')) openDetail('session',button.dataset.session,button);
    else if (button.hasAttribute('data-speaker')) openDetail('speaker',button.dataset.speaker,button);
    else if (button.hasAttribute('data-clear-all')) clearAll();
    else if (button.hasAttribute('data-retry')) loadProgramme();
  });
  els.output.addEventListener('change',event=> {
    const day = event.target.dataset.roomDay;
    if (!day) return;
    mobileRooms.set(day, event.target.value);
    // Change selected room without clearing filters or moving the scroll position.
    render();
  });
  els.content.addEventListener('click',async event => {
    const speaker = event.target.closest('[data-speaker]');
    const session = event.target.closest('[data-session]');
    const copy = event.target.closest('[data-share]');
    if (speaker) openDetail('speaker',speaker.dataset.speaker,speaker);
    else if (session) openDetail('session',session.dataset.session,session);
    else if (event.target.closest('[data-print]')) window.print();
    else if (copy) {
      try { await navigator.clipboard.writeText(copy.dataset.share); copy.textContent='Link copied'; }
      catch { window.prompt('Copy this session link:',copy.dataset.share); }
    }
  });
  els.close.addEventListener('click',closeDetail);
  els.dialog.addEventListener('cancel',event=> { event.preventDefault(); closeDetail(); });
  window.addEventListener('popstate',()=> {
    clearTimeout(searchTimer);
    openedInApp = false;
    const previous = state;
    state = readURL();
    const displayChanged = ['q','day','track','room','type','view'].some(key => previous[key] !== state[key]);
    if (displayChanged) render(); else syncDialog();
  });
  window.addEventListener('pageshow',event=> { if (event.persisted) { state=readURL(); render(); } });
  // URL is the source of truth, including direct links refreshed from the browser.
  render();
  loadProgramme();
})();
