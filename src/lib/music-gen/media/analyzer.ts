import { z } from 'zod';
import fs from 'fs';
import { execFileSync } from 'child_process';
import { Midi } from '@tonejs/midi';
import { getAccountPool } from '../gemini/account-pool';
import * as globalSettings from '../repositories/global-settings';

// ── Schema ────────────────────────────────────────────────────────────────────

const songSectionSchema = z.object({
  name: z.string(),
  start_time: z.number(),
  end_time: z.number(),
  bars: z.number().optional(),
  energy: z.number().min(1).max(10).optional(),
  characteristics: z.string().optional(),
});

const lyricSectionGuideSchema = z.object({
  section_name: z.string(),
  time_range: z.string(),
  bars: z.number().optional(),
  energy: z.number().min(1).max(10).optional(),
  harmonic_character: z.string(),
  syllables_per_bar: z.string(),
  lyric_style: z.string(),
  lyric_note: z.string(),
});

export const mediaAnalysisSchema = z.object({
  // ── 1. Basic Metadata ───────────────────────────────────────────────────────
  key: z.string().optional(),
  tempo_bpm: z.number().optional(),
  duration_seconds: z.number().optional(),
  time_signature: z.string().optional(),
  energy_level: z.number().min(1).max(10).optional(),
  // ── 2. Timeline Analysis ────────────────────────────────────────────────────
  song_sections: z.array(songSectionSchema).optional(),
  structure: z.string().optional(),
  // ── 3. Rhythmic Density ─────────────────────────────────────────────────────
  notes_per_bar_avg: z.number().optional(),
  syllables_per_bar_min: z.number().optional(),
  syllables_per_bar_max: z.number().optional(),
  lyric_density_recommendation: z.string().optional(),
  // ── 4. Harmonic & Emotional Map ─────────────────────────────────────────────
  chord_progression: z.array(z.string()).optional(),
  chord_progression_chorus: z.array(z.string()).optional(),
  chord_progression_confidence: z.number().min(0).max(1).optional(),
  chord_character: z.string().optional(),
  emotional_change: z.string().optional(),
  mood: z.array(z.string()).optional(),
  emotional_keywords: z.array(z.string()).optional(),
  // ── 5. Melodic Profile ──────────────────────────────────────────────────────
  vocal_range_expected: z.string().optional(),
  accent_position: z.string().optional(),
  vocal_recommendation: z.string().optional(),
  // ── Extra ───────────────────────────────────────────────────────────────────
  instrumentation: z.array(z.string()).optional(),
  notes: z.string().optional(),
  lyric_structure_guide: z.array(lyricSectionGuideSchema).optional(),
  raw: z.string().optional(),
});

export type MediaAnalysis = z.infer<typeof mediaAnalysisSchema>;

// ── MIME type routing ─────────────────────────────────────────────────────────

const MIDI_MIMES = new Set(['audio/midi', 'audio/mid', 'audio/x-midi']);
const AUDIO_MIMES = new Set(['audio/mpeg', 'audio/wav', 'audio/mp4', 'audio/m4a']);

// ── JSON Schema for Gemini responseSchema ─────────────────────────────────────

const MEDIA_ANALYSIS_RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    key:                          { type: 'string' },
    tempo_bpm:                    { type: 'number' },
    duration_seconds:             { type: 'number' },
    time_signature:               { type: 'string' },
    mood:                         { type: 'array', items: { type: 'string' } },
    structure:                    { type: 'string' },
    instrumentation:              { type: 'array', items: { type: 'string' } },
    notes:                        { type: 'string' },
    chord_progression:            { type: 'array', items: { type: 'string' } },
    chord_progression_chorus:     { type: 'array', items: { type: 'string' } },
    chord_progression_confidence: { type: 'number' },
    song_sections: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name:       { type: 'string' },
          start_time: { type: 'number' },
          end_time:   { type: 'number' },
          bars:       { type: 'number' },
        },
      },
    },
    syllables_per_bar_min:   { type: 'number' },
    syllables_per_bar_max:   { type: 'number' },
    vocal_recommendation:    { type: 'string' },
    emotional_keywords:      { type: 'array', items: { type: 'string' } },
  },
};

