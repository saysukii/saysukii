import { useEffect, useRef, type ReactNode } from "react";

import { Wordmark } from "@/components/portal/bits";
import { cn } from "@/lib/utils";

export function InquireScene({
  children,
  tone = "pearl",
  wide = false,
  flush = false,
  scroll = false,
}: {
  children: ReactNode;
  tone?: "pearl" | "thread" | "dossier" | "atelier";
  wide?: boolean;
  flush?: boolean;
  scroll?: boolean;
}) {
  const sceneRef = useRef<HTMLDivElement>(null);
  const farRef = useRef<HTMLDivElement>(null);
  const nearRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scroll) return;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const target = {
      x: window.innerWidth / 2,
      y: window.innerHeight / 2,
      normalizedX: 0,
      normalizedY: 0,
    };
    const current = { ...target };
    let raf = 0;

    const onMove = (event: PointerEvent) => {
      target.x = event.clientX;
      target.y = event.clientY;
      target.normalizedX = (event.clientX / window.innerWidth) * 2 - 1;
      target.normalizedY = (event.clientY / window.innerHeight) * 2 - 1;
    };
    const onLeave = () => {
      target.x = window.innerWidth / 2;
      target.y = window.innerHeight / 2;
      target.normalizedX = 0;
      target.normalizedY = 0;
    };

    const tick = () => {
      current.x += (target.x - current.x) * 0.045;
      current.y += (target.y - current.y) * 0.045;
      current.normalizedX += (target.normalizedX - current.normalizedX) * 0.025;
      current.normalizedY += (target.normalizedY - current.normalizedY) * 0.025;

      if (farRef.current) {
        farRef.current.style.transform = `translate3d(${current.normalizedX * -1.2}vw, ${current.normalizedY * -0.8}vh, 0) scale(1.08)`;
      }
      if (nearRef.current) {
        nearRef.current.style.transform = `translate3d(${current.x}px, ${current.y}px, 0) translate(-50%, -50%)`;
      }
      raf = requestAnimationFrame(tick);
    };

    const scene = sceneRef.current;
    window.addEventListener("pointermove", onMove, { passive: true });
    scene?.addEventListener("pointerleave", onLeave);
    raf = requestAnimationFrame(tick);
    return () => {
      window.removeEventListener("pointermove", onMove);
      scene?.removeEventListener("pointerleave", onLeave);
      cancelAnimationFrame(raf);
    };
  }, [scroll]);

  return (
    <div
      ref={sceneRef}
      className={cn(
        "auth-scene auth-scene--pearl auth-scene--login",
        `inquire-scene--${tone}`,
        scroll && "auth-scene--scroll",
      )}
    >
      <div className="auth-scene-wash" aria-hidden="true">
        <div className="auth-grain" />
        <div ref={farRef} className="auth-aura auth-aura--far" />
        <div ref={nearRef} className="auth-aura auth-aura--near">
          <span className="auth-orbit auth-orbit--one" />
          <span className="auth-orbit auth-orbit--two" />
          <span className="auth-petal auth-petal--one" />
          <span className="auth-petal auth-petal--two" />
          <span className="auth-petal auth-petal--three" />
        </div>
      </div>
      <main
        className={cn(
          !flush && "auth-login-only inquire-login",
          wide && !flush && "inquire-login--wide",
          scroll && !flush && "inquire-login--scroll",
          flush && "inquire-system-frame",
        )}
      >
        {flush ? null : (
          <a href="/" className="auth-wordmark inquire-wordmark" aria-label="Say Sukii home">
            <Wordmark tone="ink" />
          </a>
        )}
        {children}
      </main>
    </div>
  );
}
