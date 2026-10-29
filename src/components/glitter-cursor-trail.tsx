import { createContext, useContext, useEffect, useRef } from "react";

/** Lets a page ask for a calm cursor while it's open; the root hides the trail. */
export const QuietCursorContext = createContext<(quiet: boolean) => void>(() => {});

export function useQuietCursor() {
  const setQuiet = useContext(QuietCursorContext);
  useEffect(() => {
    setQuiet(true);
    return () => setQuiet(false);
  }, [setQuiet]);
}

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
  rotation: number;
  glow: boolean;
};

const GLITTER_COLORS = [
  "#FFD700",
  "#FFB6C1",
  "#E6B3FF",
  "#FFFFFF",
  "#3AB819",
  "#15AAD2",
  "#EFB003",
];

function pickColor() {
  return GLITTER_COLORS[Math.floor(Math.random() * GLITTER_COLORS.length)]!;
}

const SPRITE_RADIUS = 12;

/** Each colour, with and without its glow, is drawn once; frames only stamp these. */
function sparkleSprite(color: string, glow: boolean, scale: number) {
  const pad = glow ? SPRITE_RADIUS * 1.6 : 2;
  const half = SPRITE_RADIUS + pad;
  const sprite = document.createElement("canvas");
  sprite.width = sprite.height = Math.ceil(half * 2 * scale);
  const ctx = sprite.getContext("2d");
  if (!ctx) return sprite;
  ctx.scale(scale, scale);
  ctx.translate(half, half);
  const r = SPRITE_RADIUS;
  const curve = r * 0.28;
  ctx.fillStyle = color;
  if (glow) {
    ctx.shadowColor = "rgba(255, 255, 255, 0.85)";
    ctx.shadowBlur = r * 1.4;
  }
  ctx.beginPath();
  ctx.moveTo(0, -r);
  ctx.quadraticCurveTo(curve, -curve, r, 0);
  ctx.quadraticCurveTo(curve, curve, 0, r);
  ctx.quadraticCurveTo(-curve, curve, -r, 0);
  ctx.quadraticCurveTo(-curve, -curve, 0, -r);
  ctx.closePath();
  ctx.fill();
  return sprite;
}

export function GlitterCursorTrail() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particlesRef = useRef<Particle[]>([]);
  const lastPosRef = useRef<{ x: number; y: number } | null>(null);
  const velocityRef = useRef({ x: 0, y: 0 });

  useEffect(() => {
    if (!window.matchMedia("(pointer: fine)").matches) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { desynchronized: true });
    if (!ctx) return;

    const scale = Math.min(window.devicePixelRatio || 1, 2);
    const sprites = new Map<string, HTMLCanvasElement>();
    const spriteFor = (color: string, glow: boolean) => {
      const key = `${color}${glow ? "*" : ""}`;
      let sprite = sprites.get(key);
      if (!sprite) {
        sprite = sparkleSprite(color, glow, scale);
        sprites.set(key, sprite);
      }
      return sprite;
    };

    const resize = () => {
      canvas.width = Math.round(window.innerWidth * scale);
      canvas.height = Math.round(window.innerHeight * scale);
      canvas.style.width = `${window.innerWidth}px`;
      canvas.style.height = `${window.innerHeight}px`;
    };
    resize();
    window.addEventListener("resize", resize);

    const spawn = (x: number, y: number, vx: number, vy: number) => {
      const scatter = 5 + Math.random() * 4;
      const maxLife = 1.1 + Math.random() * 0.5;
      particlesRef.current.push({
        x: x + (Math.random() - 0.5) * scatter,
        y: y + (Math.random() - 0.5) * scatter,
        vx: -vx * 0.04 + (Math.random() - 0.5) * 0.18,
        vy: -vy * 0.04 + (Math.random() - 0.5) * 0.18,
        life: maxLife,
        maxLife,
        size: 2.2 + Math.random() * 2.2,
        color: pickColor(),
        rotation: Math.random() * Math.PI * 0.5,
        glow: Math.random() < 0.45,
      });
      if (particlesRef.current.length > 55) {
        particlesRef.current.splice(0, particlesRef.current.length - 55);
      }
    };

    let raf = 0;
    let lastTime = 0;
    // distance travelled since the last sparkle, so a fast flick still leaves an even trail
    let travelled = 0;

    const tick = (now: number) => {
      const dt = lastTime ? Math.min((now - lastTime) / 1000, 0.032) : 0.016;
      lastTime = now;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      particlesRef.current = particlesRef.current.filter((p) => {
        p.life -= dt;
        if (p.life <= 0) return false;
        p.x += p.vx;
        p.y += p.vy;
        p.vx *= 0.985;
        p.vy *= 0.985;

        const t = p.life / p.maxLife;
        const size = p.size * (0.35 + 0.65 * t);
        const sprite = spriteFor(p.color, p.glow);
        const drawn = (sprite.width / scale) * (size / SPRITE_RADIUS);
        ctx.globalAlpha = Math.pow(t, 1.6) * 0.92;
        ctx.setTransform(scale, 0, 0, scale, p.x * scale, p.y * scale);
        ctx.rotate(p.rotation);
        ctx.drawImage(sprite, -drawn / 2, -drawn / 2, drawn, drawn);
        return true;
      });

      // nothing left to fade: rest until the pointer moves again
      if (particlesRef.current.length) raf = requestAnimationFrame(tick);
      else {
        raf = 0;
        lastTime = 0;
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
    };

    const onMove = (e: PointerEvent) => {
      const last = lastPosRef.current;
      const dx = last ? e.clientX - last.x : 0;
      const dy = last ? e.clientY - last.y : 0;
      lastPosRef.current = { x: e.clientX, y: e.clientY };
      velocityRef.current.x = velocityRef.current.x * 0.55 + dx * 0.45;
      velocityRef.current.y = velocityRef.current.y * 0.55 + dy * 0.45;

      const step = Math.hypot(dx, dy);
      travelled += step;
      // a sparkle every ~14px along the path, laid where the pointer actually went
      const count = Math.min(3, Math.floor(travelled / 14));
      for (let i = count; i >= 1; i -= 1) {
        const back = step ? Math.min(1, ((i - 1) * 14) / step) : 0;
        spawn(
          e.clientX - dx * back,
          e.clientY - dy * back,
          velocityRef.current.x,
          velocityRef.current.y,
        );
      }
      if (count) travelled = travelled % 14;
      if (!last) spawn(e.clientX, e.clientY, 0, 0);
      if (!raf) raf = requestAnimationFrame(tick);
    };

    window.addEventListener("pointermove", onMove, { passive: true });

    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("resize", resize);
      cancelAnimationFrame(raf);
      particlesRef.current = [];
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none fixed inset-0 z-[9999] [will-change:transform]"
      aria-hidden
    />
  );
}
