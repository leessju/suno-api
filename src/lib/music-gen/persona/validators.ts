/**
 * CJK 비율 기반 라인 분류 및 가사 구조 검증
 * jp2_en1: [JP 2줄 + EN 1줄] × N연 (N≥2)
 */

const CJK_REGEX = /[\u3000-\u9FFF\uF900-\uFAFF\uAC00-\uD7AF]/g;
// 한국어(Hangul) 범위 — 일본어 가사에 혼입되면 안 됨
const HANGUL_REGEX = /[\uAC00-\uD7AF\u1100-\u11FF\u3130-\u318F]/g;
const ASCII_PRINTABLE_REGEX = /[\x20-\x7E]/g;

function cjkRatio(line: string): number {
  const trimmed = line.trim();
  if (!trimmed) return 0;
  const cjkCount = (trimmed.match(CJK_REGEX) ?? []).length;
  return cjkCount / trimmed.length;
}

function asciiRatio(line: string): number {
  const trimmed = line.trim();
  if (!trimmed) return 0;
  const asciiCount = (trimmed.match(ASCII_PRINTABLE_REGEX) ?? []).length;
  return asciiCount / trimmed.length;
}

type LineType = 'jp' | 'en' | 'other';

function classifyLine(line: string): LineType {
  const trimmed = line.trim();
  if (!trimmed) return 'other';
  if (cjkRatio(trimmed) >= 0.4) return 'jp';
  if (asciiRatio(trimmed) >= 0.7) return 'en';
  return 'other';
}

export function validateForbiddenWords(
  text: string,
  forbiddenWords: string[],
): { valid: boolean; foundWords: string[] } {
  const foundWords = forbiddenWords.filter((w) => text.includes(w));
  return { valid: foundWords.length === 0, foundWords };
}

export function validateLyrics(
  text: string,
  lyricFormat: string,
): { valid: boolean; violations: string[] } {
  if (lyricFormat === 'free') {
    return { valid: true, violations: [] };
  }

  if (lyricFormat === 'jp2_en1') {
    return validateJp2En1(text);
  }

  if (lyricFormat === 'jp_tagged') {
    return validateJpTagged(text);
  }

  // 알 수 없는 형식 — 검증 스킵
  return { valid: true, violations: [] };
}

function validateJp2En1(text: string): { valid: boolean; violations: string[] } {
  const violations: string[] = [];
  const lines = text.split('\n');

  // 비어 있지 않은 라인만 추출, 빈 줄로 스탠자 구분
  const stanzas: string[][] = [];
  let current: string[] = [];
  for (const line of lines) {
    if (line.trim() === '') {
      if (current.length > 0) {
        stanzas.push(current);
        current = [];
      }
    } else {
      current.push(line.trim());
    }
  }
  if (current.length > 0) stanzas.push(current);

  if (stanzas.length < 2) {
    violations.push(`스탠자 수 부족: ${stanzas.length}개 (최소 2개 필요)`);
    return { valid: false, violations };
  }

  stanzas.forEach((stanza, idx) => {
    const stanzaNum = idx + 1;
    if (stanza.length !== 3) {
      violations.push(`스탠자 ${stanzaNum}: 라인 수 ${stanza.length} (jp2+en1=3줄 필요)`);
      return;
    }
    const types = stanza.map(classifyLine);
    if (types[0] !== 'jp') {
      violations.push(`스탠자 ${stanzaNum} 1번 줄: JP 라인 아님 (CJK비율<0.4) — "${stanza[0]}"`);
    }
    if (types[1] !== 'jp') {
      violations.push(`스탠자 ${stanzaNum} 2번 줄: JP 라인 아님 (CJK비율<0.4) — "${stanza[1]}"`);
    }
    if (types[2] !== 'en') {
      violations.push(`스탠자 ${stanzaNum} 3번 줄: EN 라인 아님 (ASCII비율<0.7) — "${stanza[2]}"`);
    }
  });

  return { valid: violations.length === 0, violations };
}

function validateJpTagged(text: string): { valid: boolean; violations: string[] } {
  const violations: string[] = [];
  const lines = text.split('\n');

  let tagCount = 0;
  let lyricLineCount = 0;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // 섹션 태그 라인: [Verse], [Chorus] 등
    if (/^\[.+\]$/.test(trimmed)) {
      tagCount++;
      continue;
    }

    // 가사 라인: 일본어(CJK) 비율 >= 0.4 + 한국어 혼입 금지
    lyricLineCount++;
    if (cjkRatio(trimmed) < 0.4) {
      violations.push(`비일본어 라인: "${trimmed}"`);
    }
    const hangulMatches = trimmed.match(HANGUL_REGEX) ?? [];
    if (hangulMatches.length > 0) {
      violations.push(`한국어 혼입 감지: "${trimmed}" (한글 ${hangulMatches.length}자)`);
    }
  }

  if (tagCount < 2) {
    violations.push(`섹션 태그 부족: ${tagCount}개 (최소 2개 필요)`);
  }
  if (lyricLineCount < 4) {
    violations.push(`가사 라인 부족: ${lyricLineCount}줄 (최소 4줄 필요)`);
  }

  return { valid: violations.length === 0, violations };
}
