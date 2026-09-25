import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { InquireScene } from "@/components/inquiry/InquireScene";
import { InquiryGuide } from "@/components/inquiry/InquiryGuide";
import { InquiryThanks } from "@/components/inquiry/InquiryThanks";
import type { InquiryFormValues } from "@/lib/os/inquiry-form";
import { submitPublicInquiry } from "@/lib/os/inquiries.functions";

export function InquirePublicPage() {
  const submitInquiry = useServerFn(submitPublicInquiry);
  const submit = useMutation({
    mutationFn: (values: InquiryFormValues) =>
      submitInquiry({ data: { ...values, website: values.website ?? "" } }),
  });

  return (
    <InquireScene>
      {submit.isSuccess ? (
        <InquiryThanks onReset={() => submit.reset()} />
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
              await submit.mutateAsync(values);
            }}
          />
        </>
      )}
    </InquireScene>
  );
}
