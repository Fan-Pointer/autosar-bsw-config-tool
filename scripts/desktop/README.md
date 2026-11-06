# 桌面入口

桌面快捷方式为 **BSW 配置器.lnk**。双击后打开系统默认浏览器的
`http://localhost:3000/workspace`；服务未启动时，后台启动当前仓库的 Vite。
已运行时复用服务，不另占端口。启动失败弹出原因，日志在 `.temp/desktop-launcher/3000/`。

入口读取仓库当前源码，没有复制固定版本。常规代码更新后重新打开/刷新即可看到更新。
本机需保留仓库、Node.js 和 node_modules；不需要保持 Codex 或 WorkBuddy 开着。
电脑关闭时停止服务，下次双击会重新启动。不设置开机自启。

创建或修复桌面快捷方式：

```powershell
powershell -NoProfile -File scripts/desktop/Install-DesktopShortcut.ps1
```

验证启动（不打开浏览器）：

```powershell
powershell -NoProfile -File scripts/desktop/Start-Configurator.ps1 -NoBrowser
```

固定使用 localhost:3000，以保持同一浏览器内现有配置库的来源地址。
不同浏览器的本机配置库各自独立；首次在默认浏览器打开时，原来在 Codex 内置浏览器保存的工程不会自动复制。
项目根目录移动、入口路径/端口/依赖或启动方式变化时，维护者应同步更新启动器并重新执行安装脚本。
普通更新无需重复复制快捷方式。遇到系统执行策略限制时应报告，不自动绕过或更改系统策略。

维护验证可用 `-NoBrowser -Port 3014` 在空闲端口启动隔离服务，并在验证后按返回 PID 关闭该测试进程；桌面入口始终使用默认 3000。
