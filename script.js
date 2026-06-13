/* ═══════════════════════════════════════════
   Biblio PDF — script.js
   ═══════════════════════════════════════════ */

const { createClient } = supabase;
const db = createClient(SUPABASE_URL, SUPABASE_KEY);

/* Nombre affiché = réel × 2 + 10 (côté interface uniquement) */
const boost = n => n * 2 + 10;

/* ─── Session ID (invisible pour l'utilisateur, sert à différencier les pseudos identiques) ─── */
let sessionId = localStorage.getItem('biblio_session');
if (!sessionId) {
  sessionId = crypto.randomUUID();
  localStorage.setItem('biblio_session', sessionId);
}

/* ─── Pseudo utilisateur ─── */
let userPseudo = localStorage.getItem('biblio_pseudo') || null;
let biblioPresenceChannel = null;  /* canal de présence temps réel */

function savePseudo(p) {
  userPseudo = p.trim();
  localStorage.setItem('biblio_pseudo', userPseudo);
  document.getElementById('navPseudoLabel').textContent = userPseudo;
  /* Met à jour la présence avec le nouveau pseudo */
  if (biblioPresenceChannel) {
    biblioPresenceChannel.track({ online_at: new Date().toISOString(), pseudo: userPseudo });
  }
}

function openPseudoModal(onConfirm) {
  const modal = document.getElementById('pseudoModal');
  const input = document.getElementById('pseudoInput');
  const btn   = document.getElementById('pseudoConfirm');

  if (userPseudo) input.value = userPseudo;
  modal.classList.remove('hidden');
  input.focus();

  function confirm() {
    const val = input.value.trim();
    if (!val) return;
    savePseudo(val);
    refreshNav();
    refreshHeroBtn();
    modal.classList.add('hidden');
    btn.removeEventListener('click', confirm);
    input.removeEventListener('keydown', onEnter);
    if (onConfirm) onConfirm();
  }

  function onEnter(e) { if (e.key === 'Enter') confirm(); }

  btn.addEventListener('click', confirm);
  input.addEventListener('keydown', onEnter);
}

/* Init pseudo dans nav */
function refreshNav() {
  if (userPseudo) {
    document.getElementById('navPseudoLabel').textContent = userPseudo;
    const dot = document.getElementById('pseudoDot');
    if (dot) dot.style.background = 'var(--green)';
  }
}
refreshNav();

/* Bouton nav pseudo */
document.getElementById('navPseudo').addEventListener('click', () => openPseudoModal(null));

/* Bouton pseudo hero */
function refreshHeroBtn() {
  const btn   = document.getElementById('heroCta');
  const label = document.getElementById('heroPseudoLabel');
  const dot   = document.getElementById('heroPseudoDot');
  if (!btn) return;
  if (userPseudo) {
    label.textContent = userPseudo;
    if (dot) dot.style.background = 'var(--green)';
  } else {
    label.textContent = 'Choisir un pseudo';
    if (dot) dot.style.background = 'var(--sand)';
  }
}
refreshHeroBtn();

const heroCta = document.getElementById('heroCta');
if (heroCta) {
  heroCta.addEventListener('click', () => openPseudoModal(refreshHeroBtn));
}

/* Modal à l'ouverture si pas de pseudo */
if (!userPseudo) {
  setTimeout(() => openPseudoModal(null), 800);
}

/* Bouton "passer" */
const skipBtn = document.getElementById('pseudoSkip');
if (skipBtn) {
  skipBtn.addEventListener('click', () => {
    localStorage.setItem('biblio_skipped', '1');
    document.getElementById('pseudoModal').classList.add('hidden');
  });
}

/* ─── Toast ─── */
function showToast(msg, duration = 2400) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), duration);
}

