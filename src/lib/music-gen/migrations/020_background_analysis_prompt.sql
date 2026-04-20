-- 020: background_analysis_system_prompt 초기 시드
INSERT OR IGNORE INTO gem_global_settings (key, value, updated_at) VALUES
  ('background_analysis_system_prompt', 'Gemini가 배경음(MR/반주)을 분석할 때 사용하는 프롬프트입니다.', 0);
