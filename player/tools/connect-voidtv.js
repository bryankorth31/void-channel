// One-time patch: connects the VOID player to VOIDtv (scripts/lib/app.js and scripts/site.js).
// Every replacement checks its anchor appears exactly the expected number of times and stops otherwise,
// so a half-applied patch is impossible. Run once:  node player/tools/connect-voidtv.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const APP = path.join(ROOT, 'scripts', 'lib', 'app.js');
const SITE = path.join(ROOT, 'scripts', 'site.js');

let s = fs.readFileSync(APP, 'utf8');
if (s.includes('function mountShow(')) { console.log('already connected'); process.exit(0); }
const rep = (a, b, times = 1) => {
  const n = s.split(a).length - 1;
  if (n !== times) throw new Error('anchor found ' + n + 'x (expected ' + times + '): ' + a.slice(0, 70));
  s = s.split(a).join(b);
};
// Remove a client function by name: from "function name(" to its matching closing brace.
const cut = (name) => {
  let i = s.indexOf('function ' + name + '(');
  if (i < 0) throw new Error('missing function ' + name);
  if (s.slice(i - 6, i) === 'async ') i -= 6; // take the async keyword with it
  let d = 0, k = s.indexOf('{', i);
  for (; k < s.length; k++) { if (s[k] === '{') d++; else if (s[k] === '}') { d--; if (!d) break; } }
  let end = k + 1; if (s[end] === '\n') end++;
  s = s.slice(0, i) + s.slice(end);
};

// ---------- server side: ranked copies per episode ----------
rep("const PROFILE = require('./profile');",
  "const PROFILE = require('./profile');\nconst { rankEpisode } = require('../../player/tools/rank-sources');\n"
  + "// Builds what the browser gets per episode: the best copy (url/item/p/f/m) plus same-episode backups (alt),\n"
  + "// ranked by player/tools/rank-sources.js (lighter clean copies first; wrong-episode \"alternates\" dropped).\n"
  + "function epOut(e) {\n"
  + "  const r = rankEpisode(e);\n"
  + "  const first = r.find((x) => !x.needs) || r[0];\n"
  + "  const oldRisk = e.file.codecRisk ? e.file.codecRisk.replace(/^(video|audio|container) /, '').replace(/[()]/g, '') : undefined;\n"
  + "  const out = { n: e.number, name: e.name, state: e.state, url: first ? first.url : e.file.url, min: Math.round(((first && first.seconds) || e.file.seconds) / 60), item: first ? first.item : e.file.item,\n"
  + "    r: !first || first.url === e.file.url ? oldRisk : (first.risk || undefined) };\n"
  + "  if (first) {\n"
  + "    out.p = first.path; out.f = first.format; if (first.mbps) out.m = first.mbps; if (first.needs) out.nd = first.needs;\n"
  + "    const rest = r.filter((x) => x !== first);\n"
  + "    if (rest.length) out.alt = rest.map((x) => ({ i: x.item, p: x.path, f: x.format, m: x.mbps || undefined, n: x.needs || undefined }));\n"
  + "  }\n"
  + "  return out;\n"
  + "}\n"
  + "// Player files are versioned by the deploy so a new player and new data always arrive together.\n"
  + "const PLAYER_V = (process.env.CF_PAGES_COMMIT_SHA || String(Date.now())).slice(0, 9);");
rep(".map((e) => ({ n: e.number, name: e.name, state: e.state, url: e.file.url, min: Math.round(e.file.seconds / 60), item: e.file.item, r: e.file.codecRisk ? e.file.codecRisk.replace(/^(video|audio|container) /, '').replace(/[()]/g, '') : undefined }))",
  ".map((e) => epOut(e))");

// ---------- page: load the player once ----------
rep('<link rel="preconnect" href="https://archive.org">', '<link rel="preconnect" href="https://archive.org"><link rel="stylesheet" href="${base}assets/player/player.css?v=${PLAYER_V}">');
rep('const indexScript = mode === \'embed\' ? \'\' : `<script src="${base}data/index.js"></script>`;',
  'const indexScript = `<script src="${base}assets/player/voidplayer.js?v=${PLAYER_V}"></script>` + (mode === \'embed\' ? \'\' : `<script src="${base}data/index.js"></script>`);');

