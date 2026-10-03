/**
 * 小米钱包 - 玩家视界每日任务自动化脚本 (精简重构版)
 * 适配环境: AutoJs6 (Rhino 引擎) / Android 15 (HyperOS 2)
 */

var CONFIG = {
    packageName: "com.mipay.wallet",                // 小米钱包主包名
    assistantPackage: "com.miui.personalassistant", // 负一屏（智能助理）包名
    maxRightSwipes: 10,                             // 桌面切入负一屏的最大向右滑动次数 (识别到负一屏即提前停止)
    maxScrollAttempts: 8,                          // 负一屏内寻找底部入口的最大向下滑动次数 (检索到入口即提前停止)
    browseDurationSec: 17,                         // 深度浏览任务的停留交互秒数
    watchDurationSec: 13,                          // 激励视频观看的实际安全停留秒数
    maxTaskCycles: 12,                             // 单轮任务列表轮询的最大任务数上限
    maxRepeatWatchCycles: 6,                       // 连续观看激励视频与再看领取的最大轮次上限
    blacklistTasks: [                              // 高危与黑名单任务关键词 (匹配即跳过)
        "下载", "安装", "充值", "开通", "借款", "办卡", "投资", "购买"
    ]
};

/**
 * 健壮性点击：节点点击 -> 父级回溯 -> 物理坐标兜底
 */
function safeClick(node) {
    if (!node) return false;
    if (node.clickable && node.click()) return true;
    var current = node.parent(), depth = 0;
    while (current && depth < 4) {
        if (current.clickable && current.click()) return true;
        current = current.parent();
        depth++;
    }
    var bounds = node.bounds();
    if (bounds && bounds.width() > 0 && bounds.height() > 0) {
        return click(bounds.centerX(), bounds.centerY());
    }
    return false;
}

/**
 * 屏幕物理滑动辅助函数 (避开全面屏边缘手势区)
 */
function swipePage(yStartRatio, yEndRatio, duration) {
    var halfX = Math.floor(device.width / 2 + (Math.random() * 30 - 15));
    var y1 = Math.floor(device.height * yStartRatio);
    var y2 = Math.floor(device.height * yEndRatio);
    swipe(halfX, y1, halfX, y2, duration || 450);
}

/**
 * 弹窗与权限拦截统一处理器
 */
function handlePopups() {
    // 1. 系统跨应用互跳授权放行 (如闲鱼)
    var allowBtn = textMatches(/^(本次允许|允许|始终允许)$/).visibleToUser(true).findOnce();
    if (allowBtn) {
        console.log("放行系统授权弹窗 [" + allowBtn.text() + "]...");
        safeClick(allowBtn);
        sleep(2500);
        return true;
    }

    // 2. 领取奖励大红包弹窗开奖
    var hasReward = textContains("领取奖励").visibleToUser(true).exists() || text("開").exists() || text("开").exists();
    if (hasReward) {
        var openBtn = textMatches(/^(開|开)$/).visibleToUser(true).findOnce() || descMatches(/^(開|开)$/).visibleToUser(true).findOnce();
        if (openBtn) {
            safeClick(openBtn);
        } else {
            click(Math.floor(device.width / 2), Math.floor(device.height * 0.44));
        }
        sleep(2500);
        if (textContains("再看").exists() || textContains("继续领会员").exists()) return true;
    }

    // 3. 干扰弹窗关闭 (若存在继续领会员则豁免关闭)
    if (textContains("再看").exists() || textContains("继续领会员").exists()) return false;

    var closeBtn = textMatches(/^(关闭|我知道了|开心收下|放弃|取消)$/).visibleToUser(true).findOnce();
    if (closeBtn) {
        safeClick(closeBtn);
        sleep(1000);
    }
    var closeIcon = descMatches(/关闭|close/i).visibleToUser(true).findOnce() || idMatches(/.*close.*/).visibleToUser(true).findOnce();
    if (closeIcon) {
        safeClick(closeIcon);
        sleep(1000);
    }
    return false;
}

/**
 * 模拟停留交互并维持滑动 (采用硬性截止时间，避免外部应用死锁卡死)
 */
