"""S3 service: owns every project file's actual content. Postgres (via
`metadata_service.py`) never sees bytes -- only the `s3_key` this service
hands back.

Uses `boto3` (sync SDK, like `docker_service.py`/the old `supabase_service.py`
before it), so every call is pushed through `asyncio.to_thread` to keep the
FastAPI event loop free.

Objects are keyed by the file's stable node id, not its human-readable path
-- see `project_storage_service.py` -- so renaming/moving a file is a
metadata-only write with zero S3 traffic.
"""

import asyncio

import boto3
from botocore.config import Config
from botocore.exceptions import BotoCoreError, ClientError

from app.config import get_settings
from app.utils.exceptions import S3StorageError
from app.utils.logger import get_logger

logger = get_logger(__name__)


class S3Service:
    """Backend-only client for the project-files S3 bucket."""

    def __init__(
        self,
        bucket: str,
        region: str,
        access_key_id: str,
        secret_access_key: str,
        endpoint_url: str,
        prefix: str,
    ) -> None:
        self._bucket = bucket
        self._region = region
        self._access_key_id = access_key_id
        self._secret_access_key = secret_access_key
        self._endpoint_url = endpoint_url or None
        self._prefix = prefix.strip("/")
        self._client = None

    def _client_or_raise(self):
        if not self._bucket or not self._access_key_id or not self._secret_access_key:
            raise S3StorageError(
                "S3 is not configured (AWS_BUCKET_NAME / AWS_ACCESS_KEY_ID / "
                "AWS_SECRET_ACCESS_KEY missing)"
            )
        if self._client is None:
            self._client = boto3.client(
                "s3",
                region_name=self._region or None,
                aws_access_key_id=self._access_key_id,
                aws_secret_access_key=self._secret_access_key,
                endpoint_url=self._endpoint_url,
                config=Config(signature_version="s3v4"),
            )
        return self._client

    def object_key(self, *parts: str) -> str:
        """Build a bucket key under this service's prefix, e.g.
        `object_key(project_id, "files", node_id, f"v{version}")` ->
        `projects/{project_id}/files/{node_id}/v{version}`."""

        return "/".join([self._prefix, *parts])

    def _upload_sync(self, key: str, data: bytes, content_type: str) -> None:
        client = self._client_or_raise()
        try:
            client.put_object(
                Bucket=self._bucket,
                Key=key,
                Body=data,
                ContentType=content_type,
                ServerSideEncryption="AES256",
            )
        except (ClientError, BotoCoreError) as exc:
            raise S3StorageError(f"Failed to upload S3 object '{key}': {exc}") from exc

    def _download_sync(self, key: str) -> bytes:
        client = self._client_or_raise()
        try:
            response = client.get_object(Bucket=self._bucket, Key=key)
            return response["Body"].read()
        except (ClientError, BotoCoreError) as exc:
            raise S3StorageError(f"Failed to download S3 object '{key}': {exc}") from exc

    def _delete_sync(self, key: str) -> None:
        client = self._client_or_raise()
        try:
            client.delete_object(Bucket=self._bucket, Key=key)
        except (ClientError, BotoCoreError) as exc:
            raise S3StorageError(f"Failed to delete S3 object '{key}': {exc}") from exc

    def _delete_prefix_sync(self, prefix: str) -> int:
        client = self._client_or_raise()
        deleted = 0
        try:
            paginator = client.get_paginator("list_objects_v2")
            for page in paginator.paginate(Bucket=self._bucket, Prefix=prefix):
                keys = [{"Key": obj["Key"]} for obj in page.get("Contents", [])]
                if not keys:
                    continue
                client.delete_objects(Bucket=self._bucket, Delete={"Objects": keys})
                deleted += len(keys)
        except (ClientError, BotoCoreError) as exc:
            raise S3StorageError(f"Failed to delete S3 objects under '{prefix}': {exc}") from exc
        return deleted

    async def upload_bytes(self, key: str, data: bytes, content_type: str = "application/octet-stream") -> None:
        await asyncio.to_thread(self._upload_sync, key, data, content_type)

    async def download_bytes(self, key: str) -> bytes:
        return await asyncio.to_thread(self._download_sync, key)

    async def delete_object(self, key: str) -> None:
        await asyncio.to_thread(self._delete_sync, key)

    async def delete_prefix(self, prefix: str) -> int:
        """Delete every object under `prefix`. Returns the count removed --
        used by project delete (`projects/{project_id}/`)."""

        return await asyncio.to_thread(self._delete_prefix_sync, prefix)


def get_s3_service() -> "S3Service":
    """FastAPI dependency provider for S3Service."""

    return s3_service


settings = get_settings()
s3_service = S3Service(
    bucket=settings.aws_bucket_name,
    region=settings.aws_region,
    access_key_id=settings.aws_access_key_id,
    secret_access_key=settings.aws_secret_access_key,
    endpoint_url=settings.s3_endpoint_url,
    prefix=settings.s3_prefix,
)
