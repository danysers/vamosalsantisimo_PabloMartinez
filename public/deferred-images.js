(() => {
  'use strict';
  const images = [...document.querySelectorAll('img[data-deferred-src]')];
  function load(image) {
    // A flyer feed may already have selected a newer approved image.
    if (!image.getAttribute('src') || image.getAttribute('src').startsWith('data:')) image.src = image.dataset.deferredSrc;
    image.removeAttribute('data-deferred-src');
  }
  if (typeof IntersectionObserver !== 'function') { images.forEach(load); return; }
  const observer = new IntersectionObserver(entries => {
    entries.filter(entry => entry.isIntersecting).forEach(entry => { load(entry.target); observer.unobserve(entry.target); });
  }, { rootMargin: '900px 0px' });
  images.forEach(image => observer.observe(image));
})();
