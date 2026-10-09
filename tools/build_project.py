#!/usr/bin/env python3
"""Build a disposable source mirror; keep toolchains, caches and logs outside sources."""
from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import time
import zipfile

EXCLUDED_DIRS = {'.git', '.gradle', 'build', 'node_modules', 'www', 'dist', '__pycache__',
                 '.cache', '.idea', '.vscode', 'GOTOWE_APK', 'signing', '.android-sdk',
                 '.gradle-user-home', 'test-results', 'playwright-report'}
GENERATED = {'app.js', 'index.html', 'style.css', 'native-bridge.js', 'report-worker.js'}
EXCLUDED_SUFFIXES = {'.apk', '.aab', '.apks', '.zip', '.log', '.tmp', '.pyc', '.jks', '.p12', '.keystore', '.pem'}


def source_files(root: Path):
    for directory, dirs, files in os.walk(root):
        dirs[:] = sorted(d for d in dirs if d not in EXCLUDED_DIRS and not (Path(directory) / d).is_symlink())
        for name in sorted(files):
            path = Path(directory) / name
            rel = path.relative_to(root)
            if path.is_symlink() or path.suffix.lower() in EXCLUDED_SUFFIXES:
                continue
            if len(rel.parts) == 1 and name in GENERATED:
                continue
            if rel.as_posix().startswith('android/app/src/main/assets/web/'):
                continue
            if name in {'local.properties', 'release-config.json', 'GITHUB_SECRETS_DO_WKLEJENIA.txt', 'desktop.ini', 'Thumbs.db'} or name.startswith('.env') or '.sha256' in name:
                continue
            yield rel


def export_sources(root: Path, destination: Path):
    """Copy only publishable sources (used for the GitHub upload checkout)."""
    destination = destination.resolve()
    if destination == root or destination.is_relative_to(root):
        raise RuntimeError('Cel kopii musi leżeć poza projektem.')
    for rel in source_files(root):
        target = destination / rel
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(root / rel, target)