function simulateStay(durationSec) {
    var deadline = Date.now() + durationSec * 1000;
    while (Date.now() < deadline) {
        var allowBtn = textMatches(/^(本次允许|允许|始终允许)$/).visibleToUser(true).findOnce();
        if (allowBtn) {
            safeClick(allowBtn);
            sleep(2000);
        }
        swipePage(0.72, 0.35, 550);
        sleep(2200 + Math.floor(Math.random() * 500));
    }
}

/**
 * 以权威包名 (CONFIG.packageName) 为核心基准切回活动面板
 */
function backToPanel() {
    console.log("正在切回小米钱包活动页面...");
    // 1. 若当前不在钱包，优先尝试 2 次系统级回退
    for (var i = 0; i < 2; i++) {
        if (currentPackage() === CONFIG.packageName) break;
        back();
        sleep(900);
    }

    // 2. 防御性保障：若仍被外部应用拦截，强制将钱包从后台唤醒至前台
    if (currentPackage() !== CONFIG.packageName) {
        console.log("检测到仍停留在外部应用，强制唤醒钱包回前台...");
        app.launchPackage(CONFIG.packageName);
        sleep(2500);
    }

    // 3. 确认回到钱包后，处理开奖浮层与领奖
    handlePopups();
    sleep(1500);
}

/**
 * 校验节点物理坐标是否真正在当前屏幕物理可视区域内
 * 彻底过滤处于屏幕外预加载区 (x < 0 或 x > width) 的幽灵节点
 */
function isNodeOnScreen(node) {
    if (!node) return false;
    var b = node.bounds();
    if (!b) return false;
    return b.centerX() > 0 && b.centerX() < device.width && b.centerY() > 0 && b.centerY() < device.height;
}

/**
 * 校验当前是否依然停留在桌面 (排他性排查)
 * 桌面独有标志：底部常驻 Dock 栏 (电话/短信/相机等) 或底部桌面搜索胶囊 (处于屏幕下部)
 */
function isStillOnHomeScreen() {
    // 1. 检查底部的桌面搜索胶囊 (处于屏幕下方 y > height * 0.75)
    var searchNodes = text("搜索").visibleToUser(true).find();
    if (searchNodes.nonEmpty()) {
        for (var s = 0; s < searchNodes.length; s++) {
            var sb = searchNodes[s].bounds();
            if (sb && sb.centerY() > device.height * 0.75) {
                return true;
            }
        }
    }

    // 2. 检查桌面底部常驻 Dock 应用 (处于屏幕下方 y > height * 0.8)
    var dockKeywords = ["电话", "拨号", "短信", "相机", "联系人", "浏览器"];
    for (var i = 0; i < dockKeywords.length; i++) {
        var node = text(dockKeywords[i]).visibleToUser(true).findOnce() ||
            desc(dockKeywords[i]).visibleToUser(true).findOnce();
        if (node) {
            var b = node.bounds();
            if (b && b.centerY() > device.height * 0.8) {
                return true;
            }
        }
    }
    return false;
}

/**
 * 校验当前是否处于负一屏真实可视界面
 * 严谨前提：底部的桌面 Dock 栏已完全脱离屏幕
 */
function isAtNegativeOneScreen() {
    // 只要屏幕底部依然存在桌面 Dock 栏或底部搜索胶囊，坚决判定为“仍在桌面”
    if (isStillOnHomeScreen()) return false;

    if (currentPackage() === CONFIG.assistantPackage) return true;

    // 负一屏顶部特有搜索栏 (处于屏幕顶部 y < height * 0.25)
    var searchNodes = text("搜索").visibleToUser(true).find();
    if (searchNodes.nonEmpty()) {
        for (var s = 0; s < searchNodes.length; s++) {
            var sb = searchNodes[s].bounds();
            if (sb && sb.centerY() < device.height * 0.25 && sb.centerX() > 0 && sb.centerX() < device.width) {
                return true;
            }
        }
    }

    // 负一屏顶部快捷功能 (扫一扫、付款码等)
    var scan = text("扫一扫").visibleToUser(true).findOnce();
    var pay = text("付款码").visibleToUser(true).findOnce();
    if (isNodeOnScreen(scan) || isNodeOnScreen(pay)) {
        return true;
    }

    var entrance = idEndsWith("video_member_btn").visibleToUser(true).findOnce() ||
        textMatches(/.*去领会员.*/).visibleToUser(true).findOnce();
    if (isNodeOnScreen(entrance)) return true;

    return false;
}

