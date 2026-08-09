import { inFov, isSolid, relativeAngle } from '../core/geometry.js';
import { windupProgress } from '../core/tokens.js';
import type { Config, Enemy, GameState } from '../core/types.js';
/**
 * The subset of the 2D canvas API this renderer uses. A real
 * CanvasRenderingContext2D satisfies it structurally, and so does a recording
 * stub, which is what makes rendering coverable without a DOM canvas.
 */
export interface Ctx2D {
  fillStyle: string | CanvasGradient | CanvasPattern;
  strokeStyle: string | CanvasGradient | CanvasPattern;
  lineWidth: number;
  globalAlpha: number;
  font: string;
  readonly fillRect: (x: number, y: number, w: number, h: number) => void;
  readonly fillText: (text: string, x: number, y: number) => void;
  readonly beginPath: () => void;
  readonly arc: (
    x: number, y: number, r: number, start: number, end: number,
  ) => void;
  readonly fill: () => void;
  readonly moveTo: (x: number, y: number) => void;
  readonly lineTo: (x: number, y: number) => void;
  readonly stroke: () => void;
}

export interface Viewport {
  readonly width: number;
  readonly height: number;
}

interface Camera {
  readonly dx: number;
  readonly dy: number;
  readonly px: number;
  readonly py: number;
}

const camera = (state: GameState, fovDegrees: number): Camera => {
  const planeLen = Math.tan((fovDegrees * Math.PI) / 180 / 2);
  const dx = Math.cos(state.pa);
  const dy = Math.sin(state.pa);
  return { dx, dy, px: -dy * planeLen, py: dx * planeLen };
};

export const castColumn = (
  state: GameState, rx: number, ry: number,
): { distance: number; side: number } => {
  let mx = Math.floor(state.px);
  let my = Math.floor(state.py);
  const ddx = Math.abs(1 / (rx === 0 ? 1e-6 : rx));
  const ddy = Math.abs(1 / (ry === 0 ? 1e-6 : ry));
  const stepX = rx < 0 ? -1 : 1;
  const stepY = ry < 0 ? -1 : 1;
  let sdx = (rx < 0 ? state.px - mx : mx + 1 - state.px) * ddx;
  let sdy = (ry < 0 ? state.py - my : my + 1 - state.py) * ddy;
  let side = 0;
  for (let guard = 0; guard < 96; guard += 1) {
    if (sdx < sdy) { sdx += ddx; mx += stepX; side = 0; } else { sdy += ddy; my += stepY; side = 1; }
    if (isSolid(state.grid, mx + 0.5, my + 0.5)) { break; }
  }
  const distance = side === 0 ? sdx - ddx : sdy - ddy;
  return { distance: Math.max(0.02, distance), side };
};

export const drawWalls = (
  ctx: Ctx2D, state: GameState, vp: Viewport, cfg: Config, zbuf: Float32Array,
): void => {
  const cam = camera(state, cfg.fovDegrees);
  ctx.fillStyle = '#0d0818';
  ctx.fillRect(0, 0, vp.width, vp.height / 2);
  ctx.fillStyle = '#150d20';
  ctx.fillRect(0, vp.height / 2, vp.width, vp.height / 2);
  for (let x = 0; x < vp.width; x += 1) {
    const camX = (2 * x) / vp.width - 1;
    const hit = castColumn(state, cam.dx + cam.px * camX, cam.dy + cam.py * camX);
    zbuf[x] = hit.distance;
    const lineH = Math.floor(vp.height / hit.distance);
    const y0 = Math.max(0, Math.floor(vp.height / 2 - lineH / 2));
    const y1 = Math.min(vp.height, y0 + lineH);
    const shade = Math.max(0.18, Math.min(1, 1.9 / hit.distance));
    const base = hit.side === 1 ? 43 : 74;
    const g = Math.floor(base * 0.6 * shade);
    ctx.fillStyle = `rgb(${String(Math.floor(base * shade))},${String(g)},${String(Math.floor(base * 1.27 * shade))})`;
    ctx.fillRect(x, y0, 1, Math.max(0, y1 - y0));
  }
};

interface Projected {
  readonly screenX: number;
  readonly depth: number;
  readonly height: number;
}

const project = (
  state: GameState, cam: Camera, vp: Viewport, x: number, y: number,
): Projected | undefined => {
  const ex = x - state.px;
  const ey = y - state.py;
  const inv = 1 / (cam.px * cam.dy - cam.dx * cam.py);
  const tx = inv * (cam.dy * ex - cam.dx * ey);
  const ty = inv * (-cam.py * ex + cam.px * ey);
  if (ty <= 0.1) {
    return undefined;
  }
  return {
    screenX: Math.floor((vp.width / 2) * (1 + tx / ty)),
    depth: ty,
    height: Math.abs(Math.floor(vp.height / ty)),
  };
};

const bodyAlpha = (alive: boolean, occluded: boolean): number => {
  if (!alive) { return 0.3; }
  return occluded ? 0.42 : 1;
};

const bodyColour = (enemy: Enemy, hot: boolean): string => {
  if (!enemy.alive) { return '#4a2d5e'; }
  return hot ? '#ffffff' : enemy.archetype.colour;
};

interface Target {
  readonly vp: Viewport;
  readonly zbuf: Float32Array;
}

