#!/usr/bin/env python3
"""
Unified Playlist Generation Pipeline

Usage:
  python3 generate_playlist.py config.json
  python3 generate_playlist.py config.json --dry-run
  python3 generate_playlist.py config.json --songs 1,3,5
  python3 generate_playlist.py config.json --prepare-only
  python3 generate_playlist.py config.json --skip-eq
  python3 generate_playlist.py config.json --skip-download
"""

import argparse
import json
import os
import re
import shutil
import sqlite3
import subprocess
import sys
import time
from datetime import datetime
from pathlib import Path

# ─── Config ──────────────────────────────────────────────

API_BASE = "http://localhost:3001/api"
DEFAULT_MODEL = "chirp-fenix"
DEFAULT_SF2 = "/opt/homebrew/Cellar/fluid-synth/2.5.3/share/fluid-synth/sf2/VintageDreamsWaves-v2.sf2"
CONDA_CHORD_ENV = "chord310"
DB_PATH = os.path.expanduser("~/.claude/gems/gems.db")
NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

# EQ presets per channel
EQ_PRESETS = {
    "vocal": {
        "description": "Vocal EQ (jpop, ballad) — Demucs split + vocal EQ + remix",
        "channels": ["jpop", "ballad"],
    },
    "master": {
        "description": "Master EQ (edm, rock, phonk) — whole mix processing",
        "channels": ["edm", "rock", "phonk"],
    },
}


# ─── Helpers ─────────────────────────────────────────────

def run(cmd, check=True, capture=True, timeout=600):
    """Run shell command."""
    print(f"  $ {cmd if isinstance(cmd, str) else ' '.join(cmd)}")
    result = subprocess.run(
        cmd, shell=isinstance(cmd, str), capture_output=capture,
        text=True, timeout=timeout
    )
    if check and result.returncode != 0:
        err = result.stderr[:500] if result.stderr else "unknown"
        print(f"  ERROR: {err}")
        raise RuntimeError(f"Command failed: {cmd}")
    return result


def api_get(path, params=None):
    """GET request to Suno API."""
    import requests
    url = f"{API_BASE}{path}"
    print(f"  GET {url}")
    resp = requests.get(url, params=params, timeout=60)
    resp.raise_for_status()
    return resp.json()


def api_post(path, data=None, files=None):
    """POST request to Suno API."""
    import requests
    url = f"{API_BASE}{path}"
    print(f"  POST {url}")
    if files:
        resp = requests.post(url, files=files, data=data, timeout=120)
    else:
        resp = requests.post(url, json=data, timeout=120)
    resp.raise_for_status()
    return resp.json()


def sanitize_filename(name):
    """Remove characters unsafe for filenames."""
    return re.sub(r'[<>:"/\\|?*]', '_', name)


# ─── Step 1: Workspace ──────────────────────────────────

def ensure_workspace(playlist_name):
    """Check if workspace exists, create if not. Return workspace_id."""
    print("\n[Step 1] Workspace")

    # List workspaces
    data = api_post("/workspace", {"action": "list"})
    workspaces = data if isinstance(data, list) else data.get("workspaces", data.get("data", []))

    # Search for existing
    for ws in workspaces:
        ws_name = ws.get("name", "")
        ws_id = ws.get("id", "")
        if ws_name == playlist_name:
            print(f"  -> Found workspace: {ws_id} ({ws_name})")
            return ws_id

    # Create new
    print(f"  Creating workspace: {playlist_name}")
    result = api_post("/workspace", {"action": "create", "name": playlist_name})
    ws_id = result.get("id", result.get("workspace_id", ""))
    print(f"  -> Created workspace: {ws_id}")
    return ws_id


# ─── Step 2: Source Processing ───────────────────────────

def resolve_source(source, output_dir):
    """YouTube URL -> mp3 download, or local path."""
    if source.startswith("http://") or source.startswith("https://"):
        print("\n[Step 2a] YouTube -> mp3")
        mp3_path = os.path.join(output_dir, "original.mp3")
        run(f'yt-dlp -x --audio-format mp3 --audio-quality 0 '
            f'-o "{os.path.join(output_dir, "original.%(ext)s")}" "{source}"')
        for f in os.listdir(output_dir):
            if f.startswith("original") and f.endswith(".mp3"):
                mp3_path = os.path.join(output_dir, f)
                break
        print(f"  -> {mp3_path}")
        return mp3_path
    else:
        expanded = os.path.expanduser(source)
        if not os.path.exists(expanded):
            raise FileNotFoundError(f"Source not found: {expanded}")
        print(f"\n[Step 2a] Source file: {expanded}")
        return expanded