/**
 * 负一屏入口导航：默认向右滑动一次后判断，循环推进直至到达最左侧负一屏
 */
function launchFromNegativeOneScreen() {
    handlePopups();
    if (text("玩家视界").exists() || textContains("我的会员时长").exists()) {
        console.log("当前已处于 [玩家视界] 页面，跳过前置导航。");
        return true;
    }

    console.log("回到主页，向右滑动穿透至最左侧负一屏...");
    home();
    sleep(1500);

    // 默认滑动一次后判断是否已离开桌面并切入负一屏，若未离开则持续右划 (上限 maxRightSwipes 次)
    var reached = false;
    for (var swipeAttempt = 1; swipeAttempt <= CONFIG.maxRightSwipes; swipeAttempt++) {
        console.log("向右滑动切换至最左侧负一屏 (第 " + swipeAttempt + " 次)...");
        var startX = Math.floor(device.width * 0.2);
        var endX = Math.floor(device.width * 0.88);
        var swipeY = Math.floor(device.height * 0.55);
        swipe(startX, swipeY, endX, swipeY, 360);
        sleep(1400);

        if (isAtNegativeOneScreen()) {
            reached = true;
            console.log("已成功识别并切入最左侧负一屏。");
            break;
        }
    }

    if (!reached) {
        console.warn("未完全匹配到负一屏特有组件标记，继续尝试检索底部入口...");
    }

    console.log("在负一屏向下滑动寻找最底部 [去领会员]...");
    for (var scroll = 0; scroll < CONFIG.maxScrollAttempts; scroll++) {
        var entrance = idEndsWith("video_member_btn").visibleToUser(true).findOnce() ||
            textMatches(/.*去领会员.*/).visibleToUser(true).findOnce() ||
            descMatches(/.*去领会员.*/).visibleToUser(true).findOnce() ||
            text("玩家视界").visibleToUser(true).findOnce();
        if (entrance && isNodeOnScreen(entrance)) {
            var title = entrance.id() ? "video_member_btn (视频会员按钮)" : (entrance.text() || entrance.desc() || "去领会员");
            console.log("成功定位到负一屏底部入口 [" + title + "]，点击进入...");
            safeClick(entrance);
            sleep(4000);
            handlePopups();
            return true;
        }
        swipePage(0.75, 0.25, 450);
        sleep(1200);
    }

    console.error("未能检索到底部 [去领会员] 入口，安全终止。");
    return false;
}

/**
 * 观看激励视频与多轮领会员循环
 */
function watchAdsLoop() {
    console.log("启动主激励视频与领会员循环...");
    for (var i = 1; i <= CONFIG.maxRepeatWatchCycles; i++) {
        var finishBtn = textContains("做任务 领时长").visibleToUser(true).findOnce() ||
            descContains("做任务 领时长").visibleToUser(true).findOnce();
        if (finishBtn) {
            console.log("检测到按钮变为 [做任务 领时长]，今日会员时长全部奖励已达成！流程圆满结束。");
            return true;
        }

        var targetBtn = textMatches(/.*再看\d+秒.*继续领会员.*/).visibleToUser(true).findOnce() ||
            textContains("再看10秒").visibleToUser(true).findOnce() ||
            textContains("继续领会员").visibleToUser(true).findOnce() ||
            textMatches(/^(看\d+秒.*领会员|点击领会员|去领会员|立即领会员)$/).visibleToUser(true).findOnce() ||
            textContains("领会员").visibleToUser(true).findOnce();

        if (!targetBtn) {
            console.log("未检索到更多可继续观看/领取的按钮，主循环结束。");
            break;
        }

        var btnText = targetBtn.text() || targetBtn.desc() || "操作按钮";
        if (btnText.indexOf("做任务 领时长") !== -1) {
            console.log("检测到按钮为 [做任务 领时长]，今日会员时长已全额到账！流程圆满结束。");
            return true;
        }

        console.log("执行第 [" + i + "] 轮: [" + btnText + "]...");
        safeClick(targetBtn);
        sleep(2000);
        handlePopups();

        if (btnText.indexOf("看") !== -1 || btnText.indexOf("秒") !== -1) {
            console.log("进入观看交互，计时 " + CONFIG.watchDurationSec + " 秒...");
            simulateStay(CONFIG.watchDurationSec);
            backToPanel();
            sleep(2000);
        }

        handlePopups();
        if (textContains("做任务 领时长").visibleToUser(true).exists() || descContains("做任务 领时长").visibleToUser(true).exists()) {
            console.log("开奖完成，检测到按钮更新为 [做任务 领时长]，今日时长已全部领满！");
            return true;
        }

        var claimBtn = text("点击领会员").visibleToUser(true).findOnce();
        if (claimBtn) {
            safeClick(claimBtn);
            sleep(2000);
            handlePopups();
        }
        sleep(1000);
    }
    handlePopups();
    return false;
}