// ---------- client: one player, shut down properly whenever the page changes ----------
// (client code lives inside a template literal: no backticks, no ${, no backslashes below)
const glue = [
  "let VP=null,TVCUR=null;",
  "function killPlayer(){if(VP){const p=VP;VP=null;try{p.destroy()}catch(e){}}}",
  "function filesFor(ep){const out=[];const add=(item,p,url,f,m,nd)=>{if(!url&&item&&p)url='https://archive.org/download/'+item+'/'+p;if(!url)return;if(!item||!p){const t=url.split('/download/')[1]||'';const k=t.indexOf('/');if(k>0){item=item||t.slice(0,k);p=p||t.slice(k+1)}}out.push({url:url,item:item,path:p,format:f||'',mbps:m||null,needs:nd||(url.toLowerCase().endsWith('.mkv')?'mkv':'')})};add(ep.item,ep.p,ep.url,ep.f,ep.m,ep.nd);(ep.alt||[]).forEach(a=>add(a.i,a.p,'',a.f,a.m,a.n));return out}",
  "function vpEvent(e,p){const c=(p&&p._ctx)||{};const base={slug:c.slug,ep:c.ep};if(e.type==='stall'||e.type==='freeze'||e.type==='drift'||e.type==='action'||e.type==='switch'||e.type==='recovered'||e.type==='silent'||e.type==='silent-final')track('act',Object.assign({x:'pq:'+e.type+(e.step?':'+e.step:'')+(e.kind?':'+e.kind:'')+(e.to?'>'+e.to:'')},base));if(e.type==='failed')track('error',Object.assign({x:c.item||'',n:/net|stall|slow/.test(e.reason||'')?2:4},base));if(e.type==='summary'&&e.summary){const m=e.summary;try{if(window.Sentry&&Sentry.captureMessage&&(m.freezes||m.drifts||m.switches||m.stalls>2))Sentry.captureMessage('Playback trouble: '+(c.slug||'?'),{level:'warning',tags:{show:c.slug||'',episode:c.ep||'',freezes:String(m.freezes),drifts:String(m.drifts),stalls:String(m.stalls),switches:String(m.switches),recovered:String(m.recovered)},extra:m,fingerprint:['trouble',c.slug||'']})}catch(x){}}}",
  "function mkPlayer(host,o){if(!window.VoidPlayer){host.innerHTML='<div class=\"loading\">The player did not load. Refresh the page.</div>';return null}return VoidPlayer.create(host,Object.assign({globalKeys:true,storageKey:'voidtv',onEvent:vpEvent},o||{}))}",
  "function nextEp(){const s=state.show;if(!s||!s.seasons[state.se])return null;const se=s.seasons[state.se];if(state.e+1<se.episodes.length)return se.episodes[state.e+1];return s.seasons[state.se+1]?s.seasons[state.se+1].episodes[0]:null}",
  "function prevEp(){const s=state.show;if(!s)return;if(state.e>0)play(state.se,state.e-1);else if(state.se>0)play(state.se-1,s.seasons[state.se-1].episodes.length-1)}",
  "function mountShow(s,se,ep,autoplay){const host=$('vph');if(!host)return null;VP=mkPlayer(host,{onNext:()=>{if(nextEp())next()},onPrev:()=>prevEp(),onReport:()=>{if(state.show)report()},onEnded:async(p)=>{const nx=nextEp();if(nx&&await p.upNext(nx.name,10)&&VP===p)next()}});if(!VP)return null;const hr=ME.history[s.slug];let at=0;if(state.seekTo){at=state.seekTo;state.seekTo=0}else if(hr&&hr.se===state.se&&hr.e===state.e&&hr.pos>20&&(!ep.min||hr.pos<ep.min*60-30))at=hr.pos;VP._ctx={slug:s.slug,ep:se.season+'x'+ep.n,item:ep.item||''};VP.load({id:s.slug+'/'+se.season+'x'+ep.n,title:'S'+String(se.season).padStart(2,'0')+'E'+String(ep.n).padStart(2,'0')+' · '+ep.name,show:s.show,files:filesFor(ep),artwork:s.poster||''},{startAt:at,autoplay:!!autoplay});return VP.v}",
].join('\n') + '\n';
rep('function vpMarkup(', glue + 'function vpMarkup(');
['vpMarkup', 'vpFlash', 'vpCaptions', 'vpSync', 'vpInit'].forEach(cut);

// show page: the player host replaces the old markup; wiring keeps play/tick/end analytics and resume saving
rep("'+vpMarkup(autoplay,ep)+'", '<div class="vpx-host" id="vph"></div>');
{
  const a = "const v=$('v');v.onended=next;";
  const i = s.indexOf(a);
  if (i < 0 || s.split(a).length !== 2) throw new Error('showView wiring anchor');
  const endMark = 'vpInit(s,se,ep)}';
  const j = s.indexOf(endMark, i);
  if (j < 0) throw new Error('showView end anchor');
  const old = s.slice(i, j + endMark.length);
  const keep = old.slice(old.indexOf('{const slug='), old.indexOf("v.addEventListener('error'"));
  const tail = old.slice(old.indexOf('v.onplay='), old.indexOf('vpInit(s,se,ep)'));
  if (!keep.startsWith('{const slug=') || !tail.startsWith('v.onplay=')) throw new Error('showView pieces');
  s = s.slice(0, i) + "const v=mountShow(s,se,ep,autoplay);if(!v)return;" + keep + '}' + tail + '}' + s.slice(j + endMark.length);
}
rep('Space / K play-pause · N next · F fullscreen · ← → skip 10s.', 'Space / K play-pause · ← → 10s · J / L −10 / +30s · N next · F fullscreen · C captions.');
rep(",v=$('v');const t=v?Math.floor(v.currentTime):0;", ";const t=VP?Math.floor(VP.currentTime):0;");

