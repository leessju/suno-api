import { ChannelWithPersona } from '../repositories/channels';
import { MediaAnalysis } from '../media/analyzer';

export const LANG_LABEL: Record<string, string> = {
  en:   '영어',
  ja:   '일본어',
  ko:   '한국어',
  zh:   '중국어',
  inst: 'Instrumental(가사없음)',
}

export function applyLangToPrompt(prompt: string, lyricLang?: string | null): string {
  if (lyricLang === 'inst') {
    return prompt.replaceAll('{가사언어} 가사', 'Instrumental(가사 없음)')
  }
  return prompt.replaceAll('{가사언어}', LANG_LABEL[lyricLang ?? 'ja'] ?? '일본어(한자+독음)')
}

export function buildSystemPrompt(channel: ChannelWithPersona, lyricLang?: string | null): string {
  const forbidden: string[] = JSON.parse(channel.forbidden_words);
  const recommended: string[] = JSON.parse(channel.recommended_words);

  const isJa = !lyricLang || lyricLang === 'ja'
  const lyricFormatDesc =
    channel.lyric_format === 'jp2_en1'
      ? isJa
        ? '[일어 2줄 + 영문 1줄] × N연 (N≥2) 엄격 준수'
        : 'Suno 섹션 태그 사용, 선택 언어로 작성'
      : channel.lyric_format === 'jp_tagged'
        ? isJa
          ? '일본어 전용 + Suno 섹션 태그\n' +
            '  - [Verse], [Pre-Chorus], [Chorus], [Bridge], [Outro] 등 Suno AI 규격 태그를 단독 줄에 배치\n' +
            '  - 태그 외 모든 가사 라인은 일본어만 (영어 라인 없음)\n' +
            '  - 태그 최소 2개 이상, 가사 라인 최소 4줄 이상'
          : 'Suno 섹션 태그 사용\n' +
            '  - [Verse], [Pre-Chorus], [Chorus], [Bridge], [Outro] 등 Suno AI 규격 태그를 단독 줄에 배치\n' +
            '  - 태그 최소 2개 이상, 가사 라인 최소 4줄 이상'
        : channel.lyric_format;

  const constraints = [
    `## 출력 제약`,
    forbidden.length > 0
      ? `금지어 (절대 사용 금지): ${forbidden.join(', ')}`
      : null,
    recommended.length > 0
      ? `권장어 (적극 활용): ${recommended.join(', ')}`
      : null,
    `가사 형식: ${lyricFormatDesc}`,
  ]
    .filter(Boolean)
    .join('\n');

  const systemPrompt = lyricLang === 'inst'
    ? channel.system_prompt.replaceAll('{가사언어} 가사', 'Instrumental(가사 없음)')
    : channel.system_prompt.replaceAll('{가사언어}', LANG_LABEL[lyricLang ?? 'ja'] ?? '일본어(한자+독음)')
  return `${systemPrompt}\n\n${constraints}\n\n## 채널 스타일 잠금 (절대 규칙)\n위 채널 페르소나와 음악 스타일 가이드라인은 레퍼런스 트랙 분석 데이터보다 **항상 우선**한다.\n레퍼런스 트랙의 장르(예: Metal, Rock, Hip-hop 등)를 그대로 복사하지 마라.\n레퍼런스 트랙에서 오직 **감정·분위기·BPM·조성**만 차용하고, 음악 스타일은 반드시 이 채널의 장르 가이드라인에 따라 재해석하라.`;
}

const COMMON_LANG_RULES = [
  '2. title_en, suno_style_prompts: English ONLY.',
  '3. narrative: English ONLY, max 10 words. A short mood summary of the song.',
]

const LYRICS_LINE: Record<string, string> = {
  en:   '1. lyrics field: English ONLY.',
  ko:   '1. lyrics field: Korean (Hangul) ONLY.',
  zh:   '1. lyrics field: Chinese (Simplified) ONLY.',
  inst: '1. No lyrics needed — instrumental only. Set lyrics to empty string "".',
}

