import asyncio
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
import main as app


def _assert_local_audio_is_accepted_for_cloud_upload():
    original_file = app.output_file_from_url
    original_type = app.content_type_for_path
    app.output_file_from_url = lambda _url: __file__
    app.content_type_for_path = lambda _path: "audio/mpeg"
    try:
        assert app.local_media_path_for_cloud_upload("/assets/input/ref.mp3") == __file__
    finally:
        app.output_file_from_url = original_file
        app.content_type_for_path = original_type


async def _assert_video_url_reference_is_preserved():
    original = app.video_reference_to_frame_data_urls
    original_upload = app.upload_local_video_to_cloud

    async def fake_frame_extract(*_args, **_kwargs):
        return ["data:image/jpeg;base64,ZmFrZQ=="]

    async def fake_upload(ref_url, service="auto"):
        assert ref_url in {"/assets/input/ref.mp4", "/assets/input/ref.mp3"}
        assert service == "auto"
        return {"url": f"https://cdn.example.com/uploaded{os.path.splitext(ref_url)[1]}"}

    app.video_reference_to_frame_data_urls = fake_frame_extract
    app.upload_local_video_to_cloud = fake_upload
    try:
        items = await app.volcengine_video_reference_content_items("https://cdn.example.com/ref.mp4")
        assert items == [{
            "type": "video_url",
            "video_url": {"url": "https://cdn.example.com/ref.mp4"},
            "role": "reference_video",
        }]

        uploaded_url = await app.volcengine_public_media_reference_url("/assets/input/ref.mp4")
        assert uploaded_url == "https://cdn.example.com/uploaded.mp4"
        uploaded_audio_url = await app.volcengine_public_media_reference_url("/assets/input/ref.mp3")
        assert uploaded_audio_url == "https://cdn.example.com/uploaded.mp3"
    finally:
        app.video_reference_to_frame_data_urls = original
        app.upload_local_video_to_cloud = original_upload


async def _assert_prompt_and_video_reach_volcengine_as_multimodal_content():
    original_provider = app.get_api_provider
    original_key = app.provider_env_key_value
    original_client = app.httpx.AsyncClient
    original_save = app.save_remote_video_to_output
    posted = {}

    class FakeResponse:
        status_code = 200
        text = '{"videos":["https://cdn.example.com/output.mp4"]}'

        def json(self):
            return {"videos": ["https://cdn.example.com/output.mp4"]}

        def raise_for_status(self):
            return None

    class FakeClient:
        def __init__(self, *args, **kwargs):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            return False

        async def post(self, url, **kwargs):
            posted["url"] = url
            posted["json"] = kwargs.get("json")
            return FakeResponse()

    async def fake_save(url):
        return url

    app.get_api_provider = lambda _provider_id: {
        "id": "volcengine",
        "name": "Volcengine",
        "protocol": "volcengine",
        "base_url": "https://ark.cn-beijing.volces.com/api/v3",
    }
    app.provider_env_key_value = lambda _provider_id: "test-key"
    app.httpx.AsyncClient = FakeClient
    app.save_remote_video_to_output = fake_save
    try:
        await app.canvas_video(app.CanvasVideoRequest(
            prompt="Follow the camera movement from video 1",
            provider_id="volcengine",
            model="doubao-seedance-2-0-260128",
            images=[app.AIReference(url="https://cdn.example.com/reference.png")],
            videos=["https://cdn.example.com/reference.mp4"],
            audios=["https://cdn.example.com/reference.mp3"],
        ))
        assert posted["url"].endswith("/api/v3/contents/generations/tasks")
        assert posted["json"]["content"] == [
            {
                "type": "text",
                "text": "Follow the camera movement from video 1",
            },
            {
                "type": "image_url",
                "image_url": {"url": "https://cdn.example.com/reference.png"},
                "role": "reference_image",
            },
            {
                "type": "video_url",
                "video_url": {"url": "https://cdn.example.com/reference.mp4"},
                "role": "reference_video",
            },
            {
                "type": "audio_url",
                "audio_url": {"url": "https://cdn.example.com/reference.mp3"},
                "role": "reference_audio",
            },
        ]

        await app.canvas_video(app.CanvasVideoRequest(
            prompt="Animate this image",
            provider_id="volcengine",
            model="doubao-seedance-2-0-260128",
            images=[app.AIReference(
                url="https://cdn.example.com/reference.png",
                role="first_frame",
            )],
            videos=[""],
            audios=[""],
        ))
        assert posted["json"]["content"] == [
            {
                "type": "text",
                "text": "Animate this image",
            },
            {
                "type": "image_url",
                "image_url": {"url": "https://cdn.example.com/reference.png"},
                "role": "first_frame",
            },
        ]
    finally:
        app.get_api_provider = original_provider
        app.provider_env_key_value = original_key
        app.httpx.AsyncClient = original_client
        app.save_remote_video_to_output = original_save


if __name__ == "__main__":
    _assert_local_audio_is_accepted_for_cloud_upload()
    asyncio.run(_assert_video_url_reference_is_preserved())
    asyncio.run(_assert_prompt_and_video_reach_volcengine_as_multimodal_content())
