# Voice files for the learning-break cards (PLAN-kids-learning-breaks T6): each card in a breaks.json gets two short
# MP3s, made on this PC with Kokoro (offline): "<id>-a.mp3", what the voice says first (say, then the question and its
# three answers, or the thing to try), and "<id>-b.mp3", the cheer after (reveal). The voice and speed come from the
# file's "voice" / "voiceSpeed". A card whose words are unchanged keeps its files (a hash of the words is stored beside
# them in voices.json); changed words are spoken again. The files are not published here: the site build copies only
# approved cards' files.
#
# Run: C:\Users\bryan\hardware-lab\Scripts\python.exe -I scripts\voice-cards.py <breaks.json> <out dir> <kokoro models dir>
import hashlib
import json
import os
import subprocess
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))  # -I leaves the script's folder off the path
from say import say  # noqa: E402  the voice's respellings (live -> liv); a new rule changes the hash, so the card is re-voiced
from kokoro_onnx import Kokoro


def lines(c):
    first = [c.get('say', '')]
    if c.get('ask'):
        ans = [a['text'] for a in c.get('answers', [])]
        first.append(c['ask'] + ' ' + (', '.join(ans[:-1]) + ', or ' + ans[-1] if len(ans) > 1 else ''.join(ans)) + '?')
    elif c.get('try'):
        first.append(c['try'])
    return ' '.join(t.strip() for t in first if t and t.strip()), (c.get('reveal') or '').strip()


def main():
    src, out, models = sys.argv[1], sys.argv[2], sys.argv[3]
    os.makedirs(out, exist_ok=True)
    data = json.load(open(src, encoding='utf8'))
    voice, speed = data.get('voice', 'af_heart'), float(data.get('voiceSpeed', 0.92))
    k = Kokoro(os.path.join(models, 'kokoro-v1.0.onnx'), os.path.join(models, 'voices-v1.0.bin'))
    idx_file = os.path.join(out, 'voices.json')
    idx = json.load(open(idx_file, encoding='utf8')) if os.path.exists(idx_file) else {}
    made = kept = 0
    for c in data['cards']:
        for part, text in zip('ab', lines(c)):
            if not text:
                continue
            text = say(text)
            key = '%s-%s' % (c['id'], part)
            h = hashlib.sha1((voice + str(speed) + text).encode('utf8')).hexdigest()[:16]
            path = os.path.join(out, key + '.mp3')
            if idx.get(key, {}).get('hash') == h and os.path.exists(path):
                kept += 1
                continue
            samples, rate = k.create(text, voice=voice, speed=speed, lang='en-us')
            pcm = (np.clip(samples, -1, 1) * 32767).astype(np.int16).tobytes()
            p = subprocess.run(['ffmpeg', '-y', '-v', 'error', '-f', 's16le', '-ar', str(rate), '-ac', '1', '-i', '-', '-codec:a', 'libmp3lame', '-b:a', '48k', path], input=pcm)
            if p.returncode != 0:
                raise RuntimeError('ffmpeg failed for ' + key)
            idx[key] = {'hash': h, 'seconds': round(len(samples) / rate, 1), 'text': text}
            made += 1
    json.dump(idx, open(idx_file, 'w', encoding='utf8'), indent=1, ensure_ascii=False)
    total = sum(os.path.getsize(os.path.join(out, f)) for f in os.listdir(out) if f.endswith('.mp3'))
    print('voice %s: made %d, kept %d, %d files, %.1f MB' % (voice, made, kept, len([f for f in os.listdir(out) if f.endswith('.mp3')]), total / 1e6))


if __name__ == '__main__':
    main()
