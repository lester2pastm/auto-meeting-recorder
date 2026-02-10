# 项目规则与经验

## 核心规则

1. **不要手动创建 Release** - 项目使用 GitHub Actions 自动构建，推送 `v*` tag 即可
2. **CI/CD 前先检查配置** - 执行部署相关操作前，先查看 `.github/workflows/`
3. **Linux 依赖** - 需要 `xdg-desktop-portal` 才能录制系统音频

## 经验总结

### 2026-02-02 - GitHub Actions
**教训**：执行 CI/CD 前先检查 `.github/workflows/` 配置，不要假设工作流程

### 2026-02-10 - PowerShell命令执行
**教训**：PowerShell不支持 `&&` 操作符，需要分步执行命令；Git commit message使用英文避免编码问题

### 2026-02-10 - 代码清理与PowerShell参数陷阱
**教训**：
1. **代码清理必须深度验证** - 使用 `grep` 搜索所有引用，确认变量/函数确实未被使用
2. **PowerShell Git commit message 陷阱** - 避免使用 `remove`、`clean`、`cleanup`、`delete` 等关键词，会被误认为是 PowerShell 命令
3. **解决方案** - 使用中文描述或安全的英文词（`update`、`fix`、`refactor`），或使用 `--message="..."` 格式

## 如何更新本文件

- 说"总结本次经验"或"更新项目规则"
- 完成重要任务后我会主动询问
- 保持精简，只记录核心要点
