import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";

import { BookMeeting } from "@/components/book/BookMeeting";
import { InquireScene } from "@/components/inquiry/InquireScene";
import { bookAppointment } from "@/lib/os/bookings.functions";

export const Route = createFileRoute("/book")({
  head: () => ({
    meta: [
      { title: "Schedule a meeting – Say Sukii" },
      { name: "description", content: "Book a thirty-minute conversation with Say Sukii." },
    ],
  }),
  component: BookPage,
});

function BookPage() {
  const book = useServerFn(bookAppointment);
  return (
    <InquireScene wide>
      <BookMeeting
        onBooked={async (booking) => {
          try {
            await book({
              data: {
                startsAt: booking.startsAt,
                name: booking.name,
                email: booking.email,
                note: booking.note,
              },
            });
          } catch {
            // the time stays on this browser when the studio table isn't ready yet
          }
        }}
      />
    </InquireScene>
  );
}
