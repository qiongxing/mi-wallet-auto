# 小米钱包 - 玩家视界每日任务自动化

基于 AutoJs6 的小米钱包“玩家视界”每日领会员及加速任务自动化脚本。

## 功能特性

- **自动导航**：优先通过负一屏底部“去领会员”启动，支持桌面手势及钱包应用兜底。
- **自动视频与开奖**：自动观看激励视频、开大红包、轮转“再看10秒”，达成上限后自动切入任务列表。
- **安全做任务**：自动执行浏览类任务，内置安全黑名单自动跳过下载、借贷、开通等任务。
- **自愈与防中断**：自动放行 HyperOS 跨应用跳转授权，异常跳出后自动拉回钱包前台。
- **批量收割**：任务完成后自动领取所有已达成的奖励。

## 运行要求

- **环境**：Android 13+ / Xiaomi HyperOS (已适配 HyperOS 2 / Android 15)
- **工具**：[AutoJs6](https://github.com/SuperMonster-So/AutoJs6)
- **权限**：无障碍服务、悬浮窗权限、后台弹出界面

## 使用步骤

1. 打开 **AutoJs6**，开启 **无障碍服务** 与 **悬浮窗权限**。
2. 将 [mi_wallet_tasks.js](file:///d:/Project/mi_wallet_tasks/mi_wallet_tasks.js) 导入 AutoJs6。
3. 保持屏幕解锁，直接点击运行脚本即可。

## 配置说明

如需修改停留时长或黑名单词汇，可在 [mi_wallet_tasks.js](file:///d:/Project/mi_wallet_tasks/mi_wallet_tasks.js) 顶部修改 `CONFIG`：

```javascript
var CONFIG = {
    browseDurationSec: 17,          // 深度浏览停留秒数
    watchDurationSec: 13,           // 视频观看停留秒数
    maxRepeatWatchCycles: 6,        // 连续再看视频上限
    blacklistTasks: ["下载", "安装", "充值", "开通", "借款", "办卡", "投资", "购买"] // 跳过任务
};
```

## 免责声明

本项目仅供自动化测试与学习研究使用，严禁用于商业用途。

## 开源协议

本项目采用 [MIT License](LICENSE) 开源协议。

