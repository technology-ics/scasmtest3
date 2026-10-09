/* SCS ASM 2026 - CSV parsing and normalization. No framework or dependencies. */
(function (global) {
  'use strict';

  const CONFIG = Object.freeze({
    csvUrl: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTtagaxqoB1rIc80p0q2Rp2BEregrRweuKCwYtPcouBE1FvPPvPyj0QoR-64yMAGuNn_392IreZnzbQ/pub?gid=0&single=true&output=csv',
    // Optional administrator-managed fallback. Leave empty for live-only operation.
    // To activate a deliberately labelled snapshot, set this to './programme-snapshot.csv'.
    snapshotUrl: '',
    timezone: 'Asia/Singapore',
    conferenceDates: ['2026-04-17', '2026-04-18', '2026-04-19']
  });

  const HEADERS = [
    'First Name', 'Last Name', 'Organization', 'Session - Name',
    'Session - Details', 'Session - Date', 'Session - Start Time',
    'Session - End Time', 'Session - Location', 'Session - Track',
    'Paper Title', 'Presentation Type', 'Presentation Start Time',
    'Presentation End Time'
  ];

  const clean = value => (value === null || value === undefined ? '' : String(value).trim());
  const keyText = value => clean(value).normalize('NFKC').replace(/\s+/g, ' ').toLocaleLowerCase('en');
  const searchText = value => keyText(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  /** RFC-4180-style CSV parser; accepts UTF-8 BOM, quoted commas, escaped quotes and multiline fields. */
  function parseCSV(input) {
    if (typeof input !== 'string') throw new TypeError('CSV response must be text');
    const source = input.replace(/^\uFEFF/, '');
    const rows = [];
    let row = [], field = '', quoted = false, atFieldStart = true;
    for (let i = 0; i < source.length; i++) {
      const c = source[i];
      if (quoted) {
        if (c === '"' && source[i + 1] === '"') { field += '"'; i++; }
        else if (c === '"') quoted = false;
        else field += c;
      } else if (c === '"' && atFieldStart) {
        quoted = true;
        atFieldStart = false;
      } else if (c === ',') {
        row.push(field); field = ''; atFieldStart = true;
      } else if (c === '\n' || c === '\r') {
        if (c === '\r' && source[i + 1] === '\n') i++;
        row.push(field);
        if (row.some(v => v.trim() !== '')) rows.push(row);
        row = []; field = ''; atFieldStart = true;
      } else {
        field += c; atFieldStart = false;
      }
    }
    if (quoted) throw new Error('CSV has an unclosed quoted field. Check the published spreadsheet.');
    row.push(field);
    if (row.some(v => v.trim() !== '')) rows.push(row);
    return rows;
  }

  function mapRecords(rows) {
    if (!rows.length) throw new Error('The published spreadsheet is empty.');
    const sourceHeaders = rows[0].map(v => clean(v).replace(/^\uFEFF/, ''));
    const sourceIndex = new Map(sourceHeaders.map((h, i) => [keyText(h), i]));
    const required = ['Session - Name', 'Session - Date'];
    const missing = HEADERS.filter(h => !sourceIndex.has(keyText(h)));
    if (required.some(h => missing.includes(h))) {
      throw new Error('Required CSV headers missing: ' + required.filter(h => missing.includes(h)).join(', '));
    }
    const warnings = [];
    if (missing.length) warnings.push('Missing optional columns: ' + missing.join(', '));
    const records = rows.slice(1).map((values, i) => {
      if (values.length !== sourceHeaders.length) {
        warnings.push('CSV record ' + (i + 2) + ' has ' + values.length + ' columns; expected ' + sourceHeaders.length + '.');
      }
      const item = { _sourceRow: i + 2 };
      for (const header of HEADERS) {
        const pos = sourceIndex.get(keyText(header));
        item[header] = pos === undefined ? '' : clean(values[pos]);
      }
      return item;
    });
    return { records, warnings, missingHeaders: missing };
  }

  function ymd(year, month, day) {
    if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return '';
    const date = new Date(Date.UTC(year, month - 1, day));
    if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return '';
    return [year, String(month).padStart(2, '0'), String(day).padStart(2, '0')].join('-');
  }

  /** Parse calendar dates without local/UTC day shifts. Ambiguous slash dates use Singapore day-first. */
  function parseDate(raw) {
    const s = clean(raw);
    if (!s) return '';
    if (/^\d{4}-\d{1,2}-\d{1,2}/.test(s)) {
      const m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
      return ymd(+m[1], +m[2], +m[3]);
    }
    if (/^\d+(?:\.\d+)?$/.test(s)) {
      const value = Number(s);
      if (value > 20000 && value < 100000) {
        const d = new Date(Date.UTC(1899, 11, 30) + Math.floor(value) * 86400000);
        return ymd(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
      }
    }
    const slash = s.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
    if (slash) {
      const a = +slash[1], b = +slash[2], year = +slash[3];
      return a > 12 ? ymd(year, b, a) : b > 12 ? ymd(year, a, b) : ymd(year, b, a);
    }
    const months = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
    const named = s.match(/^(\d{1,2})[\s\/-]+([A-Za-z]{3,9})[\s,\/-]+(\d{4})$/);
    if (named) return ymd(+named[3], months[named[2].slice(0, 3).toLowerCase()], +named[1]);
    const usNamed = s.match(/^([A-Za-z]{3,9})\s+(\d{1,2}),?\s+(\d{4})$/);
    if (usNamed) return ymd(+usNamed[3], months[usNamed[1].slice(0, 3).toLowerCase()], +usNamed[2]);
    return '';
  }

  /** Null means missing/invalid; 0 is valid midnight. */
  function parseTime(raw) {
    const s = clean(raw);
    if (!s) return null;
    const fraction = /^0?\.\d+$/.test(s) ? Number(s) : null;
    if (fraction !== null && fraction >= 0 && fraction < 1) return Math.round(fraction * 1440) % 1440;
    const normalized = s.replace(/^.*[T ](?=\d{1,2}:\d{2})/, '').trim();
    const m = normalized.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?$/i);
    if (!m) return null;
    let h = +m[1]; const min = +m[2]; const sec = +(m[3] || 0);
    if (min > 59 || sec > 59 || (m[4] ? h < 1 || h > 12 : h > 23)) return null;
    if (m[4]) h = (h % 12) + (m[4].toUpperCase() === 'PM' ? 12 : 0);
    return h * 60 + min;
  }

  function displayTime(minutes) {
    if (!Number.isInteger(minutes)) return 'Time TBC';
    return String(Math.floor(minutes / 60)).padStart(2, '0') + ':' + String(minutes % 60).padStart(2, '0');
  }

  function displayDate(day, options) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day || '')) return 'Date TBC';
    const [y, m, d] = day.split('-').map(Number);
    return new Intl.DateTimeFormat('en-SG', { weekday: 'long', day: 'numeric', month: 'long', ...(options || {}), timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, d)));
  }

  function fingerprint(input) {
    // Stable 64-bit FNV-1a; never depends on source-row ordering.
    let h = 0xcbf29ce484222325n;
    const bytes = new TextEncoder().encode(input);
    for (const byte of bytes) { h ^= BigInt(byte); h = (h * 0x100000001b3n) & 0xffffffffffffffffn; }
    return h.toString(36);
  }

  function splitSessionName(name) {
    const match = clean(name).match(/^([A-Za-z]{1,5}\d{1,4})\s*[-–—:]\s*(.+)$/);
    return match ? { code: match[1], title: match[2] } : { code: '', title: clean(name) };
  }

  function normalizeRecords(records, initialWarnings = []) {
    const warnings = initialWarnings.slice(), sessionsById = new Map(), speakersById = new Map();
    const rejected = []; const normalizedRows = [];
    for (const row of records) {
      const sessionName = clean(row['Session - Name']);
      const date = parseDate(row['Session - Date']);
      if (!sessionName || !date) {
        rejected.push({ row: row._sourceRow, reason: !sessionName ? 'Missing session name' : 'Invalid/missing session date' });
        continue;
      }
      const startRaw = clean(row['Session - Start Time']), endRaw = clean(row['Session - End Time']);
      const start = parseTime(startRaw), end = parseTime(endRaw);
      const room = clean(row['Session - Location']), track = clean(row['Session - Track']);
      const identity = [sessionName, date, startRaw ? (start === null ? startRaw : start) : '', endRaw ? (end === null ? endRaw : end) : '', room].map(keyText).join('|');
      const id = 's-' + fingerprint(identity);
      let session = sessionsById.get(id);
      if (!session) {
        const parts = splitSessionName(sessionName);
        session = { id, name: sessionName, code: parts.code, title: parts.title, date, start, end,
          room, track, details: '', presentations: [], sourceRows: [], searchIndex: '' };
        sessionsById.set(id, session);
        if (start !== null && end !== null && end <= start) warnings.push('Session ' + sessionName + ' has a non-positive time interval.');
        if (startRaw && start === null) warnings.push('Unrecognized session start time in ' + sessionName + '.');
        if (endRaw && end === null) warnings.push('Unrecognized session end time in ' + sessionName + '.');
      }
      const details = clean(row['Session - Details']);
      if (!session.details && details) session.details = details;
      else if (session.details && details && session.details !== details) warnings.push('Conflicting session descriptions in ' + sessionName + '.');
      if (session.track !== track) warnings.push('Conflicting track values in ' + sessionName + '.');
      const firstName = clean(row['First Name']), lastName = clean(row['Last Name']);
      const speakerName = [firstName, lastName].filter(Boolean).join(' ');
      const organization = clean(row['Organization']);
      // Conservative merging: normalized name AND affiliation. Never collapse different affiliations.
      const speakerKey = [keyText(speakerName), keyText(organization)].join('|');
      const speakerId = speakerName ? 'p-' + fingerprint(speakerKey) : '';
      if (speakerId && !speakersById.has(speakerId)) {
        speakersById.set(speakerId, { id: speakerId, name: speakerName, firstName, lastName, organization, contributions: [] });
      }
      const pStartRaw = clean(row['Presentation Start Time']), pEndRaw = clean(row['Presentation End Time']);
      const pStart = parseTime(pStartRaw), pEnd = parseTime(pEndRaw);
      if (pStartRaw && pStart === null) warnings.push('Unrecognized presentation start time in row ' + row._sourceRow + '.');
      if (pEndRaw && pEnd === null) warnings.push('Unrecognized presentation end time in row ' + row._sourceRow + '.');
      if (pStart !== null && pEnd !== null && pEnd <= pStart) warnings.push('Presentation ends before it starts in row ' + row._sourceRow + '.');
      if (pStart !== null && start !== null && pStart < start || pEnd !== null && end !== null && pEnd > end) warnings.push('Presentation falls outside session time in row ' + row._sourceRow + '.');
      const paperTitle = clean(row['Paper Title']), type = clean(row['Presentation Type']);
      const presentation = { id: 'r-' + row._sourceRow, sourceRow: row._sourceRow,
        title: paperTitle, type, start: pStart, end: pEnd, speakerId, speakerName, organization,
        firstName, lastName, sessionId: id };
      session.presentations.push(presentation);
      session.sourceRows.push(row._sourceRow);
      normalizedRows.push(presentation);
      if (speakerId) speakersById.get(speakerId).contributions.push(presentation);
    }
    const sessions = Array.from(sessionsById.values());
    for (const session of sessions) {
      // Timed talks sorted first; roles without times remain visible in original source ordering.
      session.presentations.sort((a, b) => (a.start === null) - (b.start === null) ||
        (a.start === null ? 0 : a.start - b.start) || a.sourceRow - b.sourceRow);
      session.searchIndex = searchText([
        session.name, session.details.replace(/<br\s*\/?\s*>/gi, ' '), session.room, session.track,
        ...session.presentations.flatMap(p => [p.title, p.type, p.firstName, p.lastName, p.speakerName, p.organization])
      ].join(' '));
    }
    sessions.sort(compareSessions);
    for (const speaker of speakersById.values()) {
      speaker.contributions.sort((a, b) => compareSessions(sessionsById.get(a.sessionId), sessionsById.get(b.sessionId)) ||
        (a.start ?? 9999) - (b.start ?? 9999));
    }
    // Same room+date, overlapping intervals: flag without auto-correcting or dropping records.
    const collisions = [];
    for (let a = 0; a < sessions.length; a++) {
      const x = sessions[a];
      if (x.start === null || x.end === null || x.end <= x.start || !x.room) continue;
      for (let b = a + 1; b < sessions.length; b++) {
        const y = sessions[b];
        if (x.date !== y.date) break;
        if (keyText(x.room) === keyText(y.room) && y.start !== null && y.end !== null && y.end > y.start && x.start < y.end && y.start < x.end) {
          collisions.push({ date: x.date, room: x.room, sessionIds: [x.id, y.id], names: [x.name, y.name] });
          warnings.push('Concurrent sessions assigned to ' + x.room + ' on ' + x.date + ': ' + x.code + ' / ' + y.code + '.');
        }
      }
    }
    const dates = [...new Set(sessions.map(s => s.date))].sort();
    const tracks = [...new Set(sessions.map(s => s.track))].sort((a, b) => (!a ? 1 : !b ? -1 : a.localeCompare(b, undefined, { numeric: true })));
    const rooms = [...new Set(sessions.map(s => s.room))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    const types = [...new Set(normalizedRows.map(p => p.type))].sort((a, b) => a.localeCompare(b));
    return { sessions, sessionById: sessionsById, speakers: Array.from(speakersById.values()), speakerById: speakersById,
      dates, tracks, rooms, types, rejected, collisions, warnings,
      stats: { sourceRecords: records.length, acceptedRecords: normalizedRows.length, rejectedRecords: rejected.length,
        sessions: sessions.length, speakers: speakersById.size, missingPresentationTimes: normalizedRows.filter(p => p.start === null || p.end === null).length } };
  }

  function compareSessions(a, b) {
    return a.date.localeCompare(b.date) || (a.start ?? 9999) - (b.start ?? 9999) ||
      (a.end ?? 9999) - (b.end ?? 9999) || a.room.localeCompare(b.room) || a.name.localeCompare(b.name);
  }

  global.SCSData = Object.freeze({ CONFIG, HEADERS, parseCSV, mapRecords, normalizeRecords,
    parseDate, parseTime, displayTime, displayDate, searchText, clean, compareSessions });
})(typeof window !== 'undefined' ? window : globalThis);
