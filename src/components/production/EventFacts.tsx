import { PlaceLink } from "@/components/studio/PlaceLink";

/** "11/30 – 12/5 · Pérez Art Museum Miami · Lumen Studio", with the place opening in maps */
export function EventFacts({
  date,
  venue,
  address,
  client = "",
}: {
  date: string;
  venue: string;
  address: string;
  client?: string;
}) {
  const parts = [
    date ? <span key="date">{date}</span> : null,
    venue ? (
      <PlaceLink key="venue" place={address || venue} className="studio-row-place">
        {venue}
      </PlaceLink>
    ) : null,
    client ? <span key="client">{client}</span> : null,
  ].filter(Boolean);
  return (
    <>
      {parts.map((part, index) => (
        <span key={index}>
          {index ? " · " : ""}
          {part}
        </span>
      ))}
    </>
  );
}