def demucs_separate(mp3_path, output_dir):
    """Demucs vocal separation, return no-vocal mix path."""
    print("\n[Step 2b] Demucs vocal separation")
    demucs_out = os.path.join(output_dir, "demucs")
    run(f'demucs -n htdemucs -o "{demucs_out}" "{mp3_path}"', timeout=1200)

    # Find stem directory
    stem_dir = None
    htdemucs = os.path.join(demucs_out, "htdemucs")
    if os.path.exists(htdemucs):
        for d in os.listdir(htdemucs):
            candidate = os.path.join(htdemucs, d)
            if os.path.isdir(candidate) and os.path.exists(os.path.join(candidate, "other.wav")):
                stem_dir = candidate
                break

    if not stem_dir:
        raise RuntimeError("Demucs stems not found")

    # Mix other + bass + drums (no vocals)
    nv_path = os.path.join(output_dir, "no_vocal.wav")
    run(f'ffmpeg -y '
        f'-i "{os.path.join(stem_dir, "other.wav")}" '
        f'-i "{os.path.join(stem_dir, "bass.wav")}" '
        f'-i "{os.path.join(stem_dir, "drums.wav")}" '
        f'-filter_complex "amix=inputs=3:duration=longest" '
        f'"{nv_path}"')

    print(f"  -> {nv_path}")
    return nv_path, stem_dir


def extract_chords(audio_path, output_dir):
    """Chordino chord extraction + key diatonic filter -> chords.json."""
    print("\n[Step 2c] Chordino chord extraction + key filter")

    chords_json = os.path.join(output_dir, "chords.json")

    code = '''
import re, json, sys
sys.path.insert(0, ".")
from chord_extractor.extractors import Chordino

NOTE_NAMES = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"]

def simplify(chord):
    if chord == "N": return "N"
    chord = chord.split("/")[0]
    m = re.match(r"^([A-G][#b]?)(m?).*$", chord)
    if not m: return "N"
    root, q = m.group(1), "m" if m.group(2) == "m" else ""
    enh = {"Db":"C#","Eb":"D#","Gb":"F#","Ab":"G#","Bb":"A#"}
    result = root + q
    for k, v in enh.items():
        if result.startswith(k): result = result.replace(k, v, 1)
    return result

def get_diatonic(key_note, is_minor=False):
    idx = NOTE_NAMES.index(key_note)
    intervals = [0,2,3,5,7,8,10] if is_minor else [0,2,4,5,7,9,11]
    scale = [NOTE_NAMES[(idx+i)%12] for i in intervals]
    qualities = ["m","","","m","m","",""] if is_minor else ["","m","m","","","m",""]
    return set(scale[i]+qualities[i] for i in range(7))

def remerge(data):
    result = []
    for t,c,d in data:
        if result and result[-1][1] == c:
            result[-1] = (result[-1][0], result[-1][1], result[-1][2]+d)
        else: result.append((t,c,d))
    return result

# Extract
chords = Chordino(roll_on=0.5).extract("AUDIO_PATH")
merged = []
for ch in chords:
    s = simplify(ch.chord)
    if s == "N": continue
    if merged and merged[-1][1] == s: continue
    if merged: merged[-1] = (merged[-1][0], merged[-1][1], ch.timestamp - merged[-1][0])
    merged.append((ch.timestamp, s, 0))
if merged: merged[-1] = (merged[-1][0], merged[-1][1], chords[-1].timestamp - merged[-1][0])

# Find best key (self-consistency: most total duration retained)
best_key, best_score, best_chords = "", 0, []
for ki in range(12):
    kn = NOTE_NAMES[ki]
    for is_minor in [False, True]:
        allowed = get_diatonic(kn, is_minor)
        filtered = remerge([(t,c,d) for t,c,d in merged if c in allowed])
        total_dur = sum(d for _,_,d in filtered)
        if total_dur > best_score:
            best_score = total_dur
            mode = "m" if is_minor else ""
            best_key = kn + mode
            best_chords = filtered

result = {
    "key": best_key,
    "total_chords": len(best_chords),
    "chords": [{"time": t, "chord": c, "duration": d} for t,c,d in best_chords]
}
with open("OUTPUT_PATH", "w") as f:
    json.dump(result, f, indent=2)
print(f"Key: {best_key}, Chords: {len(best_chords)}")
'''.replace("AUDIO_PATH", audio_path).replace("OUTPUT_PATH", chords_json)

    script_path = os.path.join(output_dir, "_extract_chords.py")
    with open(script_path, "w") as f:
        f.write(code)

    run(f'conda run -n {CONDA_CHORD_ENV} python3 "{script_path}"')
    os.remove(script_path)

    with open(chords_json) as f:
        data = json.load(f)
    print(f"  -> Key: {data['key']}, {data['total_chords']} chords")
    return data


