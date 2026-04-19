CREATE TABLE IF NOT EXISTS gem_global_settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at INTEGER NOT NULL DEFAULT 0
);

INSERT OR IGNORE INTO gem_global_settings (key, value, updated_at) VALUES
  ('music_analysis_system_prompt', '당신은 음악 분석 전문가입니다. 입력된 음악의 BPM, 키, 장르, 감성, 코드 진행을 분석하고 커버 음악 제작을 위한 상세 메타데이터를 제공합니다.', 0);

INSERT OR IGNORE INTO gem_global_settings (key, value, updated_at) VALUES
  ('music_lyrics_system_prompt', '원곡의 장르, 분위기, 보컬 스타일을 충실히 반영하여 가사와 Suno 스타일 프롬프트를 생성합니다. 채널 고유 스타일이 아닌 원곡 자체의 음악적 특성을 우선합니다.', 0);
