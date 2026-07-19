# Architektura źródeł aplikacji

Pliki uruchamiane przez przeglądarkę pozostają w katalogu głównym, ale są generowane ze źródeł uporządkowanych według odpowiedzialności:

- `core/` — stan uruchomieniowy, inicjalizacja, DOM i zdarzenia wspólne,
- `screens/` — kod i HTML poszczególnych ekranów,
- `components/` — elementy współdzielone przez ekrany, w tym jeden sprite ikon SVG,
- `services/` — dane, szyfrowanie, import, eksport, motyw i powiadomienia,
- `platform/` — integracje PWA oraz Android WebView,
- `styles/` — zmienne, układ, komponenty, ekrany i warstwa motywu,
- `shell/` — początek i koniec dokumentu HTML.

Kolejność składania opisują trzy jawne manifesty:

- `module-order.json` → `app.js`,
- `html-order.json` → `index.html`,
- `styles/style-order.json` → `style.css`.

## Zasady pracy

1. Zmieniaj odpowiedni plik w `src/`, nie plik wynikowy.
2. Uruchom `npm run prepare:web`, aby zbudować i zsynchronizować zasoby.
3. Uruchom `npm run build:check`, aby wykryć ręczną zmianę pliku wynikowego.
4. Kolejność manifestów jest częścią architektury i podlega testom.

Moduły JavaScript są nadal łączone w jedno prywatne IIFE. Dzięki temu refaktoryzacja nie dodaje nowych zmiennych globalnych i zachowuje dotychczasowe działanie aplikacji.
