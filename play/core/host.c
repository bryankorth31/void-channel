/* VoidTV PLAY: the host's C side, linked into each core's WebAssembly build.
 *
 * Copyright (C) 2026 Bryan Korth for CASH. Licence: GPL-2.0-or-later (see play/LICENSE).
 *
 * The same contract as Couch Craft's libretro_host.py, translated for the browser: the core asks its host for
 * directories, settings and a pixel format, hands back one picture and a run of sound per frame, and asks what
 * keys and buttons are down. This file answers every question the core asks and keeps the answers in plain
 * buffers that the JavaScript side (play/src/core-worker.js) reads and writes. Nothing here draws, plays or
 * listens; that is all JavaScript.
 */
#include <stdarg.h>
#include <stdbool.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <emscripten.h>
#include "libretro.h"

#define MAX_W 1280
#define MAX_H 1024
#define AUDIO_MAX (48000 * 2)        /* one second of stereo samples */
#define MAX_VARS 32

static uint32_t frame[MAX_W * MAX_H]; /* RGBA, one 32-bit word per pixel */
static int frame_w, frame_h, frame_count;
static int16_t audio[AUDIO_MAX];
static int audio_len;                 /* samples (not frames) waiting for JavaScript */
static enum retro_pixel_format pixfmt = RETRO_PIXEL_FORMAT_0RGB1555;
static struct retro_system_av_info av;
static retro_keyboard_event_t key_event;
static uint8_t keys[RETROK_LAST];
static uint16_t pads[4];              /* one bit per RETRO_DEVICE_ID_JOYPAD_* */
static int mouse_dx, mouse_dy;        /* movement since the last frame (a DOS game's mouse, plan T21b) */
static unsigned mouse_buttons;        /* 1 left, 2 right, 4 middle */
static unsigned mouse_pressed;        /* pressed since the last frame: a quick click is seen even if let go before it */
static char var_key[MAX_VARS][64], var_val[MAX_VARS][64];
static int var_count, var_changed;
static void *game_data;

/* ---- what the core asks for ---- */

static void log_cb(enum retro_log_level level, const char *fmt, ...) {
  va_list ap; va_start(ap, fmt);
  if (level >= RETRO_LOG_WARN) vfprintf(stderr, fmt, ap); else vprintf(fmt, ap);
  va_end(ap);
}

static bool environment(unsigned cmd, void *data) {
  switch (cmd) {
    case RETRO_ENVIRONMENT_GET_SYSTEM_DIRECTORY: *(const char **)data = "/sys"; return true;
    case RETRO_ENVIRONMENT_GET_SAVE_DIRECTORY: *(const char **)data = "/save"; return true;
    case RETRO_ENVIRONMENT_GET_LOG_INTERFACE: ((struct retro_log_callback *)data)->log = log_cb; return true;
    case RETRO_ENVIRONMENT_GET_CAN_DUPE: *(bool *)data = true; return true;
    case RETRO_ENVIRONMENT_SET_PIXEL_FORMAT: {
      enum retro_pixel_format f = *(enum retro_pixel_format *)data;
      if (f != RETRO_PIXEL_FORMAT_XRGB8888 && f != RETRO_PIXEL_FORMAT_RGB565 && f != RETRO_PIXEL_FORMAT_0RGB1555) return false;
      pixfmt = f; return true;
    }
    case RETRO_ENVIRONMENT_SET_GEOMETRY: av.geometry = *(struct retro_game_geometry *)data; return true;
    case RETRO_ENVIRONMENT_SET_SYSTEM_AV_INFO: av = *(struct retro_system_av_info *)data; return true;
    case RETRO_ENVIRONMENT_SET_KEYBOARD_CALLBACK: key_event = ((struct retro_keyboard_callback *)data)->callback; return true;
    case RETRO_ENVIRONMENT_GET_VARIABLE: {
      struct retro_variable *v = (struct retro_variable *)data;
      for (int i = 0; i < var_count; i++) if (!strcmp(var_key[i], v->key)) { v->value = var_val[i]; return true; }
      v->value = NULL; return false;   /* the core then uses its own default */
    }
    case RETRO_ENVIRONMENT_GET_VARIABLE_UPDATE: *(bool *)data = var_changed; var_changed = 0; return true;
    case RETRO_ENVIRONMENT_SET_VARIABLES:
    case RETRO_ENVIRONMENT_SET_INPUT_DESCRIPTORS:
    case RETRO_ENVIRONMENT_SET_CONTROLLER_INFO:
    case RETRO_ENVIRONMENT_SET_SUPPORT_NO_GAME:
    case RETRO_ENVIRONMENT_SET_CORE_OPTIONS_DISPLAY:
    case RETRO_ENVIRONMENT_SET_MEMORY_MAPS:
      return true;
    case RETRO_ENVIRONMENT_SET_MESSAGE_EXT: {
      const struct retro_message_ext *m = (const struct retro_message_ext *)data; printf("[core says] %s\n", m->msg); return true;
    }
    case RETRO_ENVIRONMENT_GET_FASTFORWARDING: *(bool *)data = false; return true;
    default: return false;          /* no VFS, no hardware rendering, no MIDI, no network: the core falls back */
  }
}

