import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";

import { getSentLetter } from "@/lib/os/sent-letters.functions";

// an email the app sent a client on its own (a receipt, a reminder), opened in its own tab
export const Route = createFileRoute("/letter/$id")({
  head: () => ({
    meta: [{ title: "Sent email — Say Sukii" }, { name: "robots", content: "noindex" }],
  }),
  component: SentLetter,
});

function SentLetter() {
  const { id } = Route.useParams();
  const load = useServerFn(getSentLetter);
  const [letter, setLetter] = useState<Awaited<ReturnType<typeof getSentLetter>> | null>(null);
  const [problem, setProblem] = useState("");

  useEffect(() => {
    void load({ data: { id } }).then(
      (result) => {
        setLetter(result);
        document.title = result.subject;
      },
      (error: unknown) =>
        setProblem(error instanceof Error ? error.message : "this email couldn't open."),
    );
  }, [id, load]);

  if (!letter) {
    return <p className="sent-letter-note">{problem || "opening…"}</p>;
  }
  return (
    <main className="sent-letter">
      <header>
        <b>{letter.subject}</b>
        <span>
          to {letter.to} ·{" "}
          {new Date(letter.sentAt).toLocaleString("en-US", {
            month: "2-digit",
            day: "2-digit",
            year: "2-digit",
            hour: "numeric",
            minute: "2-digit",
          })}
        </span>
      </header>
      <iframe title={letter.subject} srcDoc={letter.html} />
    </main>
  );
}