/**
 * 展开深度任务中心列表
 */
function enterTaskCenter() {
    console.log("检查深度任务通道入口...");
    handlePopups();
    var taskEntrance = textContains("加速领").visibleToUser(true).findOnce() ||
        textContains("做任务 加速").visibleToUser(true).findOnce() ||
        textContains("做任务 领时长").visibleToUser(true).findOnce();

    if (taskEntrance) {
        var goBtn = text("去领取").visibleToUser(true).findOnce();
        safeClick(goBtn || taskEntrance);
        sleep(3000);
        handlePopups();
    }
}

/**
 * 校验黑名单任务
 */
function isBlacklisted(taskNode) {
    try {
        var parent = taskNode.parent();
        if (parent) {
            var titleNode = parent.findOne(textMatches(/.+/));
            if (titleNode) {
                var title = titleNode.text();
                for (var i = 0; i < CONFIG.blacklistTasks.length; i++) {
                    if (title.indexOf(CONFIG.blacklistTasks[i]) !== -1) {
                        console.warn("跳过黑名单任务: [" + title + "]");
                        return true;
                    }
                }
            }
        }
    } catch (e) { }
    return false;
}

/**
 * 轮询执行普通浏览任务
 */
function runTasksLoop() {
    console.log("开始轮询执行任务列表...");
    for (var cycle = 1; cycle <= CONFIG.maxTaskCycles; cycle++) {
        handlePopups();
        var actionBtn = textMatches(/^(去完成|去浏览|去查看|逛一逛)$/).visibleToUser(true).findOnce();
        if (!actionBtn) {
            scrollDown();
            sleep(1500);
            actionBtn = textMatches(/^(去完成|去浏览|去查看|逛一逛)$/).visibleToUser(true).findOnce();
            if (!actionBtn) {
                console.log("未发现更多可用交互任务，结束轮询。");
                break;
            }
        }

        if (isBlacklisted(actionBtn)) {
            scrollDown();
            sleep(1000);
            continue;
        }

        console.log("执行第 [" + cycle + "] 项任务...");
        safeClick(actionBtn);
        sleep(2500);
        simulateStay(CONFIG.browseDurationSec);
        backToPanel();
        sleep(1500);
    }
}

/**
 * 批量收割已完成的奖励
 */
function claimRewards() {
    console.log("检查并收集待领取奖励...");
    handlePopups();
    var list = textMatches(/^(领取|可领取|点击领取)$/).visibleToUser(true).find();
    if (list.nonEmpty()) {
        console.log("找到 " + list.length + " 个待领取奖励。");
        for (var i = 0; i < list.length; i++) {
            safeClick(list[i]);
            sleep(1200);
            handlePopups();
        }
    }
}

/**
 * 主执行入口
 */
function main() {
    console.show();
    console.setTitle("玩家视界任务执行器");
    console.log("正在校验运行权限...");
    auto.waitFor();
    device.keepScreenDim(600 * 1000);
    console.log("环境就绪，准备调度应用。");

    var launched = launchFromNegativeOneScreen();
    if (!launched) {
        console.error("未能进入活动页面，脚本安全终止。");
        device.cancelKeepingAwake();
        return;
    }

    var allDone = watchAdsLoop();
    if (allDone) {
        console.log("===============================");
        console.log("检测到 [做任务 领时长] 终态，今日会员时长已全额领取达成！");
        console.log("自动化流程圆满结束。");
        console.log("===============================");
        device.cancelKeepingAwake();
        return;
    }

    enterTaskCenter();
    runTasksLoop();
    claimRewards();

    device.cancelKeepingAwake();
    console.log("===============================");
    console.log("全部任务流程执行完毕。");
    console.log("===============================");
}

main();
