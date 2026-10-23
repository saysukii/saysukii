import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { InquireScene } from "@/components/inquiry/InquireScene";
import { InquiryGuide } from "@/components/inquiry/InquiryGuide";
import { InquiryThanks } from "@/components/inquiry/InquiryThanks";
import { firstName } from "@/lib/os/connect-letter";
import type { InquiryFormValues } from "@/lib/os/inquiry-form";
import { submitPublicInquiry } from "@/lib/os/inquiries.functions";
import { rememberPreviewArrival } from "@/lib/preview-arrivals";
import { pushNotice } from "@/lib/studio-notices";

export function InquirePublicPage() {
  const submitInquiry = useServerFn(submitPublicInquiry);
  const submit = useMutation({
    mutationFn: (values: InquiryFormValues) =>
      submitInquiry({ data: { ...values, website: values.website ?? "" } }),
  });
  const [previewSent, setPreviewSent] = useState(false);

  useEffect(() => {
    if (import.meta.env.DEV && new URLSearchParams(window.location.search).get("sent") === "1") {
      setPreviewSent(true);
    }
  }, []);

  return (
    <InquireScene>
      {submit.isSuccess || previewSent ? (
        <InquiryThanks
          onReset={() => {
            setPreviewSent(false);
            submit.reset();
          }}
        />
      ) : (
        <>
          {submit.isError ? (
            <p className="inquire-error inquire-error--page" role="alert">
              We couldn’t save your inquiry. Please try again.
            </p>
          ) : null}
          <InquiryGuide
            showHoneypot
            disabled={submit.isPending}
            onSubmit={async (values) => {
              const result = await submit.mutateAsync(values);
              if (!result.preview) return;
              const id = crypto.randomUUID();
              const receivedAt = new Date().toISOString();
              rememberPreviewArrival({
                id,
                name: values.name,
                email: values.email,
                phone: values.phone,
                eventType: values.event_type,
                eventDate: values.event_date,
                eventDateTbd: values.event_date_tbd,
                venue: values.venue_text,
                budget: values.budget_range,
                message: values.message,
                receivedAt,
              });
              const who = firstName(values.name).toLowerCase() || "someone";
              pushNotice({
                id: `inquiry-${id}`,
                title: `${who} wrote in`,
                body: "a new inquiry is in the book.",
                href: `/pipeline/${id}`,
              });
            }}
          />
        </>
      )}
    </InquireScene>
  );
}
