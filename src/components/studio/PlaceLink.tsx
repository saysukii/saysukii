import { useEffect, useState, type ReactNode } from "react";

function prefersAppleMaps() {
  const agent = navigator.userAgent;
  if (/iPhone|iPad|iPod/.test(agent)) return true;
  if (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1) return true;
  return /Macintosh/.test(agent);
}

function mapsHref(place: string) {
  const query = encodeURIComponent(place);
  return prefersAppleMaps()
    ? `https://maps.apple.com/?q=${query}`
    : `https://www.google.com/maps/search/?api=1&query=${query}`;
}

/** Opens a place in apple maps on apple devices and google maps everywhere else. */
export function PlaceLink({
  place,
  children,
  className = "studio-place",
}: {
  place: string;
  children?: ReactNode;
  className?: string;
}) {
  const google = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place)}`;
  const [href, setHref] = useState(google);
  useEffect(() => {
    setHref(mapsHref(place));
  }, [place]);
  return (
    <a className={className} href={href} target="_blank" rel="noreferrer">
      {children ?? place}
    </a>
  );
}
