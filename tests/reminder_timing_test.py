from pathlib import Path
import os
import subprocess
import tempfile

root = Path(__file__).resolve().parents[1]
java_root = root / "android/app/src/main/java/pl/tomaszwolak/dzienniczekhormonuwzrostu"
cache = Path(os.environ.get("TEMP", tempfile.gettempdir()))
with tempfile.TemporaryDirectory(prefix="dh-reminder-test-", dir=cache) as work:
    subprocess.run(["javac", "-encoding", "UTF-8", "-d", work,
                    str(java_root / "ReminderTiming.java"), str(root / "tests/ReminderTimingTest.java")], check=True)
    subprocess.run(["java", "-cp", work, "pl.tomaszwolak.dzienniczekhormonuwzrostu.ReminderTimingTest"], check=True)
