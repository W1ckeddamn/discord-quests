import os
import sys
import glob
import json
import shutil
import logging
import subprocess
from pathlib import Path

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - [%(levelname)s] - %(message)s"
)

PROJECT_DIR = Path(__file__).resolve().parent
COMPLETER_SCRIPT_PATH = PROJECT_DIR / "discord_quest_completer.js"


def close_discord():
    """Terminates Discord processes to release file locks and ensure full reload of core module."""
    try:
        res = subprocess.run(
            ["taskkill", "/F", "/IM", "Discord.exe"],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL
        )
        if res.returncode == 0:
            logging.info("Все запущенные процессы Discord успешно завершены.")
    except Exception:
        pass


def find_core_index_files():
    pattern = os.path.expandvars(r"%LOCALAPPDATA%\Discord\app-*\modules\discord_desktop_core-*\discord_desktop_core\index.js")
    matches = glob.glob(pattern)
    return [Path(p) for p in matches]


def generate_injected_index_js(script_content: str) -> str:
    # Безопасное экранирование скрипта через JSON.parse
    json_escaped_script = json.dumps(script_content)

    return f"""// [DISCORD_QUEST_AUTO_INJECTOR]
const {{ app }} = require('electron');

const QUEST_SCRIPT = {json_escaped_script};

let injected = false;
app.on('browser-window-created', (event, win) => {{
    win.webContents.on('dom-ready', () => {{
        // Проверяем готовность webpackChunkdiscord_app перед инъекцией
        const checkAndInject = (attempt = 0) => {{
            if (attempt > 40) return;
            win.webContents.executeJavaScript('typeof webpackChunkdiscord_app !== "undefined"')
                .then(isReady => {{
                    if (isReady) {{
                        setTimeout(() => {{
                            win.webContents.executeJavaScript(QUEST_SCRIPT)
                                .then(() => console.log('[QuestInjector] Script successfully injected!'))
                                .catch(err => console.error('[QuestInjector] Injection error:', err));
                        }}, 4000);
                    }} else {{
                        setTimeout(() => checkAndInject(attempt + 1), 2000);
                    }}
                }})
                .catch(() => setTimeout(() => checkAndInject(attempt + 1), 2000));
        }};
        setTimeout(checkAndInject, 2000);
    }});
}});

module.exports = require('./core.asar');
"""


def install():
    if not COMPLETER_SCRIPT_PATH.exists():
        logging.error("Файл скрипта не найден: %s", COMPLETER_SCRIPT_PATH)
        return False

    with open(COMPLETER_SCRIPT_PATH, "r", encoding="utf-8") as f:
        script_content = f.read()

    index_files = find_core_index_files()
    if not index_files:
        logging.error("Не найден модуль discord_desktop_core. Убедитесь, что Discord установлен.")
        return False

    # Завершаем процессы Discord перед модификацией файлов
    close_discord()

    new_content = generate_injected_index_js(script_content)

    for index_path in index_files:
        backup_path = index_path.with_name("index.js.bak")

        # Делаем резервную копию оригинала, если ее еще нет
        if not backup_path.exists():
            shutil.copy2(index_path, backup_path)
            logging.info("Создана резервная копия оригинала: %s", backup_path)

        with open(index_path, "w", encoding="utf-8") as f:
            f.write(new_content)

        logging.info("[✓] Авто-инъекция успешно установлена в: %s", index_path)

    print("\n" + "=" * 65)
    print(" УСПЕШНО! АВТО-ИНЪЕКЦИЯ УСТАНОВЛЕНА В DISCORD")
    print("=" * 65)
    print("Теперь при каждом запуске Discord:")
    print(" 1. Через 6 секунд после входа в аккаунт скрипт сам запустится.")
    print(" 2. Сам активирует все новые квесты.")
    print(" 3. Сам эмулирует все игры и заберет награды!")
    print("\nВАЖНО: Запустите Discord заново (полный запуск приложения).")
    print("Простой перезагрузки окна (Ctrl + R) недостаточно, так как патч")
    print("работает на уровне главного процесса Electron.")
    return True


def uninstall():
    index_files = find_core_index_files()
    if not index_files:
        logging.error("Не найден модуль discord_desktop_core.")
        return False

    # Завершаем процессы Discord перед восстановлением файлов
    close_discord()

    restored = 0
    for index_path in index_files:
        backup_path = index_path.with_name("index.js.bak")
        if backup_path.exists():
            shutil.copy2(backup_path, index_path)
            backup_path.unlink()
            logging.info("[✓] Оригинальный index.js восстановлен: %s", index_path)
            restored += 1
        else:
            # Если бэкапа нет, пишем стандартную строчку
            with open(index_path, "w", encoding="utf-8") as f:
                f.write("module.exports = require('./core.asar');\n")
            logging.info("[✓] Записан стандартный index.js: %s", index_path)
            restored += 1

    print("\n[✓] Авто-инъекция полностью удалена! Discord возвращен в исходное состояние.")
    return True


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1].lower() in ("uninstall", "remove", "-u"):
        uninstall()
    else:
        install()
