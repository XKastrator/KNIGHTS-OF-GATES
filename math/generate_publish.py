"""
Standalone generator of Stake Engine math publish files for Knights of Gates.

Produces (in math/publish/):
    index.json               — mode manifest
    books_base.jsonl.zst     — zstd-compressed round events (id/events/payoutMultiplier)
    lookUpTable_base_0.csv   — "simulation number, weight, payout multiplier(x100)"

This mirrors what the official math-sdk pipeline outputs, without requiring the
SDK: rules here MUST stay in sync with game_config.py (paytable, paylines,
reels, wild). payoutMultiplier uses the documented x100 fixed-point convention
(1150 == 11.5x). Weights are tuned so the weighted RTP lands on TARGET_RTP.

Usage:
    pip install zstandard
    python3 math/generate_publish.py
"""

from __future__ import annotations

import csv
import json
import os
import random
from pathlib import Path

import zstandard

HERE = Path(__file__).parent
OUT = HERE / "publish"

SEED = 20260709
NUM_SIMS = 20_000
NUM_WINCAP_SIMS = 20
TARGET_RTP = 0.97
TARGET_HIT_RATE = 0.27  # weighted share of winning rounds
WINCAP_X100 = 20_000  # 200x
BASE_WEIGHT = 100_000

ROWS = 5
REELS = 5
WILD = "W"

# (count, symbol) -> payout x100  — keep identical to game_config.py pay_group
PAYTABLE_X100 = {
    ("H1", 5): 2000, ("H1", 4): 800, ("H1", 3): 300,
    ("H2", 5): 1500, ("H2", 4): 600, ("H2", 3): 250,
    ("H3", 5): 1200, ("H3", 4): 500, ("H3", 3): 200,
    ("H4", 5): 1000, ("H4", 4): 400, ("H4", 3): 150,
    ("H5", 5): 800,  ("H5", 4): 300, ("H5", 3): 120,
    ("L1", 5): 500,  ("L1", 4): 200, ("L1", 3): 80,
    ("L2", 5): 400,  ("L2", 4): 160, ("L2", 3): 60,
    ("L3", 5): 300,  ("L3", 4): 120, ("L3", 3): 50,
    ("L4", 5): 250,  ("L4", 4): 100, ("L4", 3): 40,
    ("L5", 5): 200,  ("L5", 4): 80,  ("L5", 3): 30,
}

# payline -> row per reel — keep identical to game_config.py
PAYLINES = {
    1: [0, 0, 0, 0, 0],
    2: [1, 1, 1, 1, 1],
    3: [2, 2, 2, 2, 2],
    4: [3, 3, 3, 3, 3],
    5: [4, 4, 4, 4, 4],
    6: [0, 1, 2, 1, 0],
    7: [4, 3, 2, 3, 4],
    8: [0, 1, 2, 3, 4],
    9: [4, 3, 2, 1, 0],
    10: [1, 2, 3, 2, 1],
}


def read_strips(name: str) -> list[list[str]]:
    """reels/<name>.csv (rows of comma-separated symbols) -> strip per reel."""
    with open(HERE / "reels" / name, newline="") as f:
        rows = [row for row in csv.reader(f) if row]
    return [[row[r] for row in rows] for r in range(REELS)]


def draw_board(strips: list[list[str]], rng: random.Random) -> list[list[str]]:
    """board[reel][row] — window of ROWS symbols from a random stop per reel."""
    board = []
    for strip in strips:
        stop = rng.randrange(len(strip))
        board.append([strip[(stop + r) % len(strip)] for r in range(ROWS)])
    return board


def eval_lines(board: list[list[str]]) -> tuple[int, list[dict]]:
    """Left-to-right line evaluation with wild substitution. Returns (x100, win details)."""
    total = 0
    wins = []
    for line_id, rows in PAYLINES.items():
        symbols = [board[reel][rows[reel]] for reel in range(REELS)]
        target = next((s for s in symbols if s != WILD), None)
        if target is None:
            target = "H1"  # all-wild line pays as the top symbol
        count = 0
        for s in symbols:
            if s == target or s == WILD:
                count += 1
            else:
                break
        pay = PAYTABLE_X100.get((target, count), 0)
        if pay > 0:
            wins.append(
                {
                    "payline": line_id,
                    "symbol": target,
                    "kind": count,
                    "win": pay,
                    "positions": [{"reel": r, "row": rows[r]} for r in range(count)],
                }
            )
            total += pay
    return min(total, WINCAP_X100), wins


def book_events(board: list[list[str]], payout_x100: int, wins: list[dict]) -> list[dict]:
    events: list[dict] = [
        {
            "index": 0,
            "type": "reveal",
            "board": [[{"name": s} for s in reel] for reel in board],
            "gameType": "basegame",
        }
    ]
    if payout_x100 > 0:
        events.append({"index": 1, "type": "winInfo", "totalWin": payout_x100, "wins": wins})
    events.append({"index": len(events), "type": "setTotalWin", "amount": payout_x100})
    events.append({"index": len(events), "type": "finalWin", "amount": payout_x100})
    return events


