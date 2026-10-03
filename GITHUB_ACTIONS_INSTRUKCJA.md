# GitHub Actions

Workflow `.github/workflows/android-ci.yml` sprawdza PR, wysłanie na main i uruchomienie ręczne. Kopiuje źródła do RUNNER_TEMP, instaluje zależności w kopii, uruchamia pełne testy web, lint Androida i kompilację debug. Na main lub uruchomieniu ręcznym buduje również podpisane APK i AAB. Pobierz je z Artifacts danego uruchomienia; retencja 14 dni. Workflow nie publikuje aplikacji w Google Play, GitHub Releases ani Pages.

W Settings → Secrets and variables → Actions ustaw sekrety zgodne z dotychczasowym kluczem: ANDROID_KEYSTORE_BASE64, ANDROID_KEYSTORE_PASSWORD, ANDROID_KEY_ALIAS, ANDROID_KEY_PASSWORD. Hasła nie trafiają do źródeł. Klucz jest odtwarzany w katalogu tymczasowym runnera i usuwany po budowaniu. PR nie otrzymuje sekretów podpisu. Brak sekretów powoduje błąd etapu release, nie zastępczy podpis debug.

Lokalnie wystarcza BUDUJ.cmd. Skrypty wysyłające na GitHub uruchamiaj dopiero, gdy chcesz faktycznie wysłać zmiany do zdalnego repozytorium.