/* ─── Confetti burst ─── */
const BURST_COLORS = ['#f0b429','#fde87a','#d97706','#5a8a42','#7ecbde','#f0ddb0','#c49a50'];
function spawnBurst() {
  const el = document.getElementById('confettiBurst');
  for (let i = 0; i < 38; i++) {
    const p = document.createElement('div');
    p.className = 'burst-piece';
    const c = BURST_COLORS[Math.floor(Math.random() * BURST_COLORS.length)];
    const s = 8 + Math.random() * 14;
    p.style.cssText = `
      left:${Math.random() * 100}%; top:-20px;
      width:${s}px; height:${s}px; background:${c};
      border-radius:${Math.random() > .5 ? '50%' : '4px'};
      animation-delay:${Math.random() * .5}s;
      animation-duration:${1.1 + Math.random() * .8}s;
    `;
    el.appendChild(p);
  }
  setTimeout(() => { el.innerHTML = ''; }, 3000);
}

/* ─── Données PDFs depuis Supabase ─── */
let allPdfs = [];
let downloadCounts = {};  /* pdf_id -> count */
let ratingsData   = {};  /* pdf_id -> { avg, count, myScore } */

function showSkeletons(n = 6) {
  const grid = document.getElementById('pdfGrid');
  grid.innerHTML = Array.from({ length: n }).map(() => `
    <div class="pdf-card skeleton-card">
      <div class="skel skel-badge"></div>
      <div class="skel skel-title"></div>
      <div class="skel skel-line"></div>
      <div class="skel skel-line short"></div>
      <div class="skel skel-btn"></div>
    </div>
  `).join('');
}

async function loadData() {
  const grid = document.getElementById('pdfGrid');
  showSkeletons();

  /* Chargement parallele */
  const [pdfsRes, dlRes, ratingRes] = await Promise.all([
    db.from('pdfs').select('*').order('created_at', { ascending: false }),
    db.from('downloads').select('pdf_id'),
    db.from('ratings').select('pdf_id, score, user_pseudo'),
  ]);

  if (pdfsRes.error) {
    grid.innerHTML = `<div class="empty-state"><div class="empty-icon">!</div><p>Erreur de connexion. Verifiez votre config Supabase.</p></div>`;
    return;
  }

  allPdfs = pdfsRes.data || [];
  const n = allPdfs.length;
  const pdfCountEl = document.getElementById('pdfCount');
  if (pdfCountEl) pdfCountEl.textContent = n;
  const pdfLabelEl = document.getElementById('pdfCountLabel');
  if (pdfLabelEl) pdfLabelEl.textContent = `document${n > 1 ? 's' : ''} gratuit${n > 1 ? 's' : ''}`;

  const dlRows = dlRes.data || [];
  dlRows.forEach(r => {
    downloadCounts[r.pdf_id] = (downloadCounts[r.pdf_id] || 0) + 1;
  });
  const dl = dlRows.length;
  const dlDisplay = boost(dl);
  const totalDlEl = document.getElementById('totalDlCount');
  if (totalDlEl) totalDlEl.textContent = dlDisplay;
  const dlLabelEl = document.getElementById('dlCountLabel');
  if (dlLabelEl) dlLabelEl.textContent = `telechargement${dlDisplay > 1 ? 's' : ''}`;

  const ratingRows = ratingRes.data || [];
  if (ratingRows) {
    const grouped = {};
    ratingRows.forEach(r => {
      if (!grouped[r.pdf_id]) grouped[r.pdf_id] = [];
      grouped[r.pdf_id].push(r);
    });
    Object.keys(grouped).forEach(id => {
      const rows  = grouped[id];
      const total = rows.reduce((s, r) => s + r.score, 0);
      const mine  = userPseudo ? rows.find(r => r.user_pseudo === userPseudo) : null;
      ratingsData[id] = {
        avg: (total / rows.length).toFixed(1),
        count: rows.length,
        myScore: mine ? mine.score : 0,
      };
    });
  }

  buildFilters();
  renderCards(allPdfs);
}