// ── System instruction (role + guidelines + constraints) ─────────────────────

const ANALYSIS_SYSTEM_INSTRUCTION = `
[Role]
너는 음악 제작 공정의 첫 번째 단계인 '미디 구조 분석 전문가'이다.
제공된 오디오 파일의 사운드를 분석하여, 향후 작사가와 작곡가가 참고할 수 있는 정밀한 음악적 명세서(Specification)를 작성하라.

[Analysis Order — 반드시 이 순서로 판단하라]
Step 1. 악기 인식 먼저: 들리는 악기가 무엇인지 먼저 판단하라. 피아노이면 클래식/발라드 계열을, 드럼+기타이면 록/팝 계열을 기준으로 설정하라.
Step 2. BPM 측정: 실제 비트/타격음의 간격을 기준으로 BPM을 측정하라. 아르페지오(음표가 빠르게 쏟아지는 패턴)는 BPM이 아니라 연주 기법이다. Double-time 오류 주의: BPM 80의 8분음표를 BPM 160의 4분음표로 착각하지 마라.
Step 3. 에너지 레벨: 악기 편성과 실제 음량·밀도를 기준으로 1~10을 판단하라. 피아노 솔로라면 최대 6이다.
Step 4. 구조·코드 분석: 시간대별 변화를 우선순위에 두고, 코드는 완전한 재즈 보이싱으로 표기하라 (Fmaj7, G6, Em7 등. 단순 "F" 금지).

[Anti-Hallucination 경고]
- 분석은 반드시 첨부된 파일의 실제 청각적 데이터에만 기반해야 한다.
- 이 프롬프트에 명시된 어떤 수치나 장르 단어도 예시일 뿐이다. 실제 파일과 다르면 무시하라.
- 파일에서 피아노 아르페지오가 들리면 BPM과 에너지를 낮게 측정하라.
- 존재하지 않는 악기, 래핑, 노이즈를 만들어내지 마라.

[Constraints]
- 가사를 직접 작성하지 마라.
- Suno 스타일 태그를 만들지 마라.
- 오로지 음악적 구조와 데이터 분석 결과만 출력하라.
- 출력은 반드시 JSON 형식이어야 한다.
`.trim();

// ── User prompt (JSON output spec) ───────────────────────────────────────────

const ANALYSIS_PROMPT = `
아래 JSON 형식으로 분석 결과를 출력하라. 모든 수치와 내용은 실제 오디오 파일을 듣고 측정한 값이어야 한다.
이 JSON 구조는 형식 명세일 뿐이다. 필드 값을 임의로 채우거나 가상의 데이터를 생성하지 마라.

{
  "key": "실제 측정한 조성",
  "tempo_bpm": <실제 측정한 BPM>,
  "duration_seconds": <실제 길이(초)>,
  "time_signature": "실제 박자",
  "energy_level": <실제 에너지 1~10. 피아노 솔로라면 최대 6>,

  "song_sections": [
    {
      "name": "Intro / Verse / Pre-Chorus / Chorus / Bridge / Solo / Outro 중 실제 해당하는 섹션명",
      "start_time": <실제 시작 시간(초)>,
      "end_time": <실제 종료 시간(초)>,
      "bars": <실제 마디 수>,
      "energy": <이 섹션의 실제 에너지 1~10>,
      "characteristics": "이 섹션의 실제 반주 패턴, 음역대, 밀도 특징"
    }
  ],

  "notes_per_bar_avg": <실제 멜로디 기준 마디당 평균 음표 수>,
  "syllables_per_bar_min": <실제 BPM과 리듬 밀도 기반 최소 권장 음절>,
  "syllables_per_bar_max": <실제 BPM과 리듬 밀도 기반 최대 권장 음절>,
  "lyric_density_recommendation": "실제 측정된 여백/밀도에 근거한 가사 작성 권장사항",

  "chord_progression": ["실제 버스 코드 — 완전한 재즈 보이싱 (Fmaj7, G6, Em7 형식)"],
  "chord_progression_chorus": ["실제 코러스 코드"],
  "chord_progression_confidence": <0.0~1.0>,
  "chord_character": "실제 코드 진행의 성격",
  "emotional_change": "실제 감정 변화 아크",

  "vocal_range_expected": "Low / Mid / High / Mid-High 중 실제 해당",
  "accent_position": "정박 중심 / 엇박 중심 / 혼합 중 실제 해당",
  "vocal_recommendation": "실제 곡 특성에 맞는 보컬 방향 권장",

  "mood": ["실제 분위기 키워드"],
  "emotional_keywords": ["실제 감성 키워드"],
  "instrumentation": ["실제 들리는 악기만 기재. 없는 악기 추가 금지"],
  "notes": "실제 프로덕션·믹싱 특이사항",

  "lyric_structure_guide": [
    {
      "section_name": "위 song_sections의 name과 정확히 동일한 값",
      "time_range": "MM:SS ~ MM:SS 형식",
      "bars": <해당 섹션 마디 수>,
      "energy": <해당 섹션 에너지 1~10>,
      "harmonic_character": "이 섹션의 실제 화성 텐션·밀도·움직임",
      "syllables_per_bar": "N~N — 실제 BPM과 음표 밀도 기반 근거",
      "lyric_style": "독백/배경설명 | 감정변화/기대감 | 핵심주제/감정폭발 중 실제 해당",
      "lyric_note": "'/'로 자연 호흡점을 표시한 예시 구 포함. BPM과 음표 길이를 기반으로 작성"
    }
  ]
}

CRITICAL:
- lyric_structure_guide 항목 수 = song_sections 항목 수 (1:1 매핑, 누락 없음)
- 모든 값은 실제 파일 분석 기반. 프롬프트의 형식 예시를 데이터로 복사하지 마라.
`.trim();

