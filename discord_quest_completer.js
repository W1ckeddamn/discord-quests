// ==============================================================================
// Discord Quest Multi-Completer v2.1 (Исправлен формат запроса метаданных)
// ==============================================================================
// Как запустить:
// 1. Откройте приложение Discord на ПК.
// 2. Нажмите Ctrl + Shift + I (откроются DevTools).
// 3. Вкладка "Console" ("Консоль").
// 4. Вставьте этот скрипт целиком и нажмите Enter.
// ==============================================================================

(async () => {
    delete window.$;
    let wpRequire = webpackChunkdiscord_app.push([[Symbol()], {}, r => r]);
    webpackChunkdiscord_app.pop();

    let modules = Object.values(wpRequire.c);

    let RunningGameStore = modules.find(x => x?.exports?.Ay?.getRunningGames)?.exports?.Ay;
    let QuestsStore = modules.find(x => x?.exports?.A?.__proto__?.getQuest)?.exports?.A;
    let FluxDispatcher = modules.find(x => x?.exports?.h?.__proto__?.flushWaitQueue)?.exports?.h;
    let api = modules.find(x => x?.exports?.Bo?.get)?.exports?.Bo;

    if (!QuestsStore || !RunningGameStore || !FluxDispatcher || !api) {
        console.error("[-] Не удалось найти внутренние модули Discord. Убедитесь, что запускаете в Discord Desktop.");
        return;
    }

    const supportedTasks = ["PLAY_ON_DESKTOP", "WATCH_VIDEO", "WATCH_VIDEO_ON_MOBILE", "STREAM_ON_DESKTOP"];

    // 1. Получаем все непросроченные квесты
    let allQuests = [...QuestsStore.quests.values()].filter(x => 
        !x.userStatus?.completedAt && 
        new Date(x.config.expiresAt).getTime() > Date.now() && 
        supportedTasks.some(y => Object.keys((x.config.taskConfig ?? x.config.taskConfigV2).tasks).includes(y))
    );

    if (allQuests.length === 0) {
        console.log("%c[i] Нет активных незавершенных квестов в профиле!", "color: yellow; font-weight: bold; font-size: 13px;");
        return;
    }

    console.log(`%c[📋] Найдено активных квестов: ${allQuests.length}. Проверяем активацию...`, "color: #00d0ff; font-weight: bold; font-size: 13px;");

    // 2. Автоматически активируем (enroll) те, которые еще не были приняты
    for (const q of allQuests) {
        if (!q.userStatus?.enrolledAt) {
            try {
                console.log(`  [+] Активируем квест: "${q.config.messages.questName}"...`);
                await api.post({
                    url: `/quests/${q.id}/enroll`,
                    body: {
                        location: 1,
                        traffic_metadata_sealed: q.trafficMetadataSealed ?? null
                    }
                });
            } catch (e) {
                console.warn(`  [-] Не удалось активировать "${q.config.messages.questName}":`, e);
            }
        }
    }

    // 3. Отдельно параллельно запускаем видео-квесты (если есть)
    const videoQuests = allQuests.filter(q => {
        const tasks = (q.config.taskConfig ?? q.config.taskConfigV2).tasks;
        return tasks.WATCH_VIDEO != null || tasks.WATCH_VIDEO_ON_MOBILE != null;
    });

    for (const vq of videoQuests) {
        (async () => {
            const taskConfig = vq.config.taskConfig ?? vq.config.taskConfigV2;
            const tName = taskConfig.tasks.WATCH_VIDEO != null ? "WATCH_VIDEO" : "WATCH_VIDEO_ON_MOBILE";
            const target = taskConfig.tasks[tName].target;
            let current = vq.userStatus?.progress?.[tName]?.value ?? 0;
            const qName = vq.config.messages.questName;
            console.log(`%c[🎬 Видео] Запущена эмуляция просмотра: "${qName}" (${target} сек)`, "color: #a78bfa; font-weight: bold;");

            while (current < target) {
                await new Promise(r => setTimeout(r, 7000));
                current = Math.min(target, current + 7);
                try {
                    const res = await api.post({
                        url: `/quests/${vq.id}/video-progress`,
                        body: { timestamp: Math.min(target, current + Math.random()) }
                    });
                    console.log(`[Видео: ${qName}] ${current} / ${target} сек.`);
                    if (res.body?.completed_at != null || current >= target) break;
                } catch(e) {
                    break;
                }
            }

            console.log(`%c[✓] Видео-квест "${qName}" завершен! Забираем награду...`, "color: #00ff88; font-weight: bold;");
            try {
                await api.post({ url: `/quests/${vq.id}/claim-reward`, body: { location: 1, platform: 0 } });
                console.log(`%c[★] Награда за "${qName}" успешно получена!`, "color: gold; font-weight: bold;");
            } catch(e) {}
        })();
    }

    // 4. Формируем единый стек ВСЕХ десктопных игр для одновременного запуска
    const playQuests = allQuests.filter(q => {
        const tasks = (q.config.taskConfig ?? q.config.taskConfigV2).tasks;
        return tasks.PLAY_ON_DESKTOP != null;
    });

    if (playQuests.length === 0) return;

    // Собираем метаданные для каждой игры по отдельности (во избежание ошибки 400 Bad Request snowflake)
    const fakeGames = [];
    const questMap = new Map();

    console.log(`%c[🎮] Получаем данные для ${playQuests.length} игр...`, "color: #00d0ff; font-weight: bold;");

    for (const q of playQuests) {
        const tasks = (q.config.taskConfig ?? q.config.taskConfigV2).tasks;
        const appId = q.config.application?.id ?? tasks.PLAY_ON_DESKTOP.applications?.[0]?.id;
        const qName = q.config.messages.questName;
        const fallbackName = q.config.application?.name ?? qName;

        let appInfo = null;
        try {
            const res = await api.get({ url: `/applications/public?application_ids=${appId}` });
            if (res.body && res.body.length > 0) {
                appInfo = res.body[0];
            }
        } catch(e) {
            console.warn(`Не удалось получить данные для ${appId}, используем fallback.`);
        }

        const gameName = appInfo?.name ?? fallbackName;
        const pid = Math.floor(Math.random() * 30000) + 1000;
        const cleanName = gameName.replace(/[\/\\:*?"<>|]/g, "");
        const exeName = appInfo?.executables?.find(x => x.os === "win32")?.name?.replace(">", "") ?? `${cleanName}.exe`;

        const gameObj = {
            cmdLine: `C:\\Program Files\\${cleanName}\\${exeName}`,
            exeName,
            exePath: `c:/program files/${cleanName.toLowerCase()}/${exeName}`,
            hidden: false,
            isLauncher: false,
            id: appId,
            name: gameName,
            pid: pid,
            pidPath: [pid],
            processName: gameName,
            start: Date.now(),
        };

        fakeGames.push(gameObj);
        questMap.set(q.id, {
            quest: q,
            game: gameObj,
            target: tasks.PLAY_ON_DESKTOP.target,
            completed: false
        });
        console.log(`  -> Добавлена игра: ${gameName} ("${qName}")`);
    }

    const realGames = RunningGameStore.getRunningGames();
    const realGetRunningGames = RunningGameStore.getRunningGames;
    const realGetGameForPID = RunningGameStore.getGameForPID;

    // Подменяем список запущенных игр на ВСЕ игры СРАЗУ
    RunningGameStore.getRunningGames = () => fakeGames;
    RunningGameStore.getGameForPID = (p) => fakeGames.find(x => x.pid === p);
    FluxDispatcher.dispatch({ 
        type: "RUNNING_GAMES_CHANGE", 
        removed: realGames, 
        added: fakeGames, 
        games: fakeGames 
    });

    console.log(`%c[🚀 СТАРТ] Все ${fakeGames.length} игр запущены ОДНОВРЕМЕННО! Discord отправляет тики (15 минут).`, "color: #00ff88; font-size: 14px; font-weight: bold;");

    // Обработчик тиков времени от Discord
    let onHeartbeat = async (data) => {
        if (!data?.userStatus?.questId) return;
        const qid = data.userStatus.questId;
        const item = questMap.get(qid);
        if (!item || item.completed) return;

        let progress = item.quest.config.configVersion === 1 
            ? data.userStatus.streamProgressSeconds 
            : Math.floor(data.userStatus.progress?.PLAY_ON_DESKTOP?.value ?? 0);

        const m = Math.floor(progress / 60);
        const s = progress % 60;
        console.log(`[Прогресс: ${item.quest.config.messages.questName}] ${progress} / ${item.target} сек. (${m} мин. ${s} сек.)`);

        if (progress >= item.target) {
            item.completed = true;
            console.log(`%c[✓] Квест "${item.quest.config.messages.questName}" завершен! Забираем награду...`, "color: #00ff88; font-weight: bold;");
            
            try {
                await api.post({ url: `/quests/${qid}/claim-reward`, body: { location: 1, platform: 0 } });
                console.log(`%c[★] Награда за "${item.quest.config.messages.questName}" получена!`, "color: gold; font-weight: bold;");
            } catch(e) {
                console.warn(`Не удалось забрать награду:`, e);
            }

            // Проверяем, завершены ли все игры
            const remaining = [...questMap.values()].filter(x => !x.completed);
            if (remaining.length === 0) {
                console.log("%c[🎉] ПОЗДРАВЛЯЕМ! Все квесты выполнены одновременно и все награды собраны!", "color: #00ff88; font-size: 16px; font-weight: bold;");
                RunningGameStore.getRunningGames = realGetRunningGames;
                RunningGameStore.getGameForPID = realGetGameForPID;
                FluxDispatcher.dispatch({ type: "RUNNING_GAMES_CHANGE", removed: fakeGames, added: [], games: [] });
                FluxDispatcher.unsubscribe("QUESTS_SEND_HEARTBEAT_SUCCESS", onHeartbeat);
            } else {
                console.log(`[i] Осталось выполнять квестов: ${remaining.length}`);
            }
        }
    };

    FluxDispatcher.subscribe("QUESTS_SEND_HEARTBEAT_SUCCESS", onHeartbeat);
})();
