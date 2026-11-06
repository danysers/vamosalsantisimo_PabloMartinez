(() => {
  'use strict';
  const pattern = /^\/api\/flyers\/media\/flyer-evento-(historia|muro)-v([3-9]|[1-9]\d{1,4})(?:-p([1-6]))?-[a-f0-9]{32}\.png$/;
  let busy = false;
  let version = 0;
  const preload = url => new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = resolve;
    image.onerror = reject;
    image.src = url;
  });
  async function refresh() {
    if (busy) return;
    busy = true;
    try {
      const response = await fetch('/api/flyers', { cache: 'no-store' });
      if (!response.ok) return;
      const data = await response.json();
      if (data.available !== true || !Number.isInteger(data.version) || data.version <= version ||
          !Array.isArray(data.files) || data.files.length > 12 || !data.files.every(file => {
            const match = typeof file?.image === 'string' && pattern.exec(file.image);
            return match && match[1] === file.format && Number(match[2]) === data.version &&
              Number(match[3] || 1) === file.page && typeof file.name === 'string' &&
              /^flyer-evento-(historia|muro)-v\d+(?:-p[1-6])?\.png$/.test(file.name);
          })) return;
      const story = data.files.find(file => file.format === 'historia' && file.page === 1);
      const wall = data.files.find(file => file.format === 'muro' && file.page === 1);
      if (!story || !wall) return;
      await Promise.all([preload(story.image), preload(wall.image)]);
      document.querySelectorAll('.invite-thumbnail, .invite-preview-stage img').forEach(image => { image.src = story.image; });
      document.querySelectorAll('.invite-download, .invite-poster, #invite-save').forEach(link => {
        link.href = story.image;
        link.download = story.name;
      });
      const wallLink = document.querySelector('#invite-save-wall');
      if (wallLink) { wallLink.href = wall.image; wallLink.download = wall.name; wallLink.hidden = false; }
      const more = document.querySelector('#invite-more-pages');
      if (more) {
        more.replaceChildren();
        data.files.filter(file => file.page > 1).forEach(file => {
          const link = document.createElement('a');
          link.href = file.image; link.download = file.name;
          link.textContent = `Descargar ${file.format === 'historia' ? 'historia' : 'muro'} · página ${file.page}`;
          more.append(link, document.createTextNode(' '));
        });
      }
      version = data.version;
      window.dispatchEvent(new CustomEvent('vas:invitation-asset', { detail: story }));
    } catch { /* Keep the approved local invitation or the last complete version. */ }
    finally { busy = false; }
  }
  refresh();
  setInterval(() => { if (!document.hidden) refresh(); }, 5 * 60_000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
})();
