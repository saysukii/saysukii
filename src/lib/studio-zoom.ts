import { useLayoutEffect } from "react";

/**
 * The studio is laid out for a 13" laptop, about 1280 wide. On anything wider it scales up to
 * match, so a 15" or a desktop shows the same page, just larger, instead of a smaller page with
 * more room around it.
 *
 * Browsers scale a page in one of two ways, and the studio works out which one it's in:
 * - like browser zoom (Safari): everything, positions included, scales together
 * - the standard way (Chrome, Firefox): positions read in javascript are on-screen pixels, and
 *   viewport units are scaled a second time. styles.css divides viewport units by
 *   --studio-vz, and floating panels (dropdowns, date and time pickers) sit outside the scale
 *   while their contents are scaled, so they open where they should.
 */

/** the width the studio is laid out for */
export const STUDIO_BASE_WIDTH = 1280;
/** past this the studio stops growing, so a big monitor doesn't get a poster */
export const STUDIO_MAX_ZOOM = 1.5;

/** how much to scale for a window this wide: 1 up to the base width, then in step with it */
export function studioZoomFor(width: number) {
  if (!Number.isFinite(width) || width <= STUDIO_BASE_WIDTH) return 1;
  // a little rounding keeps text and lines crisp
  return Math.min(STUDIO_MAX_ZOOM, Math.round((width / STUDIO_BASE_WIDTH) * 1000) / 1000);
}

let current = 1;
let standard: boolean | null = null;

/** whether this browser scales the standard way, where measurements come back in screen pixels */
function scalesStandard() {
  if (standard !== null) return standard;
  const outer = document.createElement("div");
  outer.style.cssText = "position:absolute;visibility:hidden;zoom:2;top:0;left:0";
  const inner = document.createElement("div");
  inner.style.cssText = "width:100px;height:1px";
  outer.appendChild(inner);
  document.body.appendChild(outer);
  standard = inner.getBoundingClientRect().width > 150;
  outer.remove();
  return standard;
}

function apply() {
  const root = document.documentElement;
  const zoom = studioZoomFor(window.innerWidth);
  current = zoom;
  if (zoom === 1) {
    root.classList.remove("studio-zoomed", "is-zoom-standard");
    root.style.removeProperty("--studio-zoom");
    root.style.removeProperty("--studio-vz");
    return;
  }
  const isStandard = scalesStandard();
  root.style.setProperty("--studio-zoom", String(zoom));
  root.style.setProperty("--studio-vz", isStandard ? String(zoom) : "1");
  root.classList.add("studio-zoomed");
  root.classList.toggle("is-zoom-standard", isStandard);
}

/** scale the studio to the window while it's on screen; public pages stay as they are */
export function useStudioZoom() {
  useLayoutEffect(() => {
    apply();
    window.addEventListener("resize", apply);
    return () => {
      window.removeEventListener("resize", apply);
      current = 1;
      const root = document.documentElement;
      root.classList.remove("studio-zoomed", "is-zoom-standard");
      root.style.removeProperty("--studio-zoom");
      root.style.removeProperty("--studio-vz");
    };
  }, []);
}

/** how much the scale is right now */
export function studioZoom() {
  return current;
}

/** a measurement from getBoundingClientRect, in the page's own pixels, for placing things */
export function fromRect(px: number) {
  return current !== 1 && standard ? px / current : px;
}

/** the window's size in the page's own pixels */
export function studioViewport() {
  return { width: window.innerWidth / current, height: window.innerHeight / current };
}
