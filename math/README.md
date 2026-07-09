# Knights of Gates — pakiet math (Stake Engine Math SDK)

Paczka gry pod [StakeEngine/math-sdk](https://github.com/StakeEngine/math-sdk).
**Placeholder math**: plansza 5×5, 10 stałych linii, wild (W) z substytucją,
tylko tryb `base`. Mechanika **symbol vs symbol** (pojedynek) dojdzie jako
osobny feature/tryb, gdy dostarczysz jej spec — wtedy zmieniamy `gamestate.py`
i paytable.

## Symbole

| Kod | Symbol (frontend)     |
| --- | --------------------- |
| H1  | Miecz                 |
| H2  | Tarcza                |
| H3  | Hełm                  |
| H4  | Korona                |
| H5  | Brama                 |
| L1–L5 | A, K, Q, J, 10      |
| W   | Wild (substytucja)    |

Kody muszą się zgadzać z `SYMBOLS` w `src/config.ts` frontendu — i zgadzają się.

## Jak wygenerować pliki do wgrania

```bash
git clone https://github.com/StakeEngine/math-sdk
cd math-sdk
make setup            # albo: python3 -m venv env && source env/bin/activate && pip install -r requirements.txt

# wgraj ten katalog jako games/knights_of_gates/
cp -r <to-repo>/math games/knights_of_gates

make run GAME=knights_of_gates
# albo: python3 games/knights_of_gates/run.py
```

Wyniki lądują w `games/knights_of_gates/library/` — komplet do publikacji
(books `*.jsonl.zst`, lookup tables `*.csv`, `index.json` + configi) wgrywasz
w Stake Engine ACP w sekcji plików math dla gry.

## Co jest czym

| Plik                   | Rola                                                        |
| ---------------------- | ----------------------------------------------------------- |
| `run.py`               | Uruchamia symulacje, zapisuje books/lookup/configi           |
| `game_config.py`       | Wymiary 5×5, paytable, linie, reels, bet mode `base`         |
| `gamestate.py`         | Logika rundy (`run_spin`)                                    |
| `game_executables.py`  | Ewaluacja linii + emisja eventów (`reveal`/`winInfo`)        |
| `game_calculations.py` | Miejsce na custom obliczenia (tu wejdzie mechanika VS)       |
| `game_override.py`     | Nadpisania zachowań silnika                                  |
| `game_optimization.py` | Parametry optymalizatora RTP (**do strojenia** przed użyciem)|
| `reels/BR0.csv`        | Główny pasek bębnów (59 stopów, W na bębnach 2–4)            |
| `reels/WCAP.csv`       | Pasek wymuszający win cap (cała plansza H1 = 200×)           |

## Uwagi / TODO

- `wincap = 200.0` — tyle wynosi maksymalna możliwa wygrana przy tej
  paytable (10 linii × 20× za 5×H1). Przy docelowej mechanice VS podnieś cap
  i przelicz paytable.
- `run_optimization` w `run.py` jest domyślnie **wyłączone**. Surowe books są
  poprawne i wgrywalne; optymalizator (Rust) tylko dostraja wagi lookup table
  do docelowego RTP 97% — przed włączeniem zweryfikuj parametry w
  `game_optimization.py` z dokumentacją twojej wersji math-sdk.
- Pakiet pisany pod math-sdk (main, lipiec 2026). Jeśli SDK zmieni API,
  porównaj z przykładową grą `games/0_0_lines` — struktura jest identyczna.
