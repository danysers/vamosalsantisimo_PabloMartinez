(() => {
  'use strict';
  const grid = document.querySelector('#marcas .brand-grid');
  if (!grid) return;
  const imagePath = /^\/api\/sponsors\/media\/[A-Za-z0-9_-]{10,100}-[a-f0-9]{32}\.(?:png|jpg|webp)$/;
  let busy = false;

  async function refresh() {
    if (busy) return;
    busy = true;
    try {
      const response = await fetch('/api/sponsors', { cache: 'no-store' });
      if (!response.ok) return;
      const data = await response.json();
      if (data.available !== true || !Array.isArray(data.sponsors)) return;
      const visible = new Set();
      for (const item of data.sponsors) {
        if (!item || !/^[A-Za-z0-9_-]{10,100}$/.test(item.id) ||
            typeof item.name !== 'string' || item.name.length < 1 || item.name.length > 90 ||
            typeof item.image !== 'string' || !imagePath.test(item.image)) continue;
        visible.add(item.id);
        if ([...grid.querySelectorAll('[data-drive-id]')].some(node => node.dataset.driveId === item.id)) continue;
        const li = document.createElement('li');
        li.className = 'brand-shell';
        li.dataset.driveId = item.id;
        const card = document.createElement('div');
        card.className = 'brand-card';
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
      }
      // An owner can remove an uploaded logo from Drive without disturbing the four originals.
      grid.querySelectorAll('[data-drive-id]').forEach(node => {
        if (!visible.has(node.dataset.driveId)) node.remove();
      });
    } catch { /* Existing logos always remain visible while Drive is unavailable. */ }
    finally { busy = false; }
  }

  refresh();
  setInterval(() => { if (!document.hidden) refresh(); }, 5 * 60_000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
})();
