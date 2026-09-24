#!/usr/bin/env bash
set -euo pipefail

cat ci-paczkahub/part-*.txt | base64 --decode > /tmp/paczkahub.zip
echo "0603befea83865501db520cbb7db77bb4614497bbe3bfc7b49cd246c1066b829  /tmp/paczkahub.zip" | sha256sum -c -
rm -rf paczkahub dist
mkdir paczkahub dist
unzip -q /tmp/paczkahub.zip -d paczkahub

cat ci-paczkahub-v101/main-*.b64 | base64 --decode > paczkahub/app/src/main/java/pl/paczkahub/MainActivity.java
cp ci-paczkahub/build.gradle.1.0.1 paczkahub/app/build.gradle
cat ci-paczkahub-v102/patch-part-*.b64 | base64 --decode > /tmp/paczkahub-1.0.2.patch

cd paczkahub
patch --batch -p4 < /tmp/paczkahub-1.0.2.patch
base64 -d ../ci-paczkahub-v103/paczkahub-1.0.3.patch.gz.b64 | gzip -d > /tmp/paczkahub-1.0.3.patch
patch --batch -p5 < /tmp/paczkahub-1.0.3.patch
printf '\nandroid.useAndroidX=true\n' >> gradle.properties
cat ../ci-paczkahub-v104/part-*.b64 | base64 -d | gzip -d > /tmp/paczkahub-1.0.4.patch
patch --batch -p1 < /tmp/paczkahub-1.0.4.patch
base64 -d ../ci-paczkahub-v105/paczkahub-1.0.5.patch.gz.b64 | gzip -d > /tmp/paczkahub-1.0.5.patch
patch --batch -p1 < /tmp/paczkahub-1.0.5.patch
base64 -d ../ci-paczkahub-v106/paczkahub-1.0.6.patch.gz.b64 | gzip -d > /tmp/paczkahub-1.0.6.patch
patch --batch -p1 < /tmp/paczkahub-1.0.6.patch
base64 -d ../ci-paczkahub-v107/paczkahub-1.0.7.patch.gz.b64 | gzip -d > /tmp/paczkahub-1.0.7.patch
patch --batch -p1 < /tmp/paczkahub-1.0.7.patch

python3 - <<'PYFIX'
from pathlib import Path
p = Path('app/src/main/java/pl/paczkahub/util/AppPrefs.java')
s = p.read_text()
if 'getImapPassword(String email)' not in s:
    needle = '    public String getImapPassword(ImapAccount account) {\n        return account == null ? "" : crypto.getSecret(imapSecretKey(account.email));\n    }\n'
    repl = needle + '\n    public String getImapPassword(String email) {\n        return email == null ? "" : crypto.getSecret(imapSecretKey(email));\n    }\n'
    if needle not in s:
        raise SystemExit('Nie znaleziono miejsca dla poprawki IMAP')
    p.write_text(s.replace(needle, repl))

g = Path('app/build.gradle')
gs = g.read_text()
if 'PACZKAHUB_STABLE_DEBUG_SIGNING' not in gs:
    marker = '    buildTypes {\n'
    replacement = '''    // PACZKAHUB_STABLE_DEBUG_SIGNING\n    signingConfigs {\n        debug {\n            storeFile file(System.getProperty("user.home") + "/.android/debug.keystore")\n            storePassword "android"\n            keyAlias "androiddebugkey"\n            keyPassword "android"\n        }\n    }\n\n    buildTypes {\n        debug {\n            signingConfig signingConfigs.debug\n        }\n'''
    if marker not in gs:
        raise SystemExit('Nie znaleziono buildTypes dla podpisu')
    g.write_text(gs.replace(marker, replacement, 1))
PYFIX

base64 -d ../ci-paczkahub-v108/paczkahub-1.0.8.patch.gz.b64 | gzip -d > /tmp/paczkahub-1.0.8.patch
patch --batch -p1 < /tmp/paczkahub-1.0.8.patch
cat ../ci-paczkahub-v109/part-*.b64 | base64 -d | gzip -d > /tmp/paczkahub-1.0.9.patch
patch --batch -p1 < /tmp/paczkahub-1.0.9.patch

# Poprawka błędu kompilacji w pierwszym patchu 1.0.9.
python3 - <<'PY109'
from pathlib import Path
p = Path('app/src/main/java/pl/paczkahub/sync/ImapSyncManager.java')
s = p.read_text()
s = s.replace('for (Parcel p : db.getParcels(false)) before.put(parcelKey, p);', 'for (Parcel p : db.getParcels(false)) before.put(key(p), p);')
s = s.replace('for (Parcel p : db.getParcels(true)) before.put(parcelKey, p);', 'for (Parcel p : db.getParcels(true)) before.put(key(p), p);')
p.write_text(s)
PY109

grep -q "versionName '1.0.9'" app/build.gradle
grep -q 'A005OVO0Q6' tests/TestParser109.java
grep -q 'IN_TRANSIT_DELAYED' app/src/main/java/pl/paczkahub/mail/MailParser.java
grep -q 'MAX_GMAIL_MESSAGES = 0' app/src/main/java/pl/paczkahub/sync/ImapSyncManager.java

rm -rf /tmp/parser-test && mkdir -p /tmp/parser-test
javac -encoding UTF-8 -d /tmp/parser-test \
  app/src/main/java/pl/paczkahub/data/Carrier.java \
  app/src/main/java/pl/paczkahub/data/CustomFilter.java \
  app/src/main/java/pl/paczkahub/data/ParcelStatus.java \
  app/src/main/java/pl/paczkahub/mail/MimeDecoder.java \
  app/src/main/java/pl/paczkahub/mail/ParsedShipment.java \
  app/src/main/java/pl/paczkahub/mail/MailParser.java \
  tests/TestParser107.java tests/TestParser108.java tests/TestParser109.java
java -cp /tmp/parser-test TestParser107
java -cp /tmp/parser-test TestParser108
java -cp /tmp/parser-test TestParser109

gradle --no-daemon :app:assembleDebug --stacktrace
cd ..
APK='paczkahub/app/build/outputs/apk/debug/app-debug.apk'
"$ANDROID_SDK_ROOT/build-tools/35.0.0/apksigner" verify --verbose --print-certs "$APK" | tee dist/CERTIFICATE.txt
cp "$APK" dist/PaczkaHub-1.0.9.apk
sha256sum dist/PaczkaHub-1.0.9.apk > dist/SHA256SUMS.txt
rm -rf paczkahub/app/build paczkahub/.gradle paczkahub/build
cd paczkahub
zip -qr ../dist/PaczkaHub-1.0.9-kod-zrodlowy.zip . -x '*/build/*' '.gradle/*' '*.apk' '*.aab' 'local.properties'
