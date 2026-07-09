"""Grouped game-logic helpers called from run_spin."""

from game_calculations import GameCalculations
from src.calculations.lines import Lines


class GameExecutables(GameCalculations):
    """Game specific executables — reusable groups of logic + event emission."""

    def evaluate_lines_board(self) -> None:
        """Populate win data from fixed lines, record wins, emit win events."""
        self.win_data = Lines.get_lines(self.board, self.config, global_multiplier=self.global_multiplier)
        Lines.record_lines_wins(self)
        self.win_manager.update_spinwin(self.win_data["totalWin"])
        Lines.emit_linewin_events(self)
