/* ═══════════════════════════════════════════
   Biblio PDF — admin.js
   ═══════════════════════════════════════════ */

const { createClient } = supabase;
const db = createClient(SUPABASE_URL, SUPABASE_KEY);

/* ─── Toast ─── */
function showToast(msg, duration = 2800) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), duration);
}

/* ─── Authentification (côté client, suffisant pour usage personnel) ─── */
const gate    = document.getElementById('passwordGate');
const content = document.getElementById('adminContent');

function unlock() {
  gate.style.display    = 'none';
  content.style.display = 'block';
  loadAll();
  initCursor();
  initOnlinePresence();
}

document.getElementById('passwordConfirm').addEventListener('click', checkPassword);
document.getElementById('passwordInput').addEventListener('keydown', e => {
  if (e.key === 'Enter') checkPassword();
});

async function checkPassword() {
  const val = document.getElementById('passwordInput').value;
  const btn = document.getElementById('passwordConfirm');
  btn.disabled = true;
  btn.textContent = '...';

  try {
    const res = await fetch('/.netlify/functions/check-admin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: val }),
    });
    const { ok } = await res.json();

    if (ok) {
      sessionStorage.setItem('biblio_admin', '1');
      unlock();
    } else {
      document.getElementById('passwordError').textContent = 'Mot de passe incorrect.';
      document.getElementById('passwordInput').value = '';
      document.getElementById('passwordInput').focus();
    }
  } catch {
    document.getElementById('passwordError').textContent = 'Erreur reseau, reessayez.';
  } finally {
    btn.disabled = false;
    btn.textContent = 'Entrer';
  }
}

if (sessionStorage.getItem('biblio_admin') === '1') {
  unlock();
}

/* Curseur actif dès le chargement, même sur l'écran de login */
initCursor();

document.getElementById('logoutBtn').addEventListener('click', () => {
  sessionStorage.removeItem('biblio_admin');
  location.reload();
});

/* ─── État ─── */
let selectedFile    = null;
let allPdfs         = [];
let allDownloads    = [];
let allRatings      = [];
let allSubmissions  = [];

/* ─── Drop zone ─── */
const dropZone    = document.getElementById('dropZone');
const fileInput   = document.getElementById('fileInputReal');
const browseLink  = document.getElementById('browseLink');
const fileInfo    = document.getElementById('fileSelectedInfo');
const fileNameEl  = document.getElementById('selectedFileName');
const fileSizeEl  = document.getElementById('selectedFileSize');

browseLink.addEventListener('click', () => fileInput.click());
dropZone.addEventListener('click',   () => fileInput.click());

dropZone.addEventListener('dragover', e => {
  e.preventDefault();
  dropZone.classList.add('drag-over');
});
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
dropZone.addEventListener('drop', e => {
  e.preventDefault();
  dropZone.classList.remove('drag-over');
  const f = e.dataTransfer.files[0];
  if (f && f.type === 'application/pdf') setFile(f);
  else showToast('Veuillez deposer un fichier PDF.');
});

fileInput.addEventListener('change', () => {
  if (fileInput.files[0]) setFile(fileInput.files[0]);
});

function setFile(f) {
  selectedFile = f;
  fileNameEl.textContent = f.name;
  fileSizeEl.textContent = formatSize(f.size);
  fileInfo.classList.remove('hidden');
  /* Pré-remplir le titre si vide */
  const titleInput = document.getElementById('fTitle');
  if (!titleInput.value) {
    titleInput.value = f.name.replace(/\.pdf$/i, '').replace(/[-_]/g, ' ');
  }
}

function formatSize(bytes) {
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + ' Ko';
  return (bytes / (1024 * 1024)).toFixed(1) + ' Mo';
}

