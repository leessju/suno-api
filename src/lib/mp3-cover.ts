/**
 * MP3 파일의 ID3v2 태그에서 앨범 아트(APIC/PIC 프레임)를 추출합니다.
 * 외부 라이브러리 없이 순수 JS로 파싱. ID3v2.2 / v2.3 / v2.4 지원.
 * @returns Object URL (사용 후 URL.revokeObjectURL로 해제 필요) 또는 null
 */
export async function extractMp3Cover(file: File): Promise<string | null> {
  try {
    // 앨범 아트는 보통 파일 앞부분에 있음 — 최대 512KB만 읽음
    const slice = file.slice(0, 512 * 1024)
    const buffer = await slice.arrayBuffer()
    const bytes = new Uint8Array(buffer)

    // ID3v2 시그니처 확인
    if (bytes[0] !== 0x49 || bytes[1] !== 0x44 || bytes[2] !== 0x33) return null

    const version = bytes[3] // 2, 3, 4
    // synchsafe integer로 태그 전체 크기 파싱
    const tagSize =
      ((bytes[6] & 0x7f) << 21) |
      ((bytes[7] & 0x7f) << 14) |
      ((bytes[8] & 0x7f) << 7) |
      (bytes[9] & 0x7f)

    const isV2 = version === 2
    const frameIdLen = isV2 ? 3 : 4
    const frameSizeLen = isV2 ? 3 : 4
    // v2.2에는 프레임 플래그 2바이트 없음
    const frameHeaderExtra = isV2 ? 0 : 2

    let offset = 10
    const limit = Math.min(tagSize + 10, bytes.length)

    while (offset + frameIdLen + frameSizeLen + frameHeaderExtra < limit) {
      const frameId = String.fromCharCode(...bytes.slice(offset, offset + frameIdLen))

      // null padding이나 알 수 없는 프레임이면 종료
      if (frameId[0] === '\0') break

      let frameSize: number
      if (isV2) {
        frameSize = (bytes[offset + 3] << 16) | (bytes[offset + 4] << 8) | bytes[offset + 5]
      } else if (version === 4) {
        // ID3v2.4: synchsafe integer
        frameSize =
          ((bytes[offset + 4] & 0x7f) << 21) |
          ((bytes[offset + 5] & 0x7f) << 14) |
          ((bytes[offset + 6] & 0x7f) << 7) |
          (bytes[offset + 7] & 0x7f)
      } else {
        // ID3v2.3: 일반 32비트 정수
        frameSize =
          (bytes[offset + 4] << 24) |
          (bytes[offset + 5] << 16) |
          (bytes[offset + 6] << 8) |
          bytes[offset + 7]
      }

      if (frameSize <= 0) break

      const totalHeaderLen = frameIdLen + frameSizeLen + frameHeaderExtra
      const frameStart = offset + totalHeaderLen

      if (frameId === 'APIC' || frameId === 'PIC') {
        let pos = frameStart
        const encoding = bytes[pos++]

        if (isV2) {
          // v2.2: 3문자 포맷 ("JPG", "PNG")
          pos += 3
        } else {
          // v2.3/v2.4: MIME 타입 (null-terminated ASCII)
          while (pos < bytes.length && bytes[pos] !== 0) pos++
          pos++ // null
        }

        pos++ // picture type byte

        // description (null-terminated, encoding에 따라 1바이트 또는 2바이트 null)
        if (encoding === 1 || encoding === 2) {
          // UTF-16: 2바이트 null terminator
          while (pos + 1 < bytes.length && !(bytes[pos] === 0 && bytes[pos + 1] === 0)) pos += 2
          pos += 2
        } else {
          // Latin-1 / UTF-8: 1바이트 null terminator
          while (pos < bytes.length && bytes[pos] !== 0) pos++
          pos++
        }

        const imageEnd = frameStart + frameSize
        if (pos < imageEnd && imageEnd <= bytes.length) {
          const imageBytes = bytes.slice(pos, imageEnd)
          const blob = new Blob([imageBytes])
          return URL.createObjectURL(blob)
        }
      }

      offset += totalHeaderLen + frameSize
    }
  } catch {
    // 파싱 실패는 조용히 무시
  }

  return null
}
