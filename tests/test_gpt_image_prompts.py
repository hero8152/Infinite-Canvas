import os
import tempfile
import unittest
from unittest import mock

from fastapi.testclient import TestClient

import main


SAMPLE_CASE_MARKDOWN = """
# 🎨 海报与插画案例

### Case 2: [Vintage Amalfi Travel Poster](https://x.com/WolfRiccardo/status/2044562722491121718) (by [@WolfRiccardo](https://x.com/WolfRiccardo))

| 输出效果 |
| :----: |
| <a href="https://evolink.ai/gpt-image-2-prompts" target="_blank" rel="noopener noreferrer"><img src="https://raw.githubusercontent.com/EvoLinkAI/awesome-gpt-image-2-API-and-Prompts/main/images/poster_case2/output.jpg" width="300" alt="输出图像"></a> |

**提示词：**

```
Modern pencil illustration of a vintage travel poster for the Amalfi Coast, Italy, panoramic coastal cliff road scene, classic 1960s white car, bright blue sky, lemon tree branches, warm summer sunlight, retro 1950s travel poster style.
```
"""

GENERIC_MARKDOWN = """
# Neon Poster Pack

## Convenience Store Neon Portrait

![preview](https://example.com/neon.jpg)

Prompt:

```
35mm film photography with harsh convenience store fluorescent lighting mixed with colorful neon signs from outside.
```

## Browser Game Ad Creative Poster

<img src="https://example.com/game.jpg" width="300">

```
Create a 1:1 promotional poster that feels like it was designed by a professional ad designer.
```
"""


