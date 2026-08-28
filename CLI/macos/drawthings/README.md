# Draw Things gRPCServerCLI

这是 Infinite-Canvas 的 Draw Things gRPCServerCLI 独立依赖说明，仅适用于 macOS Apple Silicon（M 芯片）。Draw Things gRPCServerCLI 需要由用户单独启动，Infinite-Canvas 只负责连接已运行的服务。

Draw Things gRPCServerCLI 借助了
https://github.com/drawthingsai/draw-things-comfyui.git 这个comfyui插件代码的能力。

当前版本已将 Draw Things gRPC 所需的协议文件和客户端代码放在本目录中，不再运行时调用或依赖 `draw-things-comfyui` 插件，也不需要启动 ComfyUI。只需在画布所使用的 Python 环境中安装下面列出的 Python 依赖。
## 安装gPRCServerCLI 
以下是drawthings作者编译好的gPRCServerCLI执行文件下载地址
https://github.com/drawthingsai/draw-things-community/releases  
参考drawthings作者GitHub仓库中的安装方法安装：
```
Self-host gRPCServerCLI from Packaged Binaries

We provide pre-built self-hosted gRPCServerCLI binaries through this repository. Latest version should be available at Releases.

These pre-built binaries provide a quick way to host Draw Things gRPC Server on your Mac or Linux systems without download the Draw Things app. Draw Things app then can connect to these self-hosted servers through Server-Offload feature within your network.

macOS

On macOS, simply download the gRPCServerCLI-macOS on your macOS systems. You can put it under /usr/local/bin or anywhere you feel comfortable, and launch it with:

gRPCServerCLI-macOS /the-path-to-host-the-models
If you have Draw Things app installed, you can simply refer the model path by doing:

gRPCServerCLI-macOS ~/Library/Containers/com.liuliu.draw-things/Data/Documents/Models
```

## 安装依赖

请在 Infinite-Canvas 项目根目录执行。建议使用 conda 或 Miniforge 创建的独立环境，不要把这些依赖追加到项目根目录的 `requirements.txt`。

```bash
python -m pip install -r CLI/macos/drawthings/requirements-Dt-gRPC.txt
```

也可以明确使用当前环境的 Python：

```bash
/Users/hanqingren/miniforge3/bin/python -m pip install -r CLI/macos/drawthings/requirements-Dt-gRPC.txt
```

## 启动服务

### 方法1（推荐）  
直接启动gPRCServerCLI（drawthings的模型路径没改动的话直接执行以下命令）不用开启drawthings本身   
```
gRPCServerCLI ~/Library/Containers/com.liuliu.draw-things/Data/Documents/Models --model-browser
```
默认连接地址为 `127.0.0.1:7859`，TLS 默认开启  
注：（如果启动服务时使用了自定义主机或端口，请在 Infinite-Canvas 的 Draw Things gRPC 设置中填写对应的 `主机:端口`。）  
### 方法2  
先在 Draw Things 中启动 gRPCServerCLI。

## 大雄画布中的API设置

在 Infinite-Canvas 的 API 设置中添加 Draw Things gRPCServerCLI provider 后，再选择实际连接到 gRPCServerCLI 的本地路径和端口号。  
模型列表由后端实时读取，不在画布节点中固定保存模型名称。

该连接目前用于图片生成、单图图生图和 Hint 多图编辑，不提供聊天模型能力。Hint 最多支持四张图片，每张图片可在画布节点中独立设置控制类型。


<img width="1282" height="727" alt="image" src="https://github.com/user-attachments/assets/2424ae77-a8cf-4773-b7a3-45ff94e352d0" />
<img width="721" height="572" alt="image" src="https://github.com/user-attachments/assets/17d7d44d-e442-47d7-9ab3-5af508acf70d" />
