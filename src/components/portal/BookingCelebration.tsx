import { X } from "lucide-react";
import { toast } from "sonner";

import { SPRITE_RADIUS, sparkleSprite } from "@/components/glitter-cursor-trail";
import { PersonName } from "@/components/studio/PersonName";
import { capitalizeName } from "@/lib/name-case";

/** the ways a new booking can be celebrated in the app */
export type CelebrationStyle = "burst" | "rain" | "shimmer" | "bomb" | "ribbon";

export type NewBooking = {
  /** the client, e.g. "Fenty Beauty" */
  name: string;
  /** what came in, e.g. "$2,001.25 deposit" */
  paid: string;
  /** the event day, MM/DD/YY */
  eventDate?: string | null;
  onOpen?: () => void;
};

// the studio's pinks, with gold, white, and a little lilac for the shine
const GLITTER = [
  "#ff4d94",
  "#ff5c89",
  "#fb8cac",
  "#fda8bf",
  "#ffd700",
  "#ffe9a8",
  "#ffffff",
  "#e6b3ff",
];

function stillMotion() {
  return (
    typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/** Celebrates a new booking: a toast, and glitter across the screen. */
export function celebrateBooking(style: CelebrationStyle, booking: NewBooking) {
  if (!stillMotion()) {
    const width = window.innerWidth;
    const height = window.innerHeight;
    // the corner card sits bottom right; the glitter starts from it
    const corner = { x: width - Math.min(200, width / 2), y: height - 150 };
    if (style === "burst") glitter({ from: corner, count: 160, speed: [3, 9], ms: 3200 });
    if (style === "rain") glitter({ rain: true, ms: 4200 });
    if (style === "shimmer") glitter({ from: corner, count: 50, speed: [1.5, 4], ms: 2600 });
    if (style === "bomb") {
      glitter({ from: { x: width / 2, y: height / 2 }, count: 320, speed: [4, 15], ms: 3800 });
      bigName(booking.name);
    }
    if (style === "ribbon") glitter({ stream: { x: width / 2, y: 84, spread: 300 }, ms: 3600 });
  }
  toast.custom((id) => <BookingToast style={style} booking={booking} id={id} />, {
    duration: 3000,
    position: style === "ribbon" ? "top-center" : "bottom-right",
    unstyled: true,
    className: "is-celebration",
  });
}

type Fleck = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
  glow: boolean;
  spin: number;
  phase: number;
};

/**
 * Glitter on a canvas over the whole screen: a burst from a point, a rain from the top, or a stream
 * falling from a ribbon. Each fleck twinkles as it drifts, then it all clears away.
 */
function glitter(options: {
  from?: { x: number; y: number };
  count?: number;
  speed?: [number, number];
  rain?: boolean;
  stream?: { x: number; y: number; spread: number };
  ms: number;
}) {
  const canvas = document.createElement("canvas");
  canvas.className = "celebrate-glitter";
  document.body.appendChild(canvas);
  const context = canvas.getContext("2d");
  if (!context) {
    canvas.remove();
    return;
  }
  const scale = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(window.innerWidth * scale);
  canvas.height = Math.round(window.innerHeight * scale);
  canvas.style.width = `${window.innerWidth}px`;
  canvas.style.height = `${window.innerHeight}px`;

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

  const flecks: Fleck[] = [];
  const fleck = (x: number, y: number, vx: number, vy: number, life: number): Fleck => ({
    x,
    y,
    vx,
    vy,
    life,
    maxLife: life,
    size: 1.6 + Math.random() * 3,
    color: GLITTER[Math.floor(Math.random() * GLITTER.length)]!,
    glow: Math.random() < 0.5,
    spin: (Math.random() - 0.5) * 0.2,
    phase: Math.random() * Math.PI * 2,
  });

  if (options.from) {
    const [low, high] = options.speed ?? [3, 9];
    for (let index = 0; index < (options.count ?? 120); index += 1) {
      const angle = Math.random() * Math.PI * 2;
      const speed = low + Math.random() * (high - low);
      flecks.push(
        fleck(
          options.from.x,
          options.from.y,
          Math.cos(angle) * speed,
          Math.sin(angle) * speed - 2,
          1.4 + Math.random() * 1.4,
        ),
      );
    }
  }

  const started = performance.now();
  const spawnUntil = started + options.ms - 1400;
  let last = started;
  let frame = 0;

  const tick = (now: number) => {
    const step = Math.min((now - last) / 16.67, 3);
    last = now;
    // rain and stream keep adding glitter for most of the moment
    if (now < spawnUntil) {
      if (options.rain) {
        for (let index = 0; index < 5; index += 1) {
          flecks.push(
            fleck(
              Math.random() * window.innerWidth,
              -10,
              (Math.random() - 0.5) * 0.8,
              1.2 + Math.random() * 2.4,
              3 + Math.random() * 1.5,
            ),
          );
        }
      }
      if (options.stream) {
        for (let index = 0; index < 4; index += 1) {
          flecks.push(
            fleck(
              options.stream.x + (Math.random() - 0.5) * options.stream.spread * 2,
              options.stream.y,
              (Math.random() - 0.5) * 1.2,
              0.6 + Math.random() * 1.8,
              2 + Math.random() * 1.4,
            ),
          );
        }
      }
    }
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, canvas.width, canvas.height);
    for (let index = flecks.length - 1; index >= 0; index -= 1) {
      const item = flecks[index]!;
      item.life -= (step * 16.67) / 1000;
      if (item.life <= 0 || item.y > window.innerHeight + 20) {
        flecks.splice(index, 1);
        continue;
      }
      // air slows the burst, then it falls and sways
      item.vx *= 0.97 ** step;
      item.vy = item.vy * 0.97 ** step + 0.07 * step;
      item.x += (item.vx + Math.sin(now / 400 + item.phase) * 0.25) * step;
      item.y += item.vy * step;
      item.phase += item.spin * step;
      const twinkle = 0.55 + 0.45 * Math.sin(now / 90 + item.phase * 6);
      const fade = Math.min(1, item.life / (item.maxLife * 0.35));
      const sprite = spriteFor(item.color, item.glow);
      const size = (item.size / SPRITE_RADIUS) * (0.7 + 0.3 * twinkle);
      context.globalAlpha = fade * twinkle;
      context.setTransform(
        size * Math.cos(item.phase),
        size * Math.sin(item.phase),
        -size * Math.sin(item.phase),
        size * Math.cos(item.phase),
        item.x * scale,
        item.y * scale,
      );
      context.drawImage(sprite, -sprite.width / 2, -sprite.height / 2);
    }
    if (now - started < options.ms || flecks.length) {
      frame = requestAnimationFrame(tick);
    } else {
      canvas.remove();
    }
  };
  frame = requestAnimationFrame(tick);
  window.setTimeout(() => {
    cancelAnimationFrame(frame);
    canvas.remove();
  }, options.ms + 3000);
}

