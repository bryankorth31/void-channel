# Listening trial (Bryan, 25 Oct 2026): name the unnamed disc files of shows hidden by the guess rule by what is said in them.
#
# For each file that was placed by position ("sequence guess"), stream about two minutes of sound from inside it, turn the
# speech into text on this PC (faster-whisper, GPU), shortlist the show's real episodes by meaning (Ollama nomic-embed-text),
# and let a local model (Ollama gemma4:12b) pick the episode with a confidence and a one-line reason. Within a show, one file
# per episode: the most confident claim wins and the loser is marked. Nothing is published and nothing is changed in the
# catalog: the result is a report for Bryan to check, and only his approval in HQ would ever bring an episode back.
#
# Only text is kept (catalog/cache/listen/, ignored by git). The audio is piped from ffmpeg straight into memory and never
# written to disk, so no video or audio file lands on this PC. One file at a time, at a polite pace.
#
# Run: C:\Users\bryan\hardware-lab\Scripts\python.exe -I scripts\listen-trial.py johnny-bravo space-ghost-coast-to-coast the-ren-and-stimpy-show
import glob, json, os, subprocess, sys, time, urllib.request
import numpy as np

# The GPU libraries (cuBLAS, cuDNN) come with the nvidia-* pip packages in this Python, but Windows does not look there on its own.
for d in glob.glob(os.path.join(sys.prefix, 'Lib', 'site-packages', 'nvidia', '*', 'bin')):
    os.add_dll_directory(d)
    os.environ['PATH'] = d + os.pathsep + os.environ.get('PATH', '')

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'catalog', 'cache', 'listen')
OLLAMA = 'http://127.0.0.1:11434'
JUDGE = 'gemma4:12b'
CLIP_SECONDS = 120

def http_json(url, body=None, timeout=300):
    req = urllib.request.Request(url, data=None if body is None else json.dumps(body).encode(), headers={'Content-Type': 'application/json', 'User-Agent': 'voidtv.net listening trial'})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode())

def tvmaze_episodes(tid):
    path = os.path.join(OUT, f'tvmaze-{tid}.json')
    if os.path.exists(path):
        return json.load(open(path, encoding='utf8'))
    eps = http_json(f'https://api.tvmaze.com/shows/{tid}/episodes?specials=1')
    keep = [{'season': e.get('season'), 'number': e.get('number'), 'name': e.get('name') or '', 'summary': strip(e.get('summary') or ''), 'airdate': e.get('airdate') or ''} for e in eps]
    json.dump(keep, open(path, 'w', encoding='utf8'), ensure_ascii=False, indent=1)
    time.sleep(1)
    return keep

def tmdb_token():
    for line in open(os.path.join(ROOT, 'backend', '.env'), encoding='utf8'):
        if line.startswith('TMDB_READ_TOKEN='):
            return line.split('=', 1)[1].strip().strip('"')
    return None

def tmdb_id_for(title):
    art = json.load(open(os.path.join(ROOT, 'catalog', 'art.json'), encoding='utf8'))
    for x in (art if isinstance(art, list) else art.values()):
        if isinstance(x, dict) and x.get('title') == title and x.get('tmdb'):
            return x['tmdb']
    return None

def tmdb_episodes(tid):
    # TMDB's episode summaries, for shows whose TVmaze guide has none (Johnny Bravo, Space Ghost). The key is read from
    # backend/.env and sent only to TMDB; it is never printed or saved.
    path = os.path.join(OUT, f'tmdb-{tid}.json')
    if os.path.exists(path):
        return json.load(open(path, encoding='utf8'))
    tok = tmdb_token(); hdr = {'Authorization': 'Bearer ' + tok, 'User-Agent': 'voidtv.net listening trial'}
    def get(u):
        with urllib.request.urlopen(urllib.request.Request('https://api.themoviedb.org/3' + u, headers=hdr), timeout=60) as r:
            return json.loads(r.read().decode())
    show = get(f'/tv/{tid}'); keep = []
    for se in show.get('seasons', []):
        n = se.get('season_number')
        if not n: continue
        for e in get(f'/tv/{tid}/season/{n}').get('episodes', []):
            keep.append({'season': n, 'number': e.get('episode_number'), 'name': e.get('name') or '', 'summary': (e.get('overview') or '').strip(), 'airdate': e.get('air_date') or ''})
        time.sleep(0.3)
    json.dump(keep, open(path, 'w', encoding='utf8'), ensure_ascii=False, indent=1)
    return keep

def strip(html):
    import re
    return re.sub(r'\s+', ' ', re.sub(r'<[^>]+>', ' ', html)).strip()

def audio_clip(url, start, seconds):
    # ffmpeg reads only the part of the file it needs (HTTP range requests) and writes raw 16 kHz mono samples to its stdout.
    cmd = ['ffmpeg', '-v', 'error', '-ss', str(start), '-t', str(seconds), '-i', url, '-vn', '-ac', '1', '-ar', '16000', '-f', 's16le', '-']
    raw = subprocess.run(cmd, capture_output=True, timeout=600).stdout
    return np.frombuffer(raw, dtype=np.int16).astype(np.float32) / 32768.0

def embed(texts):
    return [np.array(http_json(f'{OLLAMA}/api/embeddings', {'model': 'nomic-embed-text', 'prompt': t[:4000]})['embedding']) for t in texts]

def cos(a, b):
    return float(a @ b / (np.linalg.norm(a) * np.linalg.norm(b) + 1e-9))

