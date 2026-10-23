import { useEffect, useRef } from "react";

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

const GLITTER_COLORS = ["#FFD700", "#FFB6C1", "#E6B3FF", "#FFFFFF", "#3AB819", "#15AAD2", "#EFB003"];

function pickColor() {
  return GLITTER_COLORS[Math.floor(Math.random() * GLITTER_COLORS.length)]!;
}

function drawGlitterSparkle(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  rotation: number,
  alpha: number,
  color: string,
  glow: boolean,
) {
  const r = size;
  const curve = size * 0.28;

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rotation);
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;

  if (glow) {
    ctx.shadowColor = "rgba(255, 255, 255, 0.85)";
    ctx.shadowBlur = size * 1.4;
  }

  ctx.beginPath();
  ctx.moveTo(0, -r);
  ctx.quadraticCurveTo(curve, -curve, r, 0);
  ctx.quadraticCurveTo(curve, curve, 0, r);
  ctx.quadraticCurveTo(-curve, curve, -r, 0);
  ctx.quadraticCurveTo(-curve, -curve, 0, -r);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
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
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener("resize", resize);

    let lastSpawnTime = 0;
    let pendingX = 0;
    let pendingY = 0;
    let hasPending = false;

    const spawn = (x: number, y: number, vx: number, vy: number) => {
      const speed = Math.hypot(vx, vy);
      const trailX = speed > 0.5 ? x - (vx / speed) * 6 : x;
      const trailY = speed > 0.5 ? y - (vy / speed) * 6 : y;
      const scatter = 5 + Math.random() * 4;
      const maxLife = 1.1 + Math.random() * 0.5;

      particlesRef.current.push({
        x: trailX + (Math.random() - 0.5) * scatter,
        y: trailY + (Math.random() - 0.5) * scatter,
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

    const onMove = (e: MouseEvent) => {
      const last = lastPosRef.current;
      const dx = last ? e.clientX - last.x : 0;
      const dy = last ? e.clientY - last.y : 0;

      velocityRef.current.x = velocityRef.current.x * 0.55 + dx * 0.45;
      velocityRef.current.y = velocityRef.current.y * 0.55 + dy * 0.45;

      pendingX = e.clientX;
      pendingY = e.clientY;
      hasPending = true;
      lastPosRef.current = { x: e.clientX, y: e.clientY };
    };

    let raf = 0;
    let lastTime = performance.now();

    const tick = (now: number) => {
      const dt = Math.min((now - lastTime) / 1000, 0.032);
      lastTime = now;

      if (hasPending && now - lastSpawnTime >= 42) {
        lastSpawnTime = now;
        spawn(pendingX, pendingY, velocityRef.current.x, velocityRef.current.y);
        hasPending = false;

        const speed = Math.hypot(velocityRef.current.x, velocityRef.current.y);
        if (speed > 14 && Math.random() < 0.35) {
          const lag = 0.35;
          spawn(
            pendingX - velocityRef.current.x * lag,
            pendingY - velocityRef.current.y * lag,
            velocityRef.current.x,
            velocityRef.current.y,
          );
        }
      }

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      particlesRef.current = particlesRef.current.filter((p) => {
        p.life -= dt;
        if (p.life <= 0) return false;

        p.x += p.vx;
        p.y += p.vy;
        p.vx *= 0.985;
        p.vy *= 0.985;

        const t = p.life / p.maxLife;
        const alpha = Math.pow(t, 1.6) * 0.92;
        const renderSize = p.size * (0.35 + 0.65 * t);

        drawGlitterSparkle(ctx, p.x, p.y, renderSize, p.rotation, alpha, p.color, p.glow);
        return true;
      });

      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    window.addEventListener("mousemove", onMove);

    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("resize", resize);
      cancelAnimationFrame(raf);
      particlesRef.current = [];
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none fixed inset-0 z-[9999]"
      aria-hidden
    />
  );
}
