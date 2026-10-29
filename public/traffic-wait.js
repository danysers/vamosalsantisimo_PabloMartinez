(() => {
  'use strict';
  const countdown = document.getElementById('traffic-countdown');
  const status = document.getElementById('traffic-status');
  if (!countdown || !status) return;
  // Spread automatic retries so a waiting group does not return all at once.
  const deadline = Date.now() + 30000 + Math.floor(Math.random() * 5001);
  let timer;
  let reloading = false;
  function tick() {
    const seconds = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
    countdown.textContent = String(seconds);
    if (seconds === 0 && !reloading) {
      reloading = true;
      clearInterval(timer);
      status.textContent = 'Estamos comprobando si ya podés ingresar…';
      // Preserve the current origin, full path, query and hash. No URL supplied
      // by another visitor or third party is used for the retry.
      window.location.reload();
    }
  }
  timer = setInterval(tick, 1000);
  tick();
})();
