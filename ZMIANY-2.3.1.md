# Dzienniczek Hormonu 2.3.1

Wersja 2.3.1, versionCode 2009002302. Baza: wydanie 2.3.0 z poprawionym AndroidKeyStore. Wybrane funkcje przeniesiono z paczki POPRAWIONY-v12; zachowano potwierdzenie fizycznej wymiany i licznik oparty na ustawionej liczbie podań.

## Etap 1 — raporty z v12

- PDF, DOCX i CSV na Androidzie otwierają systemowe okno wyboru miejsca zapisu.
- Komunikat o sukcesie pojawia się po zapisaniu pliku. Anulowanie okna jest osobnym wynikiem, również dla kopii JSON.
- Podgląd historii na telefonie przedstawia wpisy jako czytelne karty. Wydruk zachowuje tabelę A4.
- Most Androida dopuszcza tylko obsługiwane typy raportów, ogranicza rozmiar i sprawdza zaufany adres aplikacji.

## Etap 2 — ampułki i migracja danych

- Ręczne rozpoczęcie nowej ampułki używa domyślnej liczby podań z ustawień.
- Korekta właśnie zakończonej ampułki, np. 10 → 12, przywraca tę samą ampułkę bez odejmowania zapasu.
- Nadal wymagane jest potwierdzenie rzeczywistej wymiany przy rozpoczynaniu nowej ampułki.
- Schemat danych 16 odczytuje zapas obu odmian 2.3.0: `unopenedCount` i `unopened` z v12. Zapisuje jeden format `unopenedCount`; kopie z ujemnym lub nieprawidłowym zapasem są odrzucane.

## Etap 3 — motywy

- Weryfikowane są wszystkie sześć palet, tryb automatyczny i trzy style interfejsu.
- Android przekazuje rzeczywisty tryb systemowy. Zmiana jasny/ciemny aktualizuje tryb automatyczny bez ponownego uruchamiania aplikacji.
- Po odrzuceniu zapisu ustawienia aplikacja przywraca poprzedni motyw.

## Etap 4 — przypomnienia Androida

- Po wyczerpaniu ustawionej liczby podań osobny alarm przypomina o wymianie 30 minut przed kolejnym zastrzykiem.
- Termin odnosi się do dnia kolejnego podania. Przy zastrzyku o 00:15 ostrzeżenie wypada o 23:45 poprzedniego dnia.
- Jeżeli harmonogram zostaje zapisany już w ostatnich 30 minutach przed zastrzykiem, ostrzeżenie może pojawić się po około 5 sekundach. Po minięciu godziny zastrzyku następne ostrzeżenie dotyczy kolejnego dnia.
- Potwierdzenie nowej ampułki lub korekta przywracająca dostępne podania usuwa alarm wymiany. Zastrzyk zachowuje własne przypomnienie.
- Kliknięcie ostrzeżenia wymiany nie oznacza wykonania podania ani dostarczenia przypomnienia o zastrzyku.
- Harmonogram jest szyfrowany i odtwarzany po restarcie telefonu, aktualizacji aplikacji oraz zmianie zegara lub strefy czasowej.
- Diagnostyka pokazuje osobny termin wymiany. Osobny alarm wymiany dotyczy APK Androida; PWA zachowuje ograniczenia przeglądarki.

Instalacja przez Google Play nie zmienia działania lokalnego AlarmManagera. Użytkownik musi włączyć przypomnienia i zezwolić na powiadomienia. Bez dostępu „Alarmy i przypomnienia” Android może opóźniać alarmy; aplikacja pokazuje tryb przybliżony. „Wymuś zatrzymanie” w ustawieniach Androida blokuje alarmy do kolejnego uruchomienia aplikacji. Nie można zagwarantować punktualności na każdym telefonie z dodatkowymi ograniczeniami baterii producenta.

Źródła: [alarmy Androida](https://developer.android.com/develop/background-work/services/alarms), [dostęp do dokładnych alarmów](https://developer.android.com/about/versions/14/changes/schedule-exact-alarms).

## Etap 5 — szybkie poprawienie wpisu

Po zatwierdzeniu sugerowanego wkłucia komunikat przez 3 sekundy zawiera „Cofnij” i „Edytuj”. Cofnięcie odwraca zapis wpisu; edycja otwiera ten wpis. Po zniknięciu komunikatu wpis nadal można zmienić w historii.

## Etap 6 — sprawdzenie i wydanie

Testy obejmują logikę ampułek, migrację zapasu z v12, cofnięcie i edycję, czas wyświetlania akcji, motywy oraz 15 scenariuszy terminów alarmów, w tym północ i zmianę czasu. Test na emulatorze korzysta wyłącznie z danych syntetycznych i wymaga jawnego parametru `--replace-test-data`.

Wynik weryfikacji: pełny zestaw testów webowych i Android Lint zaliczony. Emulator Androida 16 potwierdził 18 kombinacji palety i stylu, przełączanie systemowe jasny/ciemny, zachowanie wyglądu po ponownym uruchomieniu oraz brak poziomego przepełnienia ekranu. Sprawdzono okna zapisu trzech formatów i anulowanie eksportu, dostarczenie alarmu wymiany w tle, niezależne anulowanie, dokładny odstęp 30 minut oraz tryb przybliżony po cofnięciu dostępu do dokładnych alarmów. Kliknięcie powiadomienia wymiany nie wyłącza przypomnienia o zastrzyku. Ponownie zaliczono test AndroidKeyStore, restartu procesu i migracji historii z wersji schematu 14.

Budowanie, cache, logi i emulator pozostają w `D:\Users\Admin\Środowiska`. Skrypt BUDUJ korzysta z własnego folderu projektu. Gotowe APK, AAB, czysty ZIP źródeł i sumy kontrolne kopiuje obok siebie w katalogu głównym projektu. Wydanie nie jest automatycznie wysyłane do Google Play.

## Dodatkowy błąd zgłoszony do decyzji

Funkcja odkładania ampułki w odziedziczonej wersji nie wycofuje zmiany w pamięci, gdy zapis się nie powiedzie. Zaproponowano przywrócenie poprzedniego stanu i komunikat o błędzie. Ta zmiana pozostaje poza zakresem do czasu odpowiedzi użytkownika, zgodnie z prośbą o pytanie przed poprawianiem dodatkowych błędów.