def judge(show, transcript, cands):
    lines = '\n'.join(f'{i + 1}. S{c["season"]}E{c["number"]} "{c["name"]}": {c["summary"][:600]}' for i, c in enumerate(cands))
    prompt = (f'You are matching a TV episode by its dialogue. Show: {show}.\n\nTranscript of about two minutes from inside one episode:\n"""{transcript[:5000]}"""\n\n'
              f'Candidate episodes from the real episode guide:\n{lines}\n\n'
              'Which candidate is this? Use names, places, events and jokes in the dialogue. If none fit, say 0. '
              'Answer as JSON: {"pick": <number 0..N>, "confidence": <0..100>, "reason": "<one short sentence quoting the dialogue clue>"}')
    r = http_json(f'{OLLAMA}/api/generate', {'model': JUDGE, 'prompt': prompt, 'format': 'json', 'stream': False, 'options': {'temperature': 0}}, timeout=600)
    try:
        return json.loads(r.get('response') or '{}')
    except Exception:
        return {'pick': 0, 'confidence': 0, 'reason': 'unreadable answer'}

def main(slugs):
    os.makedirs(OUT, exist_ok=True)
    from faster_whisper import WhisperModel
    model = WhisperModel('large-v3', device='cuda', compute_type='float16')
    report = []
    for slug in slugs:
        show = json.load(open(os.path.join(ROOT, 'catalog', 'shows', slug + '.json'), encoding='utf8'))
        eps = [e for e in tvmaze_episodes(show['tvmaze']['id']) if e['season'] and e['season'] > 0]
        src = 'TVmaze'
        if sum(1 for e in eps if len(e['summary']) > 20) < len(eps) / 2 and tmdb_id_for(show['show']):
            eps = [e for e in tmdb_episodes(tmdb_id_for(show['show'])) if e['season'] > 0]; src = 'TMDB'
        print(f"{slug}: {len(eps)} episodes from {src}, {sum(1 for e in eps if len(e['summary']) > 20)} with summaries", flush=True)
        ep_vecs = embed([f'{e["name"]}. {e["summary"]}' for e in eps])
        rows = []
        files = [(se['season'], e) for se in show['seasons'] for e in se['episodes'] if e.get('file') and str(e['file'].get('why', '')).startswith('sequence guess')]
        for season, e in files:
            f = e['file']
            dur = f.get('seconds') or 600
            start = max(30, min(180, int(dur * 0.2)))
            t0 = time.time()
            audio = audio_clip(f['url'], start, min(CLIP_SECONDS, max(30, dur - start - 5)))
            segs, _ = model.transcribe(audio, language='en', vad_filter=True, beam_size=5)
            text = ' '.join(s.text.strip() for s in segs)
            if len(text) < 40:
                rows.append({'file': f['file'], 'url': f['url'], 'guessed_as': f'S{season}E{e["number"]}', 'transcript': text, 'pick': None, 'confidence': 0, 'reason': 'too little speech'})
                continue
            tv = embed([text])[0]
            sims = sorted(((cos(tv, v), i) for i, v in enumerate(ep_vecs)), reverse=True)[:10]
            cands = [eps[i] for _, i in sims]
            j = judge(show['show'], text, cands)
            pk = int(j.get('pick') or 0)
            c = cands[pk - 1] if 0 < pk <= len(cands) else None
            rows.append({'file': f['file'], 'url': f['url'], 'guessed_as': f'S{season}E{e["number"]}', 'transcript': text[:1200],
                         'shortlist': [f'S{x["season"]}E{x["number"]} {x["name"]}' for x in cands],
                         'pick': f'S{c["season"]}E{c["number"]} {c["name"]}' if c else None, 'confidence': int(j.get('confidence') or 0), 'reason': j.get('reason', ''),
                         'seconds_spent': round(time.time() - t0, 1)})
            print(f'{slug} | {f["file"][:50]} -> {rows[-1]["pick"]} ({rows[-1]["confidence"]})', flush=True)
            time.sleep(2)
        # one file per episode: keep the most confident claim
        best = {}
        for r in rows:
            if r['pick'] and (r['pick'] not in best or r['confidence'] > best[r['pick']]['confidence']):
                best[r['pick']] = r
        for r in rows:
            r['kept'] = bool(r['pick']) and best.get(r['pick']) is r
        json.dump(rows, open(os.path.join(OUT, slug + '.json'), 'w', encoding='utf8'), ensure_ascii=False, indent=1)
        report.append((show['show'], rows))
    lines = ['# Listening trial report', '']
    for name, rows in report:
        sure = [r for r in rows if r['kept'] and r['confidence'] >= 80]
        maybe = [r for r in rows if r['kept'] and 50 <= r['confidence'] < 80]
        lines += [f'## {name}: {len(rows)} files, {len(sure)} sure (80+), {len(maybe)} maybe (50 to 79), {len(rows) - len(sure) - len(maybe)} not identified', '',
                  '| File | Picked | Confidence | Why |', '|---|---|---|---|']
        lines += [f'| {r["file"][:60]} | {r["pick"] or "-"}{"" if r["kept"] or not r["pick"] else " (lost to another file)"} | {r["confidence"]} | {str(r["reason"])[:140]} |' for r in rows]
        lines.append('')
    open(os.path.join(OUT, 'REPORT.md'), 'w', encoding='utf8').write('\n'.join(lines))
    print('report:', os.path.join(OUT, 'REPORT.md'))

if __name__ == '__main__':
    main(sys.argv[1:])
