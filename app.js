'use strict';

(function () {
  // ---------------------------------------------------------------------------
  // Constants
  // ---------------------------------------------------------------------------
  const STORAGE_KEY = 'eceTracker.data.v1';
  const THEME_KEY = 'eceTracker.theme';

  const GRADE_POINTS = {
    'A': 4.00, 'A-': 3.67, 'B+': 3.33, 'B': 3.00, 'B-': 2.67, 'C+': 2.33,
    'C': 2.00, 'C-': 1.67, 'D+': 1.33, 'D': 1.00, 'F': 0.00,
  };
  const LETTERS = Object.keys(GRADE_POINTS);
  const VALID_GRADES = new Set(['IP', ...LETTERS, 'P', 'W', 'I']);
  const GRADE_OPTIONS = [
    ['IP', 'In progress'], ...LETTERS.map((l) => [l, l]),
    ['P', 'P · Pass'], ['W', 'W · Withdrawn'], ['I', 'I · Incomplete'],
  ];
  const DEFAULT_CUTOFFS = {
    'A': 95, 'A-': 90, 'B+': 85, 'B': 80, 'B-': 75, 'C+': 70, 'C': 65, 'C-': 60, 'D+': 55, 'D': 50,
  };
  const CUTOFF_LETTERS = Object.keys(DEFAULT_CUTOFFS);
  const FAMILIES = [
    { id: 'a', label: 'A', letters: ['A', 'A-'] },
    { id: 'b', label: 'B', letters: ['B+', 'B', 'B-'] },
    { id: 'c', label: 'C', letters: ['C+', 'C', 'C-'] },
    { id: 'd', label: 'D', letters: ['D+', 'D'] },
    { id: 'f', label: 'F', letters: ['F'] },
  ];

  // First-visit data: Fall 2026, everything in progress.
  const STARTING_COURSES = [
    ['MATH 161', 'Calculus I', 8],
    ['PHYS 161', 'Physics for Scientists and Engineers I with Lab', 8],
    ['ENG 100', 'Introduction to Engineering', 6],
    ['ENG 101', 'Programming for Engineers', 6],
    ['ASC 200', 'Academic Writing, Science Communication & Media Literacy', 6],
  ];

  let state;
  // Transient UI state (not saved).
  const ui = { confirmDelete: null, addingSlot: null, pickerSem: null, focus: null };

  // ---------------------------------------------------------------------------
  // Utilities
  // ---------------------------------------------------------------------------
  const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (ch) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const num = (v) => {
    if (v === '' || v == null) return NaN;
    const n = Number(String(v).trim().replace(',', '.'));
    return Number.isFinite(n) ? n : NaN;
  };
  const ectsOf = (c) => { const n = num(c.ects); return n > 0 ? n : 0; };
  const isLetter = (g) => Object.prototype.hasOwnProperty.call(GRADE_POINTS, g);
  const family = (g) => (isLetter(g) ? g[0].toLowerCase() : 'x');
  const fmtGpa = (n) => (n == null ? '—' : n.toFixed(2));
  const fmtNum = (n) => String(Math.round(n * 10) / 10);
  const fmtPct = (n) => `${(Math.round(n * 10) / 10).toFixed(1)}%`;
  const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
  const gradeLabel = (g) => (g === 'IP' ? 'In progress' : g);

  const closestLetter = (gpa) => LETTERS.reduce((best, l) => (
    Math.abs(GRADE_POINTS[l] - gpa) < Math.abs(GRADE_POINTS[best] - gpa) ? l : best), 'A');

  function chip(grade, extraClass) {
    return `<span class="chip g-${family(grade)}${extraClass ? ' ' + extraClass : ''}">${esc(gradeLabel(grade))}</span>`;
  }

  // ---------------------------------------------------------------------------
  // State, persistence, import validation
  // ---------------------------------------------------------------------------
  function newCourse(p) {
    return Object.assign({ id: uid(), code: '', title: '', ects: 6, grade: 'IP', assessments: [], open: false }, p);
  }

  function defaultState() {
    return {
      app: 'ece-grade-ledger',
      version: 1,
      semesters: [{
        id: uid(),
        name: 'Fall 2026',
        courses: STARTING_COURSES.map(([code, title, ects]) => newCourse({ code, title, ects })),
      }],
      plan: { choices: {}, electives: {} },
      settings: { cutoffs: Object.assign({}, DEFAULT_CUTOFFS), kazakhAdvanced: false, needsASC100: false },
      calc: { target: '3.50', credits: '' },
    };
  }

  // Returns an error message, or null when the data looks like a valid export.
  function validateData(d) {
    if (!d || typeof d !== 'object' || Array.isArray(d)) return 'The file is not a Grade Ledger export.';
    if (!Array.isArray(d.semesters)) return 'The file has no "semesters" list.';
    for (let i = 0; i < d.semesters.length; i++) {
      const s = d.semesters[i];
      if (!s || typeof s !== 'object' || typeof s.name !== 'string' || !Array.isArray(s.courses)) {
        return `Semester ${i + 1} is malformed.`;
      }
      for (const c of s.courses) {
        if (!c || typeof c !== 'object') return `A course in "${s.name}" is malformed.`;
        if (c.code != null && typeof c.code !== 'string') return `A course code in "${s.name}" is not text.`;
        if (c.title != null && typeof c.title !== 'string') return `A course title in "${s.name}" is not text.`;
        if (c.grade != null && !VALID_GRADES.has(c.grade)) return `Unknown grade "${c.grade}" in "${s.name}".`;
        if (c.ects != null && c.ects !== '' && !Number.isFinite(Number(c.ects))) return `Invalid ECTS in "${s.name}".`;
        if (c.assessments != null && !Array.isArray(c.assessments)) return `Invalid assessments in "${s.name}".`;
      }
    }
    if (d.settings != null && typeof d.settings !== 'object') return 'The "settings" section is malformed.';
    return null;
  }

  // Fill in defaults so older or hand-edited files still work.
  function normalize(d) {
    const base = defaultState();
    const str = (v) => (v == null ? '' : String(v));
    const out = {
      app: base.app,
      version: 1,
      semesters: d.semesters.map((s) => ({
        id: str(s.id) || uid(),
        name: s.name,
        courses: s.courses.map((c) => ({
          id: str(c.id) || uid(),
          code: str(c.code),
          title: str(c.title),
          ects: c.ects == null ? '' : c.ects,
          grade: VALID_GRADES.has(c.grade) ? c.grade : 'IP',
          open: !!c.open,
          assessments: (Array.isArray(c.assessments) ? c.assessments : [])
            .filter((a) => a && typeof a === 'object')
            .map((a) => ({ id: str(a.id) || uid(), name: str(a.name), weight: str(a.weight), score: str(a.score) })),
        })),
      })),
      plan: { choices: {}, electives: {} },
      settings: base.settings,
      calc: base.calc,
    };
    const plan = d.plan && typeof d.plan === 'object' ? d.plan : {};
    if (plan.choices && typeof plan.choices === 'object') {
      for (const [k, v] of Object.entries(plan.choices)) if (Number.isInteger(v)) out.plan.choices[k] = v;
    }
    if (plan.electives && typeof plan.electives === 'object') {
      for (const [k, v] of Object.entries(plan.electives)) {
        if (v && typeof v === 'object') out.plan.electives[k] = { code: str(v.code), title: str(v.title) };
      }
    }
    const s = d.settings || {};
    out.settings.kazakhAdvanced = !!s.kazakhAdvanced;
    out.settings.needsASC100 = !!s.needsASC100;
    if (s.cutoffs && typeof s.cutoffs === 'object') {
      for (const l of CUTOFF_LETTERS) if (s.cutoffs[l] != null && s.cutoffs[l] !== '') out.settings.cutoffs[l] = s.cutoffs[l];
    }
    if (d.calc && typeof d.calc === 'object') {
      out.calc = { target: str(d.calc.target), credits: str(d.calc.credits) };
    }
    return out;
  }

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const d = JSON.parse(raw);
        if (!validateData(d)) return normalize(d);
      }
    } catch (e) { /* storage blocked or corrupt: fall back to defaults */ }
    return defaultState();
  }

  let savedTimer;
  function save() {
    const el = document.getElementById('saved');
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      el.textContent = 'Saved';
      el.classList.remove('error');
    } catch (e) {
      el.textContent = 'Not saved: browser storage unavailable';
      el.classList.add('error');
    }
    el.classList.add('show');
    clearTimeout(savedTimer);
    if (!el.classList.contains('error')) savedTimer = setTimeout(() => el.classList.remove('show'), 1600);
  }

  let flashTimer;
  function flash(msg, kind) {
    const el = document.getElementById('flash');
    el.textContent = msg;
    el.className = 'flash' + (kind ? ' ' + kind : '');
    el.hidden = false;
    clearTimeout(flashTimer);
    flashTimer = setTimeout(() => { el.hidden = true; }, 5000);
  }

  // ---------------------------------------------------------------------------
  // Degree plan matching
  // ---------------------------------------------------------------------------
  const normCode = (s) => String(s || '').toUpperCase().replace(/[\s-]+/g, '');
  const normTitle = (s) => String(s || '').toUpperCase().replace(/\s+/g, ' ').trim();

  // A course or slot is identified by its code(s); titles are used only when there is no code.
  function keysFor(code, title) {
    const codes = String(code || '').split('/').map(normCode).filter(Boolean);
    if (codes.length) return codes.map((c) => 'C:' + c);
    const t = normTitle(title);
    return t ? ['T:' + t] : [];
  }

  function resolveMin(m) {
    if (m === 'D*') return state.settings.kazakhAdvanced ? 'D' : 'C-';
    return m || null;
  }

  // Grade F, or a letter grade below the minimum. P/IP/I/W never "fail".
  function failsMin(grade, min) {
    if (grade === 'F') return true;
    if (!isLetter(grade) || !min || !isLetter(min)) return false;
    return GRADE_POINTS[grade] < GRADE_POINTS[min];
  }

  function slotAlternatives(slot) {
    if (slot.options) {
      return slot.options.map((o) => ({
        code: o.code, title: o.title, minGrade: o.minGrade || slot.minGrade, keys: keysFor(o.code, o.title),
      }));
    }
    if (slot.elective) {
      const e = state.plan.electives[slot.id];
      if (!e || !(e.code.trim() || e.title.trim())) return [];
      return [{ code: e.code, title: e.title, minGrade: slot.minGrade, keys: keysFor(e.code, e.title) }];
    }
    return [{ code: slot.code, title: slot.title, minGrade: slot.minGrade, keys: keysFor(slot.code, slot.title) }];
  }

  // The plan as it applies with the current settings.
  function planSlots() {
    const slots = [];
    for (const raw of CURRICULUM) {
      const slot = Object.assign({}, raw);
      if (raw.options) slot.options = raw.options.map((o) => Object.assign({}, o));
      if (raw.kazakhIelts && state.settings.needsASC100 && slot.options) {
        // ASC 100 is an extra requirement, so it cannot fill the language slot.
        slot.options = slot.options.filter((o) => !keysFor(o.code, o.title).includes('C:ASC100'));
        slot.ascSeparate = true;
      }
      slots.push(slot);
    }
    if (state.settings.needsASC100) {
      let at = 0;
      slots.forEach((s, i) => { if (s.year === 1 && s.term === 'Fall') at = i + 1; });
      slots.splice(at, 0, Object.assign({}, EXTRA_ASC100));
    }
    for (const s of slots) s.alternatives = slotAlternatives(s);
    return slots;
  }

  /*
   * Match courses to slots by code, in chronological order (semester order, then row order).
   * A later attempt of the same course replaces an earlier one that failed or was below the minimum (a retake).
   * Slots that share a code (ENG 400 parts 1 and 2) are filled one after another.
   */
  function analyze() {
    const slots = planSlots();
    const courses = [];
    state.semesters.forEach((sem, si) => sem.courses.forEach((c) => courses.push({ c, sem, si })));
    const info = new Map();
    const claimed = new Set();

    for (const slot of slots) {
      slot.course = null;
      slot.alt = null;
      slot.sem = null;
      for (const { c, sem } of courses) {
        if (claimed.has(c.id) || c.grade === 'W') continue;
        const ck = keysFor(c.code, c.title);
        const alt = slot.alternatives.find((a) => a.keys.some((k) => ck.includes(k)));
        if (!alt) continue;
        if (slot.course) {
          if (!failsMin(slot.course.grade, resolveMin(slot.alt.minGrade))) break;
          info.get(slot.course.id).superseded = true;
        }
        claimed.add(c.id);
        slot.course = c;
        slot.alt = alt;
        slot.sem = sem;
        info.set(c.id, { slot, min: resolveMin(alt.minGrade), dStar: alt.minGrade === 'D*', superseded: false });
      }
    }

    // Courses that matched no free slot (withdrawn, or a third attempt) still get their minimum shown.
    for (const { c } of courses) {
      if (info.has(c.id)) continue;
      const ck = keysFor(c.code, c.title);
      if (!ck.length) continue;
      for (const slot of slots) {
        const alt = slot.alternatives.find((a) => a.keys.some((k) => ck.includes(k)));
        if (alt) {
          info.set(c.id, { slot: null, refSlot: slot, min: resolveMin(alt.minGrade), dStar: alt.minGrade === 'D*', superseded: false });
          break;
        }
      }
    }
    return { slots, info };
  }

  function slotStatus(slot) {
    const c = slot.course;
    if (!c) return 'todo';
    if (c.grade === 'IP') return 'ip';
    if (c.grade === 'I') return 'incomplete';
    if (failsMin(c.grade, resolveMin(slot.alt.minGrade))) return 'below';
    return 'done';
  }

  // Title and ECTS to suggest for a typed code (or title, for courses without codes).
  function lookupPlan(code, title, courseId) {
    const ck = keysFor(code, code.trim() ? '' : title);
    if (!ck.length) return null;
    const matches = [];
    for (const slot of planSlots()) {
      for (const a of slot.alternatives) {
        if (a.keys.some((k) => ck.includes(k))) matches.push({ title: a.title, ects: slot.ects });
      }
    }
    if (!matches.length) return null;
    // Repeated codes (ENG 400 part 1 / part 2): pick the part by how many you already have.
    let others = 0;
    state.semesters.forEach((s) => s.courses.forEach((c) => {
      if (c.id !== courseId && keysFor(c.code, c.title).some((k) => ck.includes(k))) others++;
    }));
    return matches[Math.min(others, matches.length - 1)];
  }

  function allPlanTitles() {
    const t = new Set();
    for (const s of CURRICULUM) {
      t.add(s.title);
      (s.options || []).forEach((o) => t.add(o.title));
    }
    t.add(EXTRA_ASC100.title);
    return t;
  }

  // ---------------------------------------------------------------------------
  // Grade math
  // ---------------------------------------------------------------------------
  function cutoffs() {
    const out = {};
    for (const l of CUTOFF_LETTERS) {
      const n = num(state.settings.cutoffs[l]);
      out[l] = Number.isFinite(n) ? n : DEFAULT_CUTOFFS[l];
    }
    return out;
  }

  function letterForPct(pct) {
    const cut = cutoffs();
    for (const l of CUTOFF_LETTERS) if (pct >= cut[l]) return l;
    return 'F';
  }

  function stats(an) {
    let q = 0; let g = 0; let earned = 0; let ipEcts = 0; let ipCount = 0;
    let cumQ = 0; let cumG = 0;
    const sems = state.semesters.map((sem) => {
      let sq = 0; let sg = 0; let sEcts = 0; let sIp = 0;
      for (const c of sem.courses) {
        const e = ectsOf(c);
        sEcts += e;
        const inf = an.info.get(c.id);
        if (isLetter(c.grade)) { sq += GRADE_POINTS[c.grade] * e; sg += e; }
        if ((isLetter(c.grade) && c.grade !== 'F') || c.grade === 'P') {
          if (!(inf && inf.superseded)) earned += e;
        }
        if (c.grade === 'IP' || c.grade === 'I') { ipEcts += e; sIp++; }
        if (c.grade === 'IP') ipCount++;
      }
      q += sq; g += sg; cumQ += sq; cumG += sg;
      return {
        sem, ects: sEcts, gpaCredits: sg, ip: sIp,
        gpa: sg > 0 ? sq / sg : null,
        cum: cumG > 0 ? cumQ / cumG : null,
      };
    });
    const graded = sems.filter((s) => s.gpa != null);
    const last = graded[graded.length - 1] || null;
    const prev = graded[graded.length - 2] || null;
    const total = PROGRAM_TOTAL_ECTS + (state.settings.needsASC100 ? EXTRA_ASC100.ects : 0);
    return {
      sems, quality: q, gpaCredits: g, gpa: g > 0 ? q / g : null, earned, ipEcts, ipCount,
      last, prev, total,
    };
  }

  function breakdown(course) {
    const items = course.assessments || [];
    let totalW = 0; let wScored = 0; let points = 0;
    for (const a of items) {
      const w = num(a.weight);
      if (!(w > 0)) continue;
      totalW += w;
      const s = num(a.score);
      if (Number.isFinite(s)) { wScored += w; points += (w * s) / 100; }
    }
    // The final grade is out of 100 (or the sum of weights, if they add up to more).
    const base = Math.max(100, totalW);
    const remaining = base - wScored;
    const avg = wScored > 0 ? (points / wScored) * 100 : null;
    const need = (cut) => (remaining > 0 ? ((cut * base) / 100 - points) / remaining * 100 : null);
    const finalIfDone = (points / base) * 100;
    return {
      items, totalW, wScored, points, base, remaining, avg, need, finalIfDone,
      locked: (wScored / base) * 100,
      weightsOk: Math.abs(totalW - 100) < 0.01,
      projected: avg == null ? null : letterForPct(avg),
    };
  }

  // ---------------------------------------------------------------------------
  // Rendering
  // ---------------------------------------------------------------------------
  function renderSummary(st) {
    const gpa = st.gpa;
    let lastHtml = '<span class="tile-num">—</span><span class="tile-sub">No graded semester yet</span>';
    if (st.last) {
      let delta = '<span class="tile-sub">First graded semester</span>';
      if (st.prev) {
        const d = st.last.gpa - st.prev.gpa;
        const cls = d > 0.004 ? 'up' : d < -0.004 ? 'down' : 'flat';
        const sign = d > 0.004 ? '▲ +' : d < -0.004 ? '▼ −' : '±';
        delta = `<span class="tile-sub delta ${cls}">${sign}${Math.abs(d).toFixed(2)} vs ${esc(st.prev.sem.name)}</span>`;
      }
      lastHtml = `<span class="tile-num">${fmtGpa(st.last.gpa)}</span><span class="tile-sub">${esc(st.last.sem.name)}</span>${delta}`;
    }
    return `
      <div class="card hero">
        <p class="eyebrow">Cumulative GPA</p>
        <p class="hero-num${gpa == null ? ' is-empty' : ''}">${fmtGpa(gpa)}<span class="hero-scale">/ 4.00</span></p>
        <p class="hero-sub">${gpa == null
          ? 'No final grades yet. Your GPA appears once a course has a letter grade.'
          : `Closest letter ${chip(closestLetter(gpa))}`}</p>
      </div>
      <div class="tiles">
        <div class="card tile"><span class="tile-label">GPA credits</span><span class="tile-num">${fmtNum(st.gpaCredits)}</span><span class="tile-sub">ECTS with a letter grade</span></div>
        <div class="card tile"><span class="tile-label">Credits earned</span><span class="tile-num">${fmtNum(st.earned)}</span><span class="tile-sub">ECTS passed (incl. P)</span></div>
        <div class="card tile"><span class="tile-label">Last semester</span>${lastHtml}</div>
        <div class="card tile"><span class="tile-label">In progress</span><span class="tile-num">${st.ipCount}</span><span class="tile-sub">${plural(st.ipCount, 'course')} · ${fmtNum(st.ipEcts)} ECTS</span></div>
      </div>`;
  }

  function renderProgress(st) {
    const pctEarned = Math.min(100, (st.earned / st.total) * 100);
    const pctIp = Math.min(100 - pctEarned, (st.ipEcts / st.total) * 100);
    const remaining = Math.max(0, st.total - st.earned);
    const extra = state.settings.needsASC100 ? ` <span class="muted">(248 + 6 ASC 100)</span>` : '';
    return `
      <div class="card-head">
        <h2 id="progress-h">Degree progress</h2>
        <p class="big-pct"><span class="mono">${pctEarned.toFixed(1)}%</span> complete</p>
      </div>
      <div class="bar" role="img" aria-label="${fmtNum(st.earned)} of ${st.total} ECTS earned, ${fmtNum(st.ipEcts)} in progress">
        <span class="bar-earned" style="width:${pctEarned}%"></span><span class="bar-ip" style="width:${pctIp}%"></span>
      </div>
      <ul class="bar-legend">
        <li><span class="sw sw-earned"></span><span class="mono">${fmtNum(st.earned)}</span> / <span class="mono">${st.total}</span> ECTS earned${extra}</li>
        <li><span class="sw sw-ip"></span><span class="mono">${fmtNum(st.ipEcts)}</span> ECTS in progress</li>
        <li><span class="sw sw-rest"></span><span class="mono">${fmtNum(remaining)}</span> ECTS remaining</li>
      </ul>`;
  }

  function shortTerm(name) {
    const m = /^(Fall|Spring|Summer)\s+\d{2}(\d{2})$/i.exec(name.trim());
    return m ? `${m[1][0].toUpperCase()}’${m[2]}` : name;
  }

  function renderTrend(st, el) {
    const pts = st.sems.filter((s) => s.gpa != null);
    const head = `
      <div class="card-head">
        <h2 id="trend-h">GPA trend</h2>
        ${pts.length ? `<ul class="legend" aria-label="Legend">
          <li><span class="sw sw-bar"></span>Semester GPA</li>
          <li><span class="sw sw-line"></span>Cumulative GPA</li>
        </ul>` : ''}
      </div>`;
    if (!pts.length) {
      return head + `
        <div class="empty">
          <svg viewBox="0 0 120 64" aria-hidden="true" class="empty-art">
            <rect x="8" y="36" width="16" height="20" rx="3"/><rect x="36" y="24" width="16" height="32" rx="3"/>
            <rect x="64" y="30" width="16" height="26" rx="3"/><rect x="92" y="14" width="16" height="42" rx="3"/>
          </svg>
          <p><strong>Your trend will appear here.</strong></p>
          <p class="muted">No course has a final grade yet. Once you set a letter grade, each semester gets a bar and your cumulative GPA a line.</p>
        </div>`;
    }
    const cs = getComputedStyle(el);
    const W = Math.max(260, Math.floor(el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)) || 600);
    const H = 240;
    const m = { l: 34, r: 14, t: 16, b: 34 };
    const iw = W - m.l - m.r;
    const ih = H - m.t - m.b;
    const band = iw / pts.length;
    const bw = Math.min(44, band * 0.56);
    const y = (v) => m.t + ih - (v / 4) * ih;
    const y0 = y(0);
    const useShort = band < 72;

    let svg = '';
    for (let v = 0; v <= 4; v++) {
      svg += `<line class="grid${v === 0 ? ' base' : ''}" x1="${m.l}" x2="${W - m.r}" y1="${y(v)}" y2="${y(v)}"/>`;
      svg += `<text class="axis-label" x="${m.l - 8}" y="${y(v) + 4}" text-anchor="end">${v.toFixed(1)}</text>`;
    }
    pts.forEach((p, i) => {
      const cx = m.l + band * i + band / 2;
      const x = cx - bw / 2;
      const top = y(p.gpa);
      const h = y0 - top;
      if (h > 0.5) {
        const r = Math.min(4, h, bw / 2);
        svg += `<path class="gpa-bar" d="M${x},${y0} V${top + r} Q${x},${top} ${x + r},${top} H${x + bw - r} Q${x + bw},${top} ${x + bw},${top + r} V${y0} Z"/>`;
      }
      svg += `<text class="axis-label" x="${cx}" y="${H - m.b + 18}" text-anchor="middle">${esc(useShort ? shortTerm(p.sem.name) : p.sem.name)}</text>`;
    });
    const linePts = pts.map((p, i) => `${m.l + band * i + band / 2},${y(p.cum)}`).join(' ');
    if (pts.length > 1) svg += `<polyline class="cum-line" points="${linePts}"/>`;
    pts.forEach((p, i) => {
      svg += `<circle class="cum-dot" cx="${m.l + band * i + band / 2}" cy="${y(p.cum)}" r="4.5"/>`;
    });
    // Direct label on the latest cumulative value only.
    const lp = pts[pts.length - 1];
    const lx = m.l + band * (pts.length - 1) + band / 2;
    const ly = y(lp.cum);
    svg += `<text class="value-label" x="${lx}" y="${ly < m.t + 18 ? ly + 20 : ly - 10}" text-anchor="middle">${lp.cum.toFixed(2)}</text>`;
    // Hover / focus targets, wider than the marks.
    pts.forEach((p, i) => {
      const tip = `${p.sem.name}\nSemester GPA ${p.gpa.toFixed(2)} · ${fmtNum(p.gpaCredits)} ECTS\nCumulative GPA ${p.cum.toFixed(2)}`;
      svg += `<rect class="hit" x="${m.l + band * i}" y="${m.t}" width="${band}" height="${ih}" tabindex="0" role="img" aria-label="${esc(tip.replace(/\n/g, ', '))}" data-tip="${esc(tip)}"/>`;
    });

    const rows = pts.map((p) => `<tr><th scope="row">${esc(p.sem.name)}</th><td>${p.gpa.toFixed(2)}</td><td>${p.cum.toFixed(2)}</td><td>${fmtNum(p.gpaCredits)}</td></tr>`).join('');
    return head + `
      <div class="chart-box">
        <svg class="chart" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="group" aria-label="Semester GPA bars and cumulative GPA line on a 0 to 4 scale">${svg}</svg>
      </div>
      <details class="table-view"><summary>Show as table</summary>
        <table><thead><tr><th scope="col">Semester</th><th scope="col">Semester GPA</th><th scope="col">Cumulative</th><th scope="col">GPA ECTS</th></tr></thead><tbody>${rows}</tbody></table>
      </details>`;
  }

  function renderCalc(st) {
    const Q = st.quality;
    const G = st.gpaCredits;
    const defaultCredits = Math.max(0, st.total - G);
    const T = num(state.calc.target);
    const R = state.calc.credits === '' ? defaultCredits : num(state.calc.credits);
    let result;
    if (!(T >= 0 && T <= 4)) {
      result = '<p class="result">Enter a target GPA between 0.00 and 4.00.</p>';
    } else if (!(R >= 0)) {
      result = '<p class="result">Enter how many ECTS you still have to take.</p>';
    } else if (R === 0) {
      result = G > 0 && Q / G >= T
        ? `<p class="result ok"><strong>Already secured.</strong> Your GPA is ${fmtGpa(Q / G)}.</p>`
        : '<p class="result">With no credits left to take, your GPA can’t change.</p>';
    } else {
      const need = (T * (G + R) - Q) / R;
      if (need > 4.0001) {
        const best = (Q + 4 * R) / (G + R);
        result = `<p class="result bad"><strong>Out of reach.</strong> You’d need ${need.toFixed(2)} on average, above 4.00. Straight A’s for the next ${fmtNum(R)} ECTS would get you ${best.toFixed(2)}.</p>`;
      } else if (need <= 0) {
        result = `<p class="result ok"><strong>Already secured.</strong> Even with failing grades on the remaining ${fmtNum(R)} ECTS you’d stay at or above ${T.toFixed(2)}.</p>`;
      } else {
        const atLeast = [...LETTERS].reverse().find((l) => GRADE_POINTS[l] >= need - 0.0001) || 'A';
        result = `<p class="result"><span class="result-num mono">${need.toFixed(2)}</span> average needed over ${fmtNum(R)} ECTS. That’s about ${chip(atLeast)} or better per course.</p>`;
      }
    }
    return `
      <div class="card-head"><h2 id="calc-h">What do I need?</h2></div>
      <div class="calc-fields">
        <div class="field">
          <label for="calc-target">Target GPA</label>
          <input id="calc-target" class="mono" type="text" inputmode="decimal" autocomplete="off" data-act="calc" data-field="target" data-k="calc-target" value="${esc(state.calc.target)}">
        </div>
        <div class="field">
          <label for="calc-credits">ECTS still to take</label>
          <input id="calc-credits" class="mono" type="text" inputmode="decimal" autocomplete="off" data-act="calc" data-field="credits" data-k="calc-credits" value="${esc(state.calc.credits)}" placeholder="${fmtNum(defaultCredits)}" aria-describedby="calc-credits-hint">
          <span id="calc-credits-hint" class="hint">Default: ${st.total} − ${fmtNum(G)} graded = ${fmtNum(defaultCredits)}</span>
        </div>
      </div>
      <div aria-live="polite">${result}</div>`;
  }

  function renderSpread() {
    const counts = FAMILIES.map((f) => ({ f, n: 0 }));
    state.semesters.forEach((s) => s.courses.forEach((c) => {
      const row = counts.find((x) => x.f.letters.includes(c.grade));
      if (row) row.n++;
    }));
    const total = counts.reduce((a, x) => a + x.n, 0);
    const head = '<div class="card-head"><h2 id="spread-h">Grade spread</h2></div>';
    if (!total) {
      return head + '<p class="muted small">No letter grades yet. The spread across A/B/C/D/F shows up as grades come in.</p>';
    }
    const segs = counts.filter((x) => x.n).map((x) => {
      const tip = `${x.f.label} range: ${plural(x.n, 'course')} (${Math.round((x.n / total) * 100)}%)`;
      return `<span class="seg g-${x.f.id}" style="flex-grow:${x.n}" data-tip="${esc(tip)}" title="${esc(tip)}">${x.n}</span>`;
    }).join('');
    const legend = counts.map((x) => `<li><span class="sw g-${x.f.id}"></span>${x.f.label} <span class="mono">${x.n}</span></li>`).join('');
    return head + `
      <div class="spread-bar" role="img" aria-label="${counts.map((x) => `${x.f.label}: ${x.n}`).join(', ')}">${segs}</div>
      <ul class="legend spread-legend">${legend}</ul>
      <p class="muted small">${plural(total, 'graded course')}</p>`;
  }

  function nextTermName() {
    const last = state.semesters[state.semesters.length - 1];
    if (!last) return 'Fall 2026';
    const m = /(Fall|Spring|Summer)\s+(\d{4})/i.exec(last.name);
    if (!m) return 'New semester';
    const y = Number(m[2]);
    return m[1].toLowerCase() === 'fall' ? `Spring ${y + 1}` : `Fall ${y}`;
  }

  function courseNotes(c, an) {
    const inf = an.info.get(c.id);
    const notes = [];
    const min = inf ? inf.min : null;
    if (c.grade === 'W') notes.push('<p class="note">Withdrawn: no GPA, no credits.</p>');
    if (min && failsMin(c.grade, min)) {
      notes.push(`<p class="note bad" role="alert"><strong>Below minimum (${esc(min)} required). Must retake.</strong></p>`);
    } else if (!min && c.grade === 'F') {
      notes.push('<p class="note bad">Failed: no credits earned.</p>');
    }
    if (inf && inf.superseded) notes.push('<p class="note">Retaken later: credits counted once, on the later attempt.</p>');
    if (c.grade === 'IP' && min && (c.assessments || []).length) {
      const b = breakdown(c);
      const cut = cutoffs()[min];
      if (cut != null && b.wScored > 0) {
        const need = b.need(cut);
        if (need == null) {
          notes.push(b.finalIfDone >= cut
            ? `<p class="note ok">All graded: ${fmtPct(b.finalIfDone)} meets the ${esc(min)} minimum.</p>`
            : `<p class="note bad">All graded: ${fmtPct(b.finalIfDone)} is below the ${esc(min)} minimum (${cut}%).</p>`);
        } else if (need <= 0) {
          notes.push(`<p class="note ok">Minimum ${esc(min)} already secured.</p>`);
        } else if (need > 100) {
          notes.push(`<p class="note bad">Minimum ${esc(min)} is out of reach: it needs ${fmtPct(need)} on the remaining ${fmtPct(b.remaining / b.base * 100)}.</p>`);
        } else {
          notes.push(`<p class="note">Need <strong class="mono">${fmtPct(need)}</strong> on the remaining ${fmtPct(b.remaining / b.base * 100)} of the course to reach the ${esc(min)} minimum.</p>`);
        }
      }
    }
    return notes.join('');
  }

  function breakdownHtml(c) {
    const b = breakdown(c);
    const rows = c.assessments.map((a, i) => {
      const k = `a:${a.id}`;
      return `
        <div class="asmt" data-key="${esc(a.id)}">
          <div class="field f-aname"><label class="fl" for="${k}:name">Assessment ${i + 1} name</label>
            <input id="${k}:name" type="text" data-act="asmt" data-cid="${esc(c.id)}" data-aid="${esc(a.id)}" data-field="name" data-k="${k}:name" value="${esc(a.name)}" placeholder="e.g. Midterm"></div>
          <div class="field f-num"><label class="fl" for="${k}:weight">Weight %</label>
            <input id="${k}:weight" class="mono" type="text" inputmode="decimal" data-act="asmt" data-cid="${esc(c.id)}" data-aid="${esc(a.id)}" data-field="weight" data-k="${k}:weight" value="${esc(a.weight)}" placeholder="0"></div>
          <div class="field f-num"><label class="fl" for="${k}:score">Score %</label>
            <input id="${k}:score" class="mono" type="text" inputmode="decimal" data-act="asmt" data-cid="${esc(c.id)}" data-aid="${esc(a.id)}" data-field="score" data-k="${k}:score" value="${esc(a.score)}" placeholder="—"></div>
          <button type="button" class="btn btn-icon btn-del" data-act="del-asmt" data-cid="${esc(c.id)}" data-aid="${esc(a.id)}" aria-label="Delete assessment ${esc(a.name || i + 1)}">×</button>
        </div>`;
    }).join('');

    let statsHtml = '';
    if (c.assessments.length) {
      const warn = b.weightsOk ? '' : `<p class="note warn">Weights add up to ${fmtNum(b.totalW)}%, not 100%.${b.totalW < 100 ? ' Missing weight is treated as not yet graded.' : ''}</p>`;
      const cut = cutoffs();
      const needs = CUTOFF_LETTERS.map((l) => {
        const n = b.need(cut[l]);
        let val; let cls = '';
        if (n == null) { val = b.finalIfDone >= cut[l] ? 'made' : 'missed'; cls = b.finalIfDone >= cut[l] ? 'ok' : 'off'; }
        else if (n <= 0) { val = 'secured'; cls = 'ok'; }
        else if (n > 100) { val = fmtPct(n); cls = 'off'; }
        else val = fmtPct(n);
        return `<li class="${cls}">${chip(l)}<span class="mono">${cls === 'off' ? `<s>${val}</s>` : val}</span></li>`;
      }).join('');
      statsHtml = `
        ${warn}
        <div class="bd-stats">
          <div><span class="tile-label">Current average</span><span class="bd-num mono">${b.avg == null ? '—' : fmtPct(b.avg)}</span></div>
          <div><span class="tile-label">Projected</span><span class="bd-num">${b.projected ? chip(b.projected) : '—'}</span></div>
          <div><span class="tile-label">Locked in</span><span class="bd-num mono">${fmtPct(b.locked)}</span><span class="tile-sub">of the final grade</span></div>
        </div>
        <p class="tile-label">Average needed on the remaining ${fmtPct(b.remaining / b.base * 100)}</p>
        <ul class="needs">${needs}</ul>`;
    }
    return `
      <div class="breakdown" id="bd-${esc(c.id)}">
        <div class="asmt-head" aria-hidden="true"><span>Assessment</span><span>Weight %</span><span>Score %</span><span></span></div>
        ${rows || '<p class="muted small">Add your assessments (midterms, quizzes, final…) with their weights. Leave the score empty until it’s graded.</p>'}
        <button type="button" class="btn btn-small" data-act="add-asmt" data-cid="${esc(c.id)}" data-k="add-asmt:${esc(c.id)}">+ Add assessment</button>
        ${statsHtml}
      </div>`;
  }

  function courseHtml(sem, c, an) {
    const k = `c:${c.id}`;
    const inf = an.info.get(c.id);
    const min = inf ? inf.min : null;
    const fails = min && failsMin(c.grade, min);
    const gradeOpts = GRADE_OPTIONS.map(([v, label]) => `<option value="${v}"${c.grade === v ? ' selected' : ''}>${label}</option>`).join('');
    let planTag = '';
    if (inf && inf.slot) {
      const s = inf.slot;
      planTag = s.extra ? 'Plan: extra requirement' : `Plan: Y${s.year} ${s.term}${s.elective ? ` · ${esc(s.title)}` : ''}`;
    } else if ((c.code || c.title).trim() && !inf) {
      planTag = 'Not in plan';
    }
    const minHtml = min
      ? `<span class="chip g-${family(min)} chip-min" title="${inf.dStar ? 'D* rule: D if Kazakh level is Advanced, otherwise C-' : 'Minimum required grade'}">min ${esc(min)}${inf.dStar ? '*' : ''}</span>`
      : '<span class="muted" title="No minimum: course not in the degree plan">—</span>';
    const nA = (c.assessments || []).length;
    return `
      <div class="course${fails ? ' is-below' : ''}" role="listitem" data-key="${esc(c.id)}">
        <div class="course-main">
          <div class="field f-code"><label class="fl" for="${k}:code">Code</label>
            <input id="${k}:code" class="mono" type="text" autocomplete="off" spellcheck="false" data-act="course" data-cid="${esc(c.id)}" data-field="code" data-k="${k}:code" value="${esc(c.code)}" placeholder="CODE 101"></div>
          <div class="field f-title"><label class="fl" for="${k}:title">Title</label>
            <input id="${k}:title" type="text" autocomplete="off" data-act="course" data-cid="${esc(c.id)}" data-field="title" data-k="${k}:title" value="${esc(c.title)}" placeholder="Course title"></div>
          <div class="field f-ects"><label class="fl" for="${k}:ects">ECTS</label>
            <input id="${k}:ects" class="mono" type="text" inputmode="decimal" autocomplete="off" data-act="course" data-cid="${esc(c.id)}" data-field="ects" data-k="${k}:ects" value="${esc(c.ects)}"></div>
          <div class="field f-grade"><label class="fl" for="${k}:grade">Grade</label>
            <select id="${k}:grade" class="grade-select g-${family(c.grade)}${c.grade === 'IP' ? ' is-ip' : ''}" data-act="grade" data-cid="${esc(c.id)}" data-k="${k}:grade">${gradeOpts}</select></div>
          <div class="field f-min"><span class="fl">Minimum</span>${minHtml}</div>
          <div class="course-actions">
            <button type="button" class="btn btn-small${c.open ? ' is-on' : ''}" data-act="toggle-bd" data-cid="${esc(c.id)}" data-k="${k}:bd" aria-expanded="${c.open}" aria-controls="bd-${esc(c.id)}">Breakdown${nA ? ` <span class="count">${nA}</span>` : ''}</button>
            <button type="button" class="btn btn-icon btn-del" data-act="del-course" data-sid="${esc(sem.id)}" data-cid="${esc(c.id)}" aria-label="Delete ${esc(c.code || c.title || 'course')}">×</button>
          </div>
        </div>
        ${planTag ? `<p class="plan-tag">${planTag}</p>` : ''}
        ${courseNotes(c, an)}
        ${c.open ? breakdownHtml(c) : ''}
      </div>`;
  }

  function renderSemesters(st, an) {
    const list = state.semesters.map((sem, i) => ({ sem, s: st.sems[i] })).reverse();
    const body = list.map(({ sem, s }) => {
      const k = `s:${sem.id}`;
      const confirming = ui.confirmDelete === sem.id;
      const del = confirming
        ? `<div class="confirm" role="group" aria-label="Confirm delete">
             <span>Delete ${esc(sem.name || 'this semester')} and its ${plural(sem.courses.length, 'course')}?</span>
             <button type="button" class="btn btn-danger btn-small" data-act="confirm-del-sem" data-sid="${esc(sem.id)}" data-k="${k}:confirm">Delete</button>
             <button type="button" class="btn btn-small" data-act="cancel-del-sem" data-k="${k}:cancel">Cancel</button>
           </div>`
        : `<button type="button" class="btn btn-ghost btn-small" data-act="del-sem" data-sid="${esc(sem.id)}" data-k="${k}:del">Delete</button>`;
      const courses = sem.courses.map((c) => courseHtml(sem, c, an)).join('');
      return `
        <article class="sem card" data-key="${esc(sem.id)}">
          <header class="sem-head">
            <div class="sem-title">
              <label class="sr-only" for="${k}:name">Semester name</label>
              <input id="${k}:name" class="sem-name" type="text" data-act="sem-name" data-sid="${esc(sem.id)}" data-k="${k}:name" value="${esc(sem.name)}">
              ${s.ip ? '<span class="badge">In progress</span>' : ''}
            </div>
            <dl class="sem-stats">
              <div><dt>GPA</dt><dd class="mono">${fmtGpa(s.gpa)}</dd></div>
              <div><dt>ECTS</dt><dd class="mono">${fmtNum(s.ects)}</dd></div>
            </dl>
            ${del}
          </header>
          ${sem.courses.length ? `
          <div class="course-cols" aria-hidden="true"><span>Code</span><span>Title</span><span>ECTS</span><span>Grade</span><span>Minimum</span><span></span></div>
          <div class="course-list" role="list" aria-label="Courses in ${esc(sem.name)}">${courses}</div>` : '<p class="muted small">No courses yet.</p>'}
          <button type="button" class="btn btn-small" data-act="add-course" data-sid="${esc(sem.id)}" data-k="${k}:add">+ Add course</button>
        </article>`;
    }).join('');
    return `
      <div class="block-head">
        <h2 id="semesters-h">Semesters</h2>
        <button type="button" class="btn btn-primary" data-act="add-sem" data-k="add-sem">+ Add semester <span class="muted-on-primary">(${esc(nextTermName())})</span></button>
      </div>
      ${body || '<div class="card empty"><p>No semesters yet. Add one to start tracking.</p></div>'}`;
  }

  const STATUS_LABEL = { todo: 'Not started', ip: 'In progress', incomplete: 'Incomplete', below: 'Below minimum', done: 'Completed' };

  function slotHtml(slot) {
    const st = slotStatus(slot);
    const c = slot.course;
    const k = `p:${slot.id}`;
    let alt = slot.alt;
    let body = '';

    if (slot.options && slot.options.length > 1) {
      const matchedIdx = alt ? slot.alternatives.indexOf(alt) : -1;
      let sel = matchedIdx >= 0 ? matchedIdx : (state.plan.choices[slot.id] || 0);
      if (sel >= slot.options.length) sel = 0;
      if (!alt) alt = slot.alternatives[sel];
      const opts = slot.options.map((o, i) => `<option value="${i}"${i === sel ? ' selected' : ''}>${esc([o.code, o.title].filter(Boolean).join(' '))}</option>`).join('');
      body = `
        <label class="fl-vis" for="${k}:choice">Choose one</label>
        <select id="${k}:choice" data-act="plan-choice" data-slot="${esc(slot.id)}" data-k="${k}:choice"${matchedIdx >= 0 ? ' disabled title="Set by the course you took"' : ''}>${opts}</select>`;
    } else if (slot.options) {
      alt = alt || slot.alternatives[0];
    } else if (slot.elective) {
      const e = state.plan.electives[slot.id] || { code: '', title: '' };
      body = `
        <div class="elective-fields">
          <div class="field"><label class="fl-vis" for="${k}:ecode">Code</label>
            <input id="${k}:ecode" class="mono" type="text" autocomplete="off" spellcheck="false" data-act="elective" data-slot="${esc(slot.id)}" data-field="code" data-k="${k}:ecode" value="${esc(e.code)}" placeholder="e.g. ELCE 4xx"></div>
          <div class="field"><label class="fl-vis" for="${k}:etitle">Course you take</label>
            <input id="${k}:etitle" type="text" autocomplete="off" data-act="elective" data-slot="${esc(slot.id)}" data-field="title" data-k="${k}:etitle" value="${esc(e.title)}" placeholder="Title"></div>
        </div>
        ${slot.specLab ? '<p class="slot-note">Can be replaced by an ECE Discipline Elective.</p>' : ''}`;
      alt = null;
    } else {
      alt = alt || slot.alternatives[0];
    }

    const minRaw = alt ? alt.minGrade : slot.minGrade;
    const min = resolveMin(minRaw);
    const code = slot.elective ? '' : (alt ? alt.code : slot.code);
    // Multi-option slots show their options in the dropdown instead of a title line.
    const title = slot.elective ? slot.title : (slot.options && slot.options.length > 1 ? '' : alt.title);
    const canAdd = st === 'todo' || st === 'below';
    const picker = ui.addingSlot === slot.id ? pickerHtml(slot) : '';
    const gradeHtml = c && (st === 'done' || st === 'below') ? chip(c.grade) : '';
    const where = c && ui.addingSlot !== slot.id ? `<span class="slot-where">${esc(slot.sem.name)}</span>` : '';

    return `
      <li class="slot st-${st}${slot.extra ? ' is-extra' : ''}" data-key="${esc(slot.id)}">
        <div class="slot-top">
          <span class="slot-code mono">${esc(code.replace('/', ' / '))}</span>
          <span class="status st-${st}">${STATUS_LABEL[st]}${gradeHtml ? ' ' + gradeHtml : ''}</span>
        </div>
        ${title ? `<p class="slot-title">${esc(title)}</p>` : ''}
        ${slot.extra ? '<p class="slot-note">Extra requirement (IELTS below 6.5), in addition to 248 ECTS.</p>' : ''}
        ${slot.ascSeparate ? '<p class="slot-note">ASC 100 is counted separately (IELTS setting).</p>' : ''}
        ${body}
        <div class="slot-meta">
          <span class="mono">${fmtNum(slot.ects)} ECTS</span>
          <span title="${minRaw === 'D*' ? 'D* rule: D if Kazakh level is Advanced, otherwise C-' : 'Minimum required grade'}">min <strong class="mono">${esc(min)}${minRaw === 'D*' ? '*' : ''}</strong></span>
          ${where}
        </div>
        ${st === 'below' ? `<p class="slot-note bad">Below minimum (${esc(min)} required). Must retake.</p>` : ''}
        ${canAdd && !picker ? `<button type="button" class="btn btn-small btn-add" data-act="open-picker" data-slot="${esc(slot.id)}" data-k="${k}:add">${st === 'below' ? 'Add retake to semester' : 'Add to semester'}</button>` : ''}
        ${picker}
      </li>`;
  }

  function pickerHtml(slot) {
    const k = `p:${slot.id}`;
    const sems = [...state.semesters].reverse();
    const sel = ui.pickerSem || (sems[0] ? sems[0].id : '__new');
    const opts = sems.map((s) => `<option value="${esc(s.id)}"${s.id === sel ? ' selected' : ''}>${esc(s.name)}</option>`).join('')
      + `<option value="__new"${sel === '__new' ? ' selected' : ''}>New semester (${esc(nextTermName())})</option>`;
    return `
      <div class="picker" data-key="picker">
        <label class="fl-vis" for="${k}:sem">Add to</label>
        <select id="${k}:sem" data-act="picker-sem" data-k="${k}:sem">${opts}</select>
        <div class="picker-btns">
          <button type="button" class="btn btn-primary btn-small" data-act="confirm-picker" data-slot="${esc(slot.id)}" data-k="${k}:ok">Add</button>
          <button type="button" class="btn btn-small" data-act="cancel-picker" data-k="${k}:cancel">Cancel</button>
        </div>
      </div>`;
  }

  function renderPlan(an) {
    const slots = an.slots;
    const planTotal = CURRICULUM.reduce((a, s) => a + s.ects, 0);
    const countDone = slots.filter((s) => slotStatus(s) === 'done').length;
    const ectsDone = slots.filter((s) => slotStatus(s) === 'done').reduce((a, s) => a + s.ects, 0);
    const years = [1, 2, 3, 4].map((y) => {
      const terms = ['Fall', 'Spring'].map((term) => {
        const ts = slots.filter((s) => s.year === y && s.term === term);
        const req = ts.filter((s) => !s.extra).reduce((a, s) => a + s.ects, 0);
        const extra = ts.filter((s) => s.extra).reduce((a, s) => a + s.ects, 0);
        return `
          <div class="term">
            <h4 class="term-h"><span>${term}</span><span class="mono muted">${req} ECTS${extra ? ` + ${extra} extra` : ''}</span></h4>
            <ul class="slots">${ts.map(slotHtml).join('')}</ul>
          </div>`;
      }).join('');
      return `<div class="year"><h3 class="year-h">Year ${y}</h3><div class="terms">${terms}</div></div>`;
    }).join('');
    const notes = PROGRAM_NOTES.map((n) => `<li>${esc(n)}</li>`).join('');
    return `
      <div class="block-head">
        <h2 id="plan-h">Degree plan</h2>
        <p class="muted">${countDone} of ${slots.length} courses completed · <span class="mono">${ectsDone}</span> / <span class="mono">${planTotal}${state.settings.needsASC100 ? ' + 6' : ''}</span> ECTS</p>
      </div>
      <div class="card notes">
        <h3 class="notes-h">Program rules</h3>
        <ul>${notes}</ul>
        <p class="muted small">Courses are matched to plan slots by code (or by title when the slot has no code), whichever semester you take them in. Your settings: Kazakh level ${state.settings.kazakhAdvanced ? '<strong>Advanced</strong> (D* = D)' : '<strong>not Advanced</strong> (D* = C-)'}; IELTS ${state.settings.needsASC100 ? '<strong>below 6.5</strong> (ASC 100 extra)' : '<strong>6.5 or above</strong>'}.</p>
      </div>
      <div class="years">${years}</div>`;
  }

  function renderSettings() {
    const cut = state.settings.cutoffs;
    const vals = CUTOFF_LETTERS.map((l) => num(cut[l]));
    const descending = vals.every((v, i) => Number.isFinite(v) && (i === 0 || v < vals[i - 1]));
    const fields = CUTOFF_LETTERS.map((l) => `
      <div class="field cutoff">
        <label for="cut-${l}">${chip(l)}<span class="sr-only"> minimum percentage</span></label>
        <input id="cut-${l}" class="mono" type="text" inputmode="decimal" data-act="cutoff" data-letter="${l}" data-k="cut:${l}" value="${esc(cut[l])}">
      </div>`).join('');
    return `
      <div class="card-head"><h2 id="settings-h">Settings</h2></div>
      <div class="settings-grid">
        <fieldset>
          <legend>Program</legend>
          <label class="toggle"><input type="checkbox" data-act="setting" data-setting="kazakhAdvanced" data-k="set-kaz"${state.settings.kazakhAdvanced ? ' checked' : ''}>
            <span><strong>My Kazakh level is Advanced</strong><span class="hint">D* minimum becomes D instead of C-.</span></span></label>
          <label class="toggle"><input type="checkbox" data-act="setting" data-setting="needsASC100" data-k="set-ielts"${state.settings.needsASC100 ? ' checked' : ''}>
            <span><strong>My IELTS is below 6.5</strong><span class="hint">ASC 100 (6 ECTS) becomes an extra requirement on top of 248 ECTS and no longer fills the Year 1 Fall language slot.</span></span></label>
        </fieldset>
        <fieldset>
          <legend>Projected-letter cutoffs (minimum %)</legend>
          <div class="cutoffs">${fields}<div class="field cutoff"><span class="cut-f">${chip('F')}</span><span class="mono muted">below</span></div></div>
          ${descending ? '' : '<p class="note warn">Cutoffs should decrease from A to D.</p>'}
          <button type="button" class="btn btn-small" data-act="reset-cutoffs" data-k="reset-cutoffs">Reset to defaults</button>
        </fieldset>
      </div>`;
  }

  // ---------------------------------------------------------------------------
  // DOM patching: keeps focus, caret and open dropdowns intact between renders.
  // ---------------------------------------------------------------------------
  function sameNode(a, b) {
    if (a.nodeType !== b.nodeType || a.nodeName !== b.nodeName) return false;
    if (a.nodeType === 1 && (a.getAttribute('data-key') || '') !== (b.getAttribute('data-key') || '')) return false;
    return true;
  }

  function morphChildren(from, to) {
    const fc = Array.from(from.childNodes);
    const tc = Array.from(to.childNodes);
    tc.forEach((t, i) => {
      const f = fc[i];
      if (!f) from.appendChild(t);
      else if (!sameNode(f, t)) from.replaceChild(t, f);
      else if (f.nodeType === 1) morphEl(f, t);
      else if (f.nodeValue !== t.nodeValue) f.nodeValue = t.nodeValue;
    });
    for (let i = tc.length; i < fc.length; i++) from.removeChild(fc[i]);
  }

  function morphEl(from, to) {
    for (const { name } of Array.from(from.attributes)) {
      if (!to.hasAttribute(name) && !(name === 'open' && from.nodeName === 'DETAILS')) from.removeAttribute(name);
    }
    for (const { name, value } of Array.from(to.attributes)) {
      if (from.getAttribute(name) !== value) from.setAttribute(name, value);
    }
    morphChildren(from, to);
    if (from.nodeName === 'INPUT') {
      if (from.type === 'checkbox') from.checked = to.checked;
      else if (from !== document.activeElement && from.value !== to.value) from.value = to.value;
    } else if (from.nodeName === 'SELECT') {
      if (from.value !== to.value) from.value = to.value;
    }
  }

  function patch(container, html) {
    const tmp = document.createElement(container.nodeName);
    tmp.innerHTML = html;
    morphChildren(container, tmp);
  }

  function render() {
    const an = analyze();
    const st = stats(an);
    const $ = (id) => document.getElementById(id);
    patch($('summary'), renderSummary(st));
    patch($('progress'), renderProgress(st));
    patch($('trend'), renderTrend(st, $('trend')));
    patch($('calc'), renderCalc(st));
    patch($('spread'), renderSpread());
    patch($('semesters'), renderSemesters(st, an));
    patch($('plan'), renderPlan(an));
    patch($('settings'), renderSettings());
    renderThemeButton();
    if (ui.focus) {
      const el = document.querySelector(`[data-k="${CSS.escape(ui.focus)}"]`);
      ui.focus = null;
      if (el) el.focus();
    }
  }

  function commit() { save(); render(); }

  // ---------------------------------------------------------------------------
  // Lookups & actions
  // ---------------------------------------------------------------------------
  const findSem = (id) => state.semesters.find((s) => s.id === id);
  function findCourse(id) {
    for (const s of state.semesters) {
      const c = s.courses.find((x) => x.id === id);
      if (c) return c;
    }
    return null;
  }

  function addSemester() {
    const sem = { id: uid(), name: nextTermName(), courses: [] };
    state.semesters.push(sem);
    return sem;
  }

  function addFromSlot(slotId) {
    const slot = planSlots().find((s) => s.id === slotId);
    if (!slot) return;
    let code = slot.code; let title = slot.title;
    if (slot.options && slot.options.length) {
      let i = state.plan.choices[slot.id] || 0;
      if (i >= slot.options.length) i = 0;
      code = slot.options[i].code; title = slot.options[i].title;
    } else if (slot.elective) {
      const e = state.plan.electives[slot.id];
      code = e ? e.code : '';
      title = e && e.title ? e.title : slot.title;
    }
    const sem = ui.pickerSem && ui.pickerSem !== '__new' ? findSem(ui.pickerSem) : null;
    const target = sem || (ui.pickerSem === '__new' || !state.semesters.length ? addSemester() : state.semesters[state.semesters.length - 1]);
    const course = newCourse({ code, title, ects: slot.ects });
    target.courses.push(course);
    ui.addingSlot = null;
    ui.pickerSem = null;
    ui.focus = `p:${slot.id}:add`;
    flash(`Added ${code || title} to ${target.name}.`, 'ok');
  }

  function exportData() {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `grade-ledger-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  function importFile(file) {
    const reader = new FileReader();
    reader.onload = () => {
      let d;
      try { d = JSON.parse(reader.result); } catch (e) {
        flash('Import failed: the file is not valid JSON. Your data was not changed.', 'bad');
        return;
      }
      const err = validateData(d);
      if (err) { flash(`Import failed: ${err} Your data was not changed.`, 'bad'); return; }
      state = normalize(d);
      ui.confirmDelete = null; ui.addingSlot = null;
      commit();
      flash(`Imported ${plural(state.semesters.length, 'semester')} from ${file.name}.`, 'ok');
    };
    reader.onerror = () => flash('Import failed: could not read the file.', 'bad');
    reader.readAsText(file);
  }

  // Autofill title and ECTS from the plan when the code (or title, for code-less courses) matches.
  function autofill(c) {
    const hit = lookupPlan(c.code, c.title, c.id);
    if (!hit) return;
    const titles = allPlanTitles();
    if (!c.title.trim() || titles.has(c.title)) c.title = hit.title;
    c.ects = hit.ects;
  }

  // ---------------------------------------------------------------------------
  // Theme
  // ---------------------------------------------------------------------------
  const systemDark = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  const currentTheme = () => document.documentElement.dataset.theme || (systemDark && systemDark.matches ? 'dark' : 'light');

  function renderThemeButton() {
    const btn = document.getElementById('theme-btn');
    const dark = currentTheme() === 'dark';
    btn.setAttribute('aria-label', dark ? 'Switch to light mode' : 'Switch to dark mode');
    btn.title = btn.getAttribute('aria-label');
    btn.innerHTML = dark
      ? '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4.5"/><path d="M12 2v2.5M12 19.5V22M4.2 4.2l1.8 1.8M18 18l1.8 1.8M2 12h2.5M19.5 12H22M4.2 19.8 6 18M18 6l1.8-1.8"/></svg>'
      : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.5 14.5A8.5 8.5 0 0 1 9.5 3.5a8.5 8.5 0 1 0 11 11Z"/></svg>';
  }

  // ---------------------------------------------------------------------------
  // Events
  // ---------------------------------------------------------------------------
  function onInput(e) {
    const el = e.target.closest('[data-act]');
    if (!el) return;
    const act = el.dataset.act;
    const v = el.value;
    if (act === 'sem-name') {
      const s = findSem(el.dataset.sid); if (s) s.name = v;
    } else if (act === 'course') {
      const c = findCourse(el.dataset.cid); if (!c) return;
      c[el.dataset.field] = v;
      if (el.dataset.field === 'code' || (el.dataset.field === 'title' && !c.code.trim())) autofill(c);
    } else if (act === 'asmt') {
      const c = findCourse(el.dataset.cid);
      const a = c && c.assessments.find((x) => x.id === el.dataset.aid);
      if (a) a[el.dataset.field] = v;
    } else if (act === 'calc') {
      state.calc[el.dataset.field] = v.trim();
    } else if (act === 'cutoff') {
      state.settings.cutoffs[el.dataset.letter] = v.trim();
    } else if (act === 'elective') {
      const e2 = state.plan.electives[el.dataset.slot] || (state.plan.electives[el.dataset.slot] = { code: '', title: '' });
      e2[el.dataset.field] = v;
    } else {
      return;
    }
    commit();
  }

  function onChange(e) {
    const el = e.target;
    const act = el.dataset.act;
    if (el.id === 'import-file') {
      if (el.files && el.files[0]) importFile(el.files[0]);
      el.value = '';
      return;
    }
    if (act === 'grade') {
      const c = findCourse(el.dataset.cid); if (c) c.grade = el.value;
    } else if (act === 'plan-choice') {
      state.plan.choices[el.dataset.slot] = Number(el.value);
    } else if (act === 'setting') {
      state.settings[el.dataset.setting] = el.checked;
    } else if (act === 'picker-sem') {
      ui.pickerSem = el.value; render(); return;
    } else {
      return;
    }
    commit();
  }

  function onClick(e) {
    const el = e.target.closest('button[data-act]');
    if (!el) return;
    const d = el.dataset;
    switch (d.act) {
      case 'add-sem': {
        const sem = addSemester();
        ui.focus = `s:${sem.id}:name`;
        break;
      }
      case 'del-sem': ui.confirmDelete = d.sid; ui.focus = `s:${d.sid}:cancel`; render(); return;
      case 'cancel-del-sem': ui.focus = `s:${ui.confirmDelete}:del`; ui.confirmDelete = null; render(); return;
      case 'confirm-del-sem': {
        const sem = findSem(d.sid);
        state.semesters = state.semesters.filter((s) => s.id !== d.sid);
        ui.confirmDelete = null;
        ui.focus = 'add-sem';
        if (sem) flash(`Deleted ${sem.name || 'semester'}.`);
        break;
      }
      case 'add-course': {
        const sem = findSem(d.sid); if (!sem) return;
        const c = newCourse({});
        sem.courses.push(c);
        ui.focus = `c:${c.id}:code`;
        break;
      }
      case 'del-course': {
        const sem = findSem(d.sid); if (!sem) return;
        sem.courses = sem.courses.filter((c) => c.id !== d.cid);
        ui.focus = `s:${sem.id}:add`;
        break;
      }
      case 'toggle-bd': {
        const c = findCourse(d.cid); if (!c) return;
        c.open = !c.open;
        break;
      }
      case 'add-asmt': {
        const c = findCourse(d.cid); if (!c) return;
        const a = { id: uid(), name: '', weight: '', score: '' };
        c.assessments.push(a);
        ui.focus = `a:${a.id}:name`;
        break;
      }
      case 'del-asmt': {
        const c = findCourse(d.cid); if (!c) return;
        c.assessments = c.assessments.filter((a) => a.id !== d.aid);
        ui.focus = `add-asmt:${c.id}`;
        break;
      }
      case 'reset-cutoffs': state.settings.cutoffs = Object.assign({}, DEFAULT_CUTOFFS); break;
      case 'open-picker': ui.addingSlot = d.slot; ui.pickerSem = null; ui.focus = `p:${d.slot}:sem`; render(); return;
      case 'cancel-picker': ui.focus = `p:${ui.addingSlot}:add`; ui.addingSlot = null; render(); return;
      case 'confirm-picker': addFromSlot(d.slot); break;
      default: return;
    }
    commit();
  }

  // Shared tooltip for chart marks and spread segments.
  function setupTooltip() {
    const tip = document.createElement('div');
    tip.className = 'tip';
    tip.hidden = true;
    document.body.appendChild(tip);
    const place = (x, y) => {
      const r = tip.getBoundingClientRect();
      let left = x + 14; let top = y + 14;
      if (left + r.width > window.innerWidth - 8) left = x - r.width - 14;
      if (top + r.height > window.innerHeight - 8) top = y - r.height - 14;
      tip.style.left = `${Math.max(8, left)}px`;
      tip.style.top = `${Math.max(8, top)}px`;
    };
    const show = (el, x, y) => { tip.textContent = el.getAttribute('data-tip'); tip.hidden = false; place(x, y); el.classList.add('is-hover'); };
    const hide = (el) => { tip.hidden = true; if (el) el.classList.remove('is-hover'); };
    document.addEventListener('pointermove', (e) => {
      const el = e.target.closest && e.target.closest('[data-tip]');
      document.querySelectorAll('[data-tip].is-hover').forEach((x) => { if (x !== el) x.classList.remove('is-hover'); });
      if (el) show(el, e.clientX, e.clientY); else if (!tip.hidden) hide();
    });
    document.addEventListener('focusin', (e) => {
      const el = e.target.closest && e.target.closest('[data-tip]');
      if (el) { const r = el.getBoundingClientRect(); show(el, r.left + r.width / 2, r.top); }
    });
    document.addEventListener('focusout', (e) => { if (e.target.closest && e.target.closest('[data-tip]')) hide(e.target); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') hide(); });
  }

  function init() {
    state = load();
    document.addEventListener('input', onInput);
    document.addEventListener('change', onChange);
    document.addEventListener('click', onClick);
    document.getElementById('export-btn').addEventListener('click', exportData);
    document.getElementById('import-btn').addEventListener('click', () => document.getElementById('import-file').click());
    document.getElementById('theme-btn').addEventListener('click', () => {
      const next = currentTheme() === 'dark' ? 'light' : 'dark';
      document.documentElement.dataset.theme = next;
      try { localStorage.setItem(THEME_KEY, next); } catch (e) { /* theme just won't persist */ }
      renderThemeButton();
    });
    if (systemDark && systemDark.addEventListener) systemDark.addEventListener('change', renderThemeButton);
    let resizeTimer;
    window.addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(render, 120); });
    setupTooltip();
    render();
    // Persist first-visit data right away so it survives a reload.
    try { if (!localStorage.getItem(STORAGE_KEY)) localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) { /* ignore */ }
  }

  // Exposed for testing in the console.
  window.GradeLedger = {
    get state() { return state; }, analyze: () => analyze(), stats: () => stats(analyze()),
    breakdown, letterForPct, GRADE_POINTS,
  };

  init();
}());
