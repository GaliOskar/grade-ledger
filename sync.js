'use strict';

/*
 * Optional account sync. Grade Ledger keeps working from localStorage, and this file copies the
 * record to Supabase, where Command Center reads it. The upload also carries a summary calculated
 * by app.js, so Command Center shows these exact numbers rather than recalculating them.
 *
 * The whole record is one row, and the newest edit wins. Whenever a copy is about to be replaced
 * after local edits, the old one is kept in localStorage under BACKUP_KEY.
 */
(function () {
  const RECORD_ID = 'grade-ledger';
  const META_KEY = 'eceTracker.sync.v1';
  const BACKUP_KEY = 'eceTracker.data.backup';
  const PUSH_DELAY_MS = 800;

  const config = window.LEDGER_SYNC_CONFIG || {};
  const api = window.GradeLedger;
  if (!config.url || !config.key || !window.supabase || !api) return; // Local-only mode.

  const client = window.supabase.createClient(config.url, config.key, {
    auth: { persistSession: true, autoRefreshToken: true },
  });

  const button = document.getElementById('sync-btn');
  let session = null;
  let running = false;
  let queued = false;
  let pushTimer;
  let lastStatus = '';

  /* ---------- metadata ---------- */

  // editedAt: last local edit. syncedAt: the account version this browser is based on (null = never).
  function readMeta() {
    try {
      return Object.assign({ editedAt: 0, syncedAt: null, dirty: false }, JSON.parse(localStorage.getItem(META_KEY)));
    } catch (e) {
      return { editedAt: 0, syncedAt: null, dirty: false };
    }
  }
  function writeMeta(meta) {
    try { localStorage.setItem(META_KEY, JSON.stringify(meta)); } catch (e) { /* retried next sync */ }
  }
  function backupLocal() {
    try { localStorage.setItem(BACKUP_KEY, JSON.stringify(api.state)); } catch (e) { /* best effort */ }
  }

  /* ---------- status and dialog ---------- */

  function setStatus(text) {
    lastStatus = text;
    button.textContent = text;
    const line = document.getElementById('sync-status');
    if (line) line.textContent = text;
  }

  const dialog = document.createElement('dialog');
  dialog.className = 'sync-dialog';
  dialog.innerHTML = `
    <form id="sync-signin" class="sync-form">
      <h2>Sync with Command Center</h2>
      <p class="muted">Sign in with your Command Center account to back up your grades and show them there. Only your account can read them.</p>
      <div class="field"><label for="sync-email">Email</label><input id="sync-email" type="email" autocomplete="username" required></div>
      <div class="field"><label for="sync-password">Password</label><input id="sync-password" type="password" autocomplete="current-password" required></div>
      <p id="sync-error" class="note warn" role="alert" hidden></p>
      <div class="sync-actions">
        <button type="button" class="btn btn-ghost" data-sync="close">Cancel</button>
        <button type="submit" class="btn btn-primary">Sign in</button>
      </div>
    </form>
    <div id="sync-account" class="sync-form" hidden>
      <h2>Sync with Command Center</h2>
      <p id="sync-who" class="muted"></p>
      <p id="sync-status" role="status"></p>
      <div class="sync-actions">
        <button type="button" class="btn btn-ghost" data-sync="signout">Sign out</button>
        <button type="button" class="btn btn-ghost" data-sync="close">Close</button>
        <button type="button" class="btn btn-primary" data-sync="now">Sync now</button>
      </div>
    </div>`;
  document.body.appendChild(dialog);

  const $ = (id) => dialog.querySelector('#' + id);

  function showDialogView() {
    $('sync-signin').hidden = !!session;
    $('sync-account').hidden = !session;
    if (session) {
      $('sync-who').textContent = 'Signed in as ' + (session.user.email || 'your account') + '.';
      $('sync-status').textContent = lastStatus;
    }
  }

  button.hidden = false;
  button.addEventListener('click', () => { showDialogView(); dialog.showModal(); });

  dialog.addEventListener('click', (e) => {
    const action = e.target.dataset && e.target.dataset.sync;
    if (action === 'close') dialog.close();
    if (action === 'now') syncNow();
    if (action === 'signout') {
      client.auth.signOut({ scope: 'local' }).finally(() => {
        session = null;
        setStatus('Sign in to sync');
        dialog.close();
      });
    }
  });

  $('sync-signin').addEventListener('submit', async (e) => {
    e.preventDefault();
    const error = $('sync-error');
    error.hidden = true;
    const { data, error: authError } = await client.auth.signInWithPassword({
      email: $('sync-email').value.trim(),
      password: $('sync-password').value,
    });
    if (authError) {
      error.textContent = navigator.onLine ? authError.message : 'You are offline. Signing in needs a connection.';
      error.hidden = false;
      return;
    }
    session = data.session;
    $('sync-password').value = '';
    dialog.close();
    syncNow();
  });

  /* ---------- sync ---------- */

  async function fetchRemote() {
    const { data, error } = await client
      .from('records')
      .select('data, updated_at, deleted')
      .eq('id', RECORD_ID)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data && !data.deleted ? data : null;
  }

  async function push(meta) {
    const payload = api.syncPayload();
    const sentAt = Math.max(meta.editedAt || Date.now(), (meta.syncedAt || 0) + 1);
    const { error } = await client.from('records').upsert({
      user_id: session.user.id,
      id: RECORD_ID,
      collection: 'gradeLedger',
      data: payload,
      updated_at: sentAt,
      deleted: false,
    }, { onConflict: 'user_id,id' });
    if (error) throw new Error(error.message);
    // An edit made during the upload stays dirty, so the next sync sends it.
    const now = readMeta();
    now.syncedAt = sentAt;
    if (now.editedAt <= sentAt) now.dirty = false;
    writeMeta(now);
    return now.dirty;
  }

  function applyRemote(remote) {
    if (!api.applySynced(remote.data.state)) throw new Error('The account copy could not be read');
    writeMeta({ editedAt: remote.updated_at, syncedAt: remote.updated_at, dirty: false });
  }

  /** Grades or scores in this browser that would be lost by taking the account copy. */
  function hasOwnData(meta) {
    if (meta.dirty) return true;
    return api.state.semesters.some((sem) => sem.courses.some((c) => (
      c.grade !== 'IP' || (c.assessments || []).some((a) => a.score !== '' && a.score != null)
    )));
  }

  async function reconcile() {
    const meta = readMeta();
    const remote = await fetchRemote();

    if (!remote) return push(meta); // First upload to this account.

    if (meta.syncedAt == null) { // First sync in this browser.
      if (!hasOwnData(meta)) { applyRemote(remote); return false; }
      if (JSON.stringify(api.state) === JSON.stringify(remote.data.state)) {
        writeMeta({ editedAt: remote.updated_at, syncedAt: remote.updated_at, dirty: false });
        return false;
      }
      backupLocal();
      const useAccount = window.confirm(
        'This browser and your account have different grades.\n\n'
        + 'OK: use the copy from your account.\n'
        + 'Cancel: replace your account copy with the grades in this browser.\n\n'
        + 'Either way, export a backup first if you are unsure.',
      );
      if (useAccount) { applyRemote(remote); return false; }
      meta.editedAt = Math.max(Date.now(), remote.updated_at + 1);
      meta.dirty = true;
      writeMeta(meta);
      return push(meta);
    }

    if (remote.updated_at > meta.syncedAt) { // Changed on another device.
      if (meta.dirty && meta.editedAt > remote.updated_at) return push(meta);
      if (meta.dirty) {
        backupLocal();
        api.flash('A newer copy from another device replaced your unsynced edits here.', 'bad');
      }
      applyRemote(remote);
      return false;
    }

    return meta.dirty ? push(meta) : false;
  }

  async function syncNow() {
    if (running) { queued = true; return; }
    if (!session) { setStatus('Sign in to sync'); return; }
    if (!navigator.onLine) { setStatus('Offline: will sync later'); return; }
    running = true;
    setStatus('Syncing…');
    try {
      const again = await reconcile();
      if (again) queued = true;
      const time = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
      setStatus('Synced ' + time);
    } catch (err) {
      setStatus(navigator.onLine ? 'Sync failed: will retry' : 'Offline: will sync later');
      console.warn('Grade Ledger sync failed:', err);
    } finally {
      running = false;
      if (queued) {
        queued = false;
        syncNow();
      }
    }
  }

  /* ---------- wiring ---------- */

  window.LedgerSync = {
    /** Called by app.js after every saved edit. */
    onLocalChange() {
      const meta = readMeta();
      meta.editedAt = Math.max(Date.now(), (meta.syncedAt || 0) + 1, meta.editedAt + 1);
      meta.dirty = true;
      writeMeta(meta);
      clearTimeout(pushTimer);
      pushTimer = setTimeout(syncNow, PUSH_DELAY_MS);
    },
  };

  window.addEventListener('online', syncNow);
  window.addEventListener('focus', syncNow);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') syncNow();
  });

  setStatus('Sign in to sync');
  client.auth.getSession().then(({ data }) => {
    session = data.session;
    syncNow();
  });
}());