def chords_to_midi_mp3(chords_data, output_dir, soundfont):
    """Chords JSON -> MIDI -> mp3 rendering."""
    print("\n[Step 2d] Chords -> MIDI -> mp3")

    midi_path = os.path.join(output_dir, "chords.mid")
    mp3_path = os.path.join(output_dir, "chords.mp3")

    code = f'''
import json, mido
from mido import MidiFile, MidiTrack, Message

NOTE_NAMES = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"]

with open("{os.path.join(output_dir, 'chords.json')}") as f:
    data = json.load(f)

chords = data["chords"]
if len(chords) > 1:
    avg_dur = sum(c["duration"] for c in chords) / len(chords)
    bpm = max(40, min(200, 60 / avg_dur * 4))
else:
    bpm = 120

mid = MidiFile(ticks_per_beat=480)
track = MidiTrack()
mid.tracks.append(track)
track.append(mido.MetaMessage("set_tempo", tempo=mido.bpm2tempo(bpm)))

for i, ch in enumerate(chords):
    chord_name = ch["chord"]
    root_name = chord_name.replace("m", "")
    is_minor = False
    if chord_name.endswith("#m"):
        root_name = chord_name[:-1]
        is_minor = True
    elif chord_name.endswith("m"):
        root_name = chord_name[:-1]
        is_minor = True

    root_idx = NOTE_NAMES.index(root_name) if root_name in NOTE_NAMES else 0
    if is_minor:
        notes = [root_idx + 60, root_idx + 63, root_idx + 67]
    else:
        notes = [root_idx + 60, root_idx + 64, root_idx + 67]

    dur_ticks = int(ch["duration"] / (60 / bpm) * 480)
    dur_ticks = max(dur_ticks, 240)

    for j, n in enumerate(notes):
        track.append(Message("note_on", note=n, velocity=80, time=0))
    for j, n in enumerate(notes):
        track.append(Message("note_off", note=n, velocity=0, time=dur_ticks if j == 0 else 0))

mid.save("{midi_path}")
print(f"BPM: {{bpm:.0f}}, MIDI saved")
'''

    script_path = os.path.join(output_dir, "_chords_to_midi.py")
    with open(script_path, "w") as f:
        f.write(code)

    run(f'conda run -n {CONDA_CHORD_ENV} python3 "{script_path}"')
    os.remove(script_path)

    # MIDI -> wav -> mp3
    wav_path = os.path.join(output_dir, "chords.wav")
    run(f'fluidsynth -ni -F "{wav_path}" -O s16 -T wav "{soundfont}" "{midi_path}"')
    run(f'ffmpeg -y -i "{wav_path}" -b:a 192k "{mp3_path}"')
    if os.path.exists(wav_path):
        os.remove(wav_path)

    print(f"  -> {mp3_path}")
    return mp3_path


def upload_to_suno(mp3_path, title):
    """Upload mp3 to Suno -> return clip_id."""
    print("\n[Step 2e] Upload to Suno")

    with open(mp3_path, "rb") as f:
        result = api_post(
            "/upload_audio",
            files={"file": (os.path.basename(mp3_path), f, "audio/mpeg")},
            data={"filename": os.path.basename(mp3_path), "title": title}
        )

    if not result.get("success"):
        raise RuntimeError(f"Upload failed: {result}")

    clip_id = result.get("clip", {}).get("clip_id") or result.get("clip", {}).get("id")
    print(f"  -> clip_id: {clip_id}")
    return clip_id


