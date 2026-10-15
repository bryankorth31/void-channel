// one-off patch: playability from the Archive's format, browsers try Matroska when they can, silent-audio notice. Deleted after use.
const fs = require('fs');
let m = fs.readFileSync('scripts/match.js', 'utf8');
const n = (m.match(/playable: !risk/g) || []).length;
if (n !== 3) throw new Error('expected 3 playable: !risk, found ' + n);
// The Archive's own format probe (h.264 / MPEG4 / WebM...) decides playability; the name tags (x265, AC3, XviD)
// stay as a risk note for the player. A probe on 2026-10-14 played ten "unplayable" files in Edge, audio included.
m = m.replace(/playable: !risk/g, 'playable: f.playable');
fs.writeFileSync('scripts/match.js', m);

const P = 'scripts/lib/app.js';
let s = fs.readFileSync(P, 'utf8');
const R = (a, b, l) => { if (!s.includes(a)) throw new Error('anchor ' + l); s = s.replace(a, b); };
// server: episodes carry the risk note
R("map((e) => ({ n: e.number, name: e.name, state: e.state, url: e.file.url, min: Math.round(e.file.seconds / 60), item: e.file.item })) })).filter((se) => se.episodes.length),",
  "map((e) => ({ n: e.number, name: e.name, state: e.state, url: e.file.url, min: Math.round(e.file.seconds / 60), item: e.file.item, r: e.file.codecRisk ? e.file.codecRisk.replace(/^(video|audio|container) /, '').replace(/[()]/g, '') : undefined })) })).filter((se) => se.episodes.length),", 'r field');
// client: browsers that play Matroska adopt the vault into the seasons
R("async function ensure(s){if(s.seasons)return s;const r=await fetch(BASE+'data/shows/'+s.slug+'.json');const d=await r.json();",
  "function adoptVault(d){if(!d.vault||!d.vault.length)return;const can=document.createElement('video').canPlayType('video/x-matroska; codecs=\"avc1.640028, mp4a.40.2\"');if(!can)return;for(const v of d.vault){let se=d.seasons.find(z=>z.season===v.season);if(!se){se={season:v.season,episodes:[]};d.seasons.push(se);d.seasons.sort((a,b)=>a.season-b.season)}if(se.episodes.some(e=>e.n===v.n))continue;se.episodes.push({n:v.n,name:v.name,state:'REVIEW',url:v.url,min:v.min,item:'',r:v.risk,tryc:1});se.episodes.sort((a,b)=>a.n-b.n)}d.vault=[]}\nasync function ensure(s){if(s.seasons)return s;const r=await fetch(BASE+'data/shows/'+s.slug+'.json');const d=await r.json();adoptVault(d);", 'adopt');
// rows show the risk note
R("'<span>'+esc(y.name)+'</span>'+(y.state==='REVIEW'?'<span class=\"rv\">review</span>':'')+'<span class=\"m\">'+y.min+'m</span></div>'}))",
  "'<span>'+esc(y.name)+'</span>'+(y.state==='REVIEW'?'<span class=\"rv\">review</span>':'')+(y.r?'<span class=\"rv dl\" title=\"May not play in every browser\">'+esc(y.r)+'</span>':'')+'<span class=\"m\">'+y.min+'m</span></div>'}))", 'row badge');
// player: silent-audio notice after a few seconds of playback
R(" setIcons();show();\n v.onended=()=>{",
  " setIcons();show();\n v.addEventListener('playing',()=>{setTimeout(()=>{if(v.paused||v.muted||v.currentTime<2||typeof v.webkitAudioDecodedByteCount!=='number'||v.webkitAudioDecodedByteCount>0||vp.dataset.silent)return;vp.dataset.silent=1;const m=q('.vp-msg');m.innerHTML='<b>No sound in this browser for this copy'+(ep.r?' ('+esc(ep.r)+')':'')+'.</b><p class=\"dim\">Edge, Safari and most TVs can play its audio, or download it for VLC.</p><div class=\"row\"><a class=\"btn\" href=\"'+esc(ep.url)+'\" target=\"_blank\" rel=\"noopener\">Download</a><button class=\"btn\" data-m=\"close\">Keep watching</button>'+(hasNext()?'<button class=\"btn gold\" data-m=\"next\">Next episode</button>':'')+'</div>';m.classList.add('on');m.onclick=(e)=>{const b=e.target.closest('[data-m]');if(!b)return;m.classList.remove('on');if(b.dataset.m==='next')next()};track('error',{slug:s.slug,ep:se.season+'x'+ep.n,x:'silent '+(ep.r||''),n:9})},4500)},{once:true});\n v.onended=()=>{", 'silent');
fs.writeFileSync(P, s);
console.log('patched');
