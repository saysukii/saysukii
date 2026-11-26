import { useLayoutEffect } from "react";

/**
 * The studio is laid out for a 13" macbook air, 1470 wide, and every screen gets that same feel:
 * - wider (a 15", a desktop): it scales up gently to match, edge to edge
 * - a tablet held wide: the 13" page, shrunk to fit
 * - phones and tablets held tall: their own layout, a touch smaller, so it reads as light as the
 *   13" does
 *
 * Browsers scale a page in one of two ways, and the studio works out which one it's in:
 * - like browser zoom (Safari): everything, positions included, scales together
 * - the standard way (Chrome, Firefox): positions read in javascript are on-screen pixels, and
 *   viewport units are scaled a second time. styles.css divides viewport units by
 *   --studio-vz, and floating panels (dropdowns, date and time pickers) sit outside the scale
 *   while their contents are scaled, so they open where they should.
 */

/** the width the studio is laid out for */
export const STUDIO_BASE_WIDTH = 1470;
/** past this the studio stops growing, so a big monitor doesn't get a poster */
export const STUDIO_MAX_ZOOM = 1.3;
/** below this the studio switches to its phone and tablet layout (styles.css, max-width: 1099px) */
export const STUDIO_HANDHELD_WIDTH = 1100;
/** phones and tablets held tall show their layout at this size */
export const STUDIO_HANDHELD_ZOOM = 0.86;

// a little rounding keeps text and lines crisp
const round = (zoom: number) => Math.round(zoom * 1000) / 1000;

/**
 * how much to scale for a window this wide. `touch` is a touchscreen, so a tablet held wide
 * shrinks the 13" page to fit, while a laptop window that size is left as it is.
 */
export function studioZoomFor(width: number, touch = false) {
  if (!Number.isFinite(width) || width <= 0) return 1;
  if (width < STUDIO_HANDHELD_WIDTH) return STUDIO_HANDHELD_ZOOM;
  if (width < STUDIO_BASE_WIDTH) return touch ? round(width / STUDIO_BASE_WIDTH) : 1;
  return Math.min(STUDIO_MAX_ZOOM, round(width / STUDIO_BASE_WIDTH));
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
  const touch = window.matchMedia?.("(any-pointer: coarse)").matches ?? false;
  const zoom = studioZoomFor(window.innerWidth, touch);
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