def process_source(config, output_dir):
    """Full source processing pipeline. Returns clip_id or None."""
    source = config.get("source")
    if not source:
        print("\n[Step 2] No source — normal generation mode")
        return None, None

    soundfont = os.path.expanduser(config.get("soundfont", DEFAULT_SF2))

    # Download / resolve source
    mp3_path = resolve_source(source, output_dir)

    # Demucs
    nv_path, stem_dir = demucs_separate(mp3_path, output_dir)

    # Chord extraction (on no-vocal mix)
    chords_data = extract_chords(nv_path, output_dir)

    # Chords -> MIDI -> mp3
    chord_mp3 = chords_to_midi_mp3(chords_data, output_dir, soundfont)

    # Upload chord mp3 to Suno
    clip_id = upload_to_suno(chord_mp3, config.get("playlist", "cover"))

    return clip_id, chords_data


# ─── Step 3: Generate Songs ─────────────────────────────

def generate_song(song, config, cover_clip_id=None):
    """Generate a single song via Suno API. Returns list of track dicts."""
    order = song["order"]
    title = song.get("title", f"Track {order}")
    print(f"\n[Step 3] Generating #{order:02d}: {title}")

    payload = {
        "title": title,
        "tags": config.get("style", ""),
        "prompt": song.get("lyrics", "[Instrumental]"),
        "mv": config.get("model", DEFAULT_MODEL),
        "make_instrumental": song.get("make_instrumental", False),
        "wait_audio": False,
    }

    # Per-song overrides
    if song.get("vocal_gender"):
        gender_tag = f"{song['vocal_gender']} vocal tone"
        if gender_tag not in payload["tags"]:
            payload["tags"] = f"{payload['tags']}, {gender_tag}".strip(", ")

    if config.get("negative_tags"):
        payload["negative_tags"] = config["negative_tags"]

    # Cover mode
    if cover_clip_id:
        payload["cover_clip_id"] = cover_clip_id
        payload["is_remix"] = True
        if "weirdness" in song:
            payload["weirdness"] = song["weirdness"]
        if "style_influence" in song:
            payload["style_influence"] = song["style_influence"]

    print(f"  Payload: model={payload['mv']}, cover={'yes' if cover_clip_id else 'no'}")
    data = api_post("/custom_generate", payload)

    if isinstance(data, dict) and "error" in data:
        raise RuntimeError(f"Generation error: {data['error']}")

    tracks = data if isinstance(data, list) else [data]
    track_ids = [t.get("id", "?") for t in tracks]
    print(f"  -> {len(tracks)} versions: {track_ids}")
    return tracks


# ─── Step 4: Add to Workspace ───────────────────────────

def add_to_workspace(workspace_id, clip_ids):
    """Add clips to workspace."""
    if not workspace_id or not clip_ids:
        return
    print(f"\n[Step 4] Adding {len(clip_ids)} clips to workspace {workspace_id}")
    api_post("/workspace", {
        "action": "add_clips",
        "id": workspace_id,
        "clip_ids": clip_ids,
    })
    print("  -> Done")


# ─── Step 5: Download ───────────────────────────────────

def poll_until_ready(track_ids, max_wait=600, interval=10):
    """Poll API until all tracks have audio_url. Returns list of track dicts."""
    print(f"\n[Step 5a] Waiting for {len(track_ids)} tracks...")
    import requests

    elapsed = 0
    while elapsed < max_wait:
        time.sleep(interval)
        elapsed += interval

        ids_str = ",".join(track_ids)
        try:
            data = api_get(f"/get", params={"ids": ids_str})
        except Exception:
            print(f"  ... poll error, retrying ({elapsed}s)")
            continue

        if not isinstance(data, list):
            data = [data]

        statuses = [t.get("status", "?") for t in data]
        ready = all(t.get("audio_url") for t in data)
        print(f"  ... {elapsed}s: {statuses}")

        if ready:
            print("  -> All tracks ready")
            return data

    print("  WARNING: Timeout waiting for tracks")
    # Return whatever we have
    try:
        return api_get(f"/get", params={"ids": ",".join(track_ids)})
    except Exception:
        return []


