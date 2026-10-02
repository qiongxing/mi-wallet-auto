/**
 * 小米钱包 - 玩家视界每日任务自动化脚本 (ES5 兼容版)
 * 适配环境: AutoJs6 (Rhino 引擎) / Android 15 (HyperOS 2)
 * 更新说明:
 *  1. 准确捕获“做任务 领时长”终态标志：识别到该文案立即判定所有视频观看已全部完成并终止视频循环；
 *  2. 点击“做任务 领时长”顺畅切入后续任务列表（浏览任务与最终领奖）；
 *  3. 完善弹窗开奖与多轮再看激励链路。
 */

// 全局配置参数
var CONFIG = {
    packageName: "com.mipay.wallet",
    assistantPackage: "com.miui.personalassistant", // 负一屏（智能助理）包名
    browseDurationSec: 17, // 深度浏览任务停留时长
    watchDurationSec: 13, // 广告观看实际安全停留时长
    maxTaskCycles: 12, // 最大单轮任务循环上限
    maxRepeatWatchCycles: 6, // 最大连续“再看10秒继续领”轮次，防止死循环
    swipeIntervalMs: 2500, // 浏览时滑动间隔
    actionTimeoutMs: 5000, // 基础元素查找超时
    // 高危与黑名单任务关键词，匹配即跳过
    blacklistTasks: [
        "下载",
        "安装",
        "充值",
        "开通",
        "借款",
        "办卡",
        "投资",
        "购买",
    ],
};

/**
 * 健壮性点击工具：逐级向父节点回溯可点击属性，最后回退至控件物理中心坐标点击
 */
function safeClick(node) {
    if (!node) return false;
    if (node.clickable && node.click()) {
        return true;
    }
    // 递归查找可点击的父级 ViewGroup
    var current = node.parent();
    var depth = 0;
    while (current && depth < 4) {
        if (current.clickable && current.click()) {
            return true;
        }
        current = current.parent();
        depth++;
    }
    // 兜底方案：计算控件在屏幕上的物理中心点坐标并点击
    var bounds = node.bounds();
    if (bounds && bounds.width() > 0 && bounds.height() > 0) {
        return click(bounds.centerX(), bounds.centerY());
    }
    return false;
}

function WalletTaskManager() {
    this.processedTaskTitles = {};
}

/**
 * 校验无障碍与悬浮窗运行上下文
 */
WalletTaskManager.prototype.initEnvironment = function () {
    console.show();
    console.setTitle("玩家视界任务执行器");
    console.log("正在校验运行权限...");

    auto.waitFor(); // 确保无障碍服务已启动
    device.keepScreenDim(600 * 1000); // 运行期间保持屏幕常亮
    console.log("环境就绪，准备调度应用。");
};

/**
 * 核心拦截：处理 HyperOS 跨应用互跳授权弹窗（例如：钱包 想要打开 闲鱼）
 */
WalletTaskManager.prototype.handleAppLaunchPermission = function () {
    var allowBtn =
        text("本次允许").visibleToUser(true).findOnce() ||
        text("允许").visibleToUser(true).findOnce() ||
        text("始终允许").visibleToUser(true).findOnce();

    if (allowBtn) {
        console.log(
            "检测到系统授权弹窗，主动点击 [" + allowBtn.text() + "] 放行跳转...",
        );
        safeClick(allowBtn);
        sleep(3000); // 等待目标第三方应用加载到前台
        return true;
    }
    return false;
};

/**
 * 核心拦截：处理“领取奖励”大红包弹窗与“開”字按钮
 */
WalletTaskManager.prototype.handleRedPacketPopup = function () {
    var rewardTitle =
        textContains("领取奖励").visibleToUser(true).findOnce() ||
        descContains("领取奖励").visibleToUser(true).findOnce();

    if (rewardTitle || text("開").exists() || text("开").exists()) {
        console.log("检测到 [领取奖励] 红包浮层，准备开奖...");

        // 优先匹配中心“開”/“开”字按钮
        var openBtn =
            textMatches(/^(開|开)$/)
                .visibleToUser(true)
                .findOnce() ||
            descMatches(/^(開|开)$/)
                .visibleToUser(true)
                .findOnce();

        if (openBtn) {
            console.log("找到红包 [開] 按钮，执行点击...");
            safeClick(openBtn);
            sleep(2500);
        } else {
            console.log("未直接捕获到 [開] 文本节点，执行红包物理中心盲点...");
            click(Math.floor(device.width / 2), Math.floor(device.height * 0.44));
            sleep(2500);
        }

        // 开奖完成后若出现“再看10秒 继续领会员”，保留弹窗以便连环领取
        if (textContains("再看").exists() || textContains("继续领会员").exists()) {
            console.log("开奖完成，检测到支持 [继续领取]，保持弹窗...");
            return true;
        }

        return true;
    }
    return false;
};

