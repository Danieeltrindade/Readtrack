import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  TIMER_STATUS,
  backToTimer,
  createActiveSession,
  getElapsedSeconds,
  getFinishedAt,
  getPauseCount,
  getPausedSeconds,
  isValidActiveSession,
  pauseActiveSession,
  resumeActiveSession,
  reviewActiveSession,
} from './timer.js';

const T0 = new Date('2026-10-15T20:00:00Z').getTime();
const at = (seconds) => new Date(T0 + seconds * 1000);

function start() {
  return createActiveSession({ id: 's1', bookId: 'b1', startPage: 10, now: at(0) });
}

test('tempo vem dos timestamps, não de um contador', () => {
  const active = start();
  assert.equal(getElapsedSeconds(active, at(0)), 0);
  assert.equal(getElapsedSeconds(active, at(90)), 90);
  // Aba em segundo plano por 1 hora: o valor continua certo ao voltar.
  assert.equal(getElapsedSeconds(active, at(3600)), 3600);
});

test('tempo pausado não é contado', () => {
  let active = start();
  active = pauseActiveSession(active, at(600)); // leu 10 min
  assert.equal(active.status, TIMER_STATUS.PAUSED);
  assert.equal(getElapsedSeconds(active, at(5000)), 600, 'pausado, o relógio fica parado');
  active = resumeActiveSession(active, at(1800)); // 20 min de pausa
  assert.equal(getElapsedSeconds(active, at(2100)), 900); // +5 min
  assert.equal(getPausedSeconds(active, at(2100)), 1200);
  assert.equal(getPauseCount(active), 1);
});

test('pausar duas vezes ou continuar sem pausar não altera nada', () => {
  let active = pauseActiveSession(start(), at(60));
  const again = pauseActiveSession(active, at(120));
  assert.equal(again, active);
  active = resumeActiveSession(active, at(100));
  assert.equal(resumeActiveSession(active, at(200)), active);
});

test('finalizar congela o tempo enquanto o formulário está aberto', () => {
  let active = reviewActiveSession(start(), at(1500));
  assert.equal(active.status, TIMER_STATUS.REVIEWING);
  assert.equal(getElapsedSeconds(active, at(9999)), 1500);
  assert.equal(getFinishedAt(active), at(1500).toISOString());
  active = backToTimer(active);
  assert.equal(active.status, TIMER_STATUS.PAUSED);
  assert.equal(getElapsedSeconds(active, at(9999)), 1500);
});

test('recuperação após recarregar: JSON ida e volta preserva o tempo', () => {
  let active = pauseActiveSession(start(), at(300));
  active = resumeActiveSession(active, at(400));
  const restored = JSON.parse(JSON.stringify(active));
  assert.ok(isValidActiveSession(restored));
  assert.equal(getElapsedSeconds(restored, at(500)), 400);
  // Fechado enquanto pausado: reabrir depois de 2 dias não soma nada.
  const paused = JSON.parse(JSON.stringify(pauseActiveSession(restored, at(500))));
  assert.equal(getElapsedSeconds(paused, at(500 + 172800)), 400);
});

test('relógio do sistema voltando no tempo não gera duração negativa', () => {
  assert.equal(getElapsedSeconds(start(), at(-100)), 0);
  const paused = pauseActiveSession(start(), at(-50));
  assert.equal(getElapsedSeconds(paused, at(10)), 0);
});

test('sessão ativa corrompida é rejeitada', () => {
  assert.equal(isValidActiveSession(null), false);
  assert.equal(isValidActiveSession({ ...start(), segments: [] }), false);
  assert.equal(isValidActiveSession({ ...start(), status: 'paused' }), false, 'pausada com intervalo aberto');
  assert.equal(isValidActiveSession({ ...start(), segments: [{ start: 'x', end: null }] }), false);
});