// ── MIDI local parsing ────────────────────────────────────────────────────────

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

const CHORD_INTERVALS: Record<string, string> = {
  '0,4,7':    'maj',
  '0,3,7':    'm',
  '0,4,7,10': '7',
  '0,4,7,11': 'maj7',
  '0,3,7,10': 'm7',
  '0,3,6':    'dim',
  '0,4,8':    'aug',
  '0,5,7':    'sus4',
  '0,2,7':    'sus2',
};

function pitchClassSetToChord(pitchClasses: Set<number>): string | null {
  const arr = [...pitchClasses].sort((a, b) => a - b);
  if (arr.length < 2) return null;

  for (const root of arr) {
    const relative = arr.map((p) => (p - root + 12) % 12).sort((a, b) => a - b);
    const suffix = CHORD_INTERVALS[relative.join(',')];
    if (suffix !== undefined) {
      return `${NOTE_NAMES[root]}${suffix}`;
    }
  }
  // Fallback: just root note name
  return NOTE_NAMES[arr[0]];
}

function detectChordsFromMidi(midi: Midi): string[] {
  const allNotes = midi.tracks.flatMap((t) => t.notes);
  if (allNotes.length === 0) return [];

  allNotes.sort((a, b) => a.time - b.time);

  const bpm = midi.header.tempos[0]?.bpm ?? 120;
  const beatDuration = 60 / bpm;
  const measureDuration = beatDuration * 4; // assume 4/4
  const numMeasures = Math.min(Math.ceil(midi.duration / measureDuration), 32);

  const chords: string[] = [];
  for (let i = 0; i < numMeasures; i++) {
    const start = i * measureDuration;
    const end = start + measureDuration;
    const measureNotes = allNotes.filter((n) => n.time >= start && n.time < end);
    if (measureNotes.length === 0) continue;

    const pitchClasses = new Set(measureNotes.map((n) => n.midi % 12));
    const chord = pitchClassSetToChord(pitchClasses);
    if (chord) chords.push(chord);
  }

  // Remove consecutive duplicates
  return chords.filter((c, i) => i === 0 || c !== chords[i - 1]);
}