static void video_refresh(const void *data, unsigned w, unsigned h, size_t pitch) {
  if (!data) return;                /* a duplicated frame: keep the last picture */
  if (w > MAX_W) w = MAX_W;
  if (h > MAX_H) h = MAX_H;
  for (unsigned y = 0; y < h; y++) {
    const uint8_t *row = (const uint8_t *)data + y * pitch;
    uint32_t *out = frame + y * w;
    if (pixfmt == RETRO_PIXEL_FORMAT_XRGB8888) {
      const uint32_t *p = (const uint32_t *)row;
      for (unsigned x = 0; x < w; x++) { uint32_t c = p[x]; out[x] = 0xFF000000u | ((c & 0xFF) << 16) | (c & 0xFF00) | ((c >> 16) & 0xFF); }
    } else {
      const uint16_t *p = (const uint16_t *)row;
      for (unsigned x = 0; x < w; x++) {
        uint16_t c = p[x]; unsigned r, g, b;
        if (pixfmt == RETRO_PIXEL_FORMAT_RGB565) { r = (c >> 11) & 31; g = (c >> 5) & 63; b = c & 31; r = r << 3 | r >> 2; g = g << 2 | g >> 4; b = b << 3 | b >> 2; }
        else { r = (c >> 10) & 31; g = (c >> 5) & 31; b = c & 31; r = r << 3 | r >> 2; g = g << 3 | g >> 2; b = b << 3 | b >> 2; }
        out[x] = 0xFF000000u | (b << 16) | (g << 8) | r;
      }
    }
  }
  frame_w = w; frame_h = h; frame_count++;
}

static size_t audio_batch(const int16_t *data, size_t frames) {
  size_t n = frames * 2;
  if (audio_len + n > AUDIO_MAX) audio_len = 0;   /* JavaScript fell behind by a second: drop, never grow */
  memcpy(audio + audio_len, data, n * sizeof(int16_t));
  audio_len += n;
  return frames;
}
static void audio_sample(int16_t l, int16_t r) { int16_t s[2] = { l, r }; audio_batch(s, 1); }
static void input_poll(void) {}
static int16_t input_state(unsigned port, unsigned device, unsigned index, unsigned id) {
  if (device == RETRO_DEVICE_KEYBOARD) return id < RETROK_LAST ? keys[id] : 0;
  if (device == RETRO_DEVICE_JOYPAD && port < 4) {
    if (id == RETRO_DEVICE_ID_JOYPAD_MASK) return (int16_t)pads[port];
    return id < 16 ? (pads[port] >> id) & 1 : 0;
  }
  if (device == RETRO_DEVICE_MOUSE && port == 0) {
    switch (id) {
      case RETRO_DEVICE_ID_MOUSE_X: return (int16_t)mouse_dx;
      case RETRO_DEVICE_ID_MOUSE_Y: return (int16_t)mouse_dy;
      case RETRO_DEVICE_ID_MOUSE_LEFT: return (mouse_buttons | mouse_pressed) & 1 ? 1 : 0;
      case RETRO_DEVICE_ID_MOUSE_RIGHT: return (mouse_buttons | mouse_pressed) & 2 ? 1 : 0;
      case RETRO_DEVICE_ID_MOUSE_MIDDLE: return (mouse_buttons | mouse_pressed) & 4 ? 1 : 0;
    }
  }
  return 0;
}

/* ---- what JavaScript calls ---- */

EMSCRIPTEN_KEEPALIVE int host_init(void) {
  retro_set_environment(environment);
  retro_set_video_refresh(video_refresh);
  retro_set_audio_sample(audio_sample);
  retro_set_audio_sample_batch(audio_batch);
  retro_set_input_poll(input_poll);
  retro_set_input_state(input_state);
  retro_init();
  return RETRO_API_VERSION;
}

/* path: a file already written into the module's file system; "#PROG.EXE" after a zip picks the program to run */
EMSCRIPTEN_KEEPALIVE int host_load(const char *path) {
  struct retro_game_info info = { path, NULL, 0, NULL };
  struct retro_system_info sys; retro_get_system_info(&sys);
  if (!sys.need_fullpath) {
    const char *hash = strchr(path, '#');
    char file[512]; size_t n = hash ? (size_t)(hash - path) : strlen(path);
    if (n >= sizeof file) return 0;
    memcpy(file, path, n); file[n] = 0;
    FILE *f = fopen(file, "rb"); if (!f) return 0;
    fseek(f, 0, SEEK_END); long len = ftell(f); fseek(f, 0, SEEK_SET);
    game_data = malloc(len); fread(game_data, 1, len, f); fclose(f);
    info.data = game_data; info.size = len;
  }
  if (!retro_load_game(&info)) return 0;
  retro_get_system_av_info(&av);
  return 1;
}

