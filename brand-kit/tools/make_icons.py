# VOIDtv icon kit generator: writes every UI icon as an SVG on one 24px grid.
# Rules: 2px stroke, round caps and joins, 2px safe margin, currentColor only, no text (digits are paths),
# so every icon drops into the site's existing CSS mask system (.ico{mask:url(...)}) and inherits colour.
# Run:  python brand-kit/tools/make_icons.py      (writes brand-kit/icons/ui/*.svg and icons.json)
import json, os

OUT = os.path.join(os.path.dirname(__file__), '..', 'icons', 'ui')
os.makedirs(OUT, exist_ok=True)
DOT = lambda x, y, r=1.15: f'<circle cx="{x}" cy="{y}" r="{r}" fill="currentColor" stroke="none"/>'

REPLAY_ARC = '<path d="M3.8 12a8.2 8.2 0 1 0 2.4-5.8"/><path d="M3.8 3.6v4.1h4.1"/>'
FWD_ARC = '<path d="M20.2 12a8.2 8.2 0 1 1-2.4-5.8"/><path d="M20.2 3.6v4.1h-4.1"/>'
DIGITS = '<g stroke-width="1.6">{}</g>'
ONE = '<path d="M9.4 10.6l1.2-.9v4.6"/>'
ZERO = lambda x: f'<rect x="{x}" y="9.7" width="3" height="4.6" rx="1.5"/>'
THREE = '<path d="M8.6 10.1c.3-.3.7-.4 1.2-.4.7 0 1.2.5 1.2 1.1 0 .6-.5 1.1-1.2 1.1.7 0 1.4.5 1.4 1.2s-.6 1.2-1.4 1.2c-.5 0-1-.2-1.3-.5"/>'
HEART = '<path d="M12 19.5S4 14.8 4 9.3A4.3 4.3 0 0 1 12 7a4.3 4.3 0 0 1 8 2.3c0 5.5-8 10.2-8 10.2z"/>'
THUMB = '<path d="M7 10.5v9"/><path d="M7 10.5l3.6-6.3a1.9 1.9 0 0 1 3.4 1.6L13.2 9.5h5.1a1.9 1.9 0 0 1 1.9 2.2l-1.1 6.2a2 2 0 0 1-2 1.6H7"/><rect x="3.5" y="10.5" width="3.5" height="9" rx="1"/>'
TV = '<rect x="3" y="7" width="18" height="13" rx="2.5"/><path d="M8.5 3.5L12 7l3.5-3.5"/>'
EYE = '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>'
PERSON = '<circle cx="12" cy="8" r="3.5"/><path d="M5 20a7 7 0 0 1 14 0"/>'
BOOKMARK = '<path d="M6.5 4.5A1 1 0 0 1 7.5 3.5h9a1 1 0 0 1 1 1V20l-5.5-4-5.5 4z"/>'
STAR = '<path d="M12 3.8l2.5 5.2 5.7.6-4.3 3.8 1.3 5.6L12 16.1 6.8 19l1.3-5.6-4.3-3.8 5.7-.6z"/>'
PLAY = '<path d="M7.5 4.8v14.4a.8.8 0 0 0 1.2.7l11-7.2a.8.8 0 0 0 0-1.4l-11-7.2a.8.8 0 0 0-1.2.7z"/>'
CIRCLE = '<circle cx="12" cy="12" r="8.5"/>'

