"""
R2 (S3-compatible) 업로드/다운로드 유틸리티
환경변수 우선, 없으면 DB(gem_global_settings)에서 R2 설정 로드
"""

import os
import sqlite3
import boto3
from pathlib import Path

_DB_PATH = Path('data') / 'music-gen.db'


def _get_setting(key: str) -> str | None:
    """DB gem_global_settings에서 값을 조회"""
    try:
        conn = sqlite3.connect(str(_DB_PATH))
        row = conn.execute('SELECT value FROM gem_global_settings WHERE key = ?', (key,)).fetchone()
        conn.close()
        return row[0] if row else None
    except Exception:
        return None


def _get_client():
    access_key = os.environ.get('R2_ACCESS_KEY_ID') or _get_setting('sys_r2_access_key_id')
    secret_key = os.environ.get('R2_SECRET_ACCESS_KEY') or _get_setting('sys_r2_secret_access_key')
    endpoint = os.environ.get('R2_ENDPOINT') or _get_setting('sys_r2_endpoint')

    if not access_key or not secret_key or not endpoint:
        raise RuntimeError(
            'R2 설정을 찾을 수 없습니다. '
            'env(R2_ACCESS_KEY_ID 등) 또는 DB(sys_r2_* 키)를 확인하세요.'
        )

    return boto3.client(
        's3',
        region_name='auto',
        endpoint_url=endpoint,
        aws_access_key_id=access_key,
        aws_secret_access_key=secret_key,
    )


def _get_bucket() -> str:
    bucket = os.environ.get('R2_BUCKET_NAME') or _get_setting('sys_r2_bucket_name')
    if not bucket:
        raise RuntimeError('R2_BUCKET_NAME 설정을 찾을 수 없습니다.')
    return bucket


def upload_file(local_path: str | Path, r2_key: str, content_type: str = 'audio/mpeg') -> str:
    """로컬 파일을 R2에 업로드하고 R2 key를 반환합니다."""
    client = _get_client()
    bucket = _get_bucket()

    with open(local_path, 'rb') as f:
        client.put_object(
            Bucket=bucket,
            Key=r2_key,
            Body=f,
            ContentType=content_type,
        )

    return r2_key


def upload_bytes(data: bytes, r2_key: str, content_type: str = 'application/octet-stream') -> str:
    """바이트 데이터를 R2에 업로드하고 R2 key를 반환합니다."""
    client = _get_client()
    bucket = _get_bucket()

    client.put_object(
        Bucket=bucket,
        Key=r2_key,
        Body=data,
        ContentType=content_type,
    )

    return r2_key


def download_file(r2_key: str, local_path: str | Path) -> Path:
    """R2에서 파일을 다운로드합니다."""
    client = _get_client()
    bucket = _get_bucket()
    local_path = Path(local_path)
    local_path.parent.mkdir(parents=True, exist_ok=True)
    client.download_file(bucket, r2_key, str(local_path))
    return local_path


def r2_available() -> bool:
    """R2 설정(env 또는 DB)이 모두 있는지 확인합니다."""
    return all([
        os.environ.get('R2_ACCESS_KEY_ID') or _get_setting('sys_r2_access_key_id'),
        os.environ.get('R2_SECRET_ACCESS_KEY') or _get_setting('sys_r2_secret_access_key'),
        os.environ.get('R2_ENDPOINT') or _get_setting('sys_r2_endpoint'),
        os.environ.get('R2_BUCKET_NAME') or _get_setting('sys_r2_bucket_name'),
    ])