def download_tracks(tracks, output_dir, song_map):
    """Download mp3, cover art, lyrics for each track."""
    import requests

    songs_dir = os.path.join(output_dir, "01_songs")
    os.makedirs(songs_dir, exist_ok=True)

    results = []
    for track in tracks:
        track_id = track.get("id", "")
        audio_url = track.get("audio_url")
        image_url = track.get("image_url")
        lyric = track.get("lyric", "")

        # Find matching song config for naming
        info = song_map.get(track_id, {})
        order = info.get("order", 0)
        title = sanitize_filename(info.get("title", track_id[:8]))
        version = info.get("version", 1)

        if order > 0:
            base = f"{order:02d}_{title}"
            if version > 1:
                base = f"{order:02d}_{title}_v{version}"
        else:
            base = f"unknown_{track_id[:8]}"

        mp3_path = os.path.join(songs_dir, f"{base}.mp3")
        jpeg_path = os.path.join(songs_dir, f"{base}.jpeg")
        txt_path = os.path.join(songs_dir, f"{base}.txt")

        # Download mp3
        if audio_url:
            print(f"  Downloading {base}.mp3")
            resp = requests.get(audio_url, timeout=120)
            with open(mp3_path, "wb") as f:
                f.write(resp.content)
        else:
            print(f"  WARNING: No audio_url for {track_id}")
            mp3_path = None

        # Download cover art
        if image_url:
            resp = requests.get(image_url, timeout=60)
            with open(jpeg_path, "wb") as f:
                f.write(resp.content)
        else:
            jpeg_path = None

        # Save lyrics (from API, not prompt)
        if lyric:
            with open(txt_path, "w", encoding="utf-8") as f:
                f.write(lyric)
        else:
            txt_path = None

        results.append({
            "id": track_id,
            "order": order,
            "title": info.get("title", ""),
            "version": version,
            "audio_url": audio_url,
            "image_url": image_url,
            "lyric": lyric,
            "duration": track.get("duration"),
            "style": track.get("tags", ""),
            "mp3_path": mp3_path,
            "jpeg_path": jpeg_path,
            "txt_path": txt_path,
        })

    return results


# ─── Step 6: DB Save ────────────────────────────────────

def save_to_db(results, config):
    """Insert tracks into gems.db suno_tracks."""
    print(f"\n[Step 6] Saving {len(results)} tracks to DB")

    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    # Ensure table exists
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS suno_tracks (
            id TEXT PRIMARY KEY,
            title TEXT,
            lyric TEXT,
            style TEXT,
            cover_url TEXT,
            audio_url TEXT,
            duration REAL,
            prompt_json TEXT,
            mp3_path TEXT,
            jpeg_path TEXT,
            txt_path TEXT,
            channel TEXT,
            created_at TIMESTAMP,
            status TEXT
        )
    """)

    channel = config.get("channel", "")

    for r in results:
        prompt_data = {
            "playlist": config.get("playlist"),
            "model": config.get("model"),
            "style": config.get("style"),
            "order": r.get("order"),
            "title": r.get("title"),
        }
        try:
            cursor.execute("""
                INSERT OR REPLACE INTO suno_tracks
                (id, title, lyric, style, cover_url, audio_url, duration,
                 prompt_json, mp3_path, jpeg_path, txt_path, channel, created_at, status)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                r["id"],
                r.get("title", ""),
                r.get("lyric", ""),
                r.get("style", config.get("style", "")),
                r.get("image_url", ""),
                r.get("audio_url", ""),
                r.get("duration"),
                json.dumps(prompt_data, ensure_ascii=False),
                r.get("mp3_path", ""),
                r.get("jpeg_path", ""),
                r.get("txt_path", ""),
                channel,
                datetime.now().isoformat(),
                "generated",
            ))
            print(f"  -> Saved: {r['id'][:8]}... ({r.get('title', '')})")
        except Exception as e:
            print(f"  WARNING: DB save failed for {r['id']}: {e}")

    conn.commit()
    conn.close()


# ─── Step 7: EQ Processing ──────────────────────────────

def detect_eq_mode(config):
    """Determine EQ mode from config or channel."""
    eq_mode = config.get("eq_mode", "auto")
    if eq_mode == "skip":
        return "skip"
    if eq_mode != "auto":
        return eq_mode

    channel = config.get("channel", "").lower()
    for preset_name, preset in EQ_PRESETS.items():
        if channel in preset["channels"]:
            return preset_name
    return "vocal"  # default


