// Daily Tarot — Admin SPA
// Vanilla JS. No deps. No build step. Loaded as a static asset on /admin.

(() => {
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const toastRoot = $('#toast-root');

  function toast(msg, kind = 'ok', ms = 3200) {
    const el = document.createElement('div');
    el.className = `toast ${kind}`;
    el.textContent = msg;
    toastRoot.appendChild(el);
    setTimeout(() => el.remove(), ms);
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function renderInline(s) {
    return s
      .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_m, alt, src) => `<img alt="${alt}" src="${src}" loading="lazy" />`)
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_m, text, href) => {
        if (!/^(\/|#|https?:\/\/)/.test(href)) return text;
        const safe = href.replace(/"/g, '%22');
        const ext = /^https?:\/\//.test(href) ? ' target="_blank" rel="noopener"' : '';
        return `<a href="${safe}"${ext}>${text}</a>`;
      })
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>');
  }

  function renderMarkdown(md, title, desc) {
    const lines = (md || '').split(/\r?\n/);
    const out = [];
    if (title) out.push(`<h1>${escapeHtml(title)}</h1>`);
    if (desc) out.push(`<p class="lede">${escapeHtml(desc)}</p>`);
    let inList = false;
    for (const line of lines) {
      const t = line.trimEnd();
      if (t.startsWith('## ')) { if (inList) { out.push('</ul>'); inList = false; } out.push(`<h2>${renderInline(escapeHtml(t.slice(3)))}</h2>`); }
      else if (t.startsWith('# ')) { if (inList) { out.push('</ul>'); inList = false; } out.push(`<h1>${renderInline(escapeHtml(t.slice(2)))}</h1>`); }
      else if (/^[-*]\s+/.test(t)) { if (!inList) { out.push('<ul>'); inList = true; } out.push(`<li>${renderInline(escapeHtml(t.replace(/^[-*]\s+/, '')))}</li>`); }
      else if (t === '') { if (inList) { out.push('</ul>'); inList = false; } out.push(''); }
      else { if (inList) { out.push('</ul>'); inList = false; } out.push(`<p>${renderInline(escapeHtml(t))}</p>`); }
    }
    if (inList) out.push('</ul>');
    return out.join('\n');
  }

  $$('.admin-tab').forEach((b) => {
    b.addEventListener('click', () => {
      $$('.admin-tab').forEach((x) => x.classList.remove('is-active'));
      b.classList.add('is-active');
      const id = b.dataset.tab;
      $$('.tab-pane').forEach((p) => p.classList.remove('is-active'));
      $(`#tab-${id}`).classList.add('is-active');
      if (id === 'browse') loadPostList();
    });
  });

  let MODELS = [];
  let CATEGORIES = [];
  const modelSel = $('#model');
  const modelBadge = $('#model-badge');
  const keyDot = $('#key-dot');
  const keyLabel = $('#key-label');

  async function loadConfig() {
    try {
      const r = await fetch('/api/admin/suggest-topics');
      if (!r.ok) throw new Error('config fetch failed');
      const j = await r.json();
      MODELS = j.models || [];
      CATEGORIES = j.categories || [];
      const grouped = { Free: [], Paid: [] };
      MODELS.forEach((m) => grouped[m.group]?.push(m));
      modelSel.innerHTML = '';
      for (const g of ['Free', 'Paid']) {
        const og = document.createElement('optgroup');
        og.label = g;
        for (const m of grouped[g]) {
          const o = document.createElement('option');
          o.value = m.id;
          o.textContent = m.label;
          if (m.id === 'openrouter/auto') o.selected = true;
          og.appendChild(o);
        }
        modelSel.appendChild(og);
      }
      const ping = await fetch('/api/admin/suggest-topics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ seed: 'ping' }),
      });
      if (ping.ok) {
        modelBadge.classList.add('ok'); modelBadge.classList.remove('err');
        keyDot.classList.add('ok'); keyDot.classList.remove('err');
        keyLabel.textContent = 'OpenRouter key is loaded.';
      } else {
        const err = await ping.json().catch(() => ({}));
        modelBadge.classList.add('err'); modelBadge.classList.remove('ok');
        keyDot.classList.add('err'); keyDot.classList.remove('ok');
        keyLabel.textContent = err?.error || 'Key not detected.';
      }
    } catch (e) {
      modelBadge.classList.add('err');
      keyDot.classList.add('err');
      keyLabel.textContent = 'Could not reach admin API.';
    }
  }
  loadConfig();

  // ---------- drag-and-drop images ----------
  const slots = { 1: null, 2: null };
  function setupDropzone(n) {
    const dz = $(`#dz${n}`);
    if (!dz) return;
    const input = dz.querySelector('input[type=file]');
    function setFile(file) {
      if (!file) return;
      if (file.size > 8 * 1024 * 1024) { toast('Image too large (8MB max)', 'err'); return; }
      const reader = new FileReader();
      reader.onload = () => {
        slots[n] = { dataUrl: reader.result, name: file.name };
        dz.innerHTML = '';
        const img = document.createElement('img');
        img.className = 'preview';
        img.src = reader.result;
        dz.appendChild(img);
        const fn = document.createElement('div');
        fn.className = 'filename';
        fn.textContent = file.name;
        dz.appendChild(fn);
        const clear = document.createElement('button');
        clear.type = 'button';
        clear.className = 'clear';
        clear.textContent = '×';
        clear.title = 'Remove';
        clear.addEventListener('click', (e) => {
          e.stopPropagation();
          slots[n] = null;
          dz.innerHTML = '<input type="file" accept="image/*" /><div class="dz-empty">Drag a JPG/PNG/WebP, or click to pick</div>';
          setupDropzone(n);
        });
        dz.appendChild(clear);
        const newInput = dz.querySelector('input[type=file]');
        newInput.addEventListener('change', (e) => setFile(e.target.files?.[0]));
      };
      reader.readAsDataURL(file);
    }
    input.addEventListener('change', (e) => setFile(e.target.files?.[0]));
    ['dragenter', 'dragover'].forEach((ev) =>
      dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.add('dragover'); })
    );
    ['dragleave', 'drop'].forEach((ev) =>
      dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.remove('dragover'); })
    );
    dz.addEventListener('drop', (e) => setFile(e.dataTransfer.files?.[0]));
  }
  setupDropzone(1); setupDropzone(2);

  // ---------- topic suggestions ----------
  const suggestBtn = $('#suggest-btn');
  const topicEl = $('#topic');
  let popover = null;
  function closePopover() { if (popover) popover.remove(); popover = null; }
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closePopover(); });

  if (suggestBtn) {
    suggestBtn.addEventListener('click', async () => {
      closePopover();
      const old = suggestBtn.innerHTML;
      suggestBtn.innerHTML = '<span class="spinner"></span> Suggesting…';
      suggestBtn.disabled = true;
      try {
        const seed = topicEl.value.trim();
        const r = await fetch('/api/admin/suggest-topics', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ seed, model: modelSel.value }),
        });
        if (!r.ok) {
          const err = await r.json().catch(() => ({}));
          throw new Error(err.error || 'suggest failed');
        }
        const j = await r.json();
        const topics = j.topics || [];
        if (!topics.length) { toast('No topics returned', 'err'); return; }
        popover = document.createElement('div');
        popover.className = 'suggestion-popover';
        for (const t of topics) {
          const b = document.createElement('button');
          b.type = 'button';
          b.className = 'suggestion-item';
          b.innerHTML = `<strong>${escapeHtml(t.title)}</strong><span class="angle">${escapeHtml(t.angle || '')}</span>`;
          b.addEventListener('click', () => {
            topicEl.value = t.title;
            $('#primary').value = t.primaryKeyword || t.title;
            if (t.category && CATEGORIES.includes(t.category)) {
              $('#category').value = t.category;
            }
            closePopover();
            topicEl.focus();
          });
          popover.appendChild(b);
        }
        const topicR = topicEl.getBoundingClientRect();
        popover.style.top = (window.scrollY + topicR.bottom + 6) + 'px';
        popover.style.left = (window.scrollX + topicR.left) + 'px';
        popover.style.maxWidth = Math.max(360, topicR.width) + 'px';
        document.body.appendChild(popover);
      } catch (e) {
        toast(e.message || 'Suggest failed', 'err');
      } finally {
        suggestBtn.innerHTML = old;
        suggestBtn.disabled = false;
      }
    });
  }

  // ---------- generate ----------
  let currentPost = null;
  const generateBtn = $('#generate-btn');
  if (generateBtn) generateBtn.addEventListener('click', generate);
  if (topicEl) {
    topicEl.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        generate();
      }
    });
  }

  async function generate() {
    const topic = topicEl.value.trim();
    if (!topic) { toast('Topic is required', 'err'); return; }
    const old = generateBtn.innerHTML;
    generateBtn.innerHTML = '<span class="spinner"></span> Generating…';
    generateBtn.disabled = true;
    try {
      const body = {
        topic,
        category: $('#category').value,
        primaryKeyword: $('#primary').value.trim(),
        secondaryKeywords: $('#secondary').value,
        model: modelSel.value,
        image1Path: slots[1]?.dataUrl || null,
        image2Path: slots[2]?.dataUrl || null,
      };
      const r = await fetch('/api/admin/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const j = await r.json();
      if (!r.ok || !j.ok) throw new Error(j.error || 'generate failed');
      currentPost = j.post;
      renderPreview(currentPost);
      toast('Generated', 'ok');
    } catch (e) {
      toast(e.message || 'Generate failed', 'err');
    } finally {
      generateBtn.innerHTML = old;
      generateBtn.disabled = false;
    }
  }

  function renderPreview(post) {
    $('#meta-card').style.display = 'block';
    $('#meta-title').textContent = post.title;
    $('#meta-description').textContent = post.description;
    const v = post.validation || {};
    const stats = $('#validation-stats');
    stats.innerHTML = '';
    function stat(label, value, kind) {
      const s = document.createElement('div');
      s.className = `stat ${kind || ''}`;
      s.innerHTML = `<div class="label">${label}</div><div class="value">${value}</div>`;
      stats.appendChild(s);
    }
    stat('Words', v.wordCount ?? '—', (v.wordCount >= 700 && v.wordCount <= 1100) ? 'ok' : (v.wordCount ? 'warn' : ''));
    stat('Title', (v.titleLength ?? '—') + 'ch', (v.titleLength >= 30 && v.titleLength <= 80) ? 'ok' : 'warn');
    stat('Description', (v.descriptionLength ?? '—') + 'ch', (v.descriptionLength >= 100 && v.descriptionLength <= 180) ? 'ok' : 'warn');
    stat('Internal links', v.internalLinks ?? 0, (v.internalLinks >= 3) ? 'ok' : 'warn');
    stat('External links', v.externalLinks ?? 0, (v.externalLinks === 0) ? 'ok' : 'err');
    const errs = v.errors || [];
    const errsEl = $('#validation-errors');
    if (errs.length) {
      errsEl.style.display = 'block';
      $('#validation-errors-list').innerHTML = errs.map(escapeHtml).map((e) => `<li>${e}</li>`).join('');
    } else {
      errsEl.style.display = 'none';
    }
    const sectionCount = (post.body.match(/^##\s/gm) || []).length;
    $('#adsense-hint').style.display = (v.ok && sectionCount >= 3) ? 'flex' : 'none';
    if (post.usage) {
      const u = post.usage;
      $('#usage-line').textContent = `model: ${post.model} · ${u.prompt_tokens ?? '?'}/${u.completion_tokens ?? '?'} tokens`;
    }
    $('#preview').innerHTML = renderMarkdown(post.body, post.title, post.description);
  }

  // ---------- save / publish / discard / copy ----------
  async function save(mode) {
    if (!currentPost) { toast('Generate a post first', 'err'); return; }
    if (!currentPost.validation?.ok && mode === 'publish') {
      if (!confirm('Validation has errors. Publish anyway?')) return;
    }
    const body = {
      title: currentPost.title,
      description: currentPost.description,
      category: currentPost.category,
      body: currentPost.body,
      mode,
      date: new Date().toISOString().slice(0, 10),
      image1DataUrl: slots[1]?.dataUrl,
      image1Name: slots[1]?.name,
      image2DataUrl: slots[2]?.dataUrl,
      image2Name: slots[2]?.name,
    };
    const btn = mode === 'publish' ? $('#publish-btn') : $('#save-draft-btn');
    const old = btn.innerHTML;
    btn.innerHTML = '<span class="spinner"></span> Saving…';
    btn.disabled = true;
    try {
      const r = await fetch('/api/admin/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const j = await r.json();
      if (!r.ok || !j.ok) throw new Error(j.error || 'save failed');
      toast(mode === 'publish' ? `Published: ${j.slug}` : `Saved draft: ${j.slug}`, 'ok');
    } catch (e) {
      toast(e.message || 'Save failed', 'err');
    } finally {
      btn.innerHTML = old;
      btn.disabled = false;
    }
  }
  const saveDraftBtn = $('#save-draft-btn');
  const publishBtn = $('#publish-btn');
  const copyMdBtn = $('#copy-md-btn');
  const discardBtn = $('#discard-btn');
  if (saveDraftBtn) saveDraftBtn.addEventListener('click', () => save('draft'));
  if (publishBtn) publishBtn.addEventListener('click', () => save('publish'));
  if (copyMdBtn) copyMdBtn.addEventListener('click', async () => {
    if (!currentPost) return;
    const md = `---\ntitle: "${currentPost.title}"\ndescription: "${currentPost.description}"\ndate: ${new Date().toISOString().slice(0, 10)}\ncategory: "${currentPost.category}"\nauthor: "Daily Tarot"\ndraft: true\n---\n\n${currentPost.body}`;
    try { await navigator.clipboard.writeText(md); toast('Copied markdown', 'ok'); }
    catch { toast('Copy failed', 'err'); }
  });
  if (discardBtn) discardBtn.addEventListener('click', () => {
    currentPost = null;
    $('#meta-card').style.display = 'none';
    $('#preview').innerHTML = '<div class="empty">Click <strong>Generate post</strong> to see a live preview here.</div>';
  });

  // ---------- browse & edit ----------
  const postsList = $('#posts-list');
  let allPosts = [];
  async function loadPostList() {
    if (!postsList) return;
    const f = $('#filter').value;
    const r = await fetch('/api/admin/list?filter=' + encodeURIComponent(f));
    const j = await r.json();
    if (!j.ok) { toast('Could not list posts', 'err'); return; }
    allPosts = j.posts;
    renderPostList();
  }
  function renderPostList() {
    postsList.innerHTML = '';
    $('#post-count').textContent = `${allPosts.length} post${allPosts.length === 1 ? '' : 's'}`;
    for (const p of allPosts) {
      const item = document.createElement('div');
      item.className = 'item';
      const left = document.createElement('div');
      left.innerHTML = `<div class="title">${escapeHtml(p.title)}</div><div class="meta">${p.date} · ${escapeHtml(p.category || '')}</div>`;
      const right = document.createElement('span');
      right.className = `badge ${p.draft ? 'draft' : 'published'}`;
      right.textContent = p.draft ? 'Draft' : 'Published';
      item.appendChild(left); item.appendChild(right);
      item.addEventListener('click', () => openEditor(p.slug));
      postsList.appendChild(item);
    }
  }
  const filterEl = $('#filter');
  const refreshEl = $('#refresh-list');
  if (filterEl) filterEl.addEventListener('change', loadPostList);
  if (refreshEl) refreshEl.addEventListener('click', loadPostList);

  async function openEditor(slug) {
    const r = await fetch('/api/admin/read?slug=' + encodeURIComponent(slug));
    const j = await r.json();
    if (!j.ok) { toast('Could not read post', 'err'); return; }
    const m = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(j.raw);
    if (!m) { toast('Post has no frontmatter', 'err'); return; }
    const fm = m[1]; const body = m[2];
    const grab = (k) => new RegExp(`^${k}:\\s*"?(.+?)"?\\s*$`, 'm').exec(fm)?.[1] || '';
    $('#editor-card').style.display = 'block';
    $('#editor-slug').textContent = slug;
    $('#edit-title').value = grab('title');
    $('#edit-description').value = grab('description');
    $('#edit-category').value = grab('category');
    $('#edit-body').value = body.trimStart();
    $('#edit-draft').checked = /draft:\s*true/.test(fm);
    $('#editor-card').dataset.slug = slug;
    $('#editor-card').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  const cancelEditBtn = $('#cancel-edit-btn');
  const saveEditBtn = $('#save-edit-btn');
  if (cancelEditBtn) cancelEditBtn.addEventListener('click', () => { $('#editor-card').style.display = 'none'; });
  if (saveEditBtn) saveEditBtn.addEventListener('click', async () => {
    const slug = $('#editor-card').dataset.slug;
    const body = {
      slug,
      title: $('#edit-title').value.trim(),
      description: $('#edit-description').value.trim(),
      category: $('#edit-category').value,
      body: $('#edit-body').value,
      draft: $('#edit-draft').checked,
    };
    const status = $('#edit-status');
    const old = status.textContent;
    status.textContent = 'Saving…';
    try {
      const r = await fetch('/api/admin/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const j = await r.json();
      if (!r.ok || !j.ok) throw new Error(j.error || 'save failed');
      status.textContent = 'Saved ✓';
      setTimeout(() => (status.textContent = old), 2200);
      loadPostList();
    } catch (e) {
      status.textContent = e.message || 'Save failed';
    }
  });
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 's' && $('#editor-card') && $('#editor-card').style.display !== 'none') {
      e.preventDefault();
      if (saveEditBtn) saveEditBtn.click();
    }
  });
})();
