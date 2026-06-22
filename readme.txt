1. API Website Registration:

https://ai.comfly.chat/register?aff=HAOj137551

2. Create an API key:

https://ai.comfly.chat/token

3. Fill in the key in the .env file of the software's API directory:

COMFLY_API_KEY=sk-xxxxx

4. Create a ModelScope API key (for international users, the domain is modelscope.ai; for international users, please ask Codex to modify it):

https://www.modelscope.cn/my/access/token

5. Fill in the key in the .env file of the API directory:

MODELSCOPE_API_KEY=ms-xxxx

6. If calling a local ComfyUI, ensure all workflows in the workflows directory can run normally locally.

7. If the default port for your local ComfyUI is 8188, you don't need to modify this value. Currently, this value reads the GPUs on ports 8188 and 4090. If you have multiple GPUs, you can modify the port number.

COMFYUI_INSTANCES=127.0.0.1:8188,127.0.0.1:4090

----Instructions-----

Source folder: run "run.bat" directly. If dependencies are missing, run "Install Dependencies.bat".

Windows portable test bundle: unzip the whole folder and run "启动 Infinite Canvas.bat". The portable bundle already includes an embedded Python runtime and dependencies, so testers do not need to install Python or download packages.

---Error Troubleshooting---

For any errors, you can install Codex Installer.exe. Select this folder and let Codex resolve the runtime issues. Free accounts have a weekly free quota.
