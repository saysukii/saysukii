const THANKS_BODY =
  "we appreciate you reaching out! we have received your message and will follow up shortly. until then, be blessed.";

export function InquiryThanks({ onReset }: { onReset?: () => void }) {
  return (
    <section className="auth-panel inquire-success-panel">
      <div className="auth-panel-shine" />
      <div className="inquire-thanks inquire-thanks--note">
        <h2>thank you.</h2>
        <div className="inquire-thanks-well">
          <p>{THANKS_BODY}</p>
          <p className="inquire-thanks-close">
            <span>with gratitude,</span>
            <em>say sukii</em>
          </p>
        </div>
        {onReset ? (
          <button type="button" className="auth-text-action" onClick={onReset}>
            send another inquiry
          </button>
        ) : null}
      </div>
    </section>
  );
}
