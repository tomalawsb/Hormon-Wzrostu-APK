#!/usr/bin/env python3
"""Exercise source filtering, mirror synchronization and source archive layout."""
import importlib.util
from pathlib import Path
import tempfile
import zipfile

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("build_project", ROOT / "tools/build_project.py")
builder = importlib.util.module_from_spec(spec)
spec.loader.exec_module(builder)

with tempfile.TemporaryDirectory(prefix="dzienniczek-layout-") as temporary:
    base = Path(temporary).resolve()
    root, work = base / "source", base / "work"
    root.mkdir()
    work.mkdir()
    files = {
        "BUDUJ.cmd": "builder", "src/source.js": "source",
        "android/gradle/wrapper/gradle-wrapper.jar": "wrapper",
        "android/app/build/large.bin": "compiled", "node_modules/large.js": "dependency",
        "android/.gradle/cache.bin": "cache", "app.js": "generated",
        "android/app/src/main/assets/web/index.html": "generated",
        "output.apk": "binary", "output.zip": "archive", "private.jks": "key",
        "android/signing/signing.properties": "secret", ".env": "secret",
        "android/local.properties": "local", "cache.tmp": "temporary",
    }
    for name, value in files.items():
        target = root / name
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(value)
    expected = {"BUDUJ.cmd", "src/source.js", "android/gradle/wrapper/gradle-wrapper.jar"}
    assert {p.as_posix() for p in builder.source_files(root)} == expected
    before = {p: builder.digest(root / p) for p in builder.source_files(root)}
    state = base / "state.json"
    builder.sync_sources(root, work, state)
    assert (work / "src/source.js").read_text() == "source"
    (work / "node_modules").mkdir()
    (work / "node_modules/cached.js").write_text("reuse")
    (root / "src/source.js").unlink()
    builder.sync_sources(root, work, state)
    assert not (work / "src/source.js").exists()
    assert (work / "node_modules/cached.js").read_text() == "reuse"
    (root / "src/source.js").write_text("source")
    archive = base / "sources.zip"
    builder.package_sources(root, archive)
    with zipfile.ZipFile(archive) as package:
        assert set(package.namelist()) == expected
        assert package.testzip() is None
    assert before == {p: builder.digest(root / p) for p in builder.source_files(root)}
print("Build layout: OK — clean sources, reused dependencies, no secrets/cache in ZIP, no wrapper directory.")
