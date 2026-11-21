# What the kids voice says, as against what the screen shows (Bryan, 17 Nov 2026: "live versus live").
# Kokoro guesses some words wrong from context. Its phonemizer reads "Books live on the shelf" and "Where do books live?"
# with the "live show" sound. The fix respells the word for the voice only; the words on screen never change.
# Add a word here when the voice says it wrong, then run voice-play.py --redo / voice-cards.py (which re-voices it).
import re

# word -> respelling Kokoro reads right. Kids lines use "live" only as the verb (to live somewhere); a line that
# means the other "live" (a live show) says so with one of the words in KEEP_LIVE after it.
KEEP_LIVE = r'(?!\s+(?:show|shows|music|video|tv|stream|broadcast|concert)\b)'
RULES = [
    (re.compile(r'\blive\b' + KEEP_LIVE), 'liv'),
    (re.compile(r'\bLive\b' + KEEP_LIVE), 'Liv'),
]


def say(text):
    for pat, rep in RULES:
        text = pat.sub(rep, text)
    return text