/* A frame reads the movement gathered since the last one, then it starts again from nothing. */
EMSCRIPTEN_KEEPALIVE void host_run(void) { retro_run(); mouse_dx = mouse_dy = 0; mouse_pressed = 0; }
EMSCRIPTEN_KEEPALIVE void host_reset(void) { retro_reset(); }
EMSCRIPTEN_KEEPALIVE void host_unload(void) { retro_unload_game(); retro_deinit(); free(game_data); game_data = NULL; }

EMSCRIPTEN_KEEPALIVE uint32_t *host_frame(void) { return frame; }
EMSCRIPTEN_KEEPALIVE int host_frame_w(void) { return frame_w; }
EMSCRIPTEN_KEEPALIVE int host_frame_h(void) { return frame_h; }
EMSCRIPTEN_KEEPALIVE int host_frame_count(void) { return frame_count; }
EMSCRIPTEN_KEEPALIVE int16_t *host_audio(void) { return audio; }
EMSCRIPTEN_KEEPALIVE int host_audio_len(void) { return audio_len; }
EMSCRIPTEN_KEEPALIVE void host_audio_clear(void) { audio_len = 0; }
EMSCRIPTEN_KEEPALIVE double host_fps(void) { return av.timing.fps; }
EMSCRIPTEN_KEEPALIVE double host_sample_rate(void) { return av.timing.sample_rate; }
EMSCRIPTEN_KEEPALIVE double host_aspect(void) {
  return av.geometry.aspect_ratio > 0 ? av.geometry.aspect_ratio : (frame_h ? (double)frame_w / frame_h : 4.0 / 3.0);
}

/* a key on the PC keyboard: keycode is a RETROK_* value, character the typed letter (0 if none) */
EMSCRIPTEN_KEEPALIVE void host_key(int down, unsigned keycode, unsigned character, unsigned mods) {
  if (keycode < RETROK_LAST) keys[keycode] = down ? 1 : 0;
  if (key_event) key_event(down != 0, keycode, character, (uint16_t)mods);
}
/* The mouse (plan T21b): movement adds up until the next frame reads it; the buttons are as they are now. */
EMSCRIPTEN_KEEPALIVE void host_mouse(int dx, int dy, unsigned buttons) {
  mouse_dx += dx; mouse_dy += dy; mouse_pressed |= buttons & ~mouse_buttons; mouse_buttons = buttons;
  if (mouse_dx > 32767) mouse_dx = 32767; if (mouse_dx < -32768) mouse_dx = -32768;
  if (mouse_dy > 32767) mouse_dy = 32767; if (mouse_dy < -32768) mouse_dy = -32768;
}
EMSCRIPTEN_KEEPALIVE void host_pad(unsigned port, unsigned bits) { if (port < 4) pads[port] = (uint16_t)bits; }
/* Plug a controller into a port, as a console frontend does at start: many cores read no buttons until told. */
EMSCRIPTEN_KEEPALIVE void host_plug_pad(unsigned port) { retro_set_controller_port_device(port, RETRO_DEVICE_JOYPAD); }

EMSCRIPTEN_KEEPALIVE void host_set_var(const char *key, const char *value) {
  for (int i = 0; i < var_count; i++) if (!strcmp(var_key[i], key)) { snprintf(var_val[i], 64, "%s", value); var_changed = 1; return; }
  if (var_count == MAX_VARS) return;
  snprintf(var_key[var_count], 64, "%s", key); snprintf(var_val[var_count], 64, "%s", value); var_count++; var_changed = 1;
}

/* Cheats (Bryan, 20 Nov 2026: "add toggle for cheats"): the page clears them all, then sets the ones switched on, each
   in the core's own code format (Game Genie, Pro Action Replay, raw address:value), as libretro defines it. A core
   that has no cheat support ignores them. */
EMSCRIPTEN_KEEPALIVE void host_cheat_reset(void) { retro_cheat_reset(); }
EMSCRIPTEN_KEEPALIVE void host_cheat_set(unsigned index, int enabled, const char *code) { retro_cheat_set(index, enabled ? true : false, code); }

/* save states: the core's own snapshot, copied out whole */
EMSCRIPTEN_KEEPALIVE int host_state_size(void) { return (int)retro_serialize_size(); }
EMSCRIPTEN_KEEPALIVE int host_state_save(void *buf, int size) { return retro_serialize(buf, (size_t)size) ? 1 : 0; }
EMSCRIPTEN_KEEPALIVE int host_state_load(const void *buf, int size) { return retro_unserialize(buf, (size_t)size) ? 1 : 0; }
