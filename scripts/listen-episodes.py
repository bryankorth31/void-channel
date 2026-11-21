# Listen to whole episodes and keep what is said, with a time for every word (PLAN-kids-learning-breaks T13/T16; the
# episode questions engine, any profile). Built on the listening trial's method (scripts/listen-trial.py):
#
#   For each episode named in a list, stream its sound from the Archive with ffmpeg straight into memory (no audio or
#   video file is ever written), turn speech into text on this PC with faster-whisper (GPU), and save only the text:
#   segments with start and end seconds, and each word with its own time and confidence (low-confidence words are
#   flagged). One episode at a time, with a pause between, so the Archive sees a polite single reader.
#
# The list is a JSON file: [{ "slug": "arthur", "season": 1, "number": 2, "title": "...", "url": "...", "item": "...",
# "name": "...", "sizeMB": 120 }, ...]. Output: <out dir>/<slug>-<season>x<number>.json; an existing one is skipped.
#
# Run (this PC's Python, GPU libraries come with its nvidia-* packages):
#   C:\Users\bryan\hardware-lab\Scripts\python.exe -I scripts\listen-episodes.py <list.json> <out dir> [--model large-v3] [--compute int8_float16]
import glob
import json
import os
import subprocess
import sys
import time

# Windows does not look for the CUDA libraries inside the nvidia-* pip packages on its own (as in listen-trial.py).
for d in glob.glob(os.path.join(sys.prefix, 'Lib', 'site-packages', 'nvidia', '*', 'bin')):
    try:
        os.add_dll_directory(d)
        os.environ['PATH'] = d + os.pathsep + os.environ.get('PATH', '')
    except OSError:
        pass

LOW = 0.5  # a word below this confidence is flagged for a person to look at


def opt(name, default):
    return sys.argv[sys.argv.index(name) + 1] if name in sys.argv else default


def audio(url):
    # ffmpeg reads the file over HTTP and writes raw 16 kHz mono samples to its stdout; nothing touches the disk.
    cmd = ['ffmpeg', '-v', 'error', '-user_agent', 'voidtv.net listening (one reader, polite)', '-i', url, '-vn', '-ac', '1', '-ar', '16000', '-f', 's16le', '-']
    p = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=3600)
    if p.returncode != 0 or not p.stdout:
        raise RuntimeError('ffmpeg: ' + p.stderr.decode('utf8', 'replace')[-300:])
    import numpy as np
    return np.frombuffer(p.stdout, dtype=np.int16).astype(np.float32) / 32768.0


def main():
    list_file, out_dir = sys.argv[1], sys.argv[2]
    model_name, compute = opt('--model', 'large-v3'), opt('--compute', 'int8_float16')
    os.makedirs(out_dir, exist_ok=True)
    eps = json.load(open(list_file, encoding='utf8'))
    from faster_whisper import WhisperModel
    model = WhisperModel(model_name, device='cuda', compute_type=compute)
    report = []
    for i, ep in enumerate(eps):
        out = os.path.join(out_dir, '%s-%sx%s.json' % (ep['slug'], ep['season'], ep['number']))
        if os.path.exists(out):
            print('skip (done):', os.path.basename(out)); continue
        t0 = time.time()
        try:
            a = audio(ep['url'])
        except Exception as e:
            print('FAILED to read', ep['slug'], ep['season'], ep['number'], e); report.append({**ep, 'error': str(e)}); continue
        t1 = time.time()
        segs, info = model.transcribe(a, language='en', vad_filter=True, beam_size=5, word_timestamps=True, condition_on_previous_text=False)
        segments, low = [], 0
        for s in segs:
            words = [[w.word.strip(), round(w.start, 2), round(w.end, 2), round(w.probability, 2)] for w in (s.words or [])]
            low += sum(1 for w in words if w[3] < LOW)
            segments.append({'start': round(s.start, 2), 'end': round(s.end, 2), 'text': s.text.strip(), 'words': words})
        t2 = time.time()
        dur = len(a) / 16000.0
        rec = {'slug': ep['slug'], 'season': ep['season'], 'number': ep['number'], 'title': ep.get('title'), 'item': ep.get('item'),
               'file': ep.get('name'), 'url': ep['url'], 'seconds': round(dur, 1), 'model': model_name + ' ' + compute,
               'made': time.strftime('%Y-%m-%dT%H:%M:%S'), 'lowConfidenceWords': low, 'lowConfidenceBelow': LOW,
               'timing': {'readSeconds': round(t1 - t0, 1), 'transcribeSeconds': round(t2 - t1, 1)}, 'segments': segments}
        with open(out, 'w', encoding='utf8') as f:
            json.dump(rec, f, ensure_ascii=False)
        words = sum(len(s['words']) for s in segments)
        print('%d/%d %s %sx%s: %.0f min, read %.0fs, transcribe %.0fs, %d words, %d low' % (i + 1, len(eps), ep['slug'], ep['season'], ep['number'], dur / 60, t1 - t0, t2 - t1, words, low))
        report.append({'slug': ep['slug'], 'season': ep['season'], 'number': ep['number'], 'minutes': round(dur / 60, 1), 'readSeconds': round(t1 - t0), 'transcribeSeconds': round(t2 - t1), 'words': words, 'low': low, 'sizeMB': ep.get('sizeMB')})
        time.sleep(5)  # a polite pause before the next Archive read
    with open(os.path.join(out_dir, '_run-%s.json' % time.strftime('%Y%m%d-%H%M%S')), 'w', encoding='utf8') as f:
        json.dump(report, f, indent=1)


if __name__ == '__main__':
    main()
