-- 021: midi_draft_rows에 가사언어/가사번역 컬럼 추가
ALTER TABLE midi_draft_rows ADD COLUMN lyric_lang TEXT CHECK(lyric_lang IN ('en','ja','ko','zh','inst'));
ALTER TABLE midi_draft_rows ADD COLUMN lyric_trans TEXT CHECK(lyric_trans IN ('en','ja','ko','zh','none'));
