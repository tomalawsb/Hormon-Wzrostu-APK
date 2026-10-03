# Dzienniczek Hormonu 2.3.2

Wersja aplikacji: **2.3.2**, versionCode: **2009002303**. Format danych pozostaje w wersji 16; aktualizacja nie wymaga migracji historii. Zachowano identyfikator aplikacji i konfigurację podpisu wydania. Nie wykonano publikacji w Google Play.

## Etap 1 — wspólne przygotowanie raportów

- Dane komórki obliczane są raz dla wiersza, zamiast ponownie dla każdej kolumny. Formatery dat są współdzielone.
- Historia ampułek jest grupowana po pojedynczym posortowaniu wpisów. Obliczenia uwzględniają dawki sprzed początku wybranego okresu; pominięty zastrzyk nie zużywa zawartości.
- Opis filtrów nie buduje pełnej historii ampułek. Okres raportu wyznaczany jest bez dodatkowego sortowania.
- Snapshot raportu zawiera kolumny, sformatowane wiersze, podsumowania, dane leczenia, ostatnie pomiary i zmiany dawki. Drukowanie wykorzystuje snapshot otwartego podglądu, dzięki czemu nie zmienia danych podczas wyboru drukarki.

## Etap 2 — PDF i drukowanie

Android tworzy tekstowy PDF przez `PdfDocument` na osobnym wątku. Nie powstają bitmapy wszystkich stron ani kopia PDF w Base64 w WebView. Układ A4 jest poziomy, zawiera powtarzane nagłówki tabel, polskie znaki i numerację. Długie komórki oraz opisy mogą przechodzić na kolejne strony bez ucinania.

„PDF” nadal otwiera zwykłe systemowe „Zapisz jako”. Dokument zapisywany jest bezpośrednio do wskazanego miejsca; aplikacja nie pozostawia jawnego raportu w swoim katalogu tymczasowym. „Drukuj” uruchamia systemowy `PrintManager`, obsługuje zakres stron, format papieru, marginesy drukarki, anulowanie i błędy. Zamknięcie okna drukowania nie jest przedstawiane jako potwierdzenie fizycznego wydruku.

Most `NativeBridge.reportPdf(model, filename, print)` korzysta z identyfikatorów zadań i zdarzeń `nativeReportResult` (przygotowanie, wybór miejsca, zapis, wynik). Most nadal wymaga zaufanej strony, limituje wielkość danych i nie otwiera dostępu do sieci.

W przeglądarce pozostaje eksport przez canvas, ale koduje on i zwalnia jedną stronę naraz. Nadal używa obrazów; największa redukcja rozmiaru PDF dotyczy Androida.

## Etap 3 — DOCX i stan eksportu

Dokument Word powstaje w lokalnym Web Workerze, obejmując składanie XML i ZIP oraz CRC32 z tablicą 256 wartości. Wynik jest przekazywany jako przenoszony bufor. Worker jest częścią zasobów Androida oraz cache offline PWA. Nie dodano zewnętrznego serwisu ani biblioteki raportowej.

Android zapisuje DOCX poza wątkiem interfejsu. Podczas generowania i wyboru miejsca przyciski raportów są zablokowane, po błędzie lub anulowaniu zostają odblokowane. Poprawiono oczekiwanie na wynik eksportu Word: okno wyboru formatu nie zamyka się już przed zakończeniem asynchronicznego zapisu. Komunikat sukcesu pojawia się po zapisie.

## Etap 4 — Wstecz

AndroidX przekazuje przycisk oraz gest Wstecz do aplikacji. Otwarte okno jest najpierw zamykane przez jego procedurę anulowania. Z ustawień, historii i kalendarza Wstecz prowadzi do Dzisiaj. Na Dzisiaj pierwsze naciśnięcie pokazuje komunikat, a drugie w ciągu 2 sekund zamyka Activity. Powrót z innego ekranu nie liczy się do wyjścia.

Otwarcie okna, zmiana ekranu, dotknięcie interfejsu lub przejście w tło zerują licznik. Blokada PIN nie jest obchodzona. Wyjście nie wywołuje anulowania alarmów ani zatrzymania aplikacji przez system.

## Etap 5 — pomiary i sprawdzenia