/* ─── Soumission du formulaire ─── */
document.getElementById('pdfForm').addEventListener('submit', async e => {
  e.preventDefault();
  if (!selectedFile) { showToast('Veuillez selectionner un fichier PDF.'); return; }

  const title = document.getElementById('fTitle').value.trim();
  if (!title) { showToast('Le titre est obligatoire.'); return; }

  const btn = document.getElementById('submitBtn');
  btn.disabled   = true;
  btn.textContent = 'Publication en cours...';

  const progressWrap = document.getElementById('uploadProgress');
  const progressBar  = document.getElementById('uploadProgressBar');
  progressWrap.classList.add('visible');

  try {
    /* 1. Upload vers Supabase Storage */
    const fileName  = `${Date.now()}_${selectedFile.name.replace(/\s+/g, '_')}`;
    progressBar.style.width = '30%';

    const { data: storageData, error: storageErr } = await db.storage
      .from('pdfs')
      .upload(fileName, selectedFile, { contentType: 'application/pdf', upsert: false });

    if (storageErr) throw storageErr;
    progressBar.style.width = '65%';

    /* 2. URL publique */
    const { data: urlData } = db.storage.from('pdfs').getPublicUrl(fileName);
    const fileUrl = urlData.publicUrl;
    progressBar.style.width = '80%';

    /* 3. Insert metadata en base */
    const { error: dbErr } = await db.from('pdfs').insert({
      title,
      description: document.getElementById('fDesc').value.trim() || null,
      category:    document.getElementById('fCat').value.trim()  || 'General',
      pages:       parseInt(document.getElementById('fPages').value) || 0,
      file_url:    fileUrl,
      file_name:   selectedFile.name,
      file_size:   formatSize(selectedFile.size),
    });

    if (dbErr) throw dbErr;
    progressBar.style.width = '100%';

    showToast('Document publie avec succes !');
    resetForm();
    await loadAll();

  } catch (err) {
    showToast('Erreur : ' + (err.message || 'Echec de la publication.'));
    console.error(err);
  } finally {
    btn.disabled    = false;
    btn.textContent = 'Publier le document';
    setTimeout(() => {
      progressWrap.classList.remove('visible');
      progressBar.style.width = '0%';
    }, 800);
  }
});

function resetForm() {
  document.getElementById('pdfForm').reset();
  selectedFile = null;
  fileInfo.classList.add('hidden');
  fileNameEl.textContent = '';
  fileSizeEl.textContent = '';
  fileInput.value = '';
}

/* ─── Chargement de toutes les données ─── */
let allConnections = [];

async function loadAll() {
  const [pdfsRes, dlRes, ratingRes, connRes, subRes] = await Promise.all([
    db.from('pdfs').select('*').order('created_at', { ascending: false }),
    db.from('downloads').select('id, pdf_id, user_pseudo, session_id, downloaded_at').order('downloaded_at', { ascending: false }),
    db.from('ratings').select('pdf_id, score, user_pseudo'),
    db.from('connections').select('*').order('connected_at', { ascending: false }),
    db.from('submissions').select('*').order('submitted_at', { ascending: false }),
  ]);

  allPdfs        = pdfsRes.data   || [];
  allDownloads   = dlRes.data     || [];
  allRatings     = ratingRes.data || [];
  allConnections = connRes.data   || [];
  allSubmissions = subRes.data    || [];

  document.getElementById('pdfCountBadge').textContent = allPdfs.length;

  const pending = allSubmissions.filter(s => s.status === 'pending').length;
  const badge   = document.getElementById('submissionsBadge');
  badge.textContent = pending || '';
  badge.style.display = pending ? 'inline-flex' : 'none';

  renderAdminList();
  renderSubmissions();
  renderHistory(allDownloads);
  renderConnections(allConnections);
}

