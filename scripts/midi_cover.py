#!/usr/bin/env python3
"""
MIDI Cover Pipeline — 원곡에서 코드 추출 → Suno Cover 자동 생성

Usage:
  # mp3 파일
  python3 midi_cover.py /path/to/song.mp3 --style "emotional J-pop" --title "My Cover"

  # YouTube URL
  python3 midi_cover.py "https://youtube.com/watch?v=xxx" --style "phonk, dark" --title "Cover"

  # 가사 파일 지정
  python3 midi_cover.py song.mp3 --style "rock" --title "Cover" --lyrics lyrics.txt

  # 전체 옵션
  python3 midi_cover.py song.mp3 \
    --style "emotional J-pop, bright piano, 84 BPM" \
    --title "Hero Cover" \
    --lyrics lyrics.txt \
    --model chirp-fenix \
    --soundfont ~/Music/soundfonts/FluidR3_GM.sf2 \
    --api http://localhost:3001 \
    --output ./output \
    --wait
"""

import argparse
import json
import os
import re
import subprocess
import sys
import tempfile
import time
from pathlib import Path


# ─── Config ──────────────────────────────────────────────

API_BASE = "http://localhost:3001/api"
DEFAULT_MODEL = "chirp-fenix"
DEFAULT_SF2 = "/opt/homebrew/Cellar/fluid-synth/2.5.3/share/fluid-synth/sf2/VintageDreamsWaves-v2.sf2"
CONDA_CHORD_ENV = "chord310"
CONDA_DEMUCS_ENV = None  # system default
NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']


# ─── Helpers ─────────────────────────────────────────────

def run(cmd, check=True, capture=True):
    """Run shell command."""
    print(f"  $ {cmd if isinstance(cmd, str) else ' '.join(cmd)}")
    result = subprocess.run(
        cmd, shell=isinstance(cmd, str), capture_output=capture,
        text=True, timeout=600
    )
    if check and result.returncode != 0:
        print(f"  ERROR: {result.stderr[:500] if result.stderr else 'unknown'}")
        sys.exit(1)
    return result


def conda_run(env, code):
    """Run Python code in a conda environment."""
    if env:
        return run(f'conda run -n {env} python3 -c "{code}"')
    return run(f'python3 -c "{code}"')


# ─── Step 0: Input (YouTube or mp3) ─────────────────────

def resolve_input(source, output_dir):
    """YouTube URL → mp3 다운로드, 또는 mp3 경로 그대로 반환."""
    if source.startswith("http://") or source.startswith("https://"):
        print("\n[Step 0] YouTube → mp3 다운로드")
        mp3_path = os.path.join(output_dir, "original.mp3")
        run(f'yt-dlp -x --audio-format mp3 --audio-quality 0 '
            f'-o "{os.path.join(output_dir, "original.%(ext)s")}" "{source}"')
        # yt-dlp may output with different extension, find the file
        for f in os.listdir(output_dir):
            if f.startswith("original") and f.endswith(".mp3"):
                mp3_path = os.path.join(output_dir, f)
                break
        print(f"  → {mp3_path}")
        return mp3_path
    else:
        if not os.path.exists(source):
            print(f"ERROR: 파일 없음: {source}")
            sys.exit(1)
        print(f"\n[Step 0] 입력 파일: {source}")
        return source


# ─── Step 1: Demucs (보컬 제거) ─────────────────────────

def demucs_separate(mp3_path, output_dir):
    """Demucs로 보컬 제거, no-vocal mix 반환."""
    print("\n[Step 1] Demucs 보컬 분리")
    demucs_out = os.path.join(output_dir, "demucs")
    run(f'demucs -n htdemucs -o "{demucs_out}" "{mp3_path}"')

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
        print("  ERROR: Demucs stems not found")
        sys.exit(1)

    # Mix other + bass + drums (no vocals)
    nv_path = os.path.join(output_dir, "no_vocal.wav")
    run(f'ffmpeg -y '
        f'-i "{os.path.join(stem_dir, "other.wav")}" '
        f'-i "{os.path.join(stem_dir, "bass.wav")}" '
        f'-i "{os.path.join(stem_dir, "drums.wav")}" '
        f'-filter_complex "amix=inputs=3:duration=longest" '
        f'"{nv_path}"')

    print(f"  → {nv_path}")
    return nv_path


