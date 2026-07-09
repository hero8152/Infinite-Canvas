import asyncio
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
import main as app


async def _assert_video_url_reference_is_preserved():
    original = app.video_reference_to_frame_data_urls
    original_upload = app.upload_local_video_to_cloud

    async def fake_frame_extract(*_args, **_kwargs):
        return ["data:image/jpeg;base64,ZmFrZQ=="]

    async def fake_upload(ref_url, service="auto"):
        assert ref_url == "/assets/input/ref.mp4"
        assert service == "auto"
        return {"url": "https://cdn.example.com/uploaded.mp4"}

    app.video_reference_to_frame_data_urls = fake_frame_extract
    app.upload_local_video_to_cloud = fake_upload
    try:
        items = await app.volcengine_video_reference_content_items("https://cdn.example.com/ref.mp4")
        assert items == [{
            "type": "video_url",
            "video_url": {"url": "https://cdn.example.com/ref.mp4"},
            "role": "reference_video",
        }]

        uploaded_url = await app.volcengine_video_reference_url("/assets/input/ref.mp4")
        assert uploaded_url == "https://cdn.example.com/uploaded.mp4"
    finally:
        app.video_reference_to_frame_data_urls = original
        app.upload_local_video_to_cloud = original_upload


if __name__ == "__main__":
    asyncio.run(_assert_video_url_reference_is_preserved())
