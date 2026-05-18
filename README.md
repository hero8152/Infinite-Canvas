# Infinite-Canvas
Supports comfyui/API calls/modelscope calls

## Agent-friendly custom API setup

This repo supports custom OpenAI-compatible and APIMart-style API providers from both the web UI and an agent-safe CLI.

```bash
export API_PROVIDER_CUSTOM_API_KEY="sk-..."
python3 scripts/configure_provider.py \
  --id custom-api \
  --name "Custom API" \
  --base-url "https://api.example.com/v1" \
  --protocol openai \
  --api-key-env API_PROVIDER_CUSTOM_API_KEY \
  --image-model gpt-image-2 \
  --chat-model gpt-5.5
```

Secrets are written to ignored `API/.env`; provider metadata is written to ignored `data/api_providers.json`. Remote provider URLs should use `https://`; the CLI and backend only allow `http://` for local endpoints like `127.0.0.1`. See `docs/AGENT_PROVIDER_SETUP.md` and `docs/API.md`.

详细教程：[https://youtu.be/1y9ShTvgC_w](https://youtu.be/r_y_9ALr7fg)

由于最近很多API网址关停，我找到一个稳定的网址：

https://apimart.ai/register?aff=1uyAbb

【折扣码（daxiong）首次充值9折，可开发票。】


5/13日更新：
1. 修复了安装依赖的报错
2. 增加了更便捷的API设置方式，现在可以全程在网页中设置，并且可以拉取模型一键添加
3. LLM节点支持图片输入反推，可以使用modelscope的VL模型测试
4. 增加了中英文切换
5. 增加了自定义comfyui工作流的功能，可以自己设置需要的输入和要调整的参数，可以在无限画布的comfyui节点中调用。
6. 增加了视频生成功能
7. 修复了2k/4k生成报错问题
8. 新增了生成节点可以通过output前后连接一键生成

5/14日更新：
1. 修复mac的一些bug
2. modelscope支持lora调用
3. 支持OpenAI协议和异步协议（生成失败不扣费）

5/15日更新：
1. 增加了循环组件和计数功能，可以将节点循环/并发运行N次，同时有提示词计数功能，可以设置提示词为：运行第二张卖点图。
用法可以是：使用Gemini生成产品10个卖点提示词。用循环节点，增加提示词：运行第X张卖点图，输入给API节点，调用GPT生成，就可以一次性并发生成10个卖点图。
2. 增加协议的验证按键，可以方便的验证自己的API平台是什么协议
3. 修复了LLM节点的一些bug
4. 上传了精简版的python，运行“安装依赖.bat”，完成之后，运行"run.bat"
   
-----

Detailed tutorial: [https://youtu.be/1y9ShTvgC_w](https://youtu.be/r_y_9ALr7fg)

Due to the recent shutdown of many API websites, I found a stable one:

https://apimart.ai/register?aff=1uyAbb

[Discount code (daxiong): 10% off your first top-up, invoice available.]


May 13th Update:

1. Fixed dependency installation errors.

2. Added a more convenient API setup method; settings can now be configured entirely through the webpage, and models can be added with a single click.

3. LLM nodes support image input for reverse engineering; VL models from ModelScope can be used for testing.

4. Added Chinese/English switching functionality.

5. Added the ability to customize ComfyUI workflows; users can set their own inputs and adjust parameters, and these workflows can be invoked within ComfyUI nodes on an infinite canvas.

6. Added video generation functionality.

7. Fixed 2K/4K generation error issues.

8. Added the ability to generate videos with a single click by connecting output nodes before and after.

May 14th Update:

1. Fixed some bugs on Mac.

2. ModelScope supports LoRa calls.

3. Supports OpenAI protocol and asynchronous protocol (no charge for generation failures).

May 15th Update:

1. Added a loop component and counting function, allowing nodes to run concurrently N times. It also includes a prompt word counting function, where the prompt word can be set to: "Run the second selling point image."

Usage: Use Gemini to generate 10 selling point prompt words for a product. Use the loop node, add the prompt word: "Run the Xth selling point image," input it to the API node, call GPT to generate, and you can generate 10 selling point images concurrently at once.

2. Added a protocol verification button for easy verification of your API platform's protocol.

3. Fixed some bugs in the LLM node.

4. Uploaded a simplified version of Python. Run "安装依赖.bat", and then run "run.bat".



<img width="1696" height="1350" alt="b68e144c5b04a322bfd035da4d89aba3" src="https://github.com/user-attachments/assets/0a6090fb-a8dd-4c3d-adee-b1f9233a2d91" />

   
<img width="1525" height="1473" alt="image" src="https://github.com/user-attachments/assets/6f61fcf9-746c-425b-9e36-cfc8d252da7c" />

   <img width="1261" height="864" alt="image" src="https://github.com/user-attachments/assets/57f3e230-3134-488f-8179-d97e7d15383a" />
<img width="1530" height="858" alt="image" src="https://github.com/user-attachments/assets/9990e42d-22d5-4a10-a1e1-ad35a634edd2" />

<img width="1735" height="1400" alt="image" src="https://github.com/user-attachments/assets/d8328ff8-bbe0-4f1c-9ffa-7b56e8a1a51d" />
<img width="2258" height="969" alt="image" src="https://github.com/user-attachments/assets/4a752d99-885d-4ba9-8b86-91b495786b5c" />


<img width="1531" height="1374" alt="image" src="https://github.com/user-attachments/assets/0af79e38-0955-4740-9e65-5c9bb057f58c" />

<img width="2196" height="1040" alt="image" src="https://github.com/user-attachments/assets/6d823668-cde2-4836-8332-1858efe5f520" />
<img width="2214" height="771" alt="image" src="https://github.com/user-attachments/assets/52e10958-753f-45ba-a50e-3bbec27be436" />
