# Infinite-Canvas
Supports comfyui/API calls/modelscope calls

配套的chrome采集插件已经上线：https://chromewebstore.google.com/detail/infinite-canvas-%E5%9B%BE%E5%83%8F%E8%A7%86%E9%A2%91%E6%96%87%E5%AD%97%E6%8A%93%E5%8F%96%E5%B7%A5/ajfhnbklbmpfaaookhfakohabnpmlcic?authuser=0&hl=en

详细教程：[https://youtu.be/1y9ShTvgC_w](https://youtu.be/r_y_9ALr7fg)

由于最近很多API网址关停，我找到一个稳定的网址：

https://apib.ai/register?aff=1uyAbb （包含所有生图模型/视频模型/LLM模型）

https://www.fhl.mom/register?aff=86L574B4T2N9  （包含codex和GPT image 2模型）

功能请求/功能更新/视频教程/联系我，都可以在B站评论或私信：https://space.bilibili.com/78652351


----

【新增了version文件，我每次更新都会更新version的版本号，如果你下载version文件，打开项目后，导航栏的GitHub按键就会提示新版本，如果不想查看更新提示，就删除version文件】

【A version file has been added. I update the version number with each update. If you download the version file, the GitHub button in the navigation bar will indicate the new version after opening the project. If you don't want to see update notifications, delete the version file.】

----

支持的功能：
1. 支持几乎所有OpenAI协议的API/异步协议/Gemini协议/方舟协议
2. RunningHub的工作流/AI应用/收费模型调用
3. 火山引擎调用（人脸认证还在修复bug）
4. Modelscope免费LLM模型和图像模型调用
5. 即梦CLI调用，可直接调用即梦高级会员的积分，支持文生图/图生图/文生视频/图生视频
6. 支持调用本地局域网的ComfyUI
7. 扩展图片/360全景图预览截图/视频帧抽取/循环节点等诸多功能
8. tools文件夹中，增加了chrome批量采集到素材库的插件，PS直连画布调用所有功能的插件

--------

已经申请著作权，禁止商业用途

Commercial use is prohibited.


* 可以自己使用和公司使用，禁止用于任何形式的修改封装成商业产品，商用须取得授权。

* 根据代码二次开发的软件必须保持开源并注明来源作者

* This software is for personal and company use only, but is prohibited from being modified or packaged into commercial products in any way. Commercial use requires authorization.

* Software developed based on this code must remain open source and the original author must be credited.

--------


<img width="2079" height="665" alt="image" src="https://github.com/user-attachments/assets/8469923b-f7a2-403c-9c37-e6e789211f28" />

<img width="1865" height="1503" alt="image" src="https://github.com/user-attachments/assets/f4030201-67c6-4845-b08b-b6fdf304afaa" />


<img width="1696" height="1350" alt="b68e144c5b04a322bfd035da4d89aba3" src="https://github.com/user-attachments/assets/0a6090fb-a8dd-4c3d-adee-b1f9233a2d91" />

   
<img width="1525" height="1473" alt="image" src="https://github.com/user-attachments/assets/6f61fcf9-746c-425b-9e36-cfc8d252da7c" />

   <img width="1261" height="864" alt="image" src="https://github.com/user-attachments/assets/57f3e230-3134-488f-8179-d97e7d15383a" />
<img width="1530" height="858" alt="image" src="https://github.com/user-attachments/assets/9990e42d-22d5-4a10-a1e1-ad35a634edd2" />

<img width="1735" height="1400" alt="image" src="https://github.com/user-attachments/assets/d8328ff8-bbe0-4f1c-9ffa-7b56e8a1a51d" />
<img width="2258" height="969" alt="image" src="https://github.com/user-attachments/assets/4a752d99-885d-4ba9-8b86-91b495786b5c" />


<img width="1531" height="1374" alt="image" src="https://github.com/user-attachments/assets/0af79e38-0955-4740-9e65-5c9bb057f58c" />

<img width="2196" height="1040" alt="image" src="https://github.com/user-attachments/assets/6d823668-cde2-4836-8332-1858efe5f520" />
<img width="2214" height="771" alt="image" src="https://github.com/user-attachments/assets/52e10958-753f-45ba-a50e-3bbec27be436" />

----

## Linux / Docker 部署

项目默认监听 `0.0.0.0:3000`，Windows（`run.bat`）、macOS（`mac-启动服务.sh`）请参考原有说明，下面补充 Linux 与 Docker 两种方式。

### Linux 直接运行

```bash
git clone https://github.com/hero8152/Infinite-Canvas.git
cd Infinite-Canvas

# 1. 安装系统图像库依赖 + 创建 .venv 并安装 Python 依赖
bash install.sh

# 2. 启动（默认 http://127.0.0.1:3000/）
bash start.sh
```

`install.sh` 会自动识别 `apt`/`dnf`/`yum` 安装 Pillow 需要的系统库，并把所有 Python 依赖装进 `.venv`。若 `install.sh` 需要权限会提示输入 sudo 密码。

### Docker Compose 运行

需要本机装有 Docker 与 Docker Compose 插件。

```bash
# 在项目根目录
docker compose up -d --build

# 查看日志
docker compose logs -f
```

- 服务监听 `3000`，访问 `http://127.0.0.1:3000/`。
- 停止：`docker compose down`（命名卷数据会保留）。
- 数据持久化：画布/会话/素材库（`data`）、生成结果（`output`、`assets`）以及 `global_config.json`、`history.json`、`API/.env` 均通过命名卷持久化，删除/重建容器数据不丢失。
- 重新拉取/重建：`docker compose up -d --build`。

> 说明：`data/output/assets`、`global_config.json`、`history.json`、`API/.env` 属于运行时数据，已加入 `.gitignore`，不再纳入版本控制。

#### 容器内访问宿主机服务（本地 ComfyUI）

容器与宿主机网络是隔离的：容器内 `127.0.0.1:8188` 指向容器自身，**访问不到宿主机上的 ComfyUI**。若要在 Docker 部署中使用本机 ComfyUI：

- 请在项目左下角的 ComfyUI 设置里，把地址填为 `http://host.docker.internal:8188`（compose 已通过 `extra_hosts` 提供该域名，Linux Docker 20.10+ 可用）；
- 不要把地址填成 `127.0.0.1:8188`，否则会报 `Connection refused`；
- 若 ComfyUI 部署在另一台机器上，则直接填那台机器的 IP，如 `http://192.168.1.10:8188`。

#### WebSocket 依赖

`requirements.txt` 已包含 `websockets`（WebSocket 库）。若日志出现 `No supported WebSocket library detected` 或 `/ws/stats` 返回 404，说明运行环境的 WebSocket 库缺失，执行 `python -m pip install websockets`（Docker 方式重建镜像 `docker compose up -d --build`）即可。