/* ─── Liste admin des PDFs ─── */
function renderAdminList() {
  const container = document.getElementById('adminPdfList');
  if (allPdfs.length === 0) {
    container.innerHTML = '<div class="history-empty">Aucun document publie.</div>';
    return;
  }

  /* Calcul stats par PDF */
  const dlCount  = {};
  const avgRating = {};
  allDownloads.forEach(d => { dlCount[d.pdf_id]  = (dlCount[d.pdf_id]  || 0) + 1; });
  const ratingGroups = {};
  allRatings.forEach(r => {
    if (!ratingGroups[r.pdf_id]) ratingGroups[r.pdf_id] = [];
    ratingGroups[r.pdf_id].push(r.score);
  });
  Object.keys(ratingGroups).forEach(id => {
    const scores = ratingGroups[id];
    avgRating[id] = (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1);
  });

  container.innerHTML = allPdfs.map(pdf => {
    const dl  = dlCount[pdf.id]  || 0;
    const avg = avgRating[pdf.id] || null;
    const date = new Date(pdf.created_at).toLocaleDateString('fr-FR');
    return `
      <div class="admin-pdf-item">
        <div class="admin-pdf-info">
          <strong>${pdf.title}</strong>
          <div class="admin-pdf-meta">${pdf.category || 'General'} &middot; ${pdf.file_size || '—'} &middot; Publie le ${date}</div>
          <div class="admin-pdf-stats">
            <span class="stat-chip">&#8595; ${dl} telechargement${dl !== 1 ? 's' : ''}</span>
            ${avg ? `<span class="stat-chip">&#9733; ${avg} / 5 (${ratingGroups[pdf.id].length} note${ratingGroups[pdf.id].length > 1 ? 's' : ''})</span>` : '<span class="stat-chip">Pas encore note</span>'}
          </div>
        </div>
        <div class="admin-pdf-actions">
          <a href="${pdf.file_url}" target="_blank" class="btn secondary btn-sm">Voir</a>
          <button class="btn btn-danger btn-sm" data-delete-id="${pdf.id}" data-delete-name="${pdf.file_name || ''}">Supprimer</button>
        </div>
      </div>
    `;
  }).join('');

  /* Boutons supprimer */
  container.querySelectorAll('[data-delete-id]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id   = btn.dataset.deleteId;
      const name = btn.dataset.deleteName;
      if (!confirm(`Supprimer "${allPdfs.find(p => p.id === id)?.title}" ? Cette action est irreversible.`)) return;

      btn.disabled    = true;
      btn.textContent = '...';

      /* Supprimer du Storage si nom connu */
      if (name) {
        const storeName = name.includes('_') ? name : `${name}`;
        /* On tente de supprimer — peut echouer si le nom exact est different, ce n'est pas bloquant */
        const { data: files } = await db.storage.from('pdfs').list();
        if (files) {
          const match = files.find(f => f.name.endsWith(name) || f.name === name);
          if (match) await db.storage.from('pdfs').remove([match.name]);
        }
      }

      const { error } = await db.from('pdfs').delete().eq('id', id);
      if (error) {
        showToast('Erreur lors de la suppression.');
        btn.disabled    = false;
        btn.textContent = 'Supprimer';
      } else {
        showToast('Document supprime.');
        await loadAll();
      }
    });
  });

  updateCursorTargets();
}

/* ─── Disambiguïsation des pseudos identiques (admin uniquement) ─── */
function disambiguate(rows) {
  /* Pour chaque pseudo, on liste les session_ids dans l'ordre d'apparition */
  const pseudoSessions = {};
  rows.forEach(d => {
    const key = d.user_pseudo;
    if (!pseudoSessions[key]) pseudoSessions[key] = [];
    const sid = d.session_id || ('__nosession__' + d.id); /* fallback si colonne absente */
    if (!pseudoSessions[key].includes(sid)) pseudoSessions[key].push(sid);
  });

  return rows.map(d => {
    const sessions = pseudoSessions[d.user_pseudo];
    const sid      = d.session_id || ('__nosession__' + d.id);
    const idx      = sessions.indexOf(sid);
    /* N'ajoute le numéro que si plusieurs sessions partagent le même pseudo */
    const display  = sessions.length > 1 ? `${d.user_pseudo} (${idx + 1})` : d.user_pseudo;
    return { ...d, displayPseudo: display };
  });
}

/* ─── Historique ─── */
function renderHistory(rows) {
  const body = document.getElementById('historyBody');

  if (rows.length === 0) {
    body.innerHTML = '<tr><td colspan="3" class="history-empty">Aucun telechargement enregistre.</td></tr>';
    return;
  }

  const disambiguated = disambiguate(rows);

  body.innerHTML = disambiguated.map(d => {
    const pdf  = allPdfs.find(p => p.id === d.pdf_id);
    const date = new Date(d.downloaded_at).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
    return `<tr>
      <td>${pdf ? pdf.title : '<em style="color:var(--muted)">Document supprime</em>'}</td>
      <td><strong>${d.displayPseudo}</strong></td>
      <td>${date}</td>
    </tr>`;
  }).join('');
}

/* ─── Soumissions ─── */
function renderSubmissions() {
  const container = document.getElementById('submissionsList');
  if (allSubmissions.length === 0) {
    container.innerHTML = '<div class="history-empty">Aucune soumission pour le moment.</div>';
    return;
  }

  container.innerHTML = allSubmissions.map(s => {
    const date   = new Date(s.submitted_at).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
    const isPending = s.status === 'pending';
    return `
      <div class="submission-item ${s.status}" data-id="${s.id}">
        <div class="submission-info">
          <div class="submission-top">
            <strong>${s.title}</strong>
            <span class="submission-status ${s.status}">${s.status === 'pending' ? 'En attente' : s.status === 'approved' ? 'Approuve' : 'Refuse'}</span>
          </div>
          <div class="admin-pdf-meta">
            ${s.category || 'General'} &middot; ${s.file_size || '—'} &middot;
            Par <strong>${s.user_pseudo || 'Anonyme'}</strong> &middot; ${date}
          </div>
          ${s.description ? `<p class="submission-desc">${s.description}</p>` : ''}
        </div>
        <div class="submission-actions">
          <a href="${s.file_url}" target="_blank" class="btn secondary btn-sm">Voir</a>
          ${isPending ? `
            <button class="btn primary btn-sm" data-approve="${s.id}">Approuver</button>
            <button class="btn btn-danger btn-sm" data-reject="${s.id}">Refuser</button>
          ` : ''}
        </div>
      </div>
    `;
  }).join('');

  /* Approuver */
  container.querySelectorAll('[data-approve]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id  = btn.dataset.approve;
      const sub = allSubmissions.find(s => s.id === id);
      if (!sub) return;
      btn.disabled = true; btn.textContent = '...';

      /* Copier dans pdfs */
      const { error } = await db.from('pdfs').insert({
        title:       sub.title,
        description: sub.description,
        category:    sub.category || 'General',
        file_url:    sub.file_url,
        file_name:   sub.file_name,
        file_size:   sub.file_size,
        pages:       0,
      });
      if (error) { showToast('Erreur lors de l\'approbation.'); btn.disabled = false; btn.textContent = 'Approuver'; return; }

      await db.from('submissions').update({ status: 'approved' }).eq('id', id);
      showToast('Document approuve et publie !');
      await loadAll();
    });
  });

  /* Refuser */
  container.querySelectorAll('[data-reject]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.reject;
      btn.disabled = true; btn.textContent = '...';
      await db.from('submissions').update({ status: 'rejected' }).eq('id', id);
      showToast('Soumission refusee.');
      await loadAll();
    });
  });
}

/* ─── Connexions ─── */
function renderConnections(rows) {
  const body = document.getElementById('connectionsBody');

  if (rows.length === 0) {
    body.innerHTML = '<tr><td colspan="5" class="history-empty">Aucune connexion enregistree.</td></tr>';
    return;
  }

  body.innerHTML = rows.map(c => {
    const date = new Date(c.connected_at).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
    const loc  = [c.city, c.region, c.country].filter(Boolean).join(', ') || '—';
    const pseudo = c.user_pseudo
      ? `<strong>${c.user_pseudo}</strong>`
      : `<em style="color:var(--muted)">Anonyme</em>`;

    return `<tr>
      <td>${pseudo}</td>
      <td>${loc}</td>
      <td style="font-family:monospace;font-size:.8rem;">${c.ip_address || '—'}</td>
      <td>${c.referrer || 'Acces direct'}</td>
      <td>${date}</td>
    </tr>`;
  }).join('');
}

/* ─── Présence temps réel (visiteurs en ligne) ─── */
function renderOnline(presences) {
  const body  = document.getElementById('onlineBody');
  const badge = document.getElementById('onlineBadge');
  if (!body) return;

  if (presences.length === 0) {
    body.innerHTML = '<tr><td colspan="2" class="history-empty">Aucun visiteur en ligne actuellement.</td></tr>';
    if (badge) badge.textContent = '0';
    return;
  }

  if (badge) badge.textContent = presences.length;

  body.innerHTML = presences.map(p => {
    const pseudo = p.pseudo && p.pseudo !== 'Anonyme'
      ? `<strong>${p.pseudo}</strong>`
      : `<em style="color:var(--muted)">Anonyme</em>`;
    let depuis = 'maintenant';
    if (p.online_at) {
      const sec = Math.floor((Date.now() - new Date(p.online_at).getTime()) / 1000);
      if (sec >= 60) depuis = `${Math.floor(sec / 60)} min`;
      else if (sec >= 5) depuis = `${sec} s`;
    }
    return `<tr><td>${pseudo}</td><td>${depuis}</td></tr>`;
  }).join('');
}

function initOnlinePresence() {
  const channel = db.channel('biblio-presence', {
    config: { presence: { key: 'admin-' + Math.random().toString(36).slice(2) } },
  });

  channel
    .on('presence', { event: 'sync' }, () => {
      const state = channel.presenceState();
      /* Chaque clé contient un tableau de métadonnées ; on prend la première */
      const presences = Object.values(state)
        .map(arr => arr[0])
        .filter(Boolean);
      renderOnline(presences);
    })
    /* On s'abonne SANS .track() : l'admin observe sans apparaitre dans la liste */
    .subscribe();
}

/* Filtre connexions */
document.getElementById('connSearch').addEventListener('input', e => {
  const q = e.target.value.toLowerCase().trim();
  if (!q) { renderConnections(allConnections); return; }
  renderConnections(allConnections.filter(c =>
    (c.user_pseudo || '').toLowerCase().includes(q) ||
    (c.city        || '').toLowerCase().includes(q) ||
    (c.country     || '').toLowerCase().includes(q) ||
    (c.region      || '').toLowerCase().includes(q) ||
    (c.referrer    || '').toLowerCase().includes(q) ||
    (c.ip_address  || '').includes(q)
  ));
});

/* Refresh connexions */
document.getElementById('refreshConnections').addEventListener('click', async () => {
  const btn = document.getElementById('refreshConnections');
  btn.textContent = '...'; btn.disabled = true;
  const { data } = await db.from('connections').select('*').order('connected_at', { ascending: false });
  allConnections = data || [];
  document.getElementById('connSearch').value = '';
  renderConnections(allConnections);
  btn.textContent = '↻'; btn.disabled = false;
});

/* Refresh historique */
document.getElementById('refreshHistory').addEventListener('click', async () => {
  const btn = document.getElementById('refreshHistory');
  btn.textContent = '...'; btn.disabled = true;
  const { data } = await db.from('downloads').select('id, pdf_id, user_pseudo, session_id, downloaded_at').order('downloaded_at', { ascending: false });
  allDownloads = data || [];
  document.getElementById('historySearch').value = '';
  renderHistory(allDownloads);
  btn.textContent = '↻'; btn.disabled = false;
});

/* Filtre historique */
document.getElementById('historySearch').addEventListener('input', e => {
  const q = e.target.value.toLowerCase().trim();
  if (!q) { renderHistory(allDownloads); return; }
  const filtered = allDownloads.filter(d => {
    const pdf = allPdfs.find(p => p.id === d.pdf_id);
    return (
      (pdf?.title || '').toLowerCase().includes(q) ||
      d.user_pseudo.toLowerCase().includes(q)
    );
  });
  renderHistory(filtered);
});

/* ─── Tabs ─── */
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const tab = btn.dataset.tab;
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('tab-' + tab).classList.add('active');
  });
});

function updateCursorTargets() { /* curseur natif */ }
function initCursor() { /* curseur natif */ }