/**
 * 防御性弹窗关闭（业务签到成功、通告蒙层、圆圈叉号等）
 * 注意：当弹窗存在“再看10秒 继续领会员”时自动豁免，不触发关闭
 */
WalletTaskManager.prototype.dismissPopups = function () {
    this.handleAppLaunchPermission();

    // 豁免保护：存在继续领会员按钮时不点关闭
    if (textContains("再看").exists() || textContains("继续领会员").exists()) {
        return;
    }

    var closeKeywords = ["关闭", "我知道了", "开心收下", "放弃", "取消"];
    for (var i = 0; i < closeKeywords.length; i++) {
        var kw = closeKeywords[i];
        var closeBtn = text(kw).visibleToUser(true).findOnce();
        if (closeBtn) {
            console.log("检测到业务干扰弹窗 [" + kw + "]，正在关闭...");
            safeClick(closeBtn);
            sleep(1000);
        }
    }

    // 匹配红包或弹窗底部的关闭图标 (X)
    var closeIcon =
        descMatches(/关闭|close/i)
            .visibleToUser(true)
            .findOnce() ||
        idMatches(/.*close.*/)
            .visibleToUser(true)
            .findOnce();
    if (closeIcon) {
        safeClick(closeIcon);
        sleep(1000);
    }
};

/**
 * 入口重构：从 HyperOS 负一屏最底部进入“玩家视界”
 */
WalletTaskManager.prototype.launchFromNegativeOneScreen = function () {
    console.log("检查当前页面状态...");
    this.dismissPopups();

    // 检查是否已经在“玩家视界”页面
    if (text("玩家视界").exists() || textContains("我的会员时长").exists()) {
        console.log("当前已处于 [玩家视界] 目标页面，跳过前置导航。");
        return;
    }

    console.log("尝试唤起负一屏（智能助理）...");
    var launched = app.launchPackage(CONFIG.assistantPackage);
    sleep(2000);

    // 校验是否成功进入负一屏，若未直接拉起则通过桌面右划手势进入
    if (
        !textContains("去支付").exists() &&
        !textContains("生活小助手").exists() &&
        !textContains("视界").exists()
    ) {
        console.log("通过包名未拉起负一屏，切换为桌面手势：回到主页并向右滑动...");
        home();
        sleep(1500);
        swipe(
            80,
            Math.floor(device.height / 2),
            Math.floor(device.width * 0.85),
            Math.floor(device.height / 2),
            350,
        );
        sleep(2500);
    }

    console.log("向下滑动至负一屏最底部寻找 [去领会员]...");
    var foundEntrance = false;

    for (var scroll = 0; scroll < 6; scroll++) {
        var entranceBtn =
            text("去领会员").visibleToUser(true).findOnce() ||
            desc("去领会员").visibleToUser(true).findOnce();

        if (entranceBtn) {
            console.log("成功在负一屏底部定位到 [去领会员]，点击进入...");
            safeClick(entranceBtn);
            sleep(4000);
            foundEntrance = true;
            break;
        }

        scrollDown();
        sleep(1200);
    }

    if (!foundEntrance) {
        console.warn(
            "负一屏未能成功检索到底部 [去领会员]，启用小米钱包常规入口兜底...",
        );
        this.launchTargetPageFallback();
    }

    this.dismissPopups();
};

/**
 * 钱包常规入口兜底导航（备用策略）
 */
WalletTaskManager.prototype.launchTargetPageFallback = function () {
    app.launchPackage(CONFIG.packageName);
    sleep(3500);
    this.dismissPopups();

    var vipEntrance =
        text("领视频会员").visibleToUser(true).findOnce() ||
        textContains("领视频会员").visibleToUser(true).findOnce();
    if (vipEntrance) {
        safeClick(vipEntrance);
        sleep(4000);
    }
};

/**
 * 核心任务：处理连环“再看10秒 继续领会员”，检测到“做任务 领时长”时自动终止并切入后续列表
 */
