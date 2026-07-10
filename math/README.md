# Knights of Gates — pakiet math (Stake Engine Math SDK)

Paczka gry pod [StakeEngine/math-sdk](https://github.com/StakeEngine/math-sdk).
**Placeholder math**: plansza 5×5, 10 stałych linii, wild (W) z substytucją,
symbol **VS** (pojedynek: 2× stawki za sztukę) i trzy tryby: `base`, `boost`
(więcej VS), `bonus` (gwarantowana wygrana). Pełna mechanika pojedynku
(czerwony vs niebieski wg tabeli wag) wejdzie po dostarczeniu speca.

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
| VS  | Pojedynek (2× za sztukę, nie płaci na liniach) |

Kody muszą się zgadzać z `SYMBOLS` w `src/config.ts` frontendu — i zgadzają się.

## Szybka ścieżka — pliki do wgrania od ręki (`math/publish/`)

Stake Engine w sekcji **Math** oczekuje wyłącznie plików publikacyjnych, nie
źródeł `.py`. Generuje je `generate_publish.py` (bez klonowania math-sdk):

```bash
pip install zstandard
python3 math/generate_publish.py
```

Powstaje `math/publish/` (trzy tryby):

- `index.json` — manifest: `base` (1×) + `boost` (5×) + `bonus` (30×)
- **base** — VS na środkowym bębnie (~8,5% na pojedynek), RTP 97.00%, hit 27%
- **boost** ("Duel Boost") — reels BST0 z dużą liczbą VS (~47% na pojedynek),
  koszt 5× stawki, RTP 97% kosztu
- **bonus** — gwarantowane 5×–200×, koszt 30×, RTP 97% kosztu

Mechanika VS (placeholder do czasu pełnego speca): każdy wylosowany symbol VS
wypłaca 2× stawki (mnożnik zwycięskiego niebieskiego rycerza) i emituje event
`duel` w books (`positions/winner/multiplier/award`), który frontend odtwarza
jako animowany pojedynek w bębnie.

**Wgrywanie w ACP:** wszystkie pliki z `math/publish/` muszą leżeć w sekcji
Math **na najwyższym poziomie** (żadnego folderu `math/` ani `publish/`
w ścieżce — publikator szuka `index.json` w korzeniu). Usuń z sekcji Math
wgrane wcześniej pliki źródłowe i wgraj tylko ten komplet (7 plików), potem
Publish.

Reguły w `generate_publish.py` (paytable/linie/reels) muszą być zsynchronizowane
z `game_config.py` — docelowo i tak zastąpi je pełny run math-sdk (poniżej).

## Jak wygenerować pliki oficjalnym math-sdk

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