def digest(path: Path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def sync_sources(root: Path, work: Path, state: Path):
    current = {p.as_posix() for p in source_files(root)}
    old = set(json.loads(state.read_text('utf-8'))) if state.exists() else set()
    for name in old - current:
        target = (work / name).resolve()
        if target.is_relative_to(work.resolve()) and target.is_file():
            target.unlink()
    for name in current:
        source, target = root / name, work / name
        if not target.exists() or digest(source) != digest(target):
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(source, target)
    state.write_text(json.dumps(sorted(current)), 'utf-8')


def package_sources(root: Path, destination: Path):
    with zipfile.ZipFile(destination, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for rel in source_files(root):
            archive.write(root / rel, rel.as_posix())
    with zipfile.ZipFile(destination) as archive:
        if archive.testzip() or 'BUILD.cmd' not in archive.namelist():
            raise RuntimeError('Nieprawidłowa paczka źródłowa.')


def signing_configured(env) -> bool:
    """Mirror the lookup order of android/app/build.gradle (no secrets are read here)."""
    if env.get('ANDROID_KEYSTORE_FILE') and env.get('ANDROID_KEYSTORE_PASSWORD') and Path(env['ANDROID_KEYSTORE_FILE']).is_file():
        return True
    candidates = []
    if env.get('SIGNING_PROPERTIES_FILE'):
        candidates.append(Path(env['SIGNING_PROPERTIES_FILE']))
    if env.get('LOCALAPPDATA'):
        candidates.append(Path(env['LOCALAPPDATA']) / 'DzienniczekHormonu/signing/signing.properties')
    candidates.append(Path.home() / '.dzienniczek-hormonu/signing.properties')
    return any(path.is_file() for path in candidates)


def publish(source: Path, target: Path):
    pending = target.with_name(target.name + '.tmp')
    shutil.copy2(source, pending)
    os.replace(pending, target)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--project', type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument('--environments', type=Path, required=True)
    parser.add_argument('--web-only', action='store_true')
    parser.add_argument('--prepare-only', action='store_true')
    parser.add_argument('--check-only', action='store_true')
    parser.add_argument('--serve', action='store_true', help='Przygotuj stronę i uruchom lokalny podgląd.')
    parser.add_argument('--port', type=int, default=8080)
    parser.add_argument('--export-sources', type=Path, help='Skopiuj same źródła do wskazanego katalogu.')
    args = parser.parse_args()
    if args.serve:
        args.prepare_only = True
    root, environments = args.project.resolve(), args.environments.resolve()
    if args.export_sources:
        export_sources(root, args.export_sources)
        print('Skopiowano źródła do: ' + str(args.export_sources))
        return 0
    if environments == root or environments.is_relative_to(root):
        raise RuntimeError('Środowiska muszą znajdować się poza projektem.')
    identity = hashlib.sha256(str(root).lower().encode()).hexdigest()[:12]
    external = environments / 'DzienniczekHormonu' / identity
    work = external / 'work'
    work.mkdir(parents=True, exist_ok=True)
    lock_path = external / 'build.lock'
    lock = lock_path.open('a+b')
    if os.name == 'nt':
        import msvcrt
        lock.seek(0)
        if lock.read(1) == b'':
            lock.write(b'0')
            lock.flush()
        lock.seek(0)
        try:
            msvcrt.locking(lock.fileno(), msvcrt.LK_NBLCK, 1)
        except OSError as error:
            raise RuntimeError('Budowanie tego projektu jest już uruchomione.') from error
    else:
        import fcntl
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    logs = external / 'logs'
    logs.mkdir(exist_ok=True)
    log_path = logs / (time.strftime('%Y%m%d-%H%M%S') + '.log')
    env = os.environ.copy()
    env['DH_BUILD_WORKSPACE'] = '1'
    env['ANDROID_CHECK_REQUIRED'] = '1'
    env['PYTHONUTF8'] = '1'
    env['PYTHONDONTWRITEBYTECODE'] = '1'
    env['GRADLE_USER_HOME'] = str(environments / 'Gradle')
    env['npm_config_cache'] = str(environments / 'npm-cache')
    env['PLAYWRIGHT_BROWSERS_PATH'] = str(environments / 'Playwright')
    temp = external / 'tmp'
    temp.mkdir(exist_ok=True)
    env['TEMP'] = env['TMP'] = str(temp)
    npm = shutil.which('npm.cmd' if os.name == 'nt' else 'npm')
    if not npm:
        raise RuntimeError('Nie znaleziono npm. Uruchom BUILD.cmd.')
    print(f'Źródła: {root}\nKopia robocza: {work}\nDziennik: {log_path}', flush=True)
    with log_path.open('w', encoding='utf-8') as log:
        def run(command, cwd=work):
            print('> ' + ' '.join(map(str, command)), flush=True)
            log.write('> ' + ' '.join(map(str, command)) + '\n')
            # cmd files need cmd.exe on Windows; list2cmdline preserves spaces and Unicode.
            if os.name == 'nt' and str(command[0]).lower().endswith(('.cmd', '.bat')):
                command = [os.environ.get('COMSPEC', 'cmd.exe'), '/d', '/s', '/c', subprocess.list2cmdline(list(map(str, command)))]
            process = subprocess.Popen(command, cwd=cwd, env=env, stdout=subprocess.PIPE,
                                       stderr=subprocess.STDOUT, text=True, encoding='utf-8', errors='replace')
            for line in process.stdout:
                log.write(line)
                log.flush()
                print(line, end='', flush=True)
            if process.wait():
                raise RuntimeError(f'Polecenie nie powiodło się. Dziennik: {log_path}')

        sync_sources(root, work, external / 'source-files.json')
        source_snapshot = {p.as_posix(): digest(root / p) for p in source_files(root)}
        dependency_key = digest(work / 'package-lock.json') + subprocess.check_output(['node', '--version'], text=True).strip()
        marker = external / 'dependencies.txt'
        if not marker.exists() or marker.read_text() != dependency_key or not (work / 'node_modules/.bin/esbuild.cmd' if os.name == 'nt' else work / 'node_modules/.bin/esbuild').exists():
            run([npm, 'ci', '--no-audit', '--no-fund'])
            marker.write_text(dependency_key)
        run([npm, 'run', 'prepare:web'])
        if args.prepare_only:
            print('PREPARE_OK=' + str(work))
            if args.serve:
                lock.close()
                server = [shutil.which('node') or 'node', 'tools/serve_static.js', 'www', '--port', str(args.port), '--open']
                print('> ' + ' '.join(server), flush=True)
                try:
                    return subprocess.call(server, cwd=work, env=env)
                except KeyboardInterrupt:
                    return 0
            return 0
        run([npm, 'run', 'test:web'])
        if args.web_only:
            print('WEB_TESTS_OK=' + str(work))
            return 0
        run([npm, 'run', 'test:android'])
        if args.check_only:
            return 0
        version = json.loads((work / 'app-version.json').read_text('utf-8'))['version']
        output = external / 'release'
        output.mkdir(exist_ok=True)
        if not signing_configured(env):
            debug_apk = work / 'android/app/build/outputs/apk/debug/app-debug.apk'
            if not debug_apk.is_file() or debug_apk.stat().st_size == 0:
                raise RuntimeError('Brak APK debug. Dziennik: ' + str(log_path))
            name = f'DzienniczekHormonu-{version}-debug.apk'
            publish(debug_apk, output / name)
            publish(debug_apk, root / name)
            print('')
            print('UWAGA: brak konfiguracji podpisu wydania.')
            print(f'Zbudowano tylko testowy APK (debug): {root / name}')
            print('Nie ma AAB do Google Play. Uruchom KONFIGURUJ_PODPIS.cmd, a potem ponownie BUILD.cmd.')
            print('GOTOWE (debug): ' + str(root))
            lock.close()
            return 0
        # Względne ścieżki: kopia robocza leży pod aliasem ASCII, a polecenia nie dostają ścieżek z polskimi znakami.
        gradle = work / 'android' / ('gradlew.bat' if os.name == 'nt' else 'gradlew')
        if os.name != 'nt':
            gradle.chmod(gradle.stat().st_mode | 0o111)
        run(['gradlew.bat' if os.name == 'nt' else './gradlew', '--no-daemon', '-Pandroid.overridePathCheck=true', 'assembleRelease', 'bundleRelease'], work / 'android')
        apk = work / 'android/app/build/outputs/apk/release/app-release.apk'
        aab = work / 'android/app/build/outputs/bundle/release/app-release.aab'
        sdk = Path(env.get('ANDROID_HOME', str(environments / 'Android_SDK')))
        apksigner = sdk / 'build-tools/36.0.0' / ('apksigner.bat' if os.name == 'nt' else 'apksigner')
        run([str(apksigner), 'verify', '--verbose', apk.relative_to(work).as_posix()])
        run(['jarsigner', '-verify', aab.relative_to(work).as_posix()])
        bundletools = list((environments / 'Bundletool').glob('bundletool*.jar'))
        if bundletools:
            run(['java', '-jar', str(sorted(bundletools)[-1]), 'validate', '--bundle=' + aab.relative_to(work).as_posix()])
        if source_snapshot != {p.as_posix(): digest(root / p) for p in source_files(root)}:
            raise RuntimeError('Źródła zmieniły się podczas budowania. Uruchom BUILD.cmd ponownie.')
        archive = output / f'DzienniczekHormonu-{version}-zrodla.zip'
        package_sources(root, archive)
        artifacts = {f'DzienniczekHormonu-{version}.apk': apk,
                     f'DzienniczekHormonu-{version}.aab': aab}
        for name, source in artifacts.items():
            if not source.is_file() or source.stat().st_size == 0:
                raise RuntimeError('Brak poprawnego wyniku: ' + name)
        sums = []
        for name, source in artifacts.items():
            publish(source, output / name)
            publish(source, root / name)
            sums.append(digest(root / name) + '  ' + name)
        sums.append(digest(archive) + '  ' + archive.name)
        (output / f'DzienniczekHormonu-{version}.sha256').write_text('\n'.join(sums) + '\n', 'utf-8')
        print('Kopie wyników, ZIP źródeł i sumy SHA-256: ' + str(output))
        print('GOTOWE: ' + str(root))
    lock.close()
    return 0


if __name__ == '__main__':
    try:
        raise SystemExit(main())
    except Exception as error:
        print('BŁĄD: ' + str(error), file=sys.stderr)
        raise SystemExit(1)
