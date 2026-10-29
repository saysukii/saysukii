import { useCallback, useEffect, useRef, useState } from "react";

export function isSignatureDataUrl(value: string | null | undefined): value is string {
  return typeof value === "string" && value.startsWith("data:image/png;base64,");
}

export function SignaturePad({
  value,
  onChange,
  disabled = false,
}: {
  value: string | null;
  onChange: (next: string | null) => void;
  disabled?: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef(false);
  const lastRef = useRef<{ x: number; y: number } | null>(null);
  const [hasInk, setHasInk] = useState(Boolean(value));

  const resizeCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.max(1, Math.floor(rect.width * dpr));
    const height = Math.max(1, Math.floor(rect.height * dpr));
    if (canvas.width === width && canvas.height === height) return;
    const previous = canvas.toDataURL("image/png");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) return;
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.lineCap = "round";
    context.lineJoin = "round";
    context.strokeStyle = "#24221f";
    context.lineWidth = 2.2;
    if (previous && previous !== "data:,") {
      const image = new Image();
      image.onload = () => context.drawImage(image, 0, 0, rect.width, rect.height);
      image.src = previous;
    }
  }, []);

  useEffect(() => {
    resizeCanvas();
    window.addEventListener("resize", resizeCanvas);
    return () => window.removeEventListener("resize", resizeCanvas);
  }, [resizeCanvas]);

  useEffect(() => {
    if (value) return;
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    const rect = canvas.getBoundingClientRect();
    context.clearRect(0, 0, rect.width, rect.height);
    setHasInk(false);
  }, [value]);

  function pointFromEvent(event: React.MouseEvent | React.TouchEvent) {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const source = "touches" in event ? event.touches[0] || event.changedTouches[0] : event;
    if (!source) return null;
    return { x: source.clientX - rect.left, y: source.clientY - rect.top };
  }

  function emit() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setHasInk(true);
    onChange(canvas.toDataURL("image/png"));
  }

  function start(event: React.MouseEvent | React.TouchEvent) {
    if (disabled) return;
    event.preventDefault();
    const point = pointFromEvent(event);
    if (!point) return;
    drawingRef.current = true;
    lastRef.current = point;
    const context = canvasRef.current?.getContext("2d");
    if (!context) return;
    context.beginPath();
    context.moveTo(point.x, point.y);
    context.lineTo(point.x + 0.01, point.y + 0.01);
    context.stroke();
  }

  function move(event: React.MouseEvent | React.TouchEvent) {
    if (!drawingRef.current || disabled) return;
    event.preventDefault();
    const point = pointFromEvent(event);
    const last = lastRef.current;
    if (!point || !last) return;
    const context = canvasRef.current?.getContext("2d");
    if (!context) return;
    context.beginPath();
    context.moveTo(last.x, last.y);
    context.lineTo(point.x, point.y);
    context.stroke();
    lastRef.current = point;
  }

  function end(event: React.MouseEvent | React.TouchEvent) {
    if (!drawingRef.current) return;
    event.preventDefault();
    drawingRef.current = false;
    lastRef.current = null;
    emit();
  }

  function clear() {
    onChange(null);
  }

  return (
    <div className="client-packet-pad">
      <div className="client-packet-pad-stage">
        <canvas
          ref={canvasRef}
          className="client-packet-pad-canvas"
          aria-label="Sign with your finger or cursor"
          onMouseDown={start}
          onMouseMove={move}
          onMouseUp={end}
          onMouseLeave={end}
          onTouchStart={start}
          onTouchMove={move}
          onTouchEnd={end}
        />
        {!hasInk && !disabled ? <p>Sign with your finger or cursor</p> : null}
      </div>
      <div className="client-packet-pad-row">
        <button
          type="button"
          className="client-packet-pad-clear"
          disabled={disabled || !hasInk}
          onClick={clear}
        >
          Clear
        </button>
      </div>
    </div>
  );
}