class GptImagePromptParserTests(unittest.TestCase):
    def test_parse_gpt_image_prompt_cases_extracts_visual_card_fields(self):
        items = main.parse_gpt_image_prompt_cases(SAMPLE_CASE_MARKDOWN, "poster_zh-CN.md")

        self.assertEqual(len(items), 1)
        item = items[0]
        self.assertEqual(item["id"], "gpt_image_poster_case_2")
        self.assertEqual(item["name"], "Vintage Amalfi Travel Poster")
        self.assertEqual(item["category"], "gpt_image_poster")
        self.assertEqual(item["category_name"], "海报与插画")
        self.assertEqual(item["author"], "@WolfRiccardo")
        self.assertEqual(item["source_url"], "https://x.com/WolfRiccardo/status/2044562722491121718")
        self.assertEqual(
            item["image_url"],
            "https://raw.githubusercontent.com/EvoLinkAI/awesome-gpt-image-2-API-and-Prompts/main/images/poster_case2/output.jpg",
        )
        self.assertEqual(item["motion"], "static")
        self.assertIn("travel poster", item["tags"])
        self.assertIn("Amalfi Coast", item["positive"])

    def test_sync_gpt_image_prompts_writes_cache_and_endpoint_exposes_library(self):
        with tempfile.TemporaryDirectory() as tmp:
            cache_path = os.path.join(tmp, "gpt_image_prompts.json")
            prompt_path = os.path.join(tmp, "prompt_libraries.json")
            with (
                mock.patch("main.GPT_IMAGE_PROMPTS_PATH", cache_path),
                mock.patch("main.PROMPT_LIBRARY_PATH", prompt_path),
                mock.patch("main.fetch_gpt_image_prompt_case_texts", return_value={"poster_zh-CN.md": SAMPLE_CASE_MARKDOWN}),
            ):
                sync_result = main.sync_gpt_image_prompts()
                self.assertEqual(sync_result["count"], 1)
                self.assertTrue(os.path.exists(cache_path))

                client = TestClient(main.app)
                response = client.get("/api/prompt-libraries")

        self.assertEqual(response.status_code, 200)
        libraries = response.json()["library"]["libraries"]
        gpt_library = next(item for item in libraries if item["id"] == "gpt-image-2")
        self.assertTrue(gpt_library["readonly"])
        self.assertEqual(gpt_library["name"], "GPT Image 2 案例库")
        self.assertEqual(gpt_library["items"][0]["id"], "gpt_image_poster_case_2")
        self.assertEqual(gpt_library["items"][0]["image_url"], "https://raw.githubusercontent.com/EvoLinkAI/awesome-gpt-image-2-API-and-Prompts/main/images/poster_case2/output.jpg")

    def test_favorite_toggle_marks_public_prompt_item(self):
        with tempfile.TemporaryDirectory() as tmp:
            cache_path = os.path.join(tmp, "gpt_image_prompts.json")
            prompt_path = os.path.join(tmp, "prompt_libraries.json")
            with (
                mock.patch("main.GPT_IMAGE_PROMPTS_PATH", cache_path),
                mock.patch("main.PROMPT_LIBRARY_PATH", prompt_path),
                mock.patch("main.fetch_gpt_image_prompt_case_texts", return_value={"poster_zh-CN.md": SAMPLE_CASE_MARKDOWN}),
            ):
                main.sync_gpt_image_prompts()
                client = TestClient(main.app)
                response = client.post(
                    "/api/prompt-libraries/favorites",
                    json={"library_id": "gpt-image-2", "item_id": "gpt_image_poster_case_2", "favorite": True},
                )
                self.assertEqual(response.status_code, 200)
                libraries = response.json()["library"]["libraries"]
                gpt_library = next(item for item in libraries if item["id"] == "gpt-image-2")
                self.assertTrue(gpt_library["items"][0]["favorite"])

                response = client.get("/api/prompt-libraries")
                gpt_library = next(item for item in response.json()["library"]["libraries"] if item["id"] == "gpt-image-2")
                self.assertTrue(gpt_library["items"][0]["favorite"])

    def test_install_github_prompt_library_parses_generic_markdown_as_readonly_library(self):
        with tempfile.TemporaryDirectory() as tmp:
            prompt_path = os.path.join(tmp, "prompt_libraries.json")
            cache_path = os.path.join(tmp, "gpt_image_prompts.json")
            with (
                mock.patch("main.PROMPT_LIBRARY_PATH", prompt_path),
                mock.patch("main.GPT_IMAGE_PROMPTS_PATH", cache_path),
                mock.patch("main.fetch_github_prompt_library_markdowns", return_value={"README.md": GENERIC_MARKDOWN}),
            ):
                client = TestClient(main.app)
                response = client.post(
                    "/api/prompt-libraries/github/install",
                    json={"url": "https://github.com/example/neon-prompts"},
                )

        self.assertEqual(response.status_code, 200)
        library = response.json()["prompt_library"]
        self.assertTrue(library["readonly"])
        self.assertEqual(library["id"], "github_example_neon-prompts")
        self.assertEqual(library["source_url"], "https://github.com/example/neon-prompts")
        self.assertEqual(len(library["items"]), 2)
        self.assertEqual(library["items"][0]["name"], "Convenience Store Neon Portrait")
        self.assertEqual(library["items"][0]["image_url"], "https://example.com/neon.jpg")

    def test_sync_github_prompt_library_refreshes_existing_remote_library(self):
        with tempfile.TemporaryDirectory() as tmp:
            prompt_path = os.path.join(tmp, "prompt_libraries.json")
            cache_path = os.path.join(tmp, "gpt_image_prompts.json")
            with (
                mock.patch("main.PROMPT_LIBRARY_PATH", prompt_path),
                mock.patch("main.GPT_IMAGE_PROMPTS_PATH", cache_path),
                mock.patch("main.fetch_github_prompt_library_markdowns", side_effect=[
                    {"README.md": GENERIC_MARKDOWN},
                    {"README.md": GENERIC_MARKDOWN.replace("Browser Game Ad Creative Poster", "Updated Browser Game Poster")},
                ]),
            ):
                client = TestClient(main.app)
                install = client.post("/api/prompt-libraries/github/install", json={"url": "https://github.com/example/neon-prompts"})
                library_id = install.json()["prompt_library"]["id"]
                response = client.post(f"/api/prompt-libraries/{library_id}/sync")

        self.assertEqual(response.status_code, 200)
        library = response.json()["prompt_library"]
        self.assertEqual(library["items"][1]["name"], "Updated Browser Game Poster")


if __name__ == "__main__":
    unittest.main()
