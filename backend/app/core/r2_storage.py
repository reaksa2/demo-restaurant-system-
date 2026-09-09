import uuid

import boto3
from botocore.config import Config

from app.core.config import settings


def _r2_client():
    return boto3.client(
        "s3",
        endpoint_url=f"https://{settings.R2_ACCOUNT_ID}.r2.cloudflarestorage.com",
        aws_access_key_id=settings.R2_ACCESS_KEY_ID,
        aws_secret_access_key=settings.R2_SECRET_ACCESS_KEY,
        config=Config(signature_version="s3v4"),
        region_name="auto",
    )


def upload_to_r2(file_bytes: bytes, extension: str, content_type: str) -> str:
    """
    Uploads a file to the configured R2 bucket and returns its permanent
    public URL. Raises on failure — callers should catch and surface a clean
    error, since a failed upload should never silently succeed.
    """
    filename = f"{uuid.uuid4()}{extension}"
    client = _r2_client()
    client.put_object(
        Bucket=settings.R2_BUCKET_NAME,
        Key=filename,
        Body=file_bytes,
        ContentType=content_type,
    )
    return f"{settings.R2_PUBLIC_URL.rstrip('/')}/{filename}"