def eq_vocal(mp3_path, output_dir):
    """Vocal EQ: Demucs split -> vocal EQ -> remix."""
    print(f"  EQ (vocal): {os.path.basename(mp3_path)}")

    stem_out = os.path.join(output_dir, "_eq_demucs")
    run(f'demucs -n htdemucs -o "{stem_out}" "{mp3_path}"', timeout=600)

    # Find stems
    htdemucs = os.path.join(stem_out, "htdemucs")
    stem_dir = None
    if os.path.exists(htdemucs):
        for d in os.listdir(htdemucs):
            candidate = os.path.join(htdemucs, d)
            if os.path.isdir(candidate) and os.path.exists(os.path.join(candidate, "vocals.wav")):
                stem_dir = candidate
                break

    if not stem_dir:
        print("  WARNING: EQ demucs stems not found, skipping EQ")
        return mp3_path

    vocal = os.path.join(stem_dir, "vocals.wav")
    other = os.path.join(stem_dir, "other.wav")
    bass = os.path.join(stem_dir, "bass.wav")
    drums = os.path.join(stem_dir, "drums.wav")

    # Pedalboard vocal EQ (J1 confirmed setting)
    from pedalboard import (Pedalboard, Compressor, Gain, Limiter,
                             HighpassFilter, LowpassFilter, PeakFilter)
    from pedalboard.io import AudioFile

    vocal_board = Pedalboard([
        HighpassFilter(cutoff_frequency_hz=100),
        PeakFilter(cutoff_frequency_hz=250, gain_db=-4, q=0.5),
        PeakFilter(cutoff_frequency_hz=800, gain_db=-4, q=2.0),
        PeakFilter(cutoff_frequency_hz=3000, gain_db=3, q=1.0),
        PeakFilter(cutoff_frequency_hz=5500, gain_db=5, q=1.0),
        PeakFilter(cutoff_frequency_hz=8000, gain_db=-2, q=1.0),
        LowpassFilter(cutoff_frequency_hz=16000),
        Compressor(threshold_db=-18, ratio=3, attack_ms=10, release_ms=100),
        Gain(gain_db=2),
        Limiter(threshold_db=-0.5),
    ])

    with AudioFile(vocal) as f:
        vocals_audio = f.read(f.frames)
        sr = f.samplerate

    vocals_eq = vocal_board(vocals_audio, sr)

    vocal_pb = os.path.join(output_dir, "_vocal_pb.wav")
    with AudioFile(vocal_pb, "w", sr, vocals_eq.shape[0]) as f:
        f.write(vocals_eq)

    # afftdn noise reduction (smoothness)
    vocal_eq = os.path.join(output_dir, "_vocal_eq.wav")
    run(f'ffmpeg -y -i "{vocal_pb}" -af "afftdn=nr=5:nt=w:om=o" "{vocal_eq}"')

    # Remix: vocal_eq + other + bass + drums
    eq_path = mp3_path.replace(".mp3", "_eq.mp3")
    remix_filter = (
        "amix=inputs=4:duration=longest:normalize=0,"
        "volume=4,"
        "loudnorm=I=-13:TP=-1:LRA=11"
    )
    run(f'ffmpeg -y '
        f'-i "{vocal_eq}" -i "{other}" -i "{bass}" -i "{drums}" '
        f'-filter_complex "{remix_filter}" '
        f'-b:a 320k "{eq_path}"')

    # Replace original
    shutil.move(eq_path, mp3_path)

    # Cleanup
    shutil.rmtree(stem_out, ignore_errors=True)
    for tmp in [vocal_pb, vocal_eq]:
        if os.path.exists(tmp):
            os.remove(tmp)

    return mp3_path


