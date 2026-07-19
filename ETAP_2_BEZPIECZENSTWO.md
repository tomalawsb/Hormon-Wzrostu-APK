# Etap 2 — bezpieczeństwo danych

## Co wdrożono

- Android: AES-256-GCM, losowy IV dla każdego zapisu i niewyciągalny klucz w Android Keystore.
- PWA: AES-256-GCM oraz niewyciągalny klucz Web Crypto przechowywany w IndexedDB.
- Automatyczna migracja danych medycznych z `localStorage`; jawny zapis jest usuwany dopiero po udanym szyfrowaniu.
- Zaszyfrowany stan przypomnień service workera.
- Eksport `.ghbackup`: AES-256-GCM, PBKDF2-HMAC-SHA-256, 210 000 iteracji, losowa sól i IV.
- Import starszych plików JSON po ścisłej walidacji; interfejs wyraźnie oznacza je jako niezaszyfrowane.
- Odrzucanie niebezpiecznych kluczy JSON, zbyt dużych, zbyt głębokich i niespójnych danych.
- Opcjonalny PIN 6–12 cyfr, blokada po pięciu błędnych próbach i automatyczna blokada po opuszczeniu aplikacji.
- Opcjonalna biometria w APK; PIN pozostaje metodą awaryjną.
- Android `FLAG_SECURE` oraz osłona prywatności PWA podczas pracy w tle.

## Ważne

- Hasło pliku `.ghbackup` nie jest zapisywane i nie można go odzyskać.
- PIN i ustawienie biometrii dotyczą urządzenia, dlatego nie są przenoszone w kopii zapasowej.
- Raporty PDF, Word i CSV pozostają zwykłymi dokumentami, bo są przeznaczone do odczytu i wydruku. Szyfrowany jest eksport pełnej kopii danych.

## Kontrola po zbudowaniu APK

1. Zaktualizować poprzednią wersję bez czyszczenia danych i sprawdzić zachowanie historii.
2. Włączyć PIN, biometrię i każdą wartość czasu blokady.
3. Sprawdzić ekran ostatnich aplikacji oraz próbę wykonania zrzutu ekranu.
4. Wyeksportować `.ghbackup`, sprawdzić błędne hasło i wykonać ponowny import poprawnym hasłem.
5. Sprawdzić import starszej, jawnej kopii JSON.

APK nie był budowany lokalnie zgodnie z ustaleniem. Kontrolę kompilacji wykona workflow po ręcznym wysłaniu paczki.
