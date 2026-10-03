# 小米钱包 - 玩家视界每日任务自动化

基于 AutoJs6 的小米钱包“玩家视界”每日领会员时长自动化脚本。

## 功能特性

- **智能穿透导航**：支持从多页桌面循环向右滑动穿透至负一屏，结合底部常驻 Dock 栏与搜索胶囊实现排他性状态判定，避开小部件误判；基于系统级黄金 ID 锚点 `video_member_btn` 毫秒级锁定并点击入口。
- **自动视频与终态终止**：自动观看激励视频、开大红包、轮转“再看10秒”；当弹窗按钮变为“做任务 领时长”时，精准判定今日会员时长已全额领满，直接圆满结束全流程。
- **防跨应用死锁与自愈**：自动放行 HyperOS 跨应用跳转授权；跳转至第三方应用（如抖音、闲鱼）采用硬性超时熔断，防返回键拦截，依据权威包名状态强制拉回钱包前台。
- **扩展任务与安全黑名单**：内置安全黑名单机制，自动跳过下载、安装、借贷、理财、开通等高危交互任务。

## 运行要求

- **系统环境**：Android 13+ / Xiaomi HyperOS (已深度适配 HyperOS 2 / Android 15)
- **运行工具**：[AutoJs6](https://github.com/SuperMonster-So/AutoJs6)
- **必要权限**：无障碍服务、悬浮窗权限、后台弹出界面

## 使用步骤

1. 打开 **AutoJs6**，开启 **无障碍服务** 与 **悬浮窗权限**。
2. 将 [mi_wallet_tasks.js](mi_wallet_tasks.js) 导入 AutoJs6。
3. 保持屏幕解锁，直接点击运行脚本即可。

## 配置说明

如需修改桌面右划次数、停留时长或黑名单词汇，可在 [mi_wallet_tasks.js](mi_wallet_tasks.js) 顶部修改 `CONFIG`：

```javascript
var CONFIG = {
    packageName: "com.mipay.wallet",                // 小米钱包主包名
    assistantPackage: "com.miui.personalassistant", // 负一屏（智能助理）包名
    maxRightSwipes: 10,                            // 桌面切入负一屏的最大向右滑动次数 (识别到负一屏即提前停止)
    maxScrollAttempts: 8,                          // 负一屏内寻找底部入口的最大向下滑动次数 (检索到入口即提前停止)
    browseDurationSec: 17,                         // 深度浏览任务的停留交互秒数
    watchDurationSec: 13,                          // 激励视频观看的实际安全停留秒数
    maxTaskCycles: 12,                             // 单轮任务列表轮询的最大任务数上限
    maxRepeatWatchCycles: 6,                       // 连续观看激励视频与再看领取的最大轮次上限
    blacklistTasks: [                              // 高危与黑名单任务关键词 (匹配即跳过)
        "下载", "安装", "充值", "开通", "借款", "办卡", "投资", "购买"
    ]
};
```

## 免责声明

本项目仅供自动化测试与学习研究使用，严禁用于商业用途。

## 开源协议

本项目采用 [MIT License](LICENSE) 开源协议。