def eq_master(mp3_path):
    """Master EQ: whole mix processing (H1 confirmed setting)."""
    print(f"  EQ (master): {os.path.basename(mp3_path)}")

    from pedalboard import (Pedalboard, Compressor, Gain, Limiter,
                             HighpassFilter, PeakFilter)
    from pedalboard.io import AudioFile

    board = Pedalboard([
        HighpassFilter(cutoff_frequency_hz=25),
        PeakFilter(cutoff_frequency_hz=60, gain_db=2, q=0.8),
        PeakFilter(cutoff_frequency_hz=300, gain_db=-3, q=0.7),
        PeakFilter(cutoff_frequency_hz=3500, gain_db=3, q=1.0),
        PeakFilter(cutoff_frequency_hz=5500, gain_db=3, q=1.0),
        PeakFilter(cutoff_frequency_hz=10000, gain_db=3, q=0.7),
        Compressor(threshold_db=-14, ratio=3, attack_ms=5, release_ms=100),
        Gain(gain_db=3),
        Limiter(threshold_db=-0.5),
    ])

    with AudioFile(mp3_path) as f:
        audio = f.read(f.frames)
        sr = f.samplerate

    result = board(audio, sr)

    eq_path = mp3_path.replace(".mp3", "_eq.mp3")
    with AudioFile(eq_path, "w", sr, result.shape[0], quality=320) as f:
        f.write(result)

    shutil.move(eq_path, mp3_path)
    return mp3_path


def apply_eq(results, config, output_dir):
    """Apply EQ to all downloaded tracks."""
    eq_mode = detect_eq_mode(config)
    if eq_mode == "skip":
        print("\n[Step 7] EQ: skipped")
        return

    print(f"\n[Step 7] EQ processing (mode: {eq_mode})")

    for r in results:
        mp3_path = r.get("mp3_path")
        if not mp3_path or not os.path.exists(mp3_path):
            continue

        try:
            if eq_mode == "vocal":
                eq_vocal(mp3_path, output_dir)
            elif eq_mode == "master":
                eq_master(mp3_path)
            else:
                print(f"  Unknown EQ mode: {eq_mode}, skipping")
        except Exception as e:
            print(f"  WARNING: EQ failed for {mp3_path}: {e}")


# ─── Step 8: Save Metadata ──────────────────────────────

def save_metadata(results, config, output_dir, workspace_id, chords_data=None):
    """Save metadata.json with all IDs, paths, settings."""
    print("\n[Step 8] Saving metadata.json")

    meta = {
        "playlist": config.get("playlist"),
        "channel": config.get("channel"),
        "model": config.get("model", DEFAULT_MODEL),
        "style": config.get("style"),
        "workspace_id": workspace_id,
        "source": config.get("source"),
        "eq_mode": detect_eq_mode(config),
        "created_at": datetime.now().isoformat(),
        "tracks": [
            {
                "id": r["id"],
                "order": r.get("order"),
                "title": r.get("title"),
                "version": r.get("version"),
                "mp3_path": r.get("mp3_path"),
                "jpeg_path": r.get("jpeg_path"),
                "txt_path": r.get("txt_path"),
                "duration": r.get("duration"),
            }
            for r in results
        ],
    }

    if chords_data:
        meta["key"] = chords_data.get("key")
        meta["total_chords"] = chords_data.get("total_chords")

    meta_path = os.path.join(output_dir, "metadata.json")
    with open(meta_path, "w", encoding="utf-8") as f:
        json.dump(meta, f, indent=2, ensure_ascii=False)
    print(f"  -> {meta_path}")


# ─── Main Pipeline ───────────────────────────────────────

def load_config(config_path):
    """Load and validate JSON config."""
    with open(config_path, "r", encoding="utf-8") as f:
        config = json.load(f)

    # Expand paths
    if config.get("output_dir"):
        config["output_dir"] = os.path.expanduser(config["output_dir"])
    if config.get("soundfont"):
        config["soundfont"] = os.path.expanduser(config["soundfont"])

    return config


def print_config_summary(config, songs_filter=None):
    """Print config summary for dry-run or confirmation."""
    print("=" * 60)
    print("Playlist Generation Pipeline")
    print("=" * 60)
    print(f"  Playlist:  {config.get('playlist')}")
    print(f"  Channel:   {config.get('channel')}")
    print(f"  Model:     {config.get('model', DEFAULT_MODEL)}")
    print(f"  Style:     {config.get('style', '')[:80]}...")
    print(f"  Source:    {config.get('source', 'none (normal mode)')}")
    print(f"  Output:    {config.get('output_dir')}")
    print(f"  EQ mode:   {detect_eq_mode(config)}")
    print(f"  Soundfont: {config.get('soundfont', DEFAULT_SF2)}")

    songs = config.get("songs", [])
    if songs_filter:
        songs = [s for s in songs if s["order"] in songs_filter]

    print(f"\n  Songs ({len(songs)}):")
    for s in songs:
        instr = " [instrumental]" if s.get("make_instrumental") else ""
        gender = f" ({s.get('vocal_gender', 'auto')})" if s.get("vocal_gender") else ""
        print(f"    {s['order']:02d}. {s.get('title', 'Untitled')}{gender}{instr}")

    print("=" * 60)


