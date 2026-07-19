# Etap 10 — powiadomienia i alarmy

## Wdrożone

- rzeczywiste planowanie przypomnień przez `AlarmManager` w lokalnym Android WebView,
- dokładny alarm, gdy Android przyzna dostęp „Alarmy i przypomnienia”,
- bezpieczny alarm przybliżony, gdy dostęp do dokładnej godziny jest wyłączony,
- ponowne planowanie po restarcie telefonu, aktualizacji aplikacji oraz zmianie czasu lub strefy,
- obsługa `POST_NOTIFICATIONS` i wyłączonego kanału powiadomień,
- ekran diagnostyczny z informacją o zgodzie, kanale, dokładności i następnym alarmie,
- przejście do systemowych ustawień powiadomień i dokładnych alarmów,
- testowe powiadomienie, które zgłasza sukces tylko po potwierdzeniu wysłania,
- otwarcie właściwego profilu po dotknięciu przypomnienia,
- szyfrowany zapis minimalnego harmonogramu przez Android Keystore,
- nieeksportowane odbiorniki systemowe i prywatna treść na ekranie blokady.

## Decyzja dotycząca dokładnych alarmów

Aplikacja pozostaje przy `SCHEDULE_EXACT_ALARM`. Nie używa `USE_EXACT_ALARM`, ponieważ to uprawnienie jest przeznaczone głównie dla budzików i kalendarzy oraz podlega ograniczeniom publikacji. Gdy użytkownik nie przyzna specjalnego dostępu, przypomnienie nadal jest planowane w trybie przybliżonym, a diagnostyka wyraźnie o tym ostrzega.

| Android | Powiadomienia                          | Dokładna godzina                                                  |
| ------- | -------------------------------------- | ----------------------------------------------------------------- |
| 10–11   | bez osobnej zgody runtime              | dostępna                                                          |
| 12      | zależna od ustawień aplikacji i kanału | wymaga dostępu „Alarmy i przypomnienia”                           |
| 13      | wymaga `POST_NOTIFICATIONS`            | wymaga dostępu „Alarmy i przypomnienia”                           |
| 14–16   | wymaga `POST_NOTIFICATIONS`            | na nowych instalacjach zwykle wyłączona; działa alarm przybliżony |

## Testy automatyczne

```text
npm run test:notifications
npm test
npm run build:check
```

## Test na telefonie po zbudowaniu APK

1. Włączyć przypomnienie kilka minut do przodu i użyć „Wyślij test”.
2. Wyłączyć powiadomienia aplikacji w Androidzie i sprawdzić czerwony stan diagnostyki.
3. Włączyć powiadomienia, ale wyłączyć „Alarmy i przypomnienia”; stan ma ostrzegać o możliwym opóźnieniu.
4. Uruchomić ponownie telefon i sprawdzić, czy diagnostyka nadal pokazuje przyszły alarm.
5. Zaktualizować APK bez czyszczenia danych i ponownie sprawdzić przyszły alarm.
6. Zmienić strefę czasową lub godzinę systemową i sprawdzić ponowne zaplanowanie.
7. Dotknąć powiadomienia i sprawdzić otwarcie ekranu „Dzisiaj” właściwego profilu.

Budowanie APK pozostaje po stronie GitHub/CI zgodnie z przyjętym sposobem pracy.

## Dokumentacja Androida

- https://developer.android.com/develop/background-work/services/alarms
- https://developer.android.com/about/versions/14/changes/schedule-exact-alarms
- https://developer.android.com/develop/ui/views/notifications/notification-permission
