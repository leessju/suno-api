"""
R2 (S3-compatible) 업로드/다운로드 유틸리티
환경 변수: R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_ENDPOINT, R2_BUCKET_NAME
"""

import os
import boto3
from pathlib import Path


def _get_client():
    access_key = os.environ.get('R2_ACCESS_KEY_ID')
    secret_key = os.environ.get('R2_SECRET_ACCESS_KEY')
    endpoint = os.environ.get('R2_ENDPOINT')

    if not access_key or not secret_key or not endpoint:
        raise RuntimeError(
            'R2 환경 변수가 설정되지 않았습니다. '
            'R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_ENDPOINT를 확인하세요.'
        )

    return boto3.client(
        's3',
        region_name='auto',
        endpoint_url=endpoint,
        aws_access_key_id=access_key,
        aws_secret_access_key=secret_key,
    )


def _get_bucket() -> str:
    bucket = os.environ.get('R2_BUCKET_NAME')
    if not bucket:
        raise RuntimeError('R2_BUCKET_NAME 환경 변수가 설정되지 않았습니다.')
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


def r2_available() -> bool:
    """R2 환경 변수가 모두 설정되어 있는지 확인합니다."""
    return all([
        os.environ.get('R2_ACCESS_KEY_ID'),
        os.environ.get('R2_SECRET_ACCESS_KEY'),
        os.environ.get('R2_ENDPOINT'),
        os.environ.get('R2_BUCKET_NAME'),
    ])