# name: (group, plain-language meaning, svg body)
ICONS = {
  # ---- player ----
  'play': ('player', 'Play', PLAY),
  'pause': ('player', 'Pause', '<rect x="6" y="4.5" width="4" height="15" rx="1.2"/><rect x="14" y="4.5" width="4" height="15" rx="1.2"/>'),
  'stop': ('player', 'Stop', '<rect x="5" y="5" width="14" height="14" rx="2.5"/>'),
  'prev': ('player', 'Previous episode', '<path d="M6 5v14"/><path d="M18.5 5.6v12.8a.7.7 0 0 1-1.1.6L9 12.6a.7.7 0 0 1 0-1.2l8.4-6.4a.7.7 0 0 1 1.1.6z"/>'),
  'next': ('player', 'Next episode', '<path d="M18 5v14"/><path d="M5.5 5.6v12.8a.7.7 0 0 0 1.1.6l8.4-6.4a.7.7 0 0 0 0-1.2L6.6 5a.7.7 0 0 0-1.1.6z"/>'),
  'back10': ('player', 'Back 10 seconds', REPLAY_ARC + DIGITS.format(ONE + ZERO(12.2))),
  'fwd10': ('player', 'Forward 10 seconds', FWD_ARC + DIGITS.format(ONE + ZERO(12.2))),
  'fwd30': ('player', 'Forward 30 seconds', FWD_ARC + DIGITS.format(THREE + ZERO(12.5))),
  'volume': ('player', 'Volume', '<path d="M4 9.5h3l4.5-4v13L7 14.5H4z"/><path d="M15.5 9a4 4 0 0 1 0 6"/><path d="M18.5 6.5a7.5 7.5 0 0 1 0 11"/>'),
  'volume-low': ('player', 'Volume low', '<path d="M5 9.5h3l4.5-4v13L8 14.5H5z"/><path d="M16.5 9a4 4 0 0 1 0 6"/>'),
  'mute': ('player', 'Muted', '<path d="M4 9.5h3l4.5-4v13L7 14.5H4z"/><path d="M15.5 9.5l5 5M20.5 9.5l-5 5"/>'),
  'captions': ('player', 'Captions / subtitles', '<rect x="3" y="5.5" width="18" height="13" rx="2.5"/><g stroke-width="1.8"><path d="M10.6 10.1a2.2 2.2 0 1 0 0 3.8"/><path d="M16.3 10.1a2.2 2.2 0 1 0 0 3.8"/></g>'),
  'pip': ('player', 'Picture in picture', '<rect x="2.5" y="4.5" width="19" height="15" rx="2.5"/><rect x="12" y="11.5" width="6.5" height="5" rx="1"/>'),
  'fullscreen': ('player', 'Fullscreen', '<path d="M4 9V5.5A1.5 1.5 0 0 1 5.5 4H9M15 4h3.5A1.5 1.5 0 0 1 20 5.5V9M20 15v3.5a1.5 1.5 0 0 1-1.5 1.5H15M9 20H5.5A1.5 1.5 0 0 1 4 18.5V15"/>'),
  'exit-fullscreen': ('player', 'Exit fullscreen', '<path d="M9 4v3.5A1.5 1.5 0 0 1 7.5 9H4M20 9h-3.5A1.5 1.5 0 0 1 15 7.5V4M15 20v-3.5a1.5 1.5 0 0 1 1.5-1.5H20M4 15h3.5A1.5 1.5 0 0 1 9 16.5V20"/>'),
  'speed': ('player', 'Playback speed', '<path d="M4.6 17.5a8.5 8.5 0 1 1 14.8 0"/><path d="M12 14l4-4.5"/>' + DOT(12, 14, 1.5)),
  'up-next': ('player', 'Up next / episode list', '<path d="M4 6h12M4 12h7M4 18h7"/><path d="M15 13.6v4.8a.6.6 0 0 0 .9.5l3.6-2.4a.6.6 0 0 0 0-1l-3.6-2.4a.6.6 0 0 0-.9.5z"/>'),
  'settings': ('player', 'Settings / adjust', '<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><path d="M15 5v4M9 15v4"/>'),
  'download': ('player', 'Download', '<path d="M12 4v11"/><path d="M7.5 10.5L12 15l4.5-4.5"/><path d="M5 19.5h14"/>'),
  'retry': ('player', 'Retry / reload', FWD_ARC),
  'no-signal': ('player', "Won't play / no signal", TV + '<path d="M3 3l18 18"/>'),
  # ---- navigation and browsing ----
  'home': ('browse', 'Home', '<path d="M4 10.5L12 4l8 6.5V19a1 1 0 0 1-1 1h-4.5v-6h-5v6H5a1 1 0 0 1-1-1z"/>'),
  'search': ('browse', 'Search', '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4 4"/>'),
  'tv': ('browse', 'TV channels', TV),
  'live': ('browse', 'Live / on now', DOT(12, 12, 2) + '<path d="M8.5 8.5a5 5 0 0 0 0 7M15.5 8.5a5 5 0 0 1 0 7M5.6 5.6a9 9 0 0 0 0 12.8M18.4 5.6a9 9 0 0 1 0 12.8"/>'),
  'movie': ('browse', 'Movies', '<rect x="4" y="9.5" width="16" height="10.5" rx="1.5"/><path d="M4 9.5V6a1.5 1.5 0 0 1 1.5-1.5h13A1.5 1.5 0 0 1 20 6v3.5"/><path d="M9.2 4.5l-2.4 5M14.2 4.5l-2.4 5M19.2 4.5l-2.4 5"/>'),
  'archive': ('browse', 'Internet Archive source', '<path d="M3.5 8.5L12 4l8.5 4.5z"/><path d="M6.5 11.5v5.5M10 11.5v5.5M14 11.5v5.5M17.5 11.5v5.5"/><path d="M4.5 20h15"/>'),
  'collection': ('browse', 'Collection / tag', '<path d="M4 5.5A1.5 1.5 0 0 1 5.5 4h6l8.5 8.5-7.5 7.5L4 11.5z"/>' + DOT(8.3, 8.3, 1.3)),
  'menu': ('browse', 'Menu', '<path d="M4 7h16M4 12h16M4 17h16"/>'),
  'close': ('browse', 'Close', '<path d="M6 6l12 12M18 6L6 18"/>'),
  'back': ('browse', 'Back', '<path d="M19 12H5"/><path d="M11 6l-6 6 6 6"/>'),
  'chevron-left': ('browse', 'Previous / scroll left', '<path d="M15 5l-7 7 7 7"/>'),
  'chevron-right': ('browse', 'Next / scroll right / see all', '<path d="M9 5l7 7-7 7"/>'),
  'chevron-down': ('browse', 'Expand', '<path d="M5 9l7 7 7-7"/>'),
  'chevron-up': ('browse', 'Collapse', '<path d="M5 15l7-7 7 7"/>'),
  'arrow-up': ('browse', 'Move up / back to top', '<path d="M12 19V5"/><path d="M6 11l6-6 6 6"/>'),
  'arrow-down': ('browse', 'Move down', '<path d="M12 5v14"/><path d="M6 13l6 6 6-6"/>'),
  'external': ('browse', 'Opens elsewhere', '<path d="M14 4h6v6M20 4l-9 9"/><path d="M18 14v4.5a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 4 18.5v-11A1.5 1.5 0 0 1 5.5 6H10"/>'),
  'grid': ('browse', 'Grid view', '<rect x="4" y="4" width="6.5" height="6.5" rx="1.5"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.5"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.5"/>'),
  'list': ('browse', 'List view', DOT(5, 6) + DOT(5, 12) + DOT(5, 18) + '<path d="M9 6h11M9 12h11M9 18h11"/>'),
  'filter': ('browse', 'Filter', '<path d="M4 5h16l-6 7.5V19l-4-2v-4.5z"/>'),
  'sort': ('browse', 'Sort', '<path d="M7 4v16M3.5 16.5L7 20l3.5-3.5M17 20V4M13.5 7.5L17 4l3.5 3.5"/>'),
  'shuffle': ('browse', 'Shuffle / surprise me', '<path d="M4 7h3.5c2 0 3 1 4.5 5s2.5 5 4.5 5H20"/><path d="M4 17h3.5c1.2 0 2-.4 2.7-1.3M13.8 8.3C14.5 7.4 15.3 7 16.5 7H20"/><path d="M17.5 4.5L20 7l-2.5 2.5M17.5 14.5L20 17l-2.5 2.5"/>'),
  'history': ('browse', 'Continue watching / history', REPLAY_ARC + '<path d="M12 8.5V12l2.5 1.5"/>'),
  'calendar': ('browse', 'Air date', '<rect x="4" y="5.5" width="16" height="14.5" rx="2"/><path d="M4 10h16M8.5 3.5v4M15.5 3.5v4"/>'),
  'clock': ('browse', 'Runtime', CIRCLE + '<path d="M12 7.5V12l3 2"/>'),
  'person': ('browse', 'Person / cast', PERSON),
  'people': ('browse', 'Cast and crew', '<circle cx="9" cy="8.5" r="3"/><path d="M3 19.5a6 6 0 0 1 12 0"/><path d="M15.5 5.7a3 3 0 0 1 0 5.6M17.5 14a6 6 0 0 1 3.5 5.5"/>'),
  'globe': ('browse', 'Country / language', CIRCLE + '<path d="M3.5 12h17"/><ellipse cx="12" cy="12" rx="3.6" ry="8.5"/>'),
  # ---- your stuff and feedback ----
  'heart': ('mine', 'Favourite', HEART),
  'heart-filled': ('mine', 'Favourited (on)', HEART.replace('<path ', '<path fill="currentColor" ')),
  'bookmark': ('mine', 'Watchlist', BOOKMARK),
  'bookmark-filled': ('mine', 'On watchlist (on)', BOOKMARK.replace('<path ', '<path fill="currentColor" ')),
  'star': ('mine', 'Top rated', STAR),
  'star-filled': ('mine', 'Rated (on)', STAR.replace('<path ', '<path fill="currentColor" ')),
  'thumbs-up': ('mine', 'More like this', THUMB),
  'thumbs-down': ('mine', 'Less like this', f'<g transform="rotate(180 12 12)">{THUMB}</g>'),
  'flag': ('mine', 'Report a problem', '<path d="M5.5 21V4.5"/><path d="M5.5 4.5H17l-2.5 4 2.5 4H5.5"/>'),
  'check': ('mine', 'Done / watched', '<path d="M5 12.5l4.5 4.5L19 7.5"/>'),
  'plus': ('mine', 'Add', '<path d="M12 5v14M5 12h14"/>'),
  'lock': ('mine', 'Password / private', '<rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/>'),
  'share': ('mine', 'Share', '<path d="M12 4v11M8 7.5L12 4l4 3.5"/><path d="M8.5 11H6.5A1.5 1.5 0 0 0 5 12.5v6A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5v-6a1.5 1.5 0 0 0-1.5-1.5h-2"/>'),
  'donate': ('mine', 'Donate (CASH)', '<path d="M12 11.5S8 9.3 8 6.6A2.1 2.1 0 0 1 12 5.5a2.1 2.1 0 0 1 4 1.1c0 2.7-4 4.9-4 4.9z"/><path d="M3.5 14.5h3v6h-3z"/><path d="M6.5 15.5h2.8l2.6 1.5h2.6a1.2 1.2 0 0 1 0 2.4h-3.3"/><path d="M6.5 20h7.8l5.5-3.2a1.3 1.3 0 0 0-1.2-2.3l-3.7 1.9"/>'),
  'info': ('mine', 'About / info', CIRCLE + '<path d="M12 11v5.5"/>' + DOT(12, 7.8, 1.2)),
  'help': ('mine', 'Help / wrong info', CIRCLE + '<path d="M9.6 9.6a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1.1.9-1.1 1.6v.4"/>' + DOT(12, 16.9, 1.2)),
  'warning': ('mine', 'Warning', '<path d="M10.7 4.8a1.5 1.5 0 0 1 2.6 0l7.4 13a1.5 1.5 0 0 1-1.3 2.2H4.6a1.5 1.5 0 0 1-1.3-2.2z"/><path d="M12 10v4"/>' + DOT(12, 17, 1.2)),
  # ---- beta reports ----
  'bug': ('beta', 'Something broke', '<rect x="7.5" y="7.5" width="9" height="12.5" rx="4.5"/><path d="M9.5 7.5a2.5 2.5 0 0 1 5 0M12 12v8M7.5 13.5H4M20 13.5h-3.5M8 9.5L5.5 7M16 9.5L18.5 7"/>'),
  'looks-off': ('beta', 'Looks off', EYE),
  'idea': ('beta', 'Idea', '<path d="M9 17.5h6M10 20.5h4"/><path d="M9 17.5c0-2-3-3.5-3-7a6 6 0 0 1 12 0c0 3.5-3 5-3 7"/>'),
  'camera': ('beta', 'Add screenshot', '<path d="M4 8.5A1.5 1.5 0 0 1 5.5 7H8l1.5-2.5h5L16 7h2.5A1.5 1.5 0 0 1 20 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 17.5z"/><circle cx="12" cy="13" r="3.5"/>'),
  'send': ('beta', 'Send report', '<path d="M20.5 3.5L3.5 10.5l7 3 3 7z"/><path d="M20.5 3.5l-10 10"/>'),
  'reply': ('beta', 'Reply', '<path d="M9.5 6.5l-5 5 5 5"/><path d="M4.5 11.5h9a6 6 0 0 1 6 6v1"/>'),
  'person-plus': ('beta', 'Invite tester', '<circle cx="10" cy="8" r="3.5"/><path d="M3 20a7 7 0 0 1 12.5-4.3"/><path d="M18.5 14v6M15.5 17h6"/>'),
  'pause-circle': ('beta', 'Paused tester', CIRCLE + '<path d="M10 9v6M14 9v6"/>'),
  # ---- HQ ----
  'dashboard': ('hq', 'Overview', '<rect x="4" y="4" width="7" height="9" rx="1.5"/><rect x="13" y="4" width="7" height="5" rx="1.5"/><rect x="13" y="11" width="7" height="9" rx="1.5"/><rect x="4" y="15" width="7" height="5" rx="1.5"/>'),
  'shows': ('hq', 'Shows', TV),
  'jobs': ('hq', 'Jobs (running scripts)', '<rect x="3" y="4.5" width="18" height="15" rx="2"/><path d="M7 9.5l3 2.5-3 2.5M12.5 15h4.5"/>'),
  'reports': ('hq', 'Reports from viewers', '<path d="M4 13.5l2.4-7.3A1.8 1.8 0 0 1 8.1 5h7.8a1.8 1.8 0 0 1 1.7 1.2l2.4 7.3V18a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z"/><path d="M4 13.5h4.5l1 2h5l1-2H20"/>'),
  'analytics': ('hq', 'Analytics', '<path d="M5 20v-7M10 20V6M15 20v-9M20 20V9"/>'),
  'qr': ('hq', 'QR codes', '<rect x="4" y="4" width="6" height="6" rx="1"/><rect x="14" y="4" width="6" height="6" rx="1"/><rect x="4" y="14" width="6" height="6" rx="1"/>' + DOT(15, 15, 1.2) + DOT(19, 15, 1.2) + DOT(17, 17, 1.2) + DOT(15, 19, 1.2) + DOT(19, 19, 1.2)),
  'add-shows': ('hq', 'Add shows', '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M12 8.5v7M8.5 12h7"/>'),
  'home-order': ('hq', 'Home order (rows)', '<path d="M10 6h10M10 12h10M10 18h10"/><path d="M5 4.5v15M3 7l2-2.5L7 7M3 17l2 2.5L7 17"/>'),
  'health': ('hq', 'Health / doctor', '<path d="M3 12h4l2.5-6 5 12 2.5-6H21"/>'),
  'catalog': ('hq', 'Catalog data', '<ellipse cx="12" cy="6" rx="7" ry="2.5"/><path d="M5 6v12c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5V6M5 12c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5"/>'),
  'deploy': ('hq', 'Publish / deploy', '<path d="M7 18.5a4.5 4.5 0 0 1-.6-9A6 6 0 0 1 18 9.6a4 4 0 0 1-.5 8.9"/><path d="M12 12.5v7M9.5 15L12 12.5l2.5 2.5"/>'),
  'device-phone': ('hq', 'Phone', '<rect x="7" y="3" width="10" height="18" rx="2"/><path d="M11 18h2"/>'),
  'device-desktop': ('hq', 'Desktop', '<rect x="3" y="4.5" width="18" height="12" rx="1.5"/><path d="M9 20.5h6M12 16.5v4"/>'),
  'shield': ('hq', 'Gate / security', '<path d="M12 3.5l7.5 3V12c0 4.5-3.3 7.8-7.5 9-4.2-1.2-7.5-4.5-7.5-9V6.5z"/>'),
  'eye-off': ('hq', 'Hidden', EYE + '<path d="M4 4l16 16"/>'),
  'edit': ('hq', 'Edit', '<path d="M4 20l1-4.5L15.5 5a2.1 2.1 0 0 1 3 3L8 18.5z"/><path d="M14 6.5l3 3"/>'),
  'copy': ('hq', 'Copy', '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5.5A1.5 1.5 0 0 0 14.5 4h-9A1.5 1.5 0 0 0 4 5.5v9A1.5 1.5 0 0 0 5.5 16H8"/>'),
  'trash': ('hq', 'Remove', '<path d="M5 7h14M9.5 7V5h5v2M6.5 7l1 13h9l1-13M10 11v5M14 11v5"/>'),
  'link': ('hq', 'Link', '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>'),
  'power': ('hq', 'Stop job', '<path d="M12 4v8"/><path d="M7.1 6.9a7 7 0 1 0 9.8 0"/>'),
}

HEAD = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">'
index = []
for name, (group, meaning, body) in ICONS.items():
    with open(os.path.join(OUT, name + '.svg'), 'w', encoding='utf-8') as f:
        f.write(HEAD + body + '</svg>\n')
    index.append({'name': name, 'group': group, 'meaning': meaning})
with open(os.path.join(OUT, '..', 'icons.json'), 'w', encoding='utf-8') as f:
    json.dump(index, f, indent=1)
print(len(ICONS), 'icons ->', os.path.normpath(OUT))