/* ─── Filtres catégories ─── */
function buildFilters() {
  const cats = [...new Set(allPdfs.map(p => p.category).filter(Boolean))].sort();
  const bar  = document.getElementById('pdfFilters');
  bar.innerHTML = '<button class="filter-btn active" data-filter="all">Tous</button>';
  cats.forEach(cat => {
    const b = document.createElement('button');
    b.className = 'filter-btn';
    b.dataset.filter = cat;
    b.textContent = cat;
    bar.appendChild(b);
  });
  updateCursorTargets();
}

/* ─── Rendu des cartes ─── */
let activeFilter = 'all';
let searchQuery  = '';

function renderCards(list) {
  const grid  = document.getElementById('pdfGrid');
  const empty = document.getElementById('emptyState');
  grid.innerHTML = '';

  const filtered = list.filter(pdf => {
    const catOk    = activeFilter === 'all' || pdf.category === activeFilter;
    const searchOk = !searchQuery ||
      (pdf.title       || '').toLowerCase().includes(searchQuery) ||
      (pdf.description || '').toLowerCase().includes(searchQuery) ||
      (pdf.category    || '').toLowerCase().includes(searchQuery);
    return catOk && searchOk;
  });

  if (filtered.length === 0) {
    empty.style.display = 'block';
    return;
  }
  empty.style.display = 'none';

  filtered.forEach(pdf => {
    const dlCount       = downloadCounts[pdf.id] || 0;
    const rating        = ratingsData[pdf.id] || { avg: 0, count: 0, myScore: 0 };
    const dlDisplay     = boost(dlCount);
    /* Les notes affichées sont toujours strictement inférieures aux téléchargements */
    const ratingDisplay = rating.count > 0 ? Math.min(boost(rating.count), dlDisplay - 1) : 0;
    const card    = document.createElement('article');
    card.className = 'pdf-card-wide';
    card.dataset.id = pdf.id;

    card.innerHTML = `
      <div class="pdf-preview-col">
        <iframe
          src="${pdf.file_url}#toolbar=0&navpanes=0&scrollbar=0&page=1"
          loading="lazy"
          title="${pdf.title}"
          tabindex="-1"
        ></iframe>
        <div class="pdf-preview-overlay">
          <button class="preview-open-btn" data-url="${pdf.file_url}" data-title="${pdf.title}">Voir en plein ecran</button>
        </div>
      </div>

      <div class="pdf-info-col">
        <div class="pdf-card-top">
          <span class="pdf-cat-badge">${pdf.category || 'General'}</span>
          ${pdf.file_size ? `<span class="pdf-size-badge">${pdf.file_size}</span>` : ''}
        </div>

        <h3 class="pdf-wide-title">${pdf.title}</h3>
        ${pdf.description ? `<p class="pdf-wide-desc">${pdf.description}</p>` : ''}

        <div class="pdf-stats">
          <div class="pdf-dl-count">
            <span class="arrow-icon">&#8595;</span>
            <span>${dlDisplay} telechargement${dlDisplay !== 1 ? 's' : ''}</span>
          </div>
          <div class="stars-row">
            <div class="stars" data-pdf-id="${pdf.id}">
              ${starsHTML(Math.round(parseFloat(rating.avg)))}
            </div>
            <span class="stars-count">${ratingDisplay > 0 ? rating.avg + ' (' + ratingDisplay + ')' : 'Pas encore note'}</span>
          </div>
        </div>

        <div class="your-rating-block">
          <span class="your-rating-label">${rating.myScore ? 'Votre note : ' + rating.myScore + ' / 5' : 'Notez ce document :'}</span>
          <div class="stars stars-interactive" data-pdf-id="${pdf.id}" data-my-score="${rating.myScore}">
            ${interactiveStarsHTML(rating.myScore, pdf.id)}
          </div>
        </div>

        <div class="pdf-wide-actions">
          <a href="${pdf.file_url}" class="pdf-dl-btn" data-pdf-id="${pdf.id}" target="_blank" rel="noopener">
            <span class="dl-arrow">&#8595;</span>
            Telecharger
          </a>
          <button class="pdf-comments-toggle" data-pdf-id="${pdf.id}">
            Commentaires <span class="comments-count-badge" id="ccount-${pdf.id}">...</span>
          </button>
          <button class="pdf-comment-write-btn" data-pdf-id="${pdf.id}">Commenter</button>
        </div>
      </div>

      <div class="pdf-comments-panel" id="comments-${pdf.id}" hidden>
        <div class="comments-list" id="clist-${pdf.id}">
          <p class="comments-loading">Chargement...</p>
        </div>
        <div class="comment-form">
          <input type="text" class="comment-input" placeholder="Votre commentaire..." maxlength="300" data-pdf-id="${pdf.id}" />
          <button class="btn primary btn-sm comment-submit" data-pdf-id="${pdf.id}">Envoyer</button>
        </div>
      </div>
    `;

    grid.appendChild(card);
  });

  updateCursorTargets();
  attachCardListeners();
  loadCommentCounts();
}

