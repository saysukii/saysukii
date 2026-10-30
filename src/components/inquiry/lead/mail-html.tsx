import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

// what a letter quotes from earlier in the thread, in gmail, apple mail, outlook, and yahoo
const QUOTED = [
  ".gmail_quote",
  ".gmail_quote_container",
  "blockquote[type='cite']",
  ".yahoo_quoted",
  "#appendonsend",
  "#divRplyFwdMsg",
  "[id^='OLK_SRC_BODY']",
];
// outlook's quote is everything from its marker down, not just the marker
const QUOTE_STARTS = ["#appendonsend", "#divRplyFwdMsg"];
const UNSAFE = "script, iframe, frame, object, embed, form, base, link, meta";

const FRAME_STYLE = `
  html, body { margin: 0; padding: 0; background: transparent; }
  body {
    color: #222;
    font-family: Arial, Helvetica, sans-serif;
    font-size: 14px;
    line-height: 1.45;
    overflow-wrap: anywhere;
  }
  img { max-width: 100%; height: auto; }
  table { max-width: 100%; }
  a { color: #1a5bd6; }
  p { margin: 0 0 0.6em; }
`;

/** the letter's own html, without what it quotes, anything that could run, or pictures it can't show */
function cleanMailHtml(html: string) {
  if (typeof DOMParser === "undefined") return "";
  const doc = new DOMParser().parseFromString(html, "text/html");
  for (const start of QUOTE_STARTS) {
    const marker = doc.querySelector(start);
    while (marker?.nextSibling) marker.nextSibling.remove();
  }
  doc.querySelectorAll([...QUOTED, UNSAFE].join(", ")).forEach((node) => node.remove());
  // a picture attached to the letter itself can't load here
  doc.querySelectorAll("img[src^='cid:']").forEach((node) => node.remove());
  doc.querySelectorAll("*").forEach((node) => {
    for (const attribute of [...node.attributes]) {
      if (/^on/i.test(attribute.name)) node.removeAttribute(attribute.name);
      if (/^\s*javascript:/i.test(attribute.value)) node.removeAttribute(attribute.name);
    }
  });
  const text = doc.body.textContent?.replace(/\s+/g, "") ?? "";
  if (!text && !doc.body.querySelector("img")) return "";
  const styles = [...doc.querySelectorAll("style")].map((style) => style.outerHTML).join("");
  return `<!doctype html><html><head><meta charset="utf-8"><base target="_blank"><style>${FRAME_STYLE}</style>${styles}</head><body>${doc.body.innerHTML}</body></html>`;
}

/**
 * An email drawn the way the client's mail app sent it: their signature, links, and pictures. It
 * sits in a sealed frame, so nothing in the letter can run or reach the studio's page.
 */
export function MailHtml({ html, fallback }: { html: string; fallback: ReactNode }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(0);
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  const page = useMemo(() => (ready ? cleanMailHtml(html) : ""), [html, ready]);

  useEffect(() => {
    const node = frame.current;
    if (!node || !page) return;
    let watch: ResizeObserver | null = null;
    const fit = () => {
      const doc = node.contentDocument;
      if (doc?.documentElement) setHeight(doc.documentElement.scrollHeight);
    };
    const loaded = () => {
      fit();
      const doc = node.contentDocument;
      if (!doc?.body) return;
      watch = new ResizeObserver(fit);
      watch.observe(doc.body);
      doc.querySelectorAll("img").forEach((image) => image.addEventListener("load", fit));
    };
    node.addEventListener("load", loaded);
    // a short letter can finish loading before this is listening
    if (
      node.contentDocument?.readyState === "complete" &&
      node.contentDocument.body?.childNodes.length
    ) {
      loaded();
    }
    return () => {
      node.removeEventListener("load", loaded);
      watch?.disconnect();
    };
  }, [page]);

  if (!ready || !page) return <>{fallback}</>;
  return (
    <iframe
      ref={frame}
      title="the letter as it was sent"
      className="studio-mail-html"
      // no scripts can run; links still open in a new tab
      sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
      srcDoc={page}
      style={{ height: height || 80 }}
    />
  );
}