const drawBody = (
  ctx: Ctx2D, target: Target, enemy: Enemy, p: Projected, cfg: Config,
): void => {
  const wide = Math.floor(p.height * 0.42);
  const y0 = Math.floor(target.vp.height / 2 - p.height / 2 + p.height * 0.22);
  const y1 = Math.floor(target.vp.height / 2 + p.height / 2);
  const hot = enemy.alive && enemy.committing;
  const x0 = Math.floor(p.screenX - wide / 2);
  for (let sx = x0; sx < x0 + wide; sx += 1) {
    const onScreen = sx >= 0 && sx < target.vp.width;
    const occluded = p.depth >= (target.zbuf[sx] ?? Infinity);
    if (onScreen && (!occluded || (cfg.silhouettes && enemy.alive))) {
      ctx.globalAlpha = bodyAlpha(enemy.alive, occluded);
      ctx.fillStyle = bodyColour(enemy, hot);
      const top = Math.max(0, y0);
      ctx.fillRect(sx, top, 1, Math.max(0, Math.min(target.vp.height, y1) - top));
    }
  }
  ctx.globalAlpha = 1;
};

/** Token state is an enemy's most important property: put it on the body. */
const drawWindupBar = (
  ctx: Ctx2D, target: Target, enemy: Enemy, p: Projected, now: number,
): void => {
  const wide = Math.floor(p.height * 0.42);
  const y0 = Math.floor(target.vp.height / 2 - p.height / 2 + p.height * 0.22);
  const bw = wide * 1.1;
  const bx = p.screenX - bw / 2;
  const by = y0 - Math.max(6, p.height * 0.09);
  ctx.fillStyle = 'rgba(10,6,18,0.8)';
  ctx.fillRect(bx - 1, by - 1, bw + 2, 7);
  ctx.fillStyle = enemy.archetype.colour;
  ctx.fillRect(bx, by, bw * windupProgress(enemy, now), 5);
};

export const drawSprites = (
  ctx: Ctx2D, state: GameState, vp: Viewport, cfg: Config, zbuf: Float32Array, now: number,
): void => {
  const cam = camera(state, cfg.fovDegrees);
  const visible = [...state.enemies].sort(
    (a, b) => Math.hypot(state.px - b.x, state.py - b.y) - Math.hypot(state.px - a.x, state.py - a.y),
  );
  const target: Target = { vp, zbuf };
  for (const enemy of visible) {
    const p = project(state, cam, vp, enemy.x, enemy.y);
    if (p !== undefined) {
      drawBody(ctx, target, enemy, p, cfg);
      if (enemy.alive && enemy.committing) {
        drawWindupBar(ctx, target, enemy, p, now);
      }
    }
  }
  for (const shot of state.projectiles) {
    const p = project(state, cam, vp, shot.x, shot.y);
    const onScreen = p !== undefined && p.screenX >= 0 && p.screenX < vp.width;
    if (onScreen && p.depth < (zbuf[p.screenX] ?? Infinity)) {
      const r = Math.max(2, 26 / p.depth);
      ctx.fillStyle = shot.blind ? '#8b7aa3' : '#ffffff';
      ctx.beginPath();
      ctx.arc(p.screenX, vp.height / 2 + r * 0.2, r * 0.35, 0, Math.PI * 2);
      ctx.fill();
    }
  }
};

/**
 * The visual redundancy for the audio tell, so a muted player is not playing a
 * different game from everyone else.
 */
export const drawThreatArcs = (
  ctx: Ctx2D, state: GameState, vp: Viewport, cfg: Config, now: number,
): void => {
  if (!cfg.threatArcs) {
    return;
  }
  const offScreenHolders = state.enemies.filter(
    (e) => e.alive && e.committing && !inFov(state, e, cfg.fovDegrees),
  );
  for (const enemy of offScreenHolders) {
    const bearing = relativeAngle(state, enemy);
    const span = vp.height * 0.42 * windupProgress(enemy, now);
    const cy = vp.height / 2 + Math.cos(bearing) * vp.height * 0.16;
    ctx.fillStyle = enemy.archetype.colour;
    ctx.globalAlpha = 0.85;
    ctx.fillRect(bearing > 0 ? vp.width - 7 : 0, cy - span / 2, 7, span);
    ctx.globalAlpha = 1;
  }
};

export const drawHud = (ctx: Ctx2D, state: GameState, vp: Viewport): void => {
  ctx.font = '11px ui-monospace, monospace';
  ctx.fillStyle = '#e8dff5';
  const label = state.weapon === 'fists' ? 'fists' : `${state.weapon}  ${String(state.ammo)}`;
  ctx.fillText(label, 12, vp.height - 14);
  if (state.combo > 1) {
    ctx.fillStyle = '#ff2d6f';
    ctx.fillText(`x${String(state.combo)}`, 12, vp.height - 30);
  }
  ctx.fillStyle = '#8b7aa3';
  ctx.fillText(`level ${String(state.levelIndex + 1)}`, vp.width - 70, vp.height - 14);
  ctx.strokeStyle = 'rgba(232,223,245,0.55)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(vp.width / 2 - 6, vp.height / 2);
  ctx.lineTo(vp.width / 2 + 6, vp.height / 2);
  ctx.moveTo(vp.width / 2, vp.height / 2 - 6);
  ctx.lineTo(vp.width / 2, vp.height / 2 + 6);
  ctx.stroke();
  if (state.dead) {
    ctx.fillStyle = 'rgba(255,45,111,0.16)';
    ctx.fillRect(0, 0, vp.width, vp.height);
  }
};

export const renderFrame = (
  ctx: Ctx2D, state: GameState, vp: Viewport, cfg: Config, zbuf: Float32Array, now: number,
): void => {
  drawWalls(ctx, state, vp, cfg, zbuf);
  drawSprites(ctx, state, vp, cfg, zbuf, now);
  drawThreatArcs(ctx, state, vp, cfg, now);
  drawHud(ctx, state, vp);
};