function buildStrictLangRule(lyricLang?: string | null): string[] {
  if (!lyricLang || lyricLang === 'ja') {
    return [
      '## STRICT LANGUAGE RULE (CRITICAL — violation = instant reject)',
      '1. lyrics field: Japanese ONLY (Kanji + Hiragana + Katakana + furigana). NO Korean (Hangul U+AC00-U+D7AF) allowed.',
      '   - Korean particles MUST NOT appear: 가→が, 의→の, 를→を, 에→に, 는→は, 도→も, 와→と',
      '   - WRONG: `街灯(がいとう)의光` → CORRECT: `街灯(がいとう)の光`',
      '   - WRONG: `孤独(こ독)` → CORRECT: `孤独(こどく)`',
      '   - Instrument/mood directives (e.g. "Electric piano...") must go in Suno tags, NOT in lyrics.',
      ...COMMON_LANG_RULES,
      '4. Furigana must use Hiragana/Katakana ONLY. No Hangul inside furigana parentheses.',
    ]
  }
  const lyricsLine = LYRICS_LINE[lyricLang]
  if (!lyricsLine) return []
  const titleRule = lyricLang === 'ko'
    ? '2. title_en: 한국어 제목 ONLY. suno_style_prompts: English ONLY.'
    : lyricLang === 'zh'
    ? '2. title_en: 中文标题 ONLY. suno_style_prompts: English ONLY.'
    : COMMON_LANG_RULES[0]
  const narrativeRule = lyricLang === 'ko'
    ? '3. narrative: 한국어 ONLY, 최대 10단어. 곡의 분위기를 짧게 요약.'
    : COMMON_LANG_RULES[1]
  const extraRules = (lyricLang === 'zh' || lyricLang === 'en')
    ? ['   - Instrument/mood directives (e.g. "Atmospheric synth swells...") must go in Suno tags, NOT in lyrics.']
    : []
  return ['## STRICT LANGUAGE RULE', lyricsLine, ...extraRules, titleRule, narrativeRule]
}