WalletTaskManager.prototype.handleMainVipButton = function () {
    console.log("启动主激励视频/领会员循环...");
    var loopCount = 0;

    while (loopCount < CONFIG.maxRepeatWatchCycles) {
        loopCount++;

        // 终态条件检查：检测是否已变为“做任务 领时长”，表示全部视频跳转已达成
        var finishBtn =
            textContains("做任务 领时长").visibleToUser(true).findOnce() ||
            descContains("做任务 领时长").visibleToUser(true).findOnce();

        if (finishBtn) {
            console.log(
                "检测到按钮变为 [做任务 领时长]，表明本次全部视频跳转奖励已完成！",
            );
            // 点击它以切入任务中心或直接关闭浮层
            safeClick(finishBtn);
            sleep(2500);
            this.dismissPopups();
            break; // 退出视频循环，顺利进入后续任务流
        }

        // 1. 优先匹配弹窗中的“再看10秒 继续领会员”
        var targetBtn =
            textMatches(/.*再看\d+秒.*继续领会员.*/)
                .visibleToUser(true)
                .findOnce() ||
            textContains("再看10秒").visibleToUser(true).findOnce() ||
            textContains("继续领会员").visibleToUser(true).findOnce();

        // 2. 若弹窗中无，则检索页面主位置的大按钮（看10秒 领会员 / 点击领会员）
        if (!targetBtn) {
            targetBtn =
                textMatches(/^(看\d+秒.*领会员|点击领会员|去领会员|立即领会员)$/)
                    .visibleToUser(true)
                    .findOnce() || textContains("领会员").visibleToUser(true).findOnce();
        }

        if (!targetBtn) {
            console.log(
                "当前屏幕未检索到更多可继续观看/领取的按钮，主激励循环结束。",
            );
            break;
        }

        var btnText = targetBtn.text() || "操作按钮";

        // 二次防御：若捕获到的主按钮本身已是“做任务 领时长”，则直接终止
        if (btnText.indexOf("做任务 领时长") !== -1) {
            console.log("主按钮已更新为 [做任务 领时长]，所有视频跳转已全部完成。");
            break;
        }

        console.log("执行第 [" + loopCount + "] 轮操作: [" + btnText + "]...");
        safeClick(targetBtn);
        sleep(2000);

        // 处理系统跨应用跳转授权（如闲鱼）
        this.handleAppLaunchPermission();

        // 若文案包含“看”或“秒”，则进入倒计时与模拟交互
        if (btnText.indexOf("看") !== -1 || btnText.indexOf("秒") !== -1) {
            console.log("进入观看交互，计时 " + CONFIG.watchDurationSec + " 秒...");
            var startTime = Date.now();
            var targetDurationMs = CONFIG.watchDurationSec * 1000;
            var width = device.width;
            var height = device.height;

            while (Date.now() - startTime < targetDurationMs) {
                if (this.handleAppLaunchPermission()) {
                    console.log("已放行应用跳转，重置有效浏览计时...");
                    startTime = Date.now();
                }

                var x = Math.floor(width / 2 + (Math.random() * 40 - 20));
                var yStart = Math.floor(height * 0.7 + (Math.random() * 50 - 25));
                var yEnd = Math.floor(height * 0.4 + (Math.random() * 50 - 25));
                swipe(x, yStart, x, yEnd, 600);
                sleep(2800 + Math.floor(Math.random() * 500));
            }

            console.log("观看时长达标，回退至玩家视界...");
            this.safeBackToTaskList();
            sleep(2500);
        }

        // 看完返回后，优先开红包
        this.handleRedPacketPopup();

        // 检查返回后是否变为“点击领会员”
        var claimBtn = text("点击领会员").visibleToUser(true).findOnce();
        if (claimBtn) {
            console.log("检测到主按钮变为 [点击领会员]，点击领奖...");
            safeClick(claimBtn);
            sleep(2500);
            this.handleRedPacketPopup();
        }

        sleep(1500);
    }

    // 循环结束后若仍残留弹窗则执行关闭
    this.dismissPopups();
    console.log("视频跳转与主激励流程处理完毕。");
};

/**
 * 检查并进入下方的“做任务 加速领5天+会员”列表
 */
WalletTaskManager.prototype.enterDetailTasks = function () {
    console.log("检查 [做任务 加速领] 深度任务通道...");
    this.dismissPopups();

    var taskEntrance =
        textContains("加速领").visibleToUser(true).findOnce() ||
        textContains("做任务 加速").visibleToUser(true).findOnce() ||
        textContains("做任务 领时长").visibleToUser(true).findOnce();

    if (taskEntrance) {
        console.log("发现任务通道入口，尝试展开任务列表...");
        var goBtn = text("去领取").visibleToUser(true).findOnce();
        if (goBtn) {
            safeClick(goBtn);
        } else {
            safeClick(taskEntrance);
        }
        sleep(3500);
        this.dismissPopups();
    }
};

/**
 * 校验任务标题是否命中安全黑名单
 */
WalletTaskManager.prototype.isBlacklisted = function (taskNode) {
    var taskTitle = "";
    try {
        var parent = taskNode.parent();
        if (parent) {
            var titleNode = parent.findOne(textMatches(/.+/));
            if (titleNode) {
                taskTitle = titleNode.text();
            }
        }
    } catch (e) { }

    for (var i = 0; i < CONFIG.blacklistTasks.length; i++) {
        var word = CONFIG.blacklistTasks[i];
        if (taskTitle.indexOf(word) !== -1) {
            console.warn("跳过黑名单任务: [" + taskTitle + "] (包含: " + word + ")");
            return true;
        }
    }
    return false;
};

/**
 * 模拟深度页面浏览
 */
