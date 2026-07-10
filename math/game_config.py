"""
Knights of Gates — game configuration for the Stake Engine Math SDK.

Placeholder math: 5x5 board, 10 fixed lines, wild substitution, base mode only.
The "symbol vs symbol" (duel) feature will be added as a separate mode once its
spec/spreadsheet is delivered.

This file is meant to live at: <math-sdk>/games/knights_of_gates/game_config.py
"""

import os

from src.config.betmode import BetMode
from src.config.config import Config
from src.config.distributions import Distribution


class GameConfig(Config):
    """Singleton game configuration — dimensions, pays, reels and bet modes."""

    def __init__(self):
        super().__init__()
        self.game_id = "0_0_knights_of_gates"
        self.provider_number = 0
        self.working_name = "Knights of Gates"
        # Placeholder cap: max board (all H1, 10 lines x 20) pays exactly 200x.
        # Revisit together with the VS mechanic.
        self.wincap = 200.0
        self.win_type = "lines"
        self.rtp = 0.9700
        self.construct_paths()

        # Game dimensions
        self.num_reels = 5
        self.num_rows = [5] * self.num_reels

        # Paytable: (matching-symbols-count, symbol) -> payout multiplier (bet = 1)
        pay_group = {
            (5, "H1"): 20.0,
            (4, "H1"): 8.0,
            (3, "H1"): 3.0,
            (5, "H2"): 15.0,
            (4, "H2"): 6.0,
            (3, "H2"): 2.5,
            (5, "H3"): 12.0,
            (4, "H3"): 5.0,
            (3, "H3"): 2.0,
            (5, "H4"): 10.0,
            (4, "H4"): 4.0,
            (3, "H4"): 1.5,
            (5, "H5"): 8.0,
            (4, "H5"): 3.0,
            (3, "H5"): 1.2,
            (5, "L1"): 5.0,
            (4, "L1"): 2.0,
            (3, "L1"): 0.8,
            (5, "L2"): 4.0,
            (4, "L2"): 1.6,
            (3, "L2"): 0.6,
            (5, "L3"): 3.0,
            (4, "L3"): 1.2,
            (3, "L3"): 0.5,
            (5, "L4"): 2.5,
            (4, "L4"): 1.0,
            (3, "L4"): 0.4,
            (5, "L5"): 2.0,
            (4, "L5"): 0.8,
            (3, "L5"): 0.3,
        }
        self.paytable = self.convert_range_table(pay_group)

        self.include_padding = True
        # VS = duel trigger (blue knight pays 2x bet per landed VS — the duel
        # award needs a custom executable when this package runs in the SDK;
        # generate_publish.py already implements the rule for the RGS files).
        self.special_symbols = {"wild": ["W"], "scatter": ["VS"], "multiplier": []}

        # No free-spin mode yet (VS feature will replace it).
        self.freespin_triggers = {self.basegame_type: {}, self.freegame_type: {}}
        # No scatters -> anticipation never triggers.
        self.anticipation_triggers = {self.basegame_type: 999, self.freegame_type: 999}

        # 10 fixed lines: row index per reel (0 = top row)
        self.paylines = {
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

        # Reel strips (BST0 = "Duel Boost" set with far more VS stops)
        reels = {"BR0": "BR0.csv", "BST0": "BST0.csv", "WCAP": "WCAP.csv"}
        self.reels = {}
        for reel_name, file_name in reels.items():
            self.reels[reel_name] = self.read_reels_csv(os.path.join(self.reels_path, file_name))

        self.padding_reels[self.basegame_type] = self.reels["BR0"]
        self.padding_reels[self.freegame_type] = self.reels["BR0"]

        self.bet_modes = [
            BetMode(
                name="base",
                cost=1.0,
                rtp=self.rtp,
                max_win=self.wincap,
                auto_close_disabled=False,
                is_feature=True,
                is_buybonus=False,
                distributions=[
                    Distribution(
                        criteria="wincap",
                        quota=0.001,
                        win_criteria=self.wincap,
                        conditions={
                            "reel_weights": {self.basegame_type: {"WCAP": 1}},
                            "force_wincap": True,
                            "force_freegame": False,
                        },
                    ),
                    Distribution(
                        criteria="0",
                        quota=0.4,
                        win_criteria=0.0,
                        conditions={
                            "reel_weights": {self.basegame_type: {"BR0": 1}},
                            "force_wincap": False,
                            "force_freegame": False,
                        },
                    ),
                    Distribution(
                        criteria="basegame",
                        quota=0.599,
                        conditions={
                            "reel_weights": {self.basegame_type: {"BR0": 1}},
                            "force_wincap": False,
                            "force_freegame": False,
                        },
                    ),
                ],
            ),
            BetMode(
                name="boost",
                cost=5.0,
                rtp=self.rtp,
                max_win=self.wincap,
                auto_close_disabled=False,
                is_feature=True,
                is_buybonus=False,
                distributions=[
                    Distribution(
                        criteria="wincap",
                        quota=0.001,
                        win_criteria=self.wincap,
                        conditions={
                            "reel_weights": {self.basegame_type: {"WCAP": 1}},
                            "force_wincap": True,
                            "force_freegame": False,
                        },
                    ),
                    Distribution(
                        criteria="basegame",
                        quota=0.999,
                        conditions={
                            "reel_weights": {self.basegame_type: {"BST0": 1}},
                            "force_wincap": False,
                            "force_freegame": False,
                        },
                    ),
                ],
            ),
        ]