/** the client's name across the screen in glittering letters, for a moment */
function bigName(name: string) {
  const host = document.createElement("div");
  host.className = "celebrate-bigname";
  host.setAttribute("aria-hidden", "true");
  const line = document.createElement("p");
  line.textContent = capitalizeName(name);
  line.className = "is-person";
  const under = document.createElement("span");
  under.textContent = "is booked";
  host.append(line, under);
  document.body.appendChild(host);
  window.setTimeout(() => host.remove(), 3400);
}

function BookingToast({
  style,
  booking,
  id,
}: {
  style: CelebrationStyle;
  booking: NewBooking;
  id: string | number;
}) {
  const close = () => toast.dismiss(id);
  const open = () => {
    booking.onOpen?.();
    close();
  };
  const facts = [booking.paid, booking.eventDate].filter(Boolean).join(" · ");

  if (style === "ribbon") {
    return (
      <div className="celebrate-ribbon" role="status">
        <span className="celebrate-sheen" aria-hidden="true" />
        <Twinkles count={10} />
        <p>
          <b>new booking</b> · <PersonName name={booking.name} /> · {facts}
        </p>
        <button type="button" onClick={open}>
          open
        </button>
        <button type="button" className="celebrate-x" aria-label="close" onClick={close}>
          <X aria-hidden="true" />
        </button>
      </div>
    );
  }

  return (
    <div className={`celebrate-card is-${style}`} role="status">
      {style === "shimmer" ? <span className="celebrate-sheen" aria-hidden="true" /> : null}
      <Twinkles count={style === "shimmer" ? 16 : 7} />
      <button type="button" className="celebrate-x" aria-label="close" onClick={close}>
        <X aria-hidden="true" />
      </button>
      <p className="celebrate-eyebrow">{style === "rain" ? "it's official" : "new booking"}</p>
      <p className="celebrate-name">
        <PersonName name={booking.name} /> is booked!
      </p>
      <p className="celebrate-facts">{facts}</p>
      <button type="button" className="celebrate-open" onClick={open}>
        open the project
      </button>
    </div>
  );
}

/** little four-point sparkles that twinkle on the card itself */
function Twinkles({ count }: { count: number }) {
  return (
    <span className="celebrate-twinkles" aria-hidden="true">
      {Array.from({ length: count }, (_, index) => (
        <svg
          key={index}
          viewBox="-12 -12 24 24"
          style={{
            left: `${(index * 61) % 100}%`,
            top: `${(index * 37 + 11) % 100}%`,
            animationDelay: `${(index * 230) % 1600}ms`,
            width: `${8 + ((index * 5) % 9)}px`,
          }}
        >
          <path
            d="M0 -12 Q3.4 -3.4 12 0 Q3.4 3.4 0 12 Q-3.4 3.4 -12 0 Q-3.4 -3.4 0 -12 Z"
            fill={GLITTER[index % GLITTER.length]}
          />
        </svg>
      ))}
    </span>
  );
}