function parseMidi(filePath: string): MediaAnalysis {
  const data = fs.readFileSync(filePath);
  const midi = new Midi(data);

  const tempoBpm = midi.header.tempos[0]?.bpm;
  const keySig = midi.header.keySignatures[0];
  const key = keySig
    ? `${keySig.key}${keySig.scale === 'minor' ? ' minor' : ' major'}`
    : undefined;

  const chord_progression = detectChordsFromMidi(midi);
  const totalNotes = midi.tracks.reduce((s, t) => s + t.notes.length, 0);

  return {
    key,
    tempo_bpm: tempoBpm != null ? Math.round(tempoBpm) : undefined,
    structure: `${midi.tracks.length} track(s), ${midi.duration.toFixed(1)}s`,
    notes: `MIDI parsed locally: ${totalNotes} notes across ${midi.tracks.length} track(s)`,
    chord_progression: chord_progression.length > 0 ? chord_progression : undefined,
    chord_progression_confidence: chord_progression.length > 0 ? 0.8 : 0,
  };
}

// ── Local audio metadata extraction ──────────────────────────────────────────

/** Returns exact duration in seconds via ffprobe. Returns undefined if ffprobe unavailable. */
function extractDurationSeconds(filePath: string): number | undefined {
  try {
    const out = execFileSync(
      'ffprobe',
      ['-v', 'quiet', '-show_entries', 'format=duration', '-of', 'csv=p=0', filePath],
      { encoding: 'utf8', timeout: 10_000 },
    ).trim();
    const val = parseFloat(out);
    return isNaN(val) ? undefined : Math.round(val);
  } catch {
    return undefined;
  }
}

/** Returns BPM via Python librosa. Returns undefined if unavailable. */
function extractBpmLibrosa(filePath: string): number | undefined {
  const script = `
import librosa, warnings, sys
warnings.filterwarnings('ignore')
y, sr = librosa.load(sys.argv[1], duration=60)
tempo, _ = librosa.beat.beat_track(y=y, sr=sr)
bpm = float(tempo)
# librosa sometimes returns half-tempo for slow tracks — double if < 60
if bpm < 60:
    bpm *= 2
print(round(bpm, 1))
`.trim();
  try {
    const out = execFileSync('python3', ['-c', script, filePath], {
      encoding: 'utf8',
      timeout: 30_000,
    }).trim();
    const val = parseFloat(out);
    return isNaN(val) ? undefined : val;
  } catch {
    return undefined;
  }
}

// ── Gemini multimodal audio analysis ─────────────────────────────────────────

async function analyzeAudioWithGemini(filePath: string, mimeType: string): Promise<MediaAnalysis> {
  const pool = getAccountPool();

  const ref = await pool.uploadFile(filePath, mimeType);
  const mediaPart = pool.refToPart(ref);

  // DB의 music_analysis_system_prompt 우선 사용, 없으면 하드코딩 폴백
  const dbPrompt = globalSettings.get('music_analysis_system_prompt');
  const systemInstruction = dbPrompt?.value?.trim() || ANALYSIS_SYSTEM_INSTRUCTION;

  const rawText = await pool.generateMultimodal(
    [mediaPart, { text: ANALYSIS_PROMPT }],
    {
      model: 'gemini-3-flash-preview', // preferred; vertex-ai falls back to gemini-2.5-flash
      temperature: 0,
      thinkingBudget: 24576, // High thinking level (matches AI Studio "High")
      systemInstruction,
      responseMimeType: 'application/json',
      // responseSchema omitted: free-form JSON allows full chord voicings (maj7, m7, sus4 etc.)
    },
  );

  const parsed = JSON.parse(rawText);
  const validated = mediaAnalysisSchema.safeParse(parsed);
  const base: MediaAnalysis = validated.success ? validated.data : { raw: rawText };

  // Override duration and BPM with locally-extracted accurate values
  const localDuration = extractDurationSeconds(filePath);
  const localBpm = extractBpmLibrosa(filePath);
  if (localDuration !== undefined) base.duration_seconds = localDuration;
  if (localBpm !== undefined) base.tempo_bpm = localBpm;

  return base;
}

// ── Public entry point ────────────────────────────────────────────────────────

export async function analyzeMediaFromUrl(
  filePath: string,
  mimeType: string,
): Promise<MediaAnalysis> {
  if (MIDI_MIMES.has(mimeType)) {
    // MIDI: local deterministic parsing, no Gemini call
    return parseMidi(filePath);
  }

  if (AUDIO_MIMES.has(mimeType)) {
    return analyzeAudioWithGemini(filePath, mimeType);
  }

  return { notes: `Unsupported MIME type: ${mimeType}` };
}
