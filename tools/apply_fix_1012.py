#!/usr/bin/env python3
from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]

subprocess.run([sys.executable, str(ROOT / 'tools/set_version.py'), '1.0.13', '3914'], check=True)

bootstrap_path = ROOT / 'src/app/00_bootstrap.js'
bootstrap = bootstrap_path.read_text(encoding='utf-8')

if "const BACKUP_REMINDER_KEY" not in bootstrap:
    bootstrap = bootstrap.replace(
        "  const BACKUP_STORAGE_KEY = 'dzienniczek-hormonu-wzrostu-v1-backup';\n",
        "  const BACKUP_STORAGE_KEY = 'dzienniczek-hormonu-wzrostu-v1-backup';\n"
        "  const BACKUP_REMINDER_KEY = 'dzienniczek-hormonu-backup-reminder-v1';\n"
        "  const BACKUP_REMINDER_INTERVAL_MS = 3 * 24 * 60 * 60 * 1000;\n",
        1
    )

if 'maybeScheduleBackupReminder();' not in bootstrap:
    bootstrap = bootstrap.replace(
        "    flushStartupWarnings();\n",
        "    flushStartupWarnings();\n    maybeScheduleBackupReminder();\n",
        1
    )

bootstrap_path.write_text(bootstrap, encoding='utf-8')

backup_path = ROOT / 'src/app/80_backup_import.js'
backup = backup_path.read_text(encoding='utf-8')

if "localStorage.setItem(BACKUP_REMINDER_KEY" not in backup:
    backup = backup.replace(
        "    downloadFile(filename, JSON.stringify(payload, null, 2), 'application/json');\n",
        "    downloadFile(filename, JSON.stringify(payload, null, 2), 'application/json');\n"
        "    try { localStorage.setItem(BACKUP_REMINDER_KEY, String(Date.now())); } catch (error) { console.warn(error); }\n",
        1
    )

if 'function maybeScheduleBackupReminder()' not in backup:
    backup += r'''

  function maybeScheduleBackupReminder() {
    let lastReminder = 0;
    try {
      lastReminder = Number(localStorage.getItem(BACKUP_REMINDER_KEY) || 0);
    } catch (error) {
      console.warn(error);
      return;
    }

    const now = Date.now();
    if (!Number.isFinite(lastReminder) || lastReminder <= 0) {
      try { localStorage.setItem(BACKUP_REMINDER_KEY, String(now)); } catch (error) { console.warn(error); }
      return;
    }
    if (now - lastReminder < BACKUP_REMINDER_INTERVAL_MS) return;

    try { localStorage.setItem(BACKUP_REMINDER_KEY, String(now)); } catch (error) { console.warn(error); }
    window.setTimeout(() => {
      const accepted = window.confirm('Minęły 3 dni od ostatniego przypomnienia o kopii zapasowej. Czy pobrać teraz pełną kopię danych?');
      if (accepted) exportJson();
      else showToast('Przypomnę ponownie za 3 dni.', 'success');
    }, 1200);
  }
'''

backup_path.write_text(backup, encoding='utf-8')
print('Dodano przypomnienie o kopii zapasowej co 3 dni i ustawiono wersję 1.0.13 / 3914.')