# ─── Step 2: Chordino 코드 추출 + Key 필터 ──────────────

def extract_chords(audio_path, output_dir):
    """Chordino로 코드 추출 → Key 필터 → JSON 저장."""
    print("\n[Step 2] Chordino 코드 추출 + Key 필터")

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

# Find best key (self-consistency: most chords retained)
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

    # Write temp script
    script_path = os.path.join(output_dir, "_extract_chords.py")
    with open(script_path, "w") as f:
        f.write(code)

    run(f'conda run -n {CONDA_CHORD_ENV} python3 "{script_path}"')
    os.remove(script_path)

    with open(chords_json) as f:
        data = json.load(f)
    print(f"  → Key: {data['key']}, {data['total_chords']} chords")
    return data


# ─── Step 3: 코드 → MIDI → mp3 ─────────────────────────

def chords_to_midi(chords_data, output_dir, soundfont):
    """코드 JSON → MIDI → mp3 렌더링."""
    print("\n[Step 3] 코드 → MIDI → mp3")

    midi_path = os.path.join(output_dir, "chords.mid")
    mp3_path = os.path.join(output_dir, "chords.mp3")

    code = f'''
import json, mido
from mido import MidiFile, MidiTrack, Message

NOTE_NAMES = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"]

with open("{os.path.join(output_dir, 'chords.json')}") as f:
    data = json.load(f)

# BPM from chord durations
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
    is_minor = chord_name.endswith("m") and not chord_name.endswith("#")
    if chord_name.endswith("#m"):
        root_name = chord_name[:-1]  # e.g. "C#m" -> "C#"
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

    # Render MIDI → mp3
    wav_path = os.path.join(output_dir, "chords.wav")
    run(f'fluidsynth -ni -F "{wav_path}" -O s16 -T wav "{soundfont}" "{midi_path}"')
    run(f'ffmpeg -y -i "{wav_path}" -b:a 192k "{mp3_path}"')
    os.remove(wav_path)

    print(f"  → {mp3_path}")
    return mp3_path


# ─── Step 4: Suno 업로드 ────────────────────────────────

def upload_to_suno(mp3_path, title, api_base):
    """mp3를 Suno에 업로드 → clip_id 반환."""
    print("\n[Step 4] Suno 업로드")

    result = run(
        f'curl -s -X POST {api_base}/upload_audio '
        f'-F "file=@{mp3_path}" '
        f'-F "filename={os.path.basename(mp3_path)}" '
        f'-F "title={title}"'
    )

    data = json.loads(result.stdout)
    if not data.get("success"):
        print(f"  ERROR: {data}")
        sys.exit(1)

    clip_id = data.get("clip", {}).get("clip_id") or data.get("clip", {}).get("id")
    print(f"  → clip_id: {clip_id}")
    return clip_id


# ─── Step 5: Cover 생성 ─────────────────────────────────

def generate_cover(clip_id, title, tags, lyrics, model, wait_audio, api_base):
    """Cover 모드로 곡 생성."""
    print("\n[Step 5] Suno Cover 생성")

    payload = {
        "prompt": lyrics,
        "tags": tags,
        "title": title,
        "model": model,
        "cover_clip_id": clip_id,
        "is_remix": True,
        "wait_audio": wait_audio
    }

    result = run(
        f"curl -s -X POST {api_base}/custom_generate "
        f"-H 'Content-Type: application/json' "
        f"-d '{json.dumps(payload)}'"
    )

    data = json.loads(result.stdout)
    if isinstance(data, dict) and "error" in data:
        print(f"  ERROR: {data['error']}")
        sys.exit(1)

    song_ids = [s["id"] for s in data] if isinstance(data, list) else []
    print(f"  → {len(song_ids)}곡 생성: {song_ids}")
    return song_ids


# ─── Step 6: 다운로드 ───────────────────────────────────

def download_songs(song_ids, output_dir, api_base):
    """생성된 곡 다운로드."""
    print("\n[Step 6] 곡 다운로드")

    if not song_ids:
        print("  No songs to download")
        return []

    # Wait for generation
    print("  생성 대기 중...")
    for attempt in range(30):  # max 5 min
        time.sleep(10)
        ids_str = ",".join(song_ids)
        result = run(f'curl -s "{api_base}/get?ids={ids_str}"', check=False)
        try:
            data = json.loads(result.stdout)
        except:
            continue
        if all(s.get("audio_url") for s in data):
            break
        statuses = [s.get("status", "?") for s in data]
        print(f"  ... {statuses}")

    # Download
    paths = []
    for s in data:
        if s.get("audio_url"):
            out_path = os.path.join(output_dir, f"cover_{s['id'][:8]}.mp3")
            run(f'curl -s -o "{out_path}" "{s["audio_url"]}"')
            paths.append(out_path)
            print(f"  → {out_path}")

    return paths


# ─── Main ────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="MIDI Cover Pipeline")
    parser.add_argument("source", help="mp3 파일 경로 또는 YouTube URL")
    parser.add_argument("--style", "-s", required=True, help="Suno 스타일 태그")
    parser.add_argument("--title", "-t", default="Cover", help="곡 제목")
    parser.add_argument("--lyrics", "-l", help="가사 파일 경로")
    parser.add_argument("--model", "-m", default=DEFAULT_MODEL, help="Suno 모델")
    parser.add_argument("--soundfont", default=DEFAULT_SF2, help="SoundFont 경로")
    parser.add_argument("--api", default=API_BASE, help="Suno API 주소")
    parser.add_argument("--output", "-o", default="./midi_cover_output", help="출력 디렉토리")
    parser.add_argument("--wait", "-w", action="store_true", help="곡 생성 완료까지 대기")
    parser.add_argument("--skip-demucs", action="store_true", help="Demucs 건너뛰기 (이미 반주만 있는 경우)")
    args = parser.parse_args()

    # Setup
    output_dir = os.path.abspath(args.output)
    os.makedirs(output_dir, exist_ok=True)

    # Lyrics
    if args.lyrics:
        with open(args.lyrics) as f:
            lyrics = f.read()
    else:
        lyrics = "[Instrumental]"

    print("=" * 50)
    print("MIDI Cover Pipeline")
    print("=" * 50)
    print(f"  Source: {args.source}")
    print(f"  Style:  {args.style}")
    print(f"  Title:  {args.title}")
    print(f"  Output: {output_dir}")

    # Step 0: Input
    mp3_path = resolve_input(args.source, output_dir)

    # Step 1: Demucs
    if args.skip_demucs:
        audio_for_chords = mp3_path
    else:
        audio_for_chords = demucs_separate(mp3_path, output_dir)

    # Step 2: Chord extraction
    chords_data = extract_chords(audio_for_chords, output_dir)

    # Step 3: MIDI → mp3
    chord_mp3 = chords_to_midi(chords_data, output_dir, args.soundfont)

    # Step 4: Upload
    clip_id = upload_to_suno(chord_mp3, args.title, args.api)

    # Step 5: Generate cover
    song_ids = generate_cover(
        clip_id, args.title, args.style, lyrics,
        args.model, args.wait, args.api
    )

    # Step 6: Download (if --wait)
    if args.wait:
        download_songs(song_ids, output_dir, args.api)

    # Summary
    print("\n" + "=" * 50)
    print("완료!")
    print(f"  Key: {chords_data['key']}")
    print(f"  Chords: {chords_data['total_chords']}개")
    print(f"  Songs: {song_ids}")
    print(f"  Output: {output_dir}/")

    # Save metadata
    meta = {
        "source": args.source,
        "key": chords_data["key"],
        "chords": chords_data["total_chords"],
        "clip_id": clip_id,
        "song_ids": song_ids,
        "style": args.style,
        "title": args.title,
    }
    with open(os.path.join(output_dir, "metadata.json"), "w") as f:
        json.dump(meta, f, indent=2, ensure_ascii=False)


if __name__ == "__main__":
    main()
