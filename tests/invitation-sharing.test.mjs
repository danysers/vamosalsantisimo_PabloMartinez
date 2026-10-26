import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../public/pagina principal con efecto/invitation.js',import.meta.url),'utf8');
const settle = () => new Promise(resolve => setImmediate(resolve));

function setup({support = true, share, fetch: customFetch, clipboard, venue = 'outdoor'} = {}) {
  const nodes = new Map();
  class Element {
    hidden = true; disabled = false; textContent = ''; listeners = {}; clicks = 0;
    addEventListener(type, handler) { (this.listeners[type] ||= []).push(handler); }
    dispatch(type, event = {}) { return Promise.all((this.listeners[type] || []).map(fn => fn({target:this,...event}))); }
    click() { this.clicks++; return this.dispatch('click'); }
    focus() { document.activeElement = this; }
    showModal() { this.open = true; }
    close() { this.open = false; return this.dispatch('close'); }
  }
  const get = selector => {
    if (!nodes.has(selector)) nodes.set(selector,new Element());
    return nodes.get(selector);
  };
  const choices = ['instagram','whatsapp','facebook'].map((value,index) => Object.assign(new Element(),{value,checked:index === 0}));
  const classes = new Set();
  const document = {
    querySelector:get, activeElement:get('#share'),
    documentElement:{dataset:{eventVenue:venue},classList:{add:value => classes.add(value),remove:value => classes.delete(value)}}
  };
  get('#invitation-dialog').querySelectorAll = () => choices;
  get('#invite-save').href = 'http://localhost:3000/pagina%20principal%20con%20efecto/assets/invitacion-vamos-al-santisimo-2026-prueba.png';
  get('#invite-save').download = 'invitacion-vamos-al-santisimo-2026-prueba.png';
  const shares = [], fetches = [], copies = [];
  const navigator = {clipboard:clipboard || {writeText:async text => copies.push(text)}};
  if (support) {
    navigator.canShare = data => data.files[0].type === 'image/png';
    navigator.share = data => { shares.push(data); return share ? share(data) : Promise.resolve(); };
  }
  vm.runInNewContext(source,{
    document,navigator,File,encodeURIComponent,matchMedia:() => ({matches:true}),
    fetch:url => { fetches.push(url); return customFetch ? customFetch(url) : Promise.resolve({ok:true,blob:async () => new Blob(['test-image'],{type:'image/png'})}); }
  });
  return {get,choices,classes,document,shares,fetches,copies};
}

test('loads the file before the share tap and hands off a real PNG without another fetch',async () => {
  const app = setup();
  assert.equal(app.fetches.length,0);
  await app.get('#share').click(); await settle();
  assert.equal(app.get('#invitation-dialog').open,true);
  assert.equal(app.get('#invite-native').hidden,false);
  assert.equal(app.shares.length,0);
  const pending = app.get('#invite-native').click();
  assert.equal(app.shares.length,1,'native share must be called synchronously in the click gesture');
  await pending;
  assert.equal(app.fetches.length,1);
  assert.ok(app.shares[0].files[0] instanceof File);
  assert.equal(app.shares[0].files[0].type,'image/png');
  assert.equal(app.shares[0].files[0].name,'invitacion-vamos-al-santisimo-2026-prueba.png');
  assert.deepEqual(Object.keys(app.shares[0]),['files']);
});

test('canceling native share neither downloads nor opens a network',async () => {
  const app = setup({share:async () => { throw Object.assign(new Error('Canceled'),{name:'AbortError'}); }});
  await app.get('#share').click(); await settle();
  await app.get('#invite-native').click();
  assert.equal(app.get('#invite-save').clicks,0);
  assert.equal(app.get('#invite-open-network').clicks,0);
  assert.match(app.get('#invite-status').textContent,/No se compartió/);
  assert.equal(app.get('#invite-native').disabled,false);
});

test('blocks duplicate native share requests until the pending handoff completes',async () => {
  let finish;
  const app = setup({share:() => new Promise(resolve => { finish = resolve; })});
  await app.get('#share').click(); await settle();
  const first = app.get('#invite-native').click();
  await app.get('#invite-native').click();
  assert.equal(app.shares.length,1);
  assert.equal(app.get('#invite-native').disabled,true);
  finish(); await first;
  assert.equal(app.get('#invite-native').disabled,false);
});

