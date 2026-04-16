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
import shutil
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
BTC_DIR = Path.home() / "Projects/clones/BTC-ISMIR19"


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
    run(f'demucs -n htdemucs --device mps -o "{demucs_out}" "{mp3_path}"')

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


# ─── Step 2: BTC Transformer 코드 추출 ──────────────────

def extract_chords(audio_path, output_dir):
    """BTC Transformer로 코드 추출 → MIDI 생성."""
    print("\n[Step 2] BTC Transformer 코드 추출")

    with tempfile.TemporaryDirectory() as tmp_dir:
        # BTC는 디렉토리 단위로 처리하므로 오디오 파일을 임시 디렉토리에 복사
        audio_name = Path(audio_path).name
        shutil.copy2(audio_path, os.path.join(tmp_dir, audio_name))

        # BTC_DIR 기준으로 실행 (상대 경로 모델 파일 참조)
        result = subprocess.run(
            ['conda', 'run', '-n', CONDA_CHORD_ENV, 'python3', 'test.py',
             '--audio_dir', tmp_dir,
             '--save_dir', tmp_dir],
            cwd=str(BTC_DIR),
            capture_output=True,
            text=True,
            timeout=600
        )

        # 생성된 MIDI 파일 탐색
        midi_files = list(Path(tmp_dir).glob('*.midi'))
        if not midi_files:
            print(f"  ERROR: BTC MIDI 생성 실패\n  stderr: {result.stderr[:500]}")
            sys.exit(1)

        # output_dir로 복사
        midi_dst = os.path.join(output_dir, 'chords.mid')
        shutil.copy2(str(midi_files[0]), midi_dst)

    print(f"  → MIDI 생성 완료: {midi_dst}")
    return {"midi_path": midi_dst, "key": "", "total_chords": 0}


# ─── Step 3: MIDI → mp3 렌더링 ─────────────────────────

def chords_to_midi(chords_data, output_dir, soundfont):
    """BTC MIDI → mp3 렌더링 (MIDI는 이미 extract_chords에서 생성됨)."""
    print("\n[Step 3] MIDI → mp3 렌더링")

    midi_path = chords_data["midi_path"]
    mp3_path = os.path.join(output_dir, "chords.mp3")
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
    print(f"  Key: {chords_data.get('key', 'N/A')}")
    print(f"  MIDI: {chords_data.get('midi_path', 'N/A')}")
    print(f"  Songs: {song_ids}")
    print(f"  Output: {output_dir}/")

    # Save metadata
    meta = {
        "source": args.source,
        "midi_path": chords_data.get("midi_path", ""),
        "clip_id": clip_id,
        "song_ids": song_ids,
        "style": args.style,
        "title": args.title,
    }
    with open(os.path.join(output_dir, "metadata.json"), "w") as f:
        json.dump(meta, f, indent=2, ensure_ascii=False)


if __name__ == "__main__":
    main()