WalletTaskManager.prototype.simulateBrowse = function () {
    console.log(
        "进入任务浏览页，维持模拟交互 " + CONFIG.browseDurationSec + " 秒...",
    );
    var startTime = Date.now();
    var targetDurationMs = CONFIG.browseDurationSec * 1000;
    var width = device.width;
    var height = device.height;

    while (Date.now() - startTime < targetDurationMs) {
        if (this.handleAppLaunchPermission()) {
            startTime = Date.now();
        }

        var x = Math.floor(width / 2 + (Math.random() * 40 - 20));
        var yStart = Math.floor(height * 0.7 + (Math.random() * 50 - 25));
        var yEnd = Math.floor(height * 0.35 + (Math.random() * 50 - 25));
        swipe(x, yStart, x, yEnd, 600);
        sleep(CONFIG.swipeIntervalMs + Math.floor(Math.random() * 500));
    }

    console.log("浏览时长达成，执行安全回退...");
    this.safeBackToTaskList();
};

/**
 * 安全回退校准机制，支持跨应用返回与前台强制拉回
 */
WalletTaskManager.prototype.safeBackToTaskList = function () {
    var retryCount = 0;
    var maxRetries = 6;

    while (retryCount < maxRetries) {
        if (
            currentPackage() === CONFIG.packageName &&
            (text("玩家视界").exists() ||
                textContains("看10秒").exists() ||
                textContains("再看").exists() ||
                textContains("做任务").exists() ||
                textContains("加速领").exists() ||
                textMatches(/(去完成|做任务|可领取|领取)/).exists())
        ) {
            console.log("已确认成功回退到目标面板。");
            return;
        }

        back();
        sleep(1800);
        this.dismissPopups();
        retryCount++;
    }

    if (currentPackage() !== CONFIG.packageName) {
        console.log("仍停留在外部应用，主动唤醒小米钱包回到前台...");
        app.launchPackage(CONFIG.packageName);
        sleep(3000);
        this.dismissPopups();
    }
};

/**
 * 轮询处理普通任务列表
 */
WalletTaskManager.prototype.processTasksLoop = function () {
    console.log("开始轮询执行任务列表...");
    var cycle = 0;

    while (cycle < CONFIG.maxTaskCycles) {
        cycle++;
        this.dismissPopups();

        var actionBtn = textMatches(/^(去完成|去浏览|去查看|逛一逛)$/)
            .visibleToUser(true)
            .findOnce();

        if (!actionBtn) {
            console.log("当前屏幕未发现可继续执行的任务按钮，尝试下翻查找...");
            scrollDown();
            sleep(1500);

            actionBtn = textMatches(/^(去完成|去浏览|去查看|逛一逛)$/)
                .visibleToUser(true)
                .findOnce();

            if (!actionBtn) {
                console.log("未能检索到更多符合条件的交互任务，结束轮询。");
                break;
            }
        }

        if (this.isBlacklisted(actionBtn)) {
            scrollDown();
            sleep(1000);
            continue;
        }

        console.log("执行第 [" + cycle + "] 项任务...");
        safeClick(actionBtn);
        sleep(2500);

        this.simulateBrowse();
        sleep(2000);
    }
};

/**
 * 批量收割已完成的奖励
 */
WalletTaskManager.prototype.collectAllRewards = function () {
    console.log("检查并收集待领取奖励...");
    this.dismissPopups();

    var rewardButtons = textMatches(/^(领取|可领取|点击领取)$/)
        .visibleToUser(true)
        .find();
    if (rewardButtons.nonEmpty()) {
        console.log("找到 " + rewardButtons.length + " 个可领取奖励。");
        for (var i = 0; i < rewardButtons.length; i++) {
            var btn = rewardButtons[i];
            console.log("领取第 " + (i + 1) + " 个奖励...");
            safeClick(btn);
            sleep(1200);
            this.dismissPopups();
        }
    } else {
        console.log("当前无待领取的奖励节点。");
    }
};

/**
 * 释放与清理
 */
WalletTaskManager.prototype.finalize = function () {
    device.cancelKeepingAwake();
    console.log("===============================");
    console.log("全部任务流程执行完毕。");
    console.log("===============================");
};

/**
 * 主控制流程
 */
WalletTaskManager.prototype.run = function () {
    this.initEnvironment();
    this.launchFromNegativeOneScreen(); // 1. 负一屏底部“去领会员”启动
    this.handleMainVipButton(); // 2. 连续观看广告直到出现“做任务 领时长”终止
    this.enterDetailTasks(); // 3. 点击“做任务 加速领5天+会员”
    this.processTasksLoop(); // 4. 轮询完成子任务
    this.collectAllRewards(); // 5. 收割全部奖励
    this.finalize();
};

// 启动执行
var manager = new WalletTaskManager();
manager.run();
