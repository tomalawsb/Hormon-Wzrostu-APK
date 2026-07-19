#!/usr/bin/env python3
from __future__ import annotations

import json
import re
import xml.etree.ElementTree as ET
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
JAVA_ROOT = ROOT / "android/app/src/main/java/pl/tomaszwolak/dzienniczekhormonuwzrostu"
ANDROID_NS = "{http://schemas.android.com/apk/res/android}"


def read(path: Path | str) -> str:
    target = path if isinstance(path, Path) else ROOT / path
    return target.read_text(encoding="utf-8")


def require(condition: bool, message: str) -> None:
    if not condition:
        raise SystemExit("BŁĄD ETAPU 10: " + message)


manifest_path = ROOT / "android/app/src/main/AndroidManifest.xml"
manifest = read(manifest_path)
root = ET.fromstring(manifest)
permissions = {
    node.attrib.get(ANDROID_NS + "name", "") for node in root.findall("uses-permission")
}
require("android.permission.POST_NOTIFICATIONS" in permissions, "brak POST_NOTIFICATIONS")
require("android.permission.RECEIVE_BOOT_COMPLETED" in permissions, "brak RECEIVE_BOOT_COMPLETED")
require("android.permission.SCHEDULE_EXACT_ALARM" in permissions, "brak SCHEDULE_EXACT_ALARM")
require("android.permission.USE_EXACT_ALARM" not in permissions, "użyto ograniczonego polityką USE_EXACT_ALARM")

receivers = {
    node.attrib.get(ANDROID_NS + "name", ""): node
    for node in root.findall("./application/receiver")
}
require(".ReminderAlarmReceiver" in receivers, "brak odbiornika zaplanowanego alarmu")
require(".ReminderRestoreReceiver" in receivers, "brak odbiornika odtwarzającego alarmy")
for name, node in receivers.items():
    require(node.attrib.get(ANDROID_NS + "exported") == "false", f"odbiornik {name} jest eksportowany")
restore_actions = {
    action.attrib.get(ANDROID_NS + "name", "")
    for action in receivers[".ReminderRestoreReceiver"].findall("./intent-filter/action")
}
for action in (
    "android.intent.action.BOOT_COMPLETED",
    "android.intent.action.MY_PACKAGE_REPLACED",
    "android.intent.action.TIME_SET",
    "android.intent.action.TIMEZONE_CHANGED",
    "android.app.action.SCHEDULE_EXACT_ALARM_PERMISSION_STATE_CHANGED",
):
    require(action in restore_actions, f"brak odtwarzania po zdarzeniu {action}")

scheduler = read(JAVA_ROOT / "ReminderScheduler.java")
alarm_receiver = read(JAVA_ROOT / "ReminderAlarmReceiver.java")
restore_receiver = read(JAVA_ROOT / "ReminderRestoreReceiver.java")
main = read(JAVA_ROOT / "MainActivity.java")
secure_store = read(JAVA_ROOT / "SecureDataStore.java")

for token in (
    "canScheduleExactAlarms()",
    "setExactAndAllowWhileIdle",
    "setAndAllowWhileIdle",
    "PendingIntent.FLAG_IMMUTABLE",
    "ReminderAlarmReceiver.class",
    "notificationsEnabled(Context context)",
    "NotificationManager.IMPORTANCE_NONE",
    "R.drawable.ic_stat_notify",
    "scheduleAndPersist",
):
    require(token in scheduler, f"brak mechanizmu Android: {token}")
require(
    "SecureDataStore.REMINDER_SCHEDULE_SLOT" in scheduler
    and "REMINDER_SCHEDULE_SLOT" in secure_store,
    "harmonogram nie jest zapisany w szyfrowanym magazynie",
)
require("goAsync()" in alarm_receiver, "alarm wykonuje pracę blokującą bez goAsync")
require("goAsync()" in restore_receiver, "odtwarzanie alarmów wykonuje pracę bez goAsync")
require("Intent.ACTION_BOOT_COMPLETED" in restore_receiver, "restart telefonu nie odtwarza alarmów")
require("Intent.ACTION_MY_PACKAGE_REPLACED" in restore_receiver, "aktualizacja aplikacji nie odtwarza alarmów")

sync_method = re.search(
    r"public int syncDailyReminders\(String profilesJson\)\s*\{(.*?)\n\s*}",
    main,
    re.DOTALL,
)
require(sync_method is not None, "brak natywnej metody synchronizacji")
require(
    "ReminderScheduler.replaceSchedules" in sync_method.group(1),
    "natywna synchronizacja nadal nie planuje alarmów",
)
require(
    'public String exactAlarmPermission()' in main and "exactAlarmState()" in main,
    "stan dokładnych alarmów jest nadal atrapą",
)
for method in (
    "notificationDiagnostics",
    "openNotificationSettings",
    "requestExactAlarmPermission",
):
    require(f"public String {method}()" in main or f"public boolean {method}()" in main, f"brak mostu {method}")
require("ACTION_REQUEST_SCHEDULE_EXACT_ALARM" in main, "brak ekranu dostępu do dokładnych alarmów")
require("ACTION_APP_NOTIFICATION_SETTINGS" in main, "brak przejścia do ustawień powiadomień")
require("onNewIntent(Intent intent)" in main, "kliknięcie powiadomienia nie jest obsługiwane")
require(
    "notificationEventsReady" in main and "notificationEventsReady" in read("src/platform/native-events.js"),
    "powiadomienie może zostać obsłużone przed podpięciem zdarzeń JavaScript",
)

html = read("src/screens/settings/index.html")
for element_id in (
    "reminder-diagnostics-overall",
    "reminder-diagnostic-permission",
    "reminder-diagnostic-channel",
    "reminder-diagnostic-exact-alarm",
    "reminder-diagnostic-next",
    "refresh-reminder-diagnostics-button",
    "open-notification-settings-button",
    "request-exact-alarm-button",
    "test-notification-button",
):
    require(f'id="{element_id}"' in html, f"brak elementu diagnostyki {element_id}")

notifications = read("src/services/notifications/index.js")
native_bridge = read("src/native/native-bridge.js")
events = read("src/core/events.js")
require("async function refreshReminderDiagnostics" in notifications, "brak działania diagnostyki")
require("if (!shown)" in notifications, "test powiadomienia nadal może zgłosić fałszywy sukces")
require(
    "Przybliżona godzina" in notifications and "Możliwe opóźnienie" in notifications,
    "brak ostrzeżenia o alarmie przybliżonym",
)
require("notificationDiagnostics" in native_bridge, "most JS nie odczytuje diagnostyki Androida")
require("openNotificationSettings" in native_bridge, "most JS nie otwiera ustawień systemowych")
require("refresh-reminder-diagnostics-button" in events, "przycisk ponownej kontroli nie ma zdarzenia")

package = json.loads(read("package.json"))
scripts = package.get("scripts", {})
require("test:notifications" in scripts, "brak testu etapu 10 w package.json")
require("test:notifications" in scripts.get("test:web", ""), "pełne testy pomijają etap 10")

print(
    "Test etapu 10: OK — alarmy Android, restart/aktualizacja, diagnostyka, ustawienia i testowe powiadomienie"
)
