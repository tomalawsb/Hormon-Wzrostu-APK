# Moduły źródłowe aplikacji

Plik `app.js` pozostaje plikiem uruchamianym przez przeglądarkę. Jest generowany przez połączenie modułów z tego katalogu w kolejności zapisanej w `module-order.json`.

## Zasady pracy

1. Zmieniaj kod w odpowiednim pliku modułu.
2. Uruchom `BUDUJ_APP.cmd` w katalogu głównym projektu.
3. Skrypt zbuduje `app.js`, sprawdzi jego składnię i uruchomi test spójności.
4. Nie zmieniaj ręcznie `app.js`, ponieważ następne budowanie nadpisze ten plik.

Podział jest beznarzędziowy: nie wymaga npm, bundlera ani połączenia z internetem. Wszystkie moduły są składane w jedno wspólne IIFE, dlatego zachowują dotychczasowy zakres zmiennych i funkcji.

## Etap 3

Moduł `15_profiles.js` odpowiada za interfejs zarządzania profilami dzieci. Operacje na danych profili są wykonywane przez funkcje z `10_data_storage.js`.

## Etapy 4–5

Moduł `17_injection_order.js` obsługuje edycję i zapis kolejności miejsc wkłucia. Schemat danych wersji 10 w `10_data_storage.js` utrzymuje pełną izolację ustawień, historii, ampułek, przypomnień i kolejności każdego profilu.

## Etapy 6–7

Moduł `18_settings_navigation.js` odpowiada za kategorie ustawień i widok mobilny/desktopowy. Funkcja `getSuggestedPlace()` w `40_ampoules.js` wylicza kolejną pozycję na podstawie rzeczywistych podań, pomija dawki pominięte i bezpiecznie obsługuje brak aktywnych miejsc.

## Etapy 8–9

Moduł `19_today_dashboard.js` odpowiada za główną kartę dnia, wyliczenia danych do widoku wszystkich dzieci, przełącznik `Wszyscy/profile` i karty zbiorcze. `20_rendering_navigation.js` nadal renderuje szczegóły aktywnego profilu, a `40_ampoules.js` udostępnia numer dzisiejszej dawki i profilowy algorytm propozycji miejsca.

## Etapy 14–15

Moduł `90_permissions_reminders.js` planuje osobny timer dla każdego aktywnego profilu i przekazuje service workerowi pełną listę stanów przypomnień. Moduł `100_voice.js` rozpoznaje nazwę dziecka oraz podstawowe polskie odmiany imion, przełącza właściwy profil i dopiero potem wykonuje polecenie.
## Etapy 16–17

Moduł `80_backup_import.js` eksportuje pełną kopię lub pojedynczy profil, pokazuje podgląd importu i zapisuje automatyczną kopię bezpieczeństwa. Przed normalizacją odrzuca kopie z nowszego formatu lub schematu oraz sprawdza, czy wpisy i `activeAmpouleId` wskazują istniejące ampułki.