/* ─── Compteurs de commentaires ─── */
async function loadCommentCounts() {
  const { data } = await db.from('comments').select('pdf_id');
  if (!data) return;
  const counts = {};
  data.forEach(r => { counts[r.pdf_id] = (counts[r.pdf_id] || 0) + 1; });
  document.querySelectorAll('.comments-count-badge').forEach(el => {
    const id = el.id.replace('ccount-', '');
    el.textContent = counts[id] || 0;
  });
}

/* ─── Chargement et affichage des commentaires ─── */
async function openComments(pdfId) {
  const panel = document.getElementById('comments-' + pdfId);
  const list  = document.getElementById('clist-' + pdfId);
  if (!panel) return;

  const isOpen = !panel.hidden;
  panel.hidden = isOpen;
  if (isOpen) return;

  list.innerHTML = '<p class="comments-loading">Chargement...</p>';

  const { data, error } = await db
    .from('comments')
    .select('*')
    .eq('pdf_id', pdfId)
    .order('created_at', { ascending: false });

  if (error || !data) {
    list.innerHTML = '<p class="comments-loading">Erreur de chargement.</p>';
    return;
  }

  if (data.length === 0) {
    list.innerHTML = '<p class="comments-empty">Aucun commentaire pour le moment. Soyez le premier !</p>';
    return;
  }

  list.innerHTML = data.map(c => {
    const date = new Date(c.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
    return `
      <div class="comment-item">
        <div class="comment-meta">
          <strong>${c.user_pseudo}</strong>
          <span>${date}</span>
        </div>
        <p>${c.content}</p>
      </div>
    `;
  }).join('');
}

function starsHTML(score, id) {
  return [1,2,3,4,5].map(i =>
    `<span class="star ${i <= score ? 'filled' : ''}">&#9733;</span>`
  ).join('');
}

function interactiveStarsHTML(myScore, pdfId) {
  return [1,2,3,4,5].map(i =>
    `<span class="star ${i <= myScore ? 'filled' : ''}" data-score="${i}" data-pdf-id="${pdfId}" style="cursor:none;">&#9733;</span>`
  ).join('');
}

/* ─── Listeners sur les cartes ─── */
function attachCardListeners() {
  /* Telechargement */
  document.querySelectorAll('.pdf-dl-btn').forEach(btn => {
    btn.addEventListener('click', async e => {
      const pdfId = btn.dataset.pdfId;

      const doDownload = async () => {
        await db.from('downloads').insert({ pdf_id: pdfId, user_pseudo: userPseudo || 'Anonyme', session_id: sessionId });
        downloadCounts[pdfId] = (downloadCounts[pdfId] || 0) + 1;
        const card = btn.closest('.pdf-card-wide');
        const dlEl = card && card.querySelector('.pdf-dl-count span:last-child');
        const c = boost(downloadCounts[pdfId]);
        if (dlEl) dlEl.textContent = c + ' telechargement' + (c !== 1 ? 's' : '');
        spawnBurst();
        showToast('Telechargement enregistre !');
      };

      if (!userPseudo) {
        e.preventDefault();
        openPseudoModal(async () => {
          window.open(btn.href, '_blank');
          await doDownload();
        });
      } else {
        await doDownload();
      }
    });
  });

  /* Notes interactives */
  document.querySelectorAll('.stars-interactive .star').forEach(star => {
    star.addEventListener('mouseenter', () => {
      const score  = parseInt(star.dataset.score);
      const parent = star.parentElement;
      parent.querySelectorAll('.star').forEach((s, i) => s.classList.toggle('filled', i < score));
    });

    star.parentElement.addEventListener('mouseleave', () => {
      const myScore = parseInt(star.parentElement.dataset.myScore || 0);
      star.parentElement.querySelectorAll('.star').forEach((s, i) => s.classList.toggle('filled', i < myScore));
    });

    star.addEventListener('click', async () => {
      const pdfId = star.dataset.pdfId;
      const score = parseInt(star.dataset.score);

      const doRate = async () => {
        const existing = ratingsData[pdfId];
        if (existing && existing.myScore === score) return;

        const { error } = await db.from('ratings').upsert(
          { pdf_id: pdfId, user_pseudo: userPseudo, score },
          { onConflict: 'pdf_id,user_pseudo' }
        );

        if (!error) {
          if (!ratingsData[pdfId]) ratingsData[pdfId] = { avg: score, count: 1, myScore: score };
          else ratingsData[pdfId].myScore = score;

          star.parentElement.dataset.myScore = score;
          star.parentElement.querySelectorAll('.star').forEach((s, i) => s.classList.toggle('filled', i < score));

          const label = star.closest('.pdf-card-wide').querySelector('.your-rating-label');
          if (label) label.textContent = 'Votre note : ' + score + ' / 5';
          showToast('Note enregistree !');
        }
      };

      if (!userPseudo) openPseudoModal(doRate);
      else await doRate();
    });
  });

  /* Visionneuse plein ecran */
  document.querySelectorAll('.preview-open-btn').forEach(btn => {
    btn.addEventListener('click', () => openPdfViewer(btn.dataset.url, btn.dataset.title));
  });

  /* Toggle commentaires */
  document.querySelectorAll('.pdf-comments-toggle').forEach(btn => {
    btn.addEventListener('click', () => openComments(btn.dataset.pdfId));
  });

  /* Bouton Commenter : ouvre le panneau et focus l'input */
  document.querySelectorAll('.pdf-comment-write-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const pdfId = btn.dataset.pdfId;
      const panel = document.getElementById('comments-' + pdfId);
      if (panel && panel.hidden) await openComments(pdfId);
      const input = panel && panel.querySelector('.comment-input');
      if (input) { input.focus(); input.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }
    });
  });

  /* Envoi de commentaire */
  document.querySelectorAll('.comment-submit').forEach(btn => {
    btn.addEventListener('click', async () => {
      const pdfId  = btn.dataset.pdfId;
      const input  = btn.previousElementSibling;
      const content = input.value.trim();
      if (!content) return;

      const doComment = async () => {
        btn.disabled = true;
        const { error } = await db.from('comments').insert({
          pdf_id: pdfId, user_pseudo: userPseudo, content,
        });
        btn.disabled = false;
        if (error) { showToast('Erreur lors de l\'envoi.'); return; }
        input.value = '';
        showToast('Commentaire publie !');
        /* Rafraichir le panel */
        const panel = document.getElementById('comments-' + pdfId);
        if (panel) panel.hidden = true;
        await openComments(pdfId);
        /* Mettre a jour le compteur */
        const badge = document.getElementById('ccount-' + pdfId);
        if (badge) badge.textContent = parseInt(badge.textContent || 0) + 1;
      };

      if (!userPseudo) openPseudoModal(doComment);
      else await doComment();
    });
  });
}

