(() => {
  'use strict';
  const $ = selector => document.querySelector(selector);
  const dialog = $('#invitation-dialog');
  const trigger = $('#share');
  if (!dialog || !trigger) return;

  // The small invitation keeps its ambient float; the dialog preview follows the pointer.
  const prefersReducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const preview = $('.invite-preview-stage');
  if (preview && !prefersReducedMotion.matches) {
    let previewFrame = 0;
    let pointerX = 0;
    let pointerY = 0;

    const resetPreview = () => {
      if (previewFrame) cancelAnimationFrame(previewFrame);
      previewFrame = 0;
      preview.classList.remove('poster-is-hovered');
      preview.style.removeProperty('--poster-x');
      preview.style.removeProperty('--poster-y');
      preview.style.removeProperty('--poster-glow-x');
      preview.style.removeProperty('--poster-glow-y');
    };

    preview.addEventListener('pointerenter', event => {
      if (event.pointerType !== 'touch') preview.classList.add('poster-is-hovered');
    });
    preview.addEventListener('pointermove', event => {
      if (event.pointerType === 'touch') return;
      preview.classList.add('poster-is-hovered');
      pointerX = event.clientX;
      pointerY = event.clientY;
      if (previewFrame) return;
      previewFrame = requestAnimationFrame(() => {
        const rect = preview.getBoundingClientRect();
        if (rect.width && rect.height) {
          const x = Math.max(0, Math.min(1, (pointerX - rect.left) / rect.width));
          const y = Math.max(0, Math.min(1, (pointerY - rect.top) / rect.height));
          preview.style.setProperty('--poster-x', `${(0.5 - y) * 9}deg`);
          preview.style.setProperty('--poster-y', `${(x - 0.5) * 9}deg`);
          preview.style.setProperty('--poster-glow-x', `${x * 100}%`);
          preview.style.setProperty('--poster-glow-y', `${y * 100}%`);
        }
        previewFrame = 0;
      });
    });
    preview.addEventListener('pointerleave', resetPreview);
    dialog.addEventListener('close', resetPreview);
  }

  // Sponsor cards also tilt, with their own independent light and reset state.
  if (!prefersReducedMotion.matches) document.querySelectorAll('.sponsor-link').forEach(card => {
    let frame = 0;
    let pointerX = 0;
    let pointerY = 0;

    card.addEventListener('pointermove', event => {
      if (event.pointerType === 'touch') return;
      pointerX = event.clientX;
      pointerY = event.clientY;
      if (frame) return;
      frame = requestAnimationFrame(() => {
        const rect = card.getBoundingClientRect();
        if (!rect.width || !rect.height) {
          frame = 0;
          return;
        }
        const x = Math.max(0, Math.min(1, (pointerX - rect.left) / rect.width));
        const y = Math.max(0, Math.min(1, (pointerY - rect.top) / rect.height));
        card.style.setProperty('--sponsor-tilt-x', `${(0.5 - y) * 8}deg`);
        card.style.setProperty('--sponsor-tilt-y', `${(x - 0.5) * 10}deg`);
        card.style.setProperty('--sponsor-glow-x', `${x * 100}%`);
        card.style.setProperty('--sponsor-glow-y', `${y * 100}%`);
        frame = 0;
      });
    });

    const resetCard = () => {
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      card.style.removeProperty('--sponsor-tilt-x');
      card.style.removeProperty('--sponsor-tilt-y');
      card.style.removeProperty('--sponsor-glow-x');
      card.style.removeProperty('--sponsor-glow-y');
    };
    card.addEventListener('pointerleave', resetCard);
    card.addEventListener('blur', resetCard);
  });

  // Always share a public address, including when previewing on localhost/LAN.
  const publicUrl = 'https://vamosalsantisimo.com/';
  const message = () => `Yo voy a VAMOS AL SANTÍSIMO 2026. ¿Venís conmigo? Sábado 19 de diciembre · ${document.documentElement.dataset?.eventVenue === 'indoor' ? 'Parroquia María Auxiliadora' : 'Anfiteatro de la Juventud'}. 19:00 Convocatoria · 20:00 Misa central · 21:00 Adoración. Con Pablo Martínez. Si llueve, nos encontramos en María Auxiliadora. Consultá la sede actualizada en el enlace.`;
  const download = $('#invite-save');
  const fileName = download.download;
  const assetUrl = download.href;
  const openNetwork = $('#invite-open-network');
  const nativeShare = $('#invite-native');
  const status = $('#invite-status');
  const choices = [...dialog.querySelectorAll('input[name="invite-network"]')];
  const networks = {
    instagram: { name:'Instagram', url:'https://www.instagram.com/', help:'Se descargará la invitación y se abrirá Instagram. Creá una historia y elegí la imagen guardada en Descargas o Archivos.' },
    whatsapp: { name:'WhatsApp', get url() { return `https://wa.me/?text=${encodeURIComponent(message()+'\n'+publicUrl)}`; }, help:'Se descargará la imagen y se abrirá WhatsApp con el texto. Adjuntá la invitación desde Descargas, o subila a tu estado.' },
    facebook: { name:'Facebook', url:'https://www.facebook.com/', help:'Se descargará la invitación y se abrirá Facebook. Creá una historia o publicación y adjuntá la imagen de Descargas o Archivos.' }
  };
  let imageFile = null;
  let preparing = null;
  let sharing = false;
  let returnFocus = trigger;

  function selectNetwork() {
    const selected = choices.find(input => input.checked)?.value || 'instagram';
    const network = networks[selected];
    openNetwork.href = network.url;
    openNetwork.textContent = `Descargar y abrir ${network.name} ↗`;
    $('#invite-help').textContent = network.help;
    status.textContent = '';
  }

  // Preload on opening, never fetch between a share tap and navigator.share:
  // awaiting network I/O can consume the browser's transient user activation.
  function prepareFile() {
    if (preparing || imageFile || typeof navigator.share !== 'function' || typeof navigator.canShare !== 'function') return;
    preparing = fetch(assetUrl)
      .then(response => { if (!response.ok) throw new Error('Invitation unavailable'); return response.blob(); })
      .then(blob => {
        if (!blob.size || blob.type !== 'image/png') throw new Error('Invalid invitation image');
        const candidate = new File([blob],fileName,{type:'image/png'});
        if (navigator.canShare({files:[candidate]})) {
          imageFile = candidate;
          nativeShare.hidden = false;
        }
      })
      .catch(() => { /* Direct download and network links remain available; retry on reopening. */ })
      .finally(() => { preparing = null; });
  }

  if (typeof dialog.showModal === 'function') {
    trigger.hidden = false;
    trigger.addEventListener('click',() => {
      returnFocus = document.activeElement;
      selectNetwork();
      dialog.showModal();
      document.documentElement.classList.add('invitation-open');
      prepareFile();
    });
  }
  $('#invite-close').addEventListener('click',() => dialog.close());
  dialog.addEventListener('close',() => {
    document.documentElement.classList.remove('invitation-open');
    returnFocus?.focus({preventScroll:true});
  });
  dialog.addEventListener('click',event => {
    if (event.target !== dialog) return;
    const rect = dialog.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
  });
  choices.forEach(input => input.addEventListener('change',selectNetwork));
  openNetwork.addEventListener('click',() => {
    openNetwork.href = networks[choices.find(input => input.checked)?.value || 'instagram'].url;
    // The anchor's normal navigation opens the selected network. Start the
    // same-origin download synchronously in the same explicit user gesture.
    download.click();
    status.textContent = 'Descarga iniciada. Si la red no se abrió, volvé a tocar el botón. La imagen también está disponible en «Solo descargar imagen».';
  });
  download.addEventListener('click',() => { status.textContent = 'Descarga iniciada. Buscá la invitación en Descargas o Archivos.'; });

  nativeShare.addEventListener('click',async () => {
    if (!imageFile || sharing) return;
    sharing = true;
    nativeShare.disabled = true;
    status.textContent = 'Elegí la app en el menú de tu dispositivo.';
    try {
      // File-only payload also works with targets that reject mixed text/files.
      await navigator.share({files:[imageFile]});
      status.textContent = 'Invitación entregada a la app. Terminá de compartirla allí.';
    } catch (error) {
      status.textContent = error.name === 'AbortError'
        ? 'No se compartió la imagen. Podés volver a intentarlo cuando quieras.'
        : 'No se pudo compartir desde este navegador. Usá «Descargar y abrir» o «Solo descargar imagen».';
    } finally {
      sharing = false;
      nativeShare.disabled = false;
    }
  });

  async function copyText(text, target) {
    try {
      await navigator.clipboard.writeText(text);
      target.textContent = 'Copiado. Ya podés pegarlo en tu publicación.';
    } catch {
      target.textContent = `No se pudo copiar automáticamente. Copiá este texto: ${text}`;
    }
  }
  $('#copy').addEventListener('click',() => copyText(publicUrl,$('#share-status')));
  $('#invite-copy-text').addEventListener('click',() => copyText(message()+'\n'+publicUrl,status));
  selectNetwork();
})();
