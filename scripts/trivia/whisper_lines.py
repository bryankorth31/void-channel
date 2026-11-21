# TRIVIA NIGHTS: Whisper for timed transcripts (plan C18). Reads the queue that scripts/trivia/transcripts.js writes,
# pulls each episode's sound from archive.org with ffmpeg (into memory, never saved), runs Whisper large-v3 on this
# PC's graphics card, and writes the timed lines next to the others. Only text is kept.
# The GPU libraries and the model are the ones the VLC + Whisper tool already set up (C:\Users\bryan\vlc-whisper).
# Stops cleanly between episodes; run again and it carries on. Waits while the PC's memory is above 75 percent, the
# line the RAM guard uses, so it never pushes the PC into stutter.
# Usage (from the void-channel folder): C:\Users\bryan\hardware-lab\Scripts\python.exe -I scripts\trivia\whisper_lines.py <queue.json>
import ctypes
import json
import os
import shutil
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[2]
GPU_LIBS = Path(r"C:\Users\bryan\vlc-whisper\gpu-libs")
MODEL = "large-v3"
MEMORY_LINE = 75
NO_WINDOW = 0x08000000 if os.name == "nt" else 0


def say(text):
    print(text, flush=True)


def memory_load():
    class MS(ctypes.Structure):
        _fields_ = [("dwLength", ctypes.c_ulong), ("dwMemoryLoad", ctypes.c_ulong), ("ullTotalPhys", ctypes.c_ulonglong),
                    ("ullAvailPhys", ctypes.c_ulonglong), ("ullTotalPageFile", ctypes.c_ulonglong), ("ullAvailPageFile", ctypes.c_ulonglong),
                    ("ullTotalVirtual", ctypes.c_ulonglong), ("ullAvailVirtual", ctypes.c_ulonglong), ("ullAvailExtendedVirtual", ctypes.c_ulonglong)]
    m = MS()
    m.dwLength = ctypes.sizeof(MS)
    ctypes.windll.kernel32.GlobalMemoryStatusEx(ctypes.byref(m))
    return m.dwMemoryLoad


def wait_for_memory():
    while memory_load() > MEMORY_LINE:
        say(f"  memory at {memory_load()}%, waiting a minute")
        time.sleep(60)


def load_model():
    if GPU_LIBS.exists():
        for d in {p.parent for p in GPU_LIBS.rglob("*.dll")}:
            os.add_dll_directory(str(d))
            os.environ["PATH"] = str(d) + os.pathsep + os.environ["PATH"]
    from faster_whisper import WhisperModel
    import ctranslate2
    if ctranslate2.get_cuda_device_count() < 1:
        raise SystemExit("No graphics card that Whisper can use; a whole episode on the CPU is too slow, so nothing was done.")
    m = WhisperModel(MODEL, device="cuda", compute_type="float16", local_files_only=True)
    list(m.transcribe(np.zeros(16000, dtype=np.float32))[0])  # proves the libraries load
    return m


def sound(url):
    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg:
        raise SystemExit("ffmpeg not found on PATH")
    out = subprocess.run([ffmpeg, "-v", "error", "-user_agent", "voidtv.net trivia transcripts (https://voidtv.net)",
                          "-i", url, "-map", "0:a:0", "-ac", "1", "-ar", "16000", "-f", "s16le", "pipe:1"],
                         capture_output=True, creationflags=NO_WINDOW, timeout=1800)
    if out.returncode != 0 or len(out.stdout) < 16000 * 2 * 30:
        raise RuntimeError("could not read the sound: " + out.stderr.decode("utf-8", "replace").strip()[:200])
    return np.frombuffer(out.stdout, dtype=np.int16).astype(np.float32) / 32768


def clean(text):
    return " ".join("".join(ch if ch >= " " else " " for ch in text).split())


def to_lines(words, seconds, gap=1.5, most=14):
    """Words into lines the way a subtitle reads: a new line after a sentence ends, at a pause longer than `gap`
    seconds, or after `most` words. Each line runs from its first word's start to its last word's end."""
    lines, cur = [], []

    def close():
        text = clean("".join(w.word for w in cur))
        if text:
            lines.append({"start": round(cur[0].start, 2), "end": round(min(cur[-1].end, seconds), 2), "text": text})

    for w in words:
        if cur and (w.start - cur[-1].end > gap or len(cur) >= most or cur[-1].word.strip()[-1:] in ".?!"):
            close()
            cur = []
        cur.append(w)
    if cur:
        close()
    return lines


def main():
    queue = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))["todo"]
    if not queue:
        say("Nothing queued for Whisper.")
        return
    say(f"Whisper {MODEL} on the graphics card: {len(queue)} episodes")
    model = load_model()
    done = 0
    for job in queue:
        out = ROOT / job["out"]
        if out.exists():
            done += 1
            continue
        wait_for_memory()
        name = f"{job['show']} S{job['season']}E{job['number']}"
        t0 = time.time()
        try:
            audio = sound(job["url"])
            # Word times, so a line starts at its first word and ends at its last: a segment's own end can swallow
            # the pause after it ("Hey, Mr. White." once spanned 22 seconds), which would cut clips in the wrong place.
            # Each piece is heard on its own (condition_on_previous_text off): led by the text before it, Whisper drifted
            # into one long run of lower case with no punctuation in a test on 20 Nov 2026.
            segments, info = model.transcribe(audio, vad_filter=True, beam_size=5, word_timestamps=True,
                                              condition_on_previous_text=False)
            words = [w for s in segments for w in (s.words or []) if w.word.strip()]
            lines = to_lines(words, job["seconds"])
        except Exception as e:  # noqa: BLE001
            say(f"  {name}: skipped ({e})")
            continue
        record = {k: job[k] for k in ("show", "season", "number", "item", "url", "seconds")}
        record["source"] = {"kind": "whisper", "model": MODEL, "language": info.language, "made": datetime.now(timezone.utc).isoformat()}
        record["made"] = record["source"]["made"]
        record["lines"] = lines
        out.parent.mkdir(parents=True, exist_ok=True)
        tmp = out.with_suffix(".part")
        tmp.write_text(json.dumps(record, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
        tmp.replace(out)
        done += 1
        say(f"  {name}: {len(lines)} lines in {time.time() - t0:.0f} s ({done}/{len(queue)})")
    say(f"Done: {done} of {len(queue)}")


if __name__ == "__main__":
    main()
