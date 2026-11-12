(() => {
  'use strict';
  const grid = document.querySelector('#marcas .brand-grid');
  if (!grid) return;
  const imagePath = /^\/api\/sponsors\/media\/[A-Za-z0-9_-]{10,100}-[a-f0-9]{32}\.(?:png|jpg|webp)$/;
  const nameKey = name => name.replace(/\.(png|jpe?g|webp)$/i, '').normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  function safeHref(value) {
    if (typeof value !== 'string' || value.length > 2048 || /[\u0000-\u0020\u007f]/.test(value)) return null;
    try {
      const url = new URL(value);
      if (url.protocol !== 'https:' || url.username || url.password || !url.hostname.includes('.') ||
          /[\[\]:]/.test(url.hostname) || /^[\d.]+$/.test(url.hostname) ||
          /\.(localhost|local|internal)$/i.test(url.hostname)) return null;
      return url.href;
    } catch { return null; }
  }
  const originals = [...document.querySelectorAll('#marcas [data-brand-name]')]
    .map(card => ({ card, name: card.dataset.brandName, href: card.getAttribute('href') }));
  function setLink(card, name, href) {
    const tag = href ? 'a' : 'div';
    if (card.tagName.toLowerCase() !== tag) {
      const replacement = document.createElement(tag);
      replacement.className = card.className;
      if (card.dataset.brandName) replacement.dataset.brandName = card.dataset.brandName;
      while (card.firstChild) replacement.append(card.firstChild);
      card.replaceWith(replacement);
      card = replacement;
    }
    if (href) {
      card.href = href;
      card.target = '_blank';
      card.rel = 'noopener noreferrer';
      card.title = `Visitar las redes de ${name}`;
      card.setAttribute('aria-label', `Visitar las redes de ${name}, abre en otra pestaña`);
    } else {
      card.removeAttribute('href');
      card.removeAttribute('target');
      card.removeAttribute('rel');
      card.removeAttribute('title');
      card.removeAttribute('aria-label');
    }
    card.classList.toggle('brand-link', Boolean(href));
    return card;
  }
  let busy = false;

  async function refresh() {
    if (busy) return;
    busy = true;
    try {
      const response = await fetch('/api/sponsors', { cache: 'no-store' });
      if (!response.ok) return;
      const data = await response.json();
      if (data.available !== true || !Array.isArray(data.sponsors)) return;
      const links = new Map();
      for (const link of Array.isArray(data.links) ? data.links : []) {
        if (!link || typeof link.name !== 'string' || !link.name.trim() || link.name.length > 90) continue;
        const href = safeHref(link.href);
        if (link.href === null || href) links.set(nameKey(link.name), href);
      }
      for (const original of originals) {
        const key = nameKey(original.name);
        original.card = setLink(original.card, original.name, links.has(key) ? links.get(key) : original.href);
      }
      const visible = new Set();
      const existing = new Map([...grid.querySelectorAll('[data-drive-id]')].map(node => [node.dataset.driveId, node]));
      for (const item of data.sponsors) {
        if (!item || !/^[A-Za-z0-9_-]{10,100}$/.test(item.id) ||
            typeof item.name !== 'string' || item.name.length < 1 || item.name.length > 90 ||
            typeof item.image !== 'string' || !imagePath.test(item.image)) continue;
        const original = originals.find(entry => nameKey(entry.name) === nameKey(item.name));
        if (original) {
          const image = original.card.querySelector('img');
          if (image) { image.src = item.image; image.alt = item.name; }
          continue;
        }
        visible.add(item.id);
        const previous = existing.get(item.id);
        if (previous) {
          setLink(previous.querySelector('.brand-card'), item.name, links.get(nameKey(item.name)) || null);
          const image = previous.querySelector('img');
          if (image) {
            if (image.getAttribute('src') !== item.image) image.src = item.image;
            image.alt = item.name;
          }
          continue;
        }
        const li = document.createElement('li');
        li.className = 'brand-shell';
        li.dataset.driveId = item.id;
        const href = links.get(nameKey(item.name)) || null;
        const card = document.createElement(href ? 'a' : 'div');
        card.className = 'brand-card';
        setLink(card, item.name, href);
        const image = document.createElement('img');
        image.src = item.image;
        image.alt = item.name;
        image.width = 240;
        image.height = 160;
        image.loading = 'lazy';
        image.decoding = 'async';
        card.append(image);
        li.append(card);
        grid.append(li);
        existing.set(item.id, li);
      }
      // Panel edits update the public gallery without disturbing the four originals.
      grid.querySelectorAll('[data-drive-id]').forEach(node => {
        if (!visible.has(node.dataset.driveId)) node.remove();
      });
    } catch { /* Existing logos remain visible while the panel is unavailable. */ }
    finally { busy = false; }
  }

  refresh();
  setInterval(() => { if (!document.hidden) refresh(); }, 15_000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
})();