test('unsupported browsers retain download and all three network destinations',async () => {
  const app = setup({support:false});
  await app.get('#share').click();
  assert.equal(app.fetches.length,0);
  assert.equal(app.get('#invite-native').hidden,true);
  for (const network of app.choices) {
    app.choices.forEach(choice => { choice.checked = choice === network; });
    await network.dispatch('change');
    const link = app.get('#invite-open-network');
    const url = new URL(link.href);
    assert.equal(url.protocol,'https:');
    if (network.value === 'whatsapp') {
      assert.equal(url.hostname,'wa.me');
      assert.match(url.searchParams.get('text'),/19:00 Convocatoria.*20:00 Misa central.*21:00 Adoración/);
      assert.match(url.searchParams.get('text'),/https:\/\/vamosalsantisimo.com\//);
      assert.ok(!link.href.includes('localhost'));
    } else assert.equal(url.hostname,`www.${network.value}.com`);
    const before = app.get('#invite-save').clicks;
    await link.click();
    assert.equal(app.get('#invite-save').clicks,before+1);
  }
});

test('failed file loading does not break downloads and retries on reopening',async () => {
  let requests = 0;
  const app = setup({fetch:async () => {
    if (++requests === 1) return {ok:false};
    return {ok:true,blob:async () => new Blob(['test'],{type:'image/png'})};
  }});
  await app.get('#share').click(); await settle();
  assert.equal(app.get('#invite-native').hidden,true);
  await app.get('#invite-open-network').click();
  assert.equal(app.get('#invite-save').clicks,1);
  await app.get('#invite-close').click();
  assert.equal(app.classes.has('invitation-open'),false);
  assert.equal(app.document.activeElement,app.get('#share'));
  await app.get('#share').click(); await settle();
  assert.equal(app.get('#invite-native').hidden,false);
  assert.equal(requests,2);
});

test('native failure offers explicit download without claiming successful sharing',async () => {
  const app = setup({share:async () => { throw Object.assign(new Error('Denied'),{name:'NotAllowedError'}); }});
  await app.get('#share').click(); await settle();
  await app.get('#invite-native').click();
  assert.match(app.get('#invite-status').textContent,/No se pudo compartir/);
  assert.match(app.get('#invite-status').textContent,/Solo descargar/);
  assert.equal(app.get('#invite-save').clicks,0);
});

test('clipboard uses the public event address and confirmed invitation details',async () => {
  const app = setup();
  await app.get('#copy').click(); await settle();
  await app.get('#invite-copy-text').click(); await settle();
  assert.equal(app.copies[0],'https://vamosalsantisimo.com/');
  assert.match(app.copies[1],/Anfiteatro de la Juventud/);
  assert.ok(app.copies.every(text => !text.includes('localhost')));
});

test('clipboard denial leaves the actual text available for manual copying',async () => {
  const app = setup({clipboard:{writeText:async () => { throw new Error('Denied'); }}});
  await app.get('#invite-copy-text').click(); await settle();
  assert.match(app.get('#invite-status').textContent,/Copiá este texto: Yo voy/);
  assert.match(app.get('#invite-status').textContent,/https:\/\/vamosalsantisimo.com\//);
});

test('shared text follows a rain venue change even when the dialog is already open',async () => {
  const app = setup({support:false});
  await app.get('#share').click();
  app.choices.forEach(choice => { choice.checked = choice.value === 'whatsapp'; });
  await app.choices[1].dispatch('change');
  app.document.documentElement.dataset.eventVenue = 'indoor';
  await app.get('#invite-open-network').click();
  const text = new URL(app.get('#invite-open-network').href).searchParams.get('text');
  assert.match(text,/diciembre · Parroquia María Auxiliadora/);
  await app.get('#invite-copy-text').click();
  assert.match(app.copies.at(-1),/diciembre · Parroquia María Auxiliadora/);
});
