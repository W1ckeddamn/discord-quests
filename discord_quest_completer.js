// ==============================================================================
// Discord Quest Multi-Completer v2.3 (Fixed excludedQuests dispatch & sync)
// ==============================================================================
// Как запустить вручную:
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

    let RunningGameStore = modules.find(x => x?.exports?.Ay?.getRunningGames)?.exports?.Ay
        || modules.find(x => x?.exports?.default?.getRunningGames)?.exports?.default
        || modules.find(x => x?.exports?.getRunningGames)?.exports;

    let QuestsStore = modules.find(x => x?.exports?.A?.__proto__?.getQuest)?.exports?.A
        || modules.find(x => x?.exports?.default?.getQuest)?.exports?.default
        || modules.find(x => x?.exports?.getQuest)?.exports;

    let FluxDispatcher = modules.find(x => x?.exports?.h?.__proto__?.flushWaitQueue)?.exports?.h
        || modules.find(x => x?.exports?.default?.flushWaitQueue)?.exports?.default
        || modules.find(x => x?.exports?.flushWaitQueue)?.exports;

    let api = modules.find(x => x?.exports?.Bo?.get)?.exports?.Bo
        || modules.find(x => x?.exports?.default?.get && x?.exports?.default?.post)?.exports?.default
        || modules.find(x => x?.exports?.get && x?.exports?.post)?.exports;

    let questActionModule = modules.find(x => 
        typeof x?.exports?.fetchCurrentQuests === 'function' || 
        typeof x?.exports?.default?.fetchCurrentQuests === 'function' ||
        typeof x?.exports?.fetchQuests === 'function'
    );
    let fetchCurrentQuests = questActionModule?.exports?.fetchCurrentQuests 
        || questActionModule?.exports?.default?.fetchCurrentQuests
        || questActionModule?.exports?.fetchQuests;

    if (!QuestsStore || !RunningGameStore || !FluxDispatcher || !api) {
        console.error("[-] Не удалось найти внутренние модули Discord. Убедитесь, что запускаете в Discord Desktop.");
        return;
    }

    const supportedTasks = ["PLAY_ON_DESKTOP", "WATCH_VIDEO", "WATCH_VIDEO_ON_MOBILE", "STREAM_ON_DESKTOP"];

    const getTaskConfig = (q) => q?.config?.taskConfig ?? q?.config?.taskConfigV2 ?? q?.config?.task_config ?? q?.config?.task_config_v2 ?? {};
    const getTasks = (q) => getTaskConfig(q).tasks ?? {};
    const getQuestName = (q) => q?.config?.messages?.questName ?? q?.config?.messages?.quest_name ?? "Quest";
    const isCompleted = (q) => Boolean(q?.userStatus?.completedAt ?? q?.user_status?.completed_at);
    const isEnrolled = (q) => Boolean(q?.userStatus?.enrolledAt ?? q?.user_status?.enrolled_at);
    const getExpiresAt = (q) => {
        const exp = q?.config?.expiresAt ?? q?.config?.expires_at;
        return exp ? new Date(exp).getTime() : 0;
    };
    const getTrafficMetadata = (q) => q?.trafficMetadataSealed ?? q?.traffic_metadata_sealed ?? null;
    const getAppId = (q) => q?.config?.application?.id ?? getTasks(q)?.PLAY_ON_DESKTOP?.applications?.[0]?.id;
    const getAppName = (q) => q?.config?.application?.name ?? getQuestName(q);

    console.log("%c[⏳] Синхронизация и загрузка актуальных квестов...", "color: #00d0ff; font-weight: bold; font-size: 13px;");

    // 1. Цикл ожидания и принудительной синхронизации квестов
    let allQuests = [];
    const maxAttempts = 15;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        // Пробуем вызвать нативный action Discord
        if (typeof fetchCurrentQuests === "function") {
            try {
                await fetchCurrentQuests();
            } catch (_) {}
        }

        let rawList = [];

        // Принудительно запрашиваем квесты через встроенный API Discord
        try {
            const res = await api.get({ url: "/quests/@me" });
            if (res.body?.quests && res.body.quests.length > 0) {
                rawList = res.body.quests;
                try {
                    const excludedList = (res.body.excluded_quests || []).map(x => x?.id ?? x);
                    FluxDispatcher.dispatch({
                        type: "QUESTS_FETCH_CURRENT_QUESTS_SUCCESS",
                        quests: res.body.quests || [],
                        excludedQuests: excludedList,
                        questEnrollmentBlockedUntil: res.body.quest_enrollment_blocked_until ?? null,
                        questAccessSuspendedUntil: res.body.quest_access_suspended_until ?? null
                    });
                } catch (_) {}
            }
        } catch (e) {
            // API клиента может еще авторизоваться при старте
        }

        // Если API не вернул, но в QuestsStore уже есть квесты
        if (rawList.length === 0 && QuestsStore?.quests && QuestsStore.quests.size > 0) {
            rawList = [...QuestsStore.quests.values()];
        }

        const now = Date.now();
        allQuests = rawList.filter(q => {
            const tasks = Object.keys(getTasks(q));
            return !isCompleted(q) &&
                   getExpiresAt(q) > now &&
                   supportedTasks.some(t => tasks.includes(t));
        });

        if (allQuests.length > 0) {
            break;
        }

        console.log(`[i] Ожидание квестов от Discord... (попытка ${attempt}/${maxAttempts})`);
        await new Promise(r => setTimeout(r, 2500));
    }

    if (allQuests.length === 0) {
        console.log("%c[i] Нет активных незавершенных квестов в профиле!", "color: yellow; font-weight: bold; font-size: 13px;");
        return;
    }

    console.log(`%c[📋] Найдено активных квестов: ${allQuests.length}. Проверяем активацию...`, "color: #00d0ff; font-weight: bold; font-size: 13px;");

    // 2. Автоматически активируем (enroll) квесты, которые еще не были приняты
    for (const q of allQuests) {
        if (!isEnrolled(q)) {
            try {
                console.log(`  [+] Активируем квест: "${getQuestName(q)}"...`);
                await api.post({
                    url: `/quests/${q.id}/enroll`,
                    body: {
                        location: 1,
                        traffic_metadata_sealed: getTrafficMetadata(q)
                    }
                });
            } catch (e) {
                console.warn(`  [-] Не удалось активировать "${getQuestName(q)}":`, e);
            }
        }
    }

    // 3. Отдельно параллельно запускаем видео-квесты (если есть)
    const videoQuests = allQuests.filter(q => {
        const tasks = getTasks(q);
        return tasks.WATCH_VIDEO != null || tasks.WATCH_VIDEO_ON_MOBILE != null;
    });

    for (const vq of videoQuests) {
        (async () => {
            const tasks = getTasks(vq);
            const tName = tasks.WATCH_VIDEO != null ? "WATCH_VIDEO" : "WATCH_VIDEO_ON_MOBILE";
            const target = tasks[tName]?.target ?? 30;
            const userStatus = vq.userStatus ?? vq.user_status;
            let current = userStatus?.progress?.[tName]?.value ?? 0;
            const qName = getQuestName(vq);
            console.log(`%c[🎬 Видео] Запущена эмуляция просмотра: "${qName}" (${target} сек)`, "color: #a78bfa; font-weight: bold;");

            while (current < target) {
                await new Promise(r => setTimeout(r, 5000));
                current = Math.min(target, current + 5);
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
        const tasks = getTasks(q);
        return tasks.PLAY_ON_DESKTOP != null;
    });

    if (playQuests.length === 0) return;

    // Собираем метаданные для каждой игры по отдельности
    const fakeGames = [];
    const questMap = new Map();

    console.log(`%c[🎮] Получаем данные для ${playQuests.length} игр...`, "color: #00d0ff; font-weight: bold;");

    for (const q of playQuests) {
        const tasks = getTasks(q);
        const appId = getAppId(q);
        const qName = getQuestName(q);
        const fallbackName = getAppName(q);

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
            target: tasks.PLAY_ON_DESKTOP?.target ?? 900,
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

    console.log(`%c[🚀 СТАРТ] Все ${fakeGames.length} игр запущены ОДНОВРЕМЕННО! Discord отправляет тики (до 15 минут).`, "color: #00ff88; font-size: 14px; font-weight: bold;");

    // Обработчик тиков времени от Discord
    let onHeartbeat = async (data) => {
        const userStatus = data?.userStatus ?? data?.user_status;
        if (!userStatus?.questId && !userStatus?.quest_id) return;
        const qid = userStatus.questId ?? userStatus.quest_id;
        const item = questMap.get(qid);
        if (!item || item.completed) return;

        const questConfig = item.quest?.config ?? {};
        const configVer = questConfig.configVersion ?? questConfig.config_version;
        let progress = configVer === 1 
            ? (userStatus.streamProgressSeconds ?? userStatus.stream_progress_seconds ?? 0)
            : Math.floor(userStatus.progress?.PLAY_ON_DESKTOP?.value ?? 0);

        const m = Math.floor(progress / 60);
        const s = progress % 60;
        console.log(`[Прогресс: ${getQuestName(item.quest)}] ${progress} / ${item.target} сек. (${m} мин. ${s} сек.)`);

        if (progress >= item.target) {
            item.completed = true;
            console.log(`%c[✓] Квест "${getQuestName(item.quest)}" завершен! Забираем награду...`, "color: #00ff88; font-weight: bold;");
            
            try {
                await api.post({ url: `/quests/${qid}/claim-reward`, body: { location: 1, platform: 0 } });
                console.log(`%c[★] Награда за "${getQuestName(item.quest)}" получена!`, "color: gold; font-weight: bold;");
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
