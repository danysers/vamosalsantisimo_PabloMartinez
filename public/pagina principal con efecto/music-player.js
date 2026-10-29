(() => {
  'use strict';

  const videoId = 'kC2UNjs3xHE';
  const playlistId = 'RDEMnKhIZKlwJfkBHGybZ85bLg';
  const button = document.getElementById('music-toggle');
  const status = document.getElementById('music-control-status');
  const caption = document.getElementById('music-frame-status');
  const placeholder = document.getElementById('music-video-placeholder');
  const soundPrompt = document.getElementById('music-sound-prompt');
  if (!button || !status || !caption || !placeholder || !document.getElementById('music-video')) return;

  let player = null;
  let playerReady = false;
  let openingFinished = document.documentElement?.dataset.openingComplete === 'true';
  let userChosePlayback = false;
  let autoAttempted = false;
  let failed = false;
  let readyTimeout = null;
  let playerConstructed = false;
  let playbackTimeout = null;
  let mutedAttempted = false;
  let needsSound = false;
  let userPaused = false;

  function showPlaying(isPlaying) {
    button.setAttribute('aria-pressed', String(isPlaying && !needsSound));
    button.setAttribute('aria-label', needsSound ? 'Activar sonido de la música' : isPlaying ? 'Pausar música' : 'Reproducir música');
    button.setAttribute('title', needsSound ? 'Activar sonido de la música' : isPlaying ? 'Pausar música' : 'Reproducir música');
    if (soundPrompt) soundPrompt.hidden = !needsSound || failed;
  }

  function offerSound() {
    needsSound = true;
    showPlaying(false);
    status.textContent = 'Tocá para escuchar';
    caption.textContent = 'El navegador requiere un toque para escuchar. Tocá «Activar música» o el botón superior.';
  }

  function tryMutedPlayback() {
    clearTimeout(playbackTimeout);
    if (!playerReady || failed || userPaused) return;
    offerSound();
    // Browsers may allow inline muted video even when audible autoplay is blocked.
    // Never retry after the visitor has explicitly chosen to play or pause.
    if (mutedAttempted || userChosePlayback) return;
    mutedAttempted = true;
    player.mute();
    player.playVideo();
  }

  function activateSound() {
    if (!playerReady || failed) return;
    userChosePlayback = true;
    userPaused = false;
    clearTimeout(playbackTimeout);
    needsSound = false;
    player.unMute();
    if (player.getVolume?.() === 0) player.setVolume(65);
    player.playVideo();
    showPlaying(player.getPlayerState() === window.YT.PlayerState.PLAYING);
    status.textContent = 'Iniciando música';
  }

  function currentTitle() {
    try { return player?.getVideoData()?.title || 'Música del encuentro'; }
    catch { return 'Música del encuentro'; }
  }

  function tryAutoPlay() {
    if (!openingFinished || !playerReady || userChosePlayback || autoAttempted || failed || document.hidden) return;
    autoAttempted = true;
    status.textContent = 'Iniciando música';
    player.playVideo();
    playbackTimeout = setTimeout(() => {
      if (!userChosePlayback && player.getPlayerState() !== window.YT.PlayerState.PLAYING) tryMutedPlayback();
    }, 4000);
  }

  function armReadyTimeout() {
    if (!openingFinished || !playerConstructed || playerReady || readyTimeout) return;
    readyTimeout = setTimeout(() => {
      if (playerReady || failed) return;
      failed = true;
      if (soundPrompt) soundPrompt.hidden = true;
      button.disabled = true;
      status.textContent = 'Abrir en YouTube';
      caption.textContent = 'YouTube no respondió. Podés abrir la lista en una pestaña nueva.';
      placeholder.textContent = 'Abrí la lista en YouTube para escucharla.';
    }, 25_000);
  }

  document.addEventListener('vas:opening-complete', () => {
    openingFinished = true;
    if (!playerReady && !failed) status.textContent = 'Esperando YouTube';
    armReadyTimeout();
    tryAutoPlay();
  }, { once: true });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) tryAutoPlay(); });

  button.addEventListener('click', () => {
    if (!playerReady || failed) return;
    if (needsSound || player.isMuted()) { activateSound(); return; }
    userChosePlayback = true;
    clearTimeout(playbackTimeout);
    userPaused = player.getPlayerState() === window.YT.PlayerState.PLAYING;
    if (userPaused) player.pauseVideo();
    else activateSound();
  });
  soundPrompt?.addEventListener('click', activateSound);

  window.onYouTubeIframeAPIReady = () => {
    player = new window.YT.Player('music-video', {
      width: '100%', height: '100%', videoId,
      playerVars: { list: playlistId, listType: 'playlist', controls: 1, playsinline: 1,
        autoplay: 0, origin: location.origin, rel: 0 },
      events: {
        onReady() {
          clearTimeout(readyTimeout);
          failed = false;
          playerReady = true;
          const iframe = player.getIframe?.();
          if (iframe) {
            const allow = iframe.getAttribute('allow') || '';
            if (!/(^|;)\s*autoplay(?:\s|;|$)/.test(allow)) iframe.setAttribute('allow', [allow, 'autoplay'].filter(Boolean).join('; '));
          }
          placeholder.hidden = true;
          button.disabled = false;
          status.textContent = 'Música lista';
          caption.textContent = openingFinished ? 'Podés reproducir o pausar desde aquí o desde el botón superior.' :
            'El video comenzará cuando termine la animación de inicio, si el navegador lo permite.';
          tryAutoPlay();
        },
        onStateChange(event) {
          if (event.data === window.YT.PlayerState.PLAYING) {
            clearTimeout(playbackTimeout);
            needsSound = player.isMuted();
            showPlaying(true);
            status.textContent = needsSound ? 'Activar música' : currentTitle();
            caption.textContent = needsSound ? 'El video está reproduciéndose sin sonido. Tocá «Activar música» para escucharlo.' :
              'Reproduciendo · usá el botón superior o los controles del video para pausar.';
          } else if (event.data === window.YT.PlayerState.PAUSED || event.data === window.YT.PlayerState.ENDED) {
            showPlaying(false);
            status.textContent = event.data === window.YT.PlayerState.ENDED ? 'Música finalizada' : 'Música en pausa';
            caption.textContent = 'Podés continuar desde el botón superior o desde el video.';
          }
        },
        onAutoplayBlocked() {
          tryMutedPlayback();
        },
        onError() {
          clearTimeout(readyTimeout);
          clearTimeout(playbackTimeout);
          failed = true;
          button.disabled = true;
          needsSound = false;
          showPlaying(false);
          status.textContent = 'Abrir en YouTube';
          caption.textContent = 'Este video no se puede reproducir aquí. Podés abrir la lista en YouTube.';
          placeholder.textContent = 'Este video no se puede reproducir aquí.';
          placeholder.hidden = false;
        },
      },
    });
    playerConstructed = true;
    armReadyTimeout();
  };

  const script = document.createElement('script');
  script.src = 'https://www.youtube.com/iframe_api';
  script.async = true;
  script.onerror = () => {
    failed = true;
    if (soundPrompt) soundPrompt.hidden = true;
    status.textContent = 'YouTube no disponible';
    caption.textContent = 'No se pudo cargar el video. Podés abrir la lista en YouTube.';
    placeholder.textContent = 'No se pudo cargar YouTube.';
  };
  // Wait for the page load so YouTube's iframe cannot delay native hash restoration.
  if (document.readyState === 'complete') document.head.append(script);
  else window.addEventListener('load', () => document.head.append(script), { once: true });
})();
