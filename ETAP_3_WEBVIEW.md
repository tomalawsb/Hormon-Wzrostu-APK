# Etap 3 — zabezpieczenie WebView

## Co wdrożono

- APK ładuje dziewięć jawnie dozwolonych zasobów przez `WebViewAssetLoader` z domeny `https://appassets.androidplatform.net`.
- Żądania sieciowe WebView, obce zasoby, nieznane ścieżki i nawigacja poza dokument aplikacji są blokowane.
- Jedynym wyjątkiem wewnętrznym jest lokalny `about:srcdoc`/`about:blank` używany przez podgląd raportu; nie może stać się dokumentem głównym.
- Zewnętrzne adresy są dopuszczane wyłącznie jako poprawne HTTPS na porcie 443 i otwierane przez systemową przeglądarkę.
- Wyłączono dostęp `file://`, `content://`, dostęp między plikami, geolokalizację, dodatkowe okna, cookies i mixed content.
- Generowanie `BuildConfig` jest jawnie włączone, a debugowanie WebView zależy od `BuildConfig.DEBUG`, więc wariant release ma je wyłączone.
- Błędy TLS są zawsze odrzucane, a prośba o mikrofon wymaga zaufanego originu aplikacji.
- CSP zezwala na lokalne skrypty, style i zasoby oraz tylko na API GitHub używane przez aktualizator PWA. Skrypty inline zostały usunięte.
- Odpowiedź głównego dokumentu APK dostaje dodatkowo CSP z `frame-ancestors 'none'`, `nosniff`, `no-referrer` i ograniczoną `Permissions-Policy`.

## Przegląd AndroidNativeApi

Każda z 25 metod sprawdza `bridgeAllowed()`. Most działa tylko wtedy, gdy głównym dokumentem jest zaufany `index.html`; przy błędzie, obcej stronie lub zamknięciu aplikacji zostaje wyłączony.

| Grupa               | Metody                                                                                                                                                                  | Dodatkowe ograniczenie                                                   |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Informacje          | `isNative`, `appVersion`, `latestReleaseJson`, `initialize`                                                                                                             | Aktualizator łączy się natywnie tylko ze stałym adresem GitHub Release   |
| Uprawnienia         | `microphonePermission`, `requestMicrophonePermission`, `notificationPermission`, `requestNotificationPermission`, `exactAlarmPermission`, `requestExactAlarmPermission` | Mikrofon wymaga dokładnego originu i tylko zasobu audio                  |
| Przypomnienia       | `syncDailyReminders`, `showNotification`                                                                                                                                | Limity rozmiaru JSON; niepoprawne dane są odrzucane                      |
| Linki               | `openExternalUrl`                                                                                                                                                       | Wyłącznie HTTPS, bez danych logowania, port 443, poza domeną zasobów APK |
| Dane i kryptografia | `secureStorageRead`, `secureStorageWrite`, `secureStorageRemove`, `secureStorageType`, `randomBase64`, `pinHash`, `encryptBackup`, `decryptBackup`                      | Pozostają limity, formaty i lista slotów z etapu 2                       |
| Dostęp do aplikacji | `biometricStatus`, `requestBiometricUnlock`, `openAppSettings`, `exitApp`                                                                                               | Operacje UI są ponownie sprawdzane na głównym wątku                      |

`syncDailyReminders` oraz obsługa exact alarm pozostają w dotychczasowym zakresie funkcjonalnym; ich pełne wdrożenie i diagnostyka należą do etapu 10.

## Testy

`npm test` uruchamia teraz także `tests/webview_security_test.py`. Test kontroluje ustawienia WebView, generowanie `BuildConfig`, allowlistę zasobów, wszystkie metody mostu, CSP i brak skryptów inline.

Po zbudowaniu APK na GitHubie należy ręcznie sprawdzić uruchomienie aplikacji, mikrofon, import pliku, biometrię, sprawdzanie aktualizacji i otwieranie linku w przeglądarce. W release trzeba też potwierdzić brak dostępu przez `chrome://inspect`.

APK nie był budowany lokalnie zgodnie z ustaleniem. Pliki `.cmd` i `.ps1` nie zostały zmienione.

## Dokumentacja techniczna

- [Android: ładowanie lokalnej treści przez WebViewAssetLoader](https://developer.android.com/develop/ui/views/layout/webapps/load-local-content)
- [Android: ryzyko mostów natywnych WebView](https://developer.android.com/privacy-and-security/risks/insecure-webview-native-bridges)
- [Android: ochrona przed niebezpiecznym dostępem do plików](https://developer.android.com/privacy-and-security/risks/webview-unsafe-file-inclusion)