export function buildUserPrompt(
  emotionInput: string,
  previousFailedOutput?: string,
  failureReason?: string,
  mediaAnalysis?: MediaAnalysis,
  originalRatio: number = 50,
  existingTitles: string[] = [],
  lyricLang?: string | null,
): string {
  const mediaLines: string[] = [];

  // ── 원곡:스타일 비율 지침 ──────────────────────────────────────────────────
  const ratioLabel =
    originalRatio <= 30
      ? '스타일 위주 (원곡 영향 최소화)'
      : originalRatio <= 70
        ? '균형 (원곡과 채널 스타일 동등 반영)'
        : '원곡 밀착 (원곡 감정·구조 최대한 보존)';
  mediaLines.push(`## 원곡:스타일 비율 (${originalRatio}/100)`);
  mediaLines.push(`방향: ${ratioLabel}`);
  if (originalRatio <= 30) {
    mediaLines.push('레퍼런스 트랙의 특성을 최소화하고 채널 고유 스타일을 전면에 내세워라.');
  } else if (originalRatio <= 70) {
    mediaLines.push('레퍼런스 트랙의 감정·BPM·조성을 균형 있게 반영하되 채널 스타일로 재해석하라.');
  } else {
    mediaLines.push('레퍼런스 트랙의 감정·분위기·코드 진행·구조를 최대한 충실히 따라가되 채널 장르 가이드라인 안에서 표현하라.');
  }
  mediaLines.push('');

  // ── 생성 지시 ─────────────────────────────────────────────────────────────
  mediaLines.push('## 생성 지시');
  if (!emotionInput) {
    mediaLines.push(
      '아래 레퍼런스 트랙 분석 결과를 보고, 이 곡에 가장 어울리는 감정 테마를 스스로 결정하라. ' +
      '결정한 테마는 emotion_theme 필드에 한 문장으로 출력하라.',
    );
  } else {
    mediaLines.push(`감정 테마: ${emotionInput}`);
    mediaLines.push('emotion_theme 필드에 위 테마를 한 문장으로 정리하여 출력하라.');
  }
  mediaLines.push('');
  mediaLines.push('### 곡 길이 제약');
  mediaLines.push('가사 구조 전체의 예상 재생 시간: **3분 30초 ~ 3분 50초 (210~230초)**');
  mediaLines.push('목표 길이를 채우기 위해 아래 최소 구조를 반드시 지켜라:');
  mediaLines.push('  - 섹션 최소 8개 이상 (예: Intro → Verse1 → Pre-Chorus → Chorus → Verse2 → Pre-Chorus → Chorus → Bridge → Chorus → Outro)');
  mediaLines.push('  - 각 섹션은 최소 3줄 이상의 가사 포함');
  mediaLines.push('  - Chorus는 최소 2회 반복');
  mediaLines.push('total_duration_sec 필드에 예상 재생 시간(초)을 숫자로 출력하라.');
  mediaLines.push('');
  mediaLines.push('### 가사 표기 규칙');
  mediaLines.push('- 쉼표(,)는 구(句) 단위의 자연스러운 호흡점에만 사용하라. 단어 하나하나마다 붙이지 마라.');
  mediaLines.push('  - 잘못된 예: `朝の, 冷気, 白く, 濁る`');
  mediaLines.push('  - 올바른 예: `朝の冷気, 白く濁る`');
  mediaLines.push('- lyric_note의 "/" 기호는 리듬 힌트일 뿐, 가사에 직접 표기하지 마라.');
  mediaLines.push('');
  mediaLines.push('### 제목 창의성 규칙');
  mediaLines.push('- title_en과 title_jp는 레퍼런스 트랙의 키워드(분위기 단어, 장르 용어 등)를 직접 사용하지 마라.');
  mediaLines.push('- 채널의 감성 세계관에서 독창적인 은유나 시적 표현을 찾아 제목을 짓는다.');
  mediaLines.push('- 같은 단어를 반복 사용하지 않는다. 매번 새로운 시각적·감각적 이미지로 표현하라.');
  if (existingTitles.length > 0) {
    // 최근 20개 제목 직접 금지 (정확한 재사용 방지)
    const recentTitles = existingTitles.slice(0, 20)
    mediaLines.push(`- **이미 사용된 제목 (절대 재사용 금지)**: ${recentTitles.join(', ')}`)
    mediaLines.push('- 위 제목과 동일하거나 유사한 단어 조합을 절대 사용하지 마라.')

    // 빈도 상위 단어 추가 경고 (토큰 절약)
    const stopWords = new Set(['the','a','an','of','in','on','at','to','for','and','or','my','your','no','is','it','this','that','with','from']);
    const wordFreq = new Map<string, number>();
    for (const title of existingTitles) {
      for (const w of title.toLowerCase().split(/[\s\-—:,()]+/).filter(w => w.length >= 2 && !stopWords.has(w))) {
        wordFreq.set(w, (wordFreq.get(w) ?? 0) + 1);
      }
    }
    const topWords = [...wordFreq.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15)
      .map(([w, c]) => c > 1 ? `${w}(${c})` : w);
    if (topWords.length > 0) {
      mediaLines.push(`- **과다 사용된 제목 단어 (사용 금지)**: ${topWords.join(', ')}`);
      mediaLines.push('- 위 단어와 완전히 다른 어휘·이미지를 사용하라.');
    }
  }
  mediaLines.push('');
  mediaLines.push('### Suno 스타일 프롬프트');
  mediaLines.push(
    'suno_style_prompts 배열에 **정확히 5가지 variant**를 생성하라. ' +
    '각 variant는 악기 편성, 무드 표현, 장르 레이블 중 하나 이상을 달리하여 뚜렷이 구분되게 하라. ' +
    '반드시 5개를 채워야 한다.',
  );
  mediaLines.push('');
  mediaLines.push('### 요약(narrative)');
  mediaLines.push(lyricLang === 'ko'
    ? 'narrative field: 한국어 ONLY, 최대 10단어. 곡의 분위기를 짧게 요약.'
    : 'narrative field: English ONLY, max 10 words. A short mood summary of the song.');
  mediaLines.push('');

  if (mediaAnalysis) {
    mediaLines.push('## 레퍼런스 트랙 분석');
    mediaLines.push('> ⚠️ **중요**: 아래 분석은 BPM·조성·감정 키워드만 참고용으로 활용하라.');
    mediaLines.push('> 레퍼런스 트랙의 장르·악기 편성·보컬 스타일을 그대로 복사하지 마라.');
    mediaLines.push('> **음악 스타일과 장르는 반드시 위 시스템 프롬프트(채널 가이드라인)에 따라 결정하라.**');
    mediaLines.push('> 레퍼런스 트랙의 "감정·분위기"를 채널 고유의 스타일로 재해석하는 것이 목표다.');
    mediaLines.push('');

    // ── 1. BPM + 리듬 → 음절 결정 ──────────────────────────────────────────
    if (mediaAnalysis.tempo_bpm != null) {
      mediaLines.push(`### BPM과 리듬 → 가사 음절 결정`);
      mediaLines.push(`템포: ${mediaAnalysis.tempo_bpm} BPM`);
      if (mediaAnalysis.time_signature) {
        mediaLines.push(`박자: ${mediaAnalysis.time_signature}`);
      }
      if (mediaAnalysis.syllables_per_bar_min != null && mediaAnalysis.syllables_per_bar_max != null) {
        mediaLines.push(
          `권장 음절/마디: ${mediaAnalysis.syllables_per_bar_min}~${mediaAnalysis.syllables_per_bar_max}음절` +
          ` — 이 범위를 초과하면 곡의 여백이 무너집니다.`,
        );
      }
    }

    // ── 2. 코드 진행 + 셈여림 → 감정선 ────────────────────────────────────
    const confidence = mediaAnalysis.chord_progression_confidence ?? 1;
    if (confidence >= 0.5) {
      mediaLines.push('');
      mediaLines.push(`### 코드 진행 → 가사 감정선`);
      if (mediaAnalysis.key) mediaLines.push(`조성(Key): ${mediaAnalysis.key}`);
      if (mediaAnalysis.chord_progression?.length) {
        mediaLines.push(`버스 코드: ${mediaAnalysis.chord_progression.join(' → ')}`);
      }
      if (mediaAnalysis.chord_progression_chorus?.length) {
        mediaLines.push(`코러스 코드: ${mediaAnalysis.chord_progression_chorus.join(' → ')}`);
      }
    }

    if (mediaAnalysis.mood?.length) {
      mediaLines.push(`전체 분위기: ${mediaAnalysis.mood.join(', ')}`);
    }
    if (mediaAnalysis.emotional_keywords?.length) {
      mediaLines.push(`감성 키워드: ${mediaAnalysis.emotional_keywords.join(', ')}`);
    }
    if (mediaAnalysis.vocal_recommendation) {
      mediaLines.push(`보컬 방향: ${mediaAnalysis.vocal_recommendation}`);
    }

    // ── 3. 시간별 구간 → 가사 형식(Form) ───────────────────────────────────
    const guide = mediaAnalysis.lyric_structure_guide;
    if (guide?.length) {
      mediaLines.push('');
      mediaLines.push(`### 시간별 구간 → 가사 형식 결정`);
      mediaLines.push(`아래 각 섹션의 지침을 반드시 준수하여 가사를 작성하세요:`);
      mediaLines.push('');
      for (const s of guide) {
        const timeRange = s.time_range ?? '';
        const bars = s.bars != null ? ` (${s.bars}bars)` : '';
        mediaLines.push(`**[${s.section_name}]** ${timeRange}${bars}`);
        mediaLines.push(`  - 화성 특성: ${s.harmonic_character}`);
        mediaLines.push(`  - 권장 음절/마디: ${s.syllables_per_bar}`);
        mediaLines.push(`  - 가사 스타일: ${s.lyric_style}`);
        mediaLines.push(`  - 작성 지침: ${s.lyric_note}`);
        mediaLines.push('');
      }
    } else if (mediaAnalysis.song_sections?.length) {
      // lyric_structure_guide 없으면 song_sections 타임스탬프만이라도 제공
      mediaLines.push('');
      mediaLines.push(`### 곡 구간`);
      for (const s of mediaAnalysis.song_sections) {
        const start = formatTime(s.start_time);
        const end = formatTime(s.end_time);
        const bars = s.bars != null ? ` (${s.bars}bars)` : '';
        mediaLines.push(`  [${s.name}] ${start} ~ ${end}${bars}`);
      }
    }

    mediaLines.push('');
  }

  if (previousFailedOutput && failureReason) {
    // 금지어 실패인 경우 해당 단어를 명시적으로 강조
    const isForbiddenWordFailure = failureReason.startsWith('금지어 포함:')
    const forbiddenWordWarning = isForbiddenWordFailure
      ? [`## ⛔ FORBIDDEN WORD VIOLATION — CRITICAL`,
         `다음 단어는 절대 사용 금지 (이전 출력에서 발견됨): **${failureReason.replace('금지어 포함: ', '')}**`,
         `이 단어 및 유사 표현을 완전히 대체하는 새로운 표현을 사용하라.`,
         ``]
      : []
    return [
      ...mediaLines,
      ...forbiddenWordWarning,
      `이전 출력이 아래 이유로 거부되었습니다: ${failureReason}`,
      ``,
      `거부된 출력:`,
      `---`,
      previousFailedOutput,
      `---`,
      ``,
      `위 문제를 반드시 수정하여 다시 생성해 주세요.`,
      ``,
      `감정/분위기 입력: ${emotionInput}`,
      ``,
      ...buildStrictLangRule(lyricLang),
    ].join('\n');
  }

  return [
    ...mediaLines,
    emotionInput ? `감정/분위기 입력: ${emotionInput}` : '',
    '',
    ...buildStrictLangRule(lyricLang),
  ].join('\n');
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}