def main():
    parser = argparse.ArgumentParser(description="Unified Playlist Generation Pipeline")
    parser.add_argument("config", help="JSON config file path")
    parser.add_argument("--dry-run", action="store_true", help="Print config only, no execution")
    parser.add_argument("--songs", type=str, help="Generate specific songs only (e.g. 1,3,5)")
    parser.add_argument("--prepare-only", action="store_true", help="Source processing only, no generation")
    parser.add_argument("--skip-eq", action="store_true", help="Skip EQ processing")
    parser.add_argument("--skip-download", action="store_true", help="Skip download step")
    args = parser.parse_args()

    # Load config
    config = load_config(args.config)

    # Parse song filter
    songs_filter = None
    if args.songs:
        songs_filter = set(int(x) for x in args.songs.split(","))

    # Dry run
    if args.dry_run:
        print_config_summary(config, songs_filter)
        print("\n[DRY RUN] No changes made.")
        return

    print_config_summary(config, songs_filter)

    # Setup output directory
    output_dir = config.get("output_dir", f"./output_{config.get('playlist', 'playlist')}")
    os.makedirs(output_dir, exist_ok=True)
    os.makedirs(os.path.join(output_dir, "01_songs"), exist_ok=True)

    # Step 1: Workspace
    workspace_id = ensure_workspace(config.get("playlist", "unnamed"))

    # Step 2: Source processing
    cover_clip_id, chords_data = process_source(config, output_dir)

    if args.prepare_only:
        print("\n[PREPARE ONLY] Source processing complete.")
        if chords_data:
            print(f"  Key: {chords_data['key']}, Chords: {chords_data['total_chords']}")
        if cover_clip_id:
            print(f"  Cover clip_id: {cover_clip_id}")
        save_metadata([], config, output_dir, workspace_id, chords_data)
        return

    # Step 3: Generate songs
    songs = config.get("songs", [])
    if songs_filter:
        songs = [s for s in songs if s["order"] in songs_filter]

    all_track_ids = []
    song_map = {}  # track_id -> {order, title, version}

    for song in songs:
        try:
            tracks = generate_song(song, config, cover_clip_id)
            for i, track in enumerate(tracks):
                tid = track.get("id", "")
                all_track_ids.append(tid)
                song_map[tid] = {
                    "order": song["order"],
                    "title": song.get("title", f"Track {song['order']}"),
                    "version": i + 1,
                }
        except Exception as e:
            print(f"  ERROR generating #{song['order']:02d}: {e}")

    if not all_track_ids:
        print("\nERROR: No tracks generated")
        return

    # Step 4: Add to workspace
    add_to_workspace(workspace_id, all_track_ids)

    # Step 5: Download
    if args.skip_download:
        print("\n[Step 5] Download: skipped")
        results = [{"id": tid, **song_map.get(tid, {})} for tid in all_track_ids]
    else:
        ready_tracks = poll_until_ready(all_track_ids)
        if not isinstance(ready_tracks, list):
            ready_tracks = [ready_tracks] if ready_tracks else []
        results = download_tracks(ready_tracks, output_dir, song_map)

    # Step 6: DB save
    save_to_db(results, config)

    # Step 7: EQ
    if args.skip_eq:
        print("\n[Step 7] EQ: skipped (--skip-eq)")
    else:
        apply_eq(results, config, output_dir)

    # Step 8: Metadata
    save_metadata(results, config, output_dir, workspace_id, chords_data)

    # Summary
    print("\n" + "=" * 60)
    print("COMPLETE")
    print("=" * 60)
    print(f"  Playlist:    {config.get('playlist')}")
    print(f"  Tracks:      {len(results)}")
    print(f"  Workspace:   {workspace_id}")
    if chords_data:
        print(f"  Key:         {chords_data['key']}")
    print(f"  Output:      {output_dir}/")
    print(f"  Track IDs:   {all_track_ids}")


if __name__ == "__main__":
    main()
