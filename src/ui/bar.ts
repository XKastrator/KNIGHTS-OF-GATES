import { sound } from '../audio/sound';
import { BONUS_COST_MULT } from '../config';
import { SlotScene } from '../game/SlotScene';
import type { GameClient } from '../rgs/client';
import { bet, bus, setBetSteps, state, stepBet } from '../state';
import { wait } from '../util/tween';

const $ = <T extends HTMLElement = HTMLElement>(sel: string): T => {
  const el = document.querySelector<T>(sel);
  if (!el) throw new Error(`missing element: ${sel}`);
  return el;
};

const CURRENCY_SIGNS: Record<string, string> = { USD: '$', EUR: '€', GBP: '£', PLN: 'zł' };

function fmt(n: number): string {
  const sign = CURRENCY_SIGNS[state.currency];
  const num = n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return sign ? `${sign}${num}` : `${num} ${state.currency}`;
}

/** Binds the DOM bottom bar + modals to the game scene and the game client. */
export function initBar(scene: SlotScene, client: GameClient): void {
  const bar = $('#bar');
  const balanceVal = $('#balance-val');
  const winVal = $('#win-val');
  const betVal = $('#bet-val');
  const bonusBetVal = $('#bonus-bet-val');
  const btnSpin = $<HTMLButtonElement>('#btn-spin');
  const btnTurbo = $('#btn-turbo');
  const btnAuto = $('#btn-auto');
  const btnBonus = $('#btn-bonus');
  const autoCount = $('#auto-count');
  const autoIcon = $('#auto-icon');
  const capsuleMain = $('.capsule-main');
  const modals = {
    menu: $('#modal-menu'),
    auto: $('#modal-auto'),
    bonus: $('#modal-bonus'),
  };

  let autoLeft = 0;

  function render(): void {
    balanceVal.textContent = fmt(state.balance);
    winVal.textContent = fmt(state.win);
    winVal.classList.toggle('winning', state.win > 0);
    betVal.textContent = fmt(bet());
    bonusBetVal.textContent = fmt(bet());
    document.querySelectorAll('.bonus-cost').forEach((el) => (el.textContent = fmt(bet() * BONUS_COST_MULT)));
    bar.classList.toggle('turbo', state.turbo);
    btnTurbo.classList.toggle('active', state.turbo);
    btnAuto.classList.toggle('active', state.autoRemaining > 0);
    autoCount.classList.toggle('hidden', state.autoRemaining === 0);
    autoIcon.classList.toggle('hidden', state.autoRemaining > 0);
    autoCount.textContent = String(state.autoRemaining);
    btnSpin.disabled = state.spinning;
    btnSpin.classList.toggle('spinning', state.spinning);
  }

  bus.on('change', render);
  bus.on('deny', () => {
    capsuleMain.classList.remove('deny');
    void capsuleMain.offsetWidth; // restart the shake animation
    capsuleMain.classList.add('deny');
  });

  function closeAll(): void {
    Object.values(modals).forEach((m) => m.classList.add('hidden'));
  }

  function stopAuto(): void {
    autoLeft = 0;
    state.autoRemaining = 0;
  }

  /** One full round: debit via client → spin reels onto the result → credit. */
  async function doSpin(mode: 'base' | 'bonus' = 'base'): Promise<void> {
    if (state.spinning) return;
    const stake = bet();
    const cost = mode === 'bonus' ? stake * BONUS_COST_MULT : stake;
    if (state.balance < cost) {
      bus.emit('deny');
      stopAuto();
      bus.emit('change');
      return;
    }

    state.spinning = true;
    state.win = 0;
    bus.emit('change');
    bus.emit('spinstart');

    let round;
    try {
      round = await client.play(stake, mode);
    } catch (err) {
      state.spinning = false;
      stopAuto();
      bus.emit('change');
      bus.emit('deny');
      console.warn('play failed:', err);
      return;
    }
    if (round.balance !== null) state.balance = round.balance;

    // bought bonus opens with the knight duel (blue wins -> the round pays)
    if (mode === 'bonus') await scene.playDuel();

    sound.play('spin', { volume: 0.7 });
    await scene.machine.spin(state.turbo, round.grid);

    state.spinning = false;
    state.win = round.win;
    if (round.win > 0) {
      try {
        const newBalance = await client.endRound();
        if (newBalance !== null) state.balance = newBalance;
      } catch (err) {
        console.warn('end-round failed:', err);
      }
      sound.play(round.win / stake >= 10 ? 'bigwin' : 'win');
      void scene.flashWin();
    }
    bus.emit('change');
    bus.emit('spinend');
  }

  async function runAuto(): Promise<void> {
    while (autoLeft > 0 && state.balance >= bet()) {
      await doSpin();
      if (state.autoRemaining === 0 && autoLeft === 0) break; // stopped by an error
      autoLeft -= 1;
      state.autoRemaining = autoLeft;
      bus.emit('change');
      await wait(state.turbo ? 220 : 550);
    }
    stopAuto();
    bus.emit('change');
  }

  // --- bar buttons
  btnSpin.addEventListener('click', () => void doSpin());
  btnTurbo.addEventListener('click', () => {
    state.turbo = !state.turbo;
    bus.emit('change');
  });
  $('#btn-bet-up').addEventListener('click', () => stepBet(1));
  $('#btn-bet-down').addEventListener('click', () => stepBet(-1));
  $('#bonus-bet-up').addEventListener('click', () => stepBet(1));
  $('#bonus-bet-down').addEventListener('click', () => stepBet(-1));
  $('#btn-menu').addEventListener('click', () => modals.menu.classList.remove('hidden'));
  btnBonus.addEventListener('click', () => modals.bonus.classList.remove('hidden'));
  btnAuto.addEventListener('click', () => {
    if (state.autoRemaining > 0) {
      stopAuto();
      bus.emit('change');
    } else {
      modals.auto.classList.remove('hidden');
    }
  });

  // --- modals
  document.querySelectorAll<HTMLElement>('[data-close]').forEach((el) => el.addEventListener('click', closeAll));
  [modals.menu, modals.auto].forEach((m) =>
    m.addEventListener('click', (e) => {
      if (e.target === m) closeAll();
    }),
  );
  document.querySelectorAll<HTMLButtonElement>('.auto-opt').forEach((btn) =>
    btn.addEventListener('click', () => {
      autoLeft = Number(btn.dataset.auto);
      state.autoRemaining = autoLeft;
      bus.emit('change');
      closeAll();
      void runAuto();
    }),
  );
  // bonus cards: all six run the "bonus" mode for now (30× bet, 5x..200x);
  // per-card offers arrive with the VS mechanic
  document.querySelectorAll<HTMLButtonElement>('[data-bonus-card]').forEach((btn) =>
    btn.addEventListener('click', () => {
      if (state.spinning) return;
      closeAll();
      void doSpin('bonus');
    }),
  );

  // sound toggle in the settings modal
  const toggleSound = $('#toggle-sound');
  const renderSoundPill = () => {
    toggleSound.textContent = sound.enabled ? 'WŁ.' : 'WYŁ.';
    toggleSound.classList.toggle('off', !sound.enabled);
  };
  toggleSound.addEventListener('click', () => {
    sound.setEnabled(!sound.enabled);
    renderSoundPill();
  });
  renderSoundPill();

  // space = spin, V = duel preview (dev)
  window.addEventListener('keydown', (e) => {
    const modalOpen = Object.values(modals).some((m) => !m.classList.contains('hidden'));
    if (modalOpen) return;
    if (e.code === 'Space') {
      e.preventDefault();
      void doSpin();
    } else if (e.code === 'KeyV' && !state.spinning) {
      void scene.playDuel();
    }
  });

  render();
}

/** Authenticates against the client and seeds balance / bet ladder. */
export async function initSession(client: GameClient): Promise<void> {
  try {
    const auth = await client.authenticate();
    state.balance = auth.balance;
    state.currency = auth.currency;
    setBetSteps(auth.betLevels, auth.defaultBet);
  } catch (err) {
    console.warn('authenticate failed — continuing with local defaults:', err);
  }
  bus.emit('change');
}
