# Voice clips for Play and Learn (PLAN-kids-play P4): every line the games can say becomes one short MP3, made on this PC
# with Kokoro (offline), voice af_heart, the same voice as the learning breaks. The lines come from the games' own data:
#   node scripts/lib/play/build.js --lines <lines.json>        ({ key: text }, key = a hash of the words)
#   C:\Users\bryan\hardware-lab\Scripts\python.exe -I scripts\voice-play.py <lines.json> <out dir> <kokoro models dir>
# <out dir> is <kids catalog>/play-voice. A clip whose file exists is kept (the key changes when the words change), and
# clips for lines no longer used are left alone; --redo re-voices the lines say.py respells (after a new rule); the site build copies only the clips its lines use.
import json
import os
import subprocess
import sys

import numpy as np
from kokoro_onnx import Kokoro

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))  # -I leaves the script's folder off the path
from say import say  # noqa: E402  the voice's respellings (live -> liv); the screen keeps the words

VOICE, SPEED = 'af_heart', 0.92


def main():
    redo = '--redo' in sys.argv
    src, out, models = [a for a in sys.argv[1:] if a != '--redo'][:3]
    os.makedirs(out, exist_ok=True)
    lines = json.load(open(src, encoding='utf8'))
    k = Kokoro(os.path.join(models, 'kokoro-v1.0.onnx'), os.path.join(models, 'voices-v1.0.bin'))
    made = kept = 0
    for key, text in lines.items():
        path = os.path.join(out, key + '.mp3')
        if os.path.exists(path) and not (redo and say(text) != text):
            kept += 1
            continue
        samples, rate = k.create(say(text), voice=VOICE, speed=SPEED, lang='en-us')
        pcm = (np.clip(samples, -1, 1) * 32767).astype(np.int16).tobytes()
        p = subprocess.run(['ffmpeg', '-y', '-v', 'error', '-f', 's16le', '-ar', str(rate), '-ac', '1', '-i', '-', '-codec:a', 'libmp3lame', '-b:a', '48k', path], input=pcm)
        if p.returncode != 0:
            raise RuntimeError('ffmpeg failed for ' + key)
        made += 1
    print('play voice %s: made %d, kept %d, of %d lines' % (VOICE, made, kept, len(lines)))


if __name__ == '__main__':
    main()