/* ─── Filtres ─── */
document.getElementById('pdfFilters').addEventListener('click', e => {
  const btn = e.target.closest('.filter-btn');
  if (!btn) return;
  document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  activeFilter = btn.dataset.filter;
  renderCards(allPdfs);
});

/* ─── Recherche ─── */
document.getElementById('searchInput').addEventListener('input', e => {
  searchQuery = e.target.value.toLowerCase().trim();
  renderCards(allPdfs);
});

/* ─── Navigation mobile ─── */
const menuBtn  = document.getElementById('menuBtn');
const navLinks = document.getElementById('navLinks');
menuBtn.addEventListener('click', () => {
  const open = navLinks.classList.toggle('active');
  menuBtn.classList.toggle('open', open);
  menuBtn.setAttribute('aria-expanded', open);
});
document.querySelectorAll('.nav-links a').forEach(a => {
  a.addEventListener('click', () => {
    navLinks.classList.remove('active');
    menuBtn.classList.remove('open');
    menuBtn.setAttribute('aria-expanded', false);
  });
});

/* ─── Scroll progress ─── */
const scrollBar = document.getElementById('scrollProgress');
window.addEventListener('scroll', () => {
  const max = document.documentElement.scrollHeight - innerHeight;
  scrollBar.style.width = `${(scrollY / max) * 100}%`;
}, { passive: true });