Pomiary wykonano na emulatorze Android 16 / API 36 na danych syntetycznych. Czas użytkownika w oknie „Zapisz jako” jest wyłączony. To obserwacje testowe, a nie gwarancja czasu na każdym telefonie.

| Wpisy | Stary PDF: generowanie | Stary DOCX: składanie | Nowy DOCX: składanie w Workerze | Stary PDF: bajty | Nowy PDF: bajty |
| ----- | ---------------------: | --------------------: | ------------------------------: | ---------------: | --------------: |
| 100   |                 941 ms |                 72 ms |                           32 ms |        1 450 958 |          95 784 |
| 1000  |                2905 ms |                651 ms |                           88 ms |       13 782 084 |         305 941 |
| 5000  |              15 413 ms |               3336 ms |                          434 ms |       69 042 987 |       1 232 786 |

Dla 5000 wpisów nowy PDF potrzebował około 1041 ms na układ i 1291 ms na wygenerowanie/zapis do pliku (razem około 2,33 s), dodatkowo około 627 ms na przygotowanie wspólnego modelu w JavaScript. Stary PDF potrzebował około 447 ms na przygotowanie konfiguracji, a następnie 15,41 s na samo generowanie. Nowy DOCX również wymaga wspólnego modelu: 434 ms w tabeli oznacza samo składanie pliku, nie cały eksport. Rozmiar DOCX dla 5000 wpisów pozostał zbliżony: 11 846 126 → 11 845 960 bajtów. Kolejne próby wykazywały zmienność czasu zapisu zależną od obciążenia emulatora i dostawcy plików.

Sprawdzenia:

- Pełny zestaw testów web, migracji, danych medycznych, motywów, ampułek, alarmów, bezpieczeństwa mostu, DOM i dostępności; Android Lint i kompilacja debug.
- Nowy test regresyjny `tests/reports_runtime_test.js`: zużycie przed początkiem raportu, pominięcia, niezmienność danych, kompletność DOCX, CRC ZIP, poprawność XML i logika Wstecz.
- Odczyt wszystkich 5000 wpisów z PDF, polskie znaki, pierwsza i ostatnia strona oraz numeracja; wizualne sprawdzenie wygenerowanych stron.
- Bardzo długa notatka i opis medyczny oraz dwa profile: 9 stron, pełna treść wraz z końcowymi znacznikami, bez obcięcia.
- Systemowy „Drukuj”: otwarcie z przycisku aplikacji, anulowanie, ponowne otwarcie oraz zapis zakresu stron 2–3; wynik zawiera dokładnie 2 strony i zachowuje numery 2/68 oraz 3/68. Fizyczna drukarka nie była podłączona.
- Zapis DOCX na Androidzie i odczyt ZIP/XML: wszystkie 1000 wierszy plus nagłówek. Anulowanie rzeczywistego eksportu Word pozostawia okno otwarte i ponownie włącza przyciski. Nie przeprowadzono wizualnego testu w Microsoft Word.
- Natywny Wstecz z ustawień, kalendarza i historii, gest od krawędzi, zamknięcie podglądu, pojedyncze naciśnięcie na Dzisiaj, przekroczenie 2 sekund, zerowanie po przejściu w tło oraz wyjście po dwóch szybkich naciśnięciach.

## Pliki wydania i czystość projektu

`BUDUJ.cmd` pracuje względem swojego folderu. Zależności, cache, logi, testowe PDF/DOCX i pośrednie pliki kompilacji pozostają poza projektem w `D:\Users\Admin\Środowiska`. W głównym folderze powstają APK, AAB, ZIP źródeł i sumy SHA-256 wersji 2.3.2. ZIP nie zawiera APK/AAB, środowiska, cache, plików build, wygenerowanych kopii zasobów ani dodatkowego folderu opakowującego.

Zmiany nie obejmują zgłoszonego wcześniej, osobnego problemu wycofania zmiany stanu ampułki po nieudanym zapisie przy jej odkładaniu. Pozostaje on poza tym zakresem do odrębnej decyzji.

Podpisy APK v2/v3 i AAB zostały zweryfikowane, a Android App Bundle przeszedł walidację Bundletool. Android Lint nie zgłosił problemów.
