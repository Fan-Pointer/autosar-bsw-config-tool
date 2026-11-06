# 桌面快捷方式交付

2026-11-06，用户直接要求：“快捷方式放桌面，更新配置器时维护快捷方式”。这是独立启动入口工作，不改变 TASK-014 已提交业务代码或其评审绑定。

- 桌面文件：`C:\Users\Pointer\Desktop\BSW 配置器.lnk`。
- 目标：系统 Windows PowerShell，`-NoProfile -WindowStyle Hidden -File <repo>/scripts/desktop/Start-Configurator.ps1`。
- 启动器定位所在仓库，检查本地服务；需要时隐藏启动 Node/Vite；默认浏览器打开 `http://localhost:3000/workspace`。
- 固定连接源码，不复制 dist 或固定版本。Node.js 和已安装依赖须保留；不依赖 Codex/WorkBuddy 运行，不创建开机自启，不更改系统执行策略。
- `Install-DesktopShortcut.ps1` 可重新生成同名入口；AGENTS 第 8 节记录每次交付检查、迁移时更新入口的用户要求。

## 实际验证

1. Windows PowerShell 直接运行启动器的 `-NoBrowser`：识别并复用已有 3000 服务，输出 Ready。
2. 空闲 3014 端口冷启动：新 Node PID 27380，响应正确项目 package.json，输出 Ready。
3. 再次调用 3014：复用同一进程，没有再次启动；核对进程命令行为本仓库 server.mjs 和 3014 后关闭该隔离进程。原 3000 服务不受影响。
4. 安装脚本成功写入桌面 .lnk；COM 读回核验 TargetPath、Arguments、WorkingDirectory、Description。
5. 初次 localhost 健康检查超时导致误判端口忙；修复为 IPv4 回环健康检查，浏览器入口仍为 localhost，随后上述验证通过。
6. 沙箱内 Windows PowerShell 注册表/本机套接字访问受限；使用已授权的扩展执行验证通过，没有 ExecutionPolicy Bypass 或修改策略。

启动器测试没有打开浏览器或写配置库。用户双击会打开系统默认浏览器，与 Codex 内置浏览器的本机存储各自独立，此限制已在使用说明告知。

TASK-014 保持 SUBMITTED / `ccb8f12832ba76512d749203eefe2da98c516a58`；右键子容器菜单仍待后续契约实现，本次未声称修复。