// every page change shuts the current player down first
rep("$('main').innerHTML=", "killPlayer();$('main').innerHTML=", 7);
rep("main.innerHTML=", "killPlayer();main.innerHTML=", 3); // tvPage writes through a local variable

// TV channels: the same player, channel surfing on Next/Prev, end-of-slot advances properly
rep('<video id="v" controls playsinline></video>', '<div class="vpx-host" id="vph"></div>');
cut('tvPlay');
rep('async function tvPage(', "async function tvPlay(c,i,offset){const it=c.items[i];const s=SHOWS[it[0]];const host=$('vph');if(!host||!s)return;const token=++TV_TOKEN;await ensure(s);if(token!==TV_TOKEN||state.view!=='tv')return;const se=(s.seasons||[]).find(x=>x.season===it[1]);const ep=se&&se.episodes.find(e=>e.n===it[2]);if(!ep){tvPlay(c,(i+1)%c.items.length,0);return}osd(c,i,s,ep);track('tvplay',{slug:c.id,x:s.slug+' '+se.season+'x'+ep.n});TVCUR={c,i};if(!VP||!host.contains(VP.root))VP=mkPlayer(host,{volumeKeys:false,onNext:()=>surf(1),onPrev:()=>surf(-1),onEnded:()=>{const n=chanNow(TVCUR.c);const j=n.i===TVCUR.i?(TVCUR.i+1)%TVCUR.c.items.length:n.i;tvPlay(TVCUR.c,j,n.i===TVCUR.i?0:n.offset)},onEvent:(e,p)=>{vpEvent(e,p);if(e.type==='started')state.tvFails=0;if(e.type==='failed'){state.tvFails=(state.tvFails||0)+1;if(state.tvFails>6){state.tvFails=0;const o=document.querySelector('.osd');if(o)o.insertAdjacentHTML('beforeend','<p class=\"dim\">Signal lost on this channel for now. Try another one.</p>');return}setTimeout(()=>{if(VP!==p||!TVCUR)return;const n=chanNow(TVCUR.c);tvPlay(TVCUR.c,(n.i+1)%TVCUR.c.items.length,0)},1500)}}});if(!VP)return;VP._ctx={slug:s.slug,ep:se.season+'x'+ep.n,item:ep.item||''};VP.load({id:c.id+'/'+s.slug+'/'+se.season+'x'+ep.n,title:s.show+' · '+ep.name,show:c.name,files:filesFor(ep),artwork:s.poster||''},{startAt:offset>5?offset:0,autoplay:!!state.tvOn})}\nasync function tvPage(");

// keyboard: the player owns playback keys; the site keeps search (/), TV surfing (↑↓) and Escape-to-browse
{
  const a = "document.addEventListener('keydown',(k)=>{";
  const i = s.indexOf(a), endMark = "if(k.key==='Escape')go('')});";
  const j = s.indexOf(endMark, i);
  if (i < 0 || j < 0) throw new Error('keydown anchors');
  s = s.slice(0, i) + "document.addEventListener('keydown',(k)=>{if(k.ctrlKey||k.metaKey||k.altKey)return;if(k.target.matches&&k.target.matches('input:not([type=range]),select,textarea,[contenteditable]'))return;if(k.key==='/'){k.preventDefault();$('q').focus();return}if(state.view==='tv'&&(k.key==='ArrowUp'||k.key==='ArrowDown')){k.preventDefault();surf(k.key==='ArrowUp'?-1:1);return}if(k.key==='Escape'&&state.show&&!document.fullscreenElement)go('')});" + s.slice(j + endMark.length);
}

// page effects stand down while the new player is playing (was keyed to the old player's class)
rep('html:has(.vp.isplay)', 'html:has(.vpx:not(.paused))', 5);
rep("document.querySelector('.vp.isplay')", "document.querySelector('.vpx:not(.paused)')");

// sanity: nothing may still reference the old player
for (const old of ['vpMarkup(', 'vpInit(', 'vpSync(', 'vpCaptions(', 'vpFlash(', "$('v')", "$('vp')"]) if (s.includes(old)) throw new Error('still references ' + old);
fs.writeFileSync(APP, s);

// ---------- build: ship the player as two cacheable files ----------
let t = fs.readFileSync(SITE, 'utf8');
const anchor = "if (fs.existsSync(brandSrc)) fs.cpSync(brandSrc";
if (t.split(anchor).length !== 2) throw new Error('site.js anchor');
const add = "// The VOID player (player/): one script bundle and one stylesheet, cached with the rest of /assets.\n"
  + "{ const P = path.join(ROOT, 'player', 'src'); const dst = path.join(OUT, 'assets', 'player'); fs.mkdirSync(dst, { recursive: true });\n"
  + "  fs.writeFileSync(path.join(dst, 'voidplayer.js'), ['core.js', 'icons.js', 'player.js'].map((f) => fs.readFileSync(path.join(P, f), 'utf8')).join('\\n;\\n'));\n"
  + "  fs.copyFileSync(path.join(P, 'player.css'), path.join(dst, 'player.css')); }\n";
t = t.replace(anchor, add + anchor);
fs.writeFileSync(SITE, t);
console.log('connected');
