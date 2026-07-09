"""Overrides of base engine behaviour."""

from game_executables import GameExecutables


class GameStateOverride(GameExecutables):
    """Override base functions where Knights of Gates deviates from defaults."""

    def reset_book(self) -> None:
        super().reset_book()

    def assign_special_sym_function(self) -> None:
        # Plain substituting wilds need no attribute functions yet.
        self.special_symbol_functions = {}
