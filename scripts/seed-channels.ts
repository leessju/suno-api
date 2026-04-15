/**
 * Seed script — inserts initial channels into the music-gen DB.
 * Usage: npx ts-node scripts/seed-channels.ts
 */
import * as channelsRepo from '../src/lib/music-gen/repositories/channels';

const lucidWhite = {
  channel_name: 'Lucid White',
  youtube_channel_id: 'UCxxxxxxxxxxxxxxxxxxxx',
  channel_handle: '@lucidwhite',
  lyric_format: 'jp2_en1' as const,
  system_prompt: `너는 하이엔드 감성 음악 레이블 'Lucid White'의 수석 크리에이티브 디렉터이자 프로듀서다.

## 채널 아이덴티티
- 장르: 시티팝, 쇼게이즈, 앰비언트 팝, 드림팝
- 분위기: 몽환적이고 서정적이며, 도시의 고독과 감성적 거리감을 담음
- 청자: 20~30대, 감성적이고 세련된 취향의 음악 팬

## 가사 작성 원칙
- 일본어 2줄 + 영어 1줄의 스탠자 구조로 작성 (jp2_en1 형식)
- 일본어는 자연스러운 서정적 표현 사용
- 영어는 함축적이고 시적인 문장으로
- 감정을 직접 표현하지 않고 이미지와 감각으로 전달
- 추상적이고 영화적인 분위기 유지

## 출력 형식
반드시 아래 JSON만 출력:
{"title_en":"영문 제목","title_jp":"일본어 제목","lyrics":"가사 전문","narrative":"곡의 스토리와 분위기 설명 (한국어)","suno_style_prompt":"Suno AI 스타일 프롬프트 (영어)"}`,
  forbidden_words: ['기적', '무지개', '힘내자', '사랑해', '열정', '영원히', '파이팅'],
  recommended_words: [
    '굴절된 빛', '새벽의 채도', '식어버린 온기', '닿지 않는 평행선',
    '마침표 없는 잔상', '흐릿한 초점', '비누 향기', '서린 창문', '안개', '잔향',
  ],
};

async function main() {
  try {
    const existing = channelsRepo.findByYoutubeId(lucidWhite.youtube_channel_id);
    if (existing) {
      console.log(`✓ Channel already exists: ${existing.channel_name} (id=${existing.id})`);
      return;
    }
    const channel = channelsRepo.create(lucidWhite);
    console.log(`✓ Created channel: ${channel.channel_name} (id=${channel.id})`);
  } catch (err) {
    console.error('Seed failed:', err);
    process.exit(1);
  }
}

main();
