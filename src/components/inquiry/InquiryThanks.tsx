export function InquiryThanks({ onReset }: { onReset?: () => void }) {
  return (
    <section className="auth-panel inquire-success-panel">
      <div className="inquire-thanks inquire-thanks--note">
        <h2>thank you.</h2>
        <p>we appreciate you reaching out. we received your message and will follow up shortly.</p>
        {onReset ? (
          <button type="button" className="auth-text-action" onClick={onReset}>
            send another inquiry
          </button>
        ) : null}
      </div>
    </section>
  );
}