def solve_weights(payouts_x100: list[int]) -> list[int]:
    """
    Per-sim lookup weights hitting TARGET_RTP and TARGET_HIT_RATE.

    Three buckets (the SDK's Rust optimizer does this with many fences; two
    free buckets are enough for placeholder math):
      small wins (<10x)  -> BASE_WEIGHT (anchor)
      big wins  (>=10x)  -> solved weight x  (fills RTP up to target)
      zero rounds        -> solved weight z  (sets the weighted hit rate)
    """
    t = TARGET_RTP
    h = TARGET_HIT_RATE
    a = BASE_WEIGHT
    small = [p for p in payouts_x100 if 0 < p < 1000]
    big = [p for p in payouts_x100 if p >= 1000]
    zeros = [p for p in payouts_x100 if p == 0]
    if not big or not zeros:
        raise SystemExit("degenerate simulation set — increase NUM_SIMS")
    s_small = sum(p / 100 for p in small)
    s_big = sum(p / 100 for p in big)
    n_small, n_big, n_zero = len(small), len(big), len(zeros)

    # From hit-rate + RTP constraints (see solve in repo history):
    #   x = a*(t/h*n_small - s_small) / (s_big - t/h*n_big)
    #   z = (1-h)/h * (n_small*a + n_big*x) / n_zero
    th = t / h
    x = a * (th * n_small - s_small) / (s_big - th * n_big)
    if x < 1:
        raise SystemExit(f"weight solve failed (x={x:.3f}) — adjust targets")
    z = (1 - h) / h * (n_small * a + n_big * x) / n_zero
    if z < 1:
        raise SystemExit(f"weight solve failed (z={z:.3f}) — adjust targets")
    big_weight, zero_weight = round(x), round(z)

    weights = [
        zero_weight if p == 0 else (BASE_WEIGHT if p < 1000 else big_weight)
        for p in payouts_x100
    ]
    total_w = sum(weights)
    achieved_rtp = sum(w * p / 100 for w, p in zip(weights, payouts_x100)) / total_w
    achieved_hit = sum(w for w, p in zip(weights, payouts_x100) if p > 0) / total_w
    print(f"weights — zero: {zero_weight}, small: {BASE_WEIGHT}, big: {big_weight}")
    print(f"achieved RTP: {achieved_rtp:.4%} (target {t:.2%})")
    print(f"achieved hit rate: {achieved_hit:.2%} (target {h:.2%})")
    return weights


def main() -> None:
    rng = random.Random(SEED)
    base_strips = read_strips("BR0.csv")
    wincap_strips = read_strips("WCAP.csv")

    boards: list[list[list[str]]] = []
    payouts: list[int] = []
    all_wins: list[list[dict]] = []

    for _ in range(NUM_SIMS):
        board = draw_board(base_strips, rng)
        payout, wins = eval_lines(board)
        boards.append(board)
        payouts.append(payout)
        all_wins.append(wins)

    for _ in range(NUM_WINCAP_SIMS):
        board = draw_board(wincap_strips, rng)
        payout, wins = eval_lines(board)
        assert payout == WINCAP_X100, f"WCAP board paid {payout}, expected {WINCAP_X100}"
        boards.append(board)
        payouts.append(payout)
        all_wins.append(wins)

    n = len(payouts)
    hit = sum(1 for p in payouts if p > 0)
    raw_rtp = sum(p / 100 for p in payouts) / n
    print(f"sims: {n} | natural hit rate: {hit / n:.2%} | raw RTP: {raw_rtp:.4%}")
    print(f"max win: {max(payouts) / 100:.0f}x | wincap sims: {NUM_WINCAP_SIMS}")

    weights = solve_weights(payouts)

    OUT.mkdir(exist_ok=True)

    lines = []
    for i, (board, payout, wins) in enumerate(zip(boards, payouts, all_wins), start=1):
        lines.append(
            json.dumps(
                {"id": i, "events": book_events(board, payout, wins), "payoutMultiplier": payout},
                separators=(",", ":"),
            )
        )
    raw = ("\n".join(lines) + "\n").encode()
    with open(OUT / "books_base.jsonl.zst", "wb") as f:
        f.write(zstandard.ZstdCompressor(level=10).compress(raw))

    with open(OUT / "lookUpTable_base_0.csv", "w", newline="") as f:
        for i, (w, p) in enumerate(zip(weights, payouts), start=1):
            f.write(f"{i},{w},{p}\n")

    with open(OUT / "index.json", "w") as f:
        json.dump(
            {
                "modes": [
                    {
                        "name": "base",
                        "cost": 1.0,
                        "events": "books_base.jsonl.zst",
                        "weights": "lookUpTable_base_0.csv",
                    }
                ]
            },
            f,
            indent=4,
        )

    for name in ("index.json", "books_base.jsonl.zst", "lookUpTable_base_0.csv"):
        print(f"{name}: {os.path.getsize(OUT / name):,} B")


if __name__ == "__main__":
    main()
