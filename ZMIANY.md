# Zmiany

## 2.3.3 (versionCode 2009002304)

Format danych bez zmian (16); identyfikator i podpis aplikacji zachowane.

- **Okno po „Zapisz podanie”** — przyciski nie reagowały, bo warstwa komunikatów przepuszczała dotyk „na wylot” (`pointer-events: none`). Teraz okno ma działające przyciski:
  - **Zapisz** — zapisuje podanie i zamyka okno,
  - **Edytuj** — otwiera formularz wpisu z danymi,
  - **Pomiń** — zamyka okno bez zapisu (dawkę jako pominiętą oznacza osobny przycisk „Oznacz jako pominięte”).
- Escape, Wstecz na Androidzie i dotknięcie tła działają jak „Pomiń”. Przyciski w komunikatach (Cofnij, Edytuj) znów działają.
- **Budowanie na Windows** — `BUILD.cmd` i `URUCHOM.cmd`; działa przy polskich znakach i spacjach w ścieżkach (alias ASCII `DH_Srodowiska` dla `D:\Users\Admin\Środowiska`, Python uruchamiany ze ścieżką względną w trybie UTF-8).
- Wyniki: `DzienniczekHormonu-2.3.3.apk` i `.aab` obok `BUILD.cmd`; bez podpisu — testowy `-debug.apk`.
- GitHub Actions publikuje APK/AAB w Releases repozytorium `tomalawsb/Hormon-Wzrostu-APK`.
- Uporządkowano paczkę: jeden skrypt pomocniczy `tools/dzienniczek.ps1`, jeden README.

## Wcześniej

- **2.3.2** — szybsze raporty PDF i DOCX, systemowe drukowanie na Androidzie, Wstecz wraca do ekranu Dzisiaj (wyjście po dwóch naciśnięciach).
- **2.3.1** — przygotowanie do Google Play, szyfrowany magazyn danych na Androidzie, ampułki i zapas.