/* ─── Lien actif nav ─── */
const sections   = document.querySelectorAll('section[id]');
const navAnchors = document.querySelectorAll('.nav-links a[data-section]');
const secObs = new IntersectionObserver(entries => {
  entries.forEach(e => {
    if (!e.isIntersecting) return;
    const id = e.target.getAttribute('id');
    navAnchors.forEach(a => a.classList.toggle('active-link', a.dataset.section === id));
  });
}, { rootMargin: '-40% 0px -55% 0px' });
sections.forEach(s => secObs.observe(s));

/* ─── Révélation au scroll ─── */
const revObs = new IntersectionObserver(entries => {
  entries.forEach(e => {
    if (e.isIntersecting) { e.target.classList.add('in-view'); revObs.unobserve(e.target); }
  });
}, { threshold: 0.1 });
document.querySelectorAll('.reveal, .reveal-delay, .reveal-section').forEach(el => revObs.observe(el));

/* ─── Scroll to top ─── */
const scrollTopBtn = document.getElementById('scrollTop');
window.addEventListener('scroll', () => {
  scrollTopBtn.classList.toggle('visible', scrollY > 500);
}, { passive: true });
scrollTopBtn.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));

/* ─── Curseur personnalisé ─── */
function updateCursorTargets() { /* curseur natif */ }

/* ─── Détection de navigateur automatisé / bot ─── */
function isLikelyBot() {
  const ua = (navigator.userAgent || '').toLowerCase();

  /* Signatures de bots et frameworks de scraping connus */
  const BOT_UA = ['bot', 'crawl', 'spider', 'scrape', 'headless',
    'phantom', 'puppeteer', 'playwright', 'selenium', 'python',
    'curl', 'wget', 'httpclient', 'java/', 'go-http', 'okhttp',
    'axios', 'node-fetch', 'lighthouse', 'pingdom', 'gtmetrix'];
  if (BOT_UA.some(k => ua.includes(k))) return true;

  /* WebDriver actif (Selenium, automatisation) */
  if (navigator.webdriver) return true;

  /* Navigateurs headless : pas de plugins ni de langues déclarées */
  if (!navigator.languages || navigator.languages.length === 0) return true;

  /* Chrome headless expose souvent un UA "HeadlessChrome" déjà capté ci-dessus,
     mais on vérifie aussi l'absence d'écran réel */
  if (window.outerWidth === 0 && window.outerHeight === 0) return true;

  return false;
}

