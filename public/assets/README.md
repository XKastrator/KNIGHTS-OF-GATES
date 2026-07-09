# Assets — podmiana grafik

Gra najpierw próbuje wczytać pliki z tego katalogu; jeśli któregoś brakuje,
używa wygenerowanego zamiennika. Żeby podpiąć docelowe grafiki, wrzuć je tutaj
pod tymi nazwami (bez zmian w kodzie):

| Plik                              | Co to jest                                    |
| --------------------------------- | --------------------------------------------- |
| `bg.png` / `bg.jpg` / `bg.webp`   | Tło (zamek/arena, ~1920×1080 lub większe)     |
| `frame.png` / `frame.webp`        | Ozdobna ramka wokół bębnów (nine-slice)       |
| `logo.png` / `logo.webp`          | Logo "Knights of Gates" (PNG z przezroczystością) |

Symbole są na razie rysowane programowo w `src/game/symbols.ts` — gdy dojdą
docelowe PNG symboli, podmieniamy tę funkcję na ładowanie tekstur (kolejność
wg `SYMBOLS` w `src/config.ts`).