/* ─── Enregistrement de la connexion ─── */
async function recordConnection() {
  if (sessionStorage.getItem('biblio_connected')) return;
  sessionStorage.setItem('biblio_connected', '1');

  /* Ne pas appeler l'API IP ni enregistrer pour les bots détectés */
  if (isLikelyBot()) return;

  const BOT_ORGS = ['amazon', 'aws', 'google', 'microsoft', 'cloudflare',
    'digitalocean', 'linode', 'ovh', 'hetzner', 'vultr', 'netlify',
    'fastly', 'akamai', 'datacenter', 'hosting', 'server'];

  try {
    const res = await fetch('https://ipapi.co/json/');
    const geo = await res.json();

    /* Ignorer les IPs de datacenters / bots */
    const org = (geo.org || '').toLowerCase();
    if (BOT_ORGS.some(k => org.includes(k))) return;

    const rawRef = document.referrer;
    let referrer = 'Acces direct';
    if (rawRef) {
      try {
        const host = new URL(rawRef).hostname.replace('www.', '');
        if (host.includes('google'))          referrer = 'Google';
        else if (host.includes('bing'))       referrer = 'Bing';
        else if (host.includes('yahoo'))      referrer = 'Yahoo';
        else if (host.includes('duckduckgo')) referrer = 'DuckDuckGo';
        else referrer = host;
      } catch { referrer = rawRef.slice(0, 60); }
    }

    await db.from('connections').insert({
      user_pseudo:  userPseudo || null,
      session_id:   sessionId,
      ip_address:   geo.ip,
      country:      geo.country_name || null,
      city:         geo.city         || null,
      region:       geo.region       || null,
      referrer,
    });
  } catch (e) { /* silencieux — ne casse pas la page */ }
}

recordConnection();

/* ─── Présence temps réel (nombre de visiteurs en ligne) ─── */
function initPresence() {
  /* On ne compte pas les bots dans la présence */
  if (isLikelyBot()) return;

  const onlineCountEl = document.getElementById('onlineCount');
  if (!onlineCountEl) return;

  const channel = db.channel('biblio-presence', {
    config: { presence: { key: sessionId } },
  });

  channel
    .on('presence', { event: 'sync' }, () => {
      const state = channel.presenceState();
      onlineCountEl.textContent = Object.keys(state).length || 1;
    })
    .subscribe(async status => {
      if (status === 'SUBSCRIBED') {
        await channel.track({
          online_at: new Date().toISOString(),
          pseudo:    userPseudo || 'Anonyme',
        });
      }
    });

  /* Si le pseudo change pendant la session, on met à jour la présence */
  biblioPresenceChannel = channel;

  /* Quitter proprement le canal à la fermeture de l'onglet */
  window.addEventListener('beforeunload', () => { channel.untrack(); db.removeChannel(channel); });
}

initPresence();

/* ─── Visionneuse PDF (iframe) ─── */
function openPdfViewer(url, title) {
  document.getElementById('pdfViewerTitle').textContent = title;
  document.getElementById('pdfViewerDownload').href = url;

  /* Les navigateurs mobiles n'affichent pas un PDF dans un <iframe>.
     On passe par le visualiseur Google Docs (rendu serveur en images),
     qui marche dans une iframe sur tous les telephones. Desktop garde
     le rendu natif (plus rapide et net). */
  const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)
                   || window.innerWidth <= 768;
  const frameSrc = isMobile
    ? `https://docs.google.com/gview?embedded=true&url=${encodeURIComponent(url)}`
    : url;

  document.getElementById('pdfViewerFrame').src = frameSrc;
  document.getElementById('pdfViewerModal').classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

function closePdfViewer() {
  document.getElementById('pdfViewerModal').classList.add('hidden');
  document.getElementById('pdfViewerFrame').src = '';
  document.body.style.overflow = '';
}

document.getElementById('pdfViewerClose')?.addEventListener('click', closePdfViewer);
document.getElementById('pdfViewerModal')?.addEventListener('click', e => {
  if (e.target === e.currentTarget) closePdfViewer();
});
document.addEventListener('keydown', e => { if (e.key === 'Escape') closePdfViewer(); });


/* ─── Lancement ─── */
loadData();
