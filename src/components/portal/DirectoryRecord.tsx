import { Link } from "@tanstack/react-router";
import { X } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";

import { FloridaAddressPicker } from "@/components/inquiry/FloridaAddressPicker";
import { PersonName } from "@/components/studio/PersonName";
import { PlaceLink } from "@/components/studio/PlaceLink";
import type { DirectoryContact } from "@/integrations/supabase/types";
import { formatPhone, typePhone } from "@/lib/phone";
import { withoutCountry } from "@/lib/place-text";

/** A vendor or venue laid out like a client: the work on the left, the facts on the right. */
export function DirectoryRecord({
  crumb,
  name,
  kind,
  line,
  editor,
  children,
  rail,
}: {
  crumb: { to: "/directories/vendors" | "/directories/venues"; label: string };
  name: string;
  kind?: string | null | undefined;
  line?: string | null | undefined;
  editor?: ReactNode;
  children: ReactNode;
  rail: ReactNode;
}) {
  return (
    <div className="studio-home is-book is-record">
      <div className="studio-lead studio-ledger">
        <header className="studio-ledger-head">
          <Link to={crumb.to} className="studio-ledger-crumb">
            {crumb.label}
          </Link>
          <div className="studio-ledger-name">
            <h1>{name}</h1>
          </div>
          {kind ? <p className="studio-ledger-kind is-category">{kind}</p> : null}
        </header>

        {line ? <p className="studio-ledger-line">{line}</p> : null}
        {editor}

        <div className="studio-ledger-body">
          <div className="studio-ledger-work">{children}</div>
          <aside className="studio-ledger-rail">{rail}</aside>
        </div>
      </div>
    </div>
  );
}

/** One labelled fact on the right; nothing at all when there's nothing to say. */
export function RecordFact({ label, children }: { label: string; children: ReactNode }) {
  if (children == null || children === "" || children === false) return null;
  return (
    <>
      <p className="studio-home-label">{label}</p>
      <div className="studio-record-fact">{children}</div>
    </>
  );
}

export function RecordPlace({ address }: { address: string | null | undefined }) {
  const place = withoutCountry(address);
  if (!place) return null;
  return (
    <p>
      <PlaceLink place={place} className="studio-place is-pink">
        {place}
      </PlaceLink>
    </p>
  );
}

/**
 * An address that opens in maps when clicked, with a small edit to change it.
 * With nothing saved yet it starts as the place search.
 */
export function EditablePlace({
  value,
  label,
  placeholder,
  onSave,
}: {
  value: string | null | undefined;
  label: string;
  placeholder: string;
  onSave: (address: string) => void;
}) {
  const saved = withoutCountry(value);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(saved);
  useEffect(() => setDraft(saved), [saved]);

  if (saved && !editing) {
    return (
      <div className="studio-place-row">
        <PlaceLink place={saved} className="studio-place is-pink">
          {saved}
        </PlaceLink>
        <button type="button" className="studio-ghost" onClick={() => setEditing(true)}>
          edit
        </button>
      </div>
    );
  }

  return (
    <FloridaAddressPicker
      line
      label={label}
      value={draft}
      placeholder={placeholder}
      onChange={setDraft}
      onCommit={(next) => {
        const address = withoutCountry(next);
        setEditing(false);
        if (address !== saved) onSave(address);
      }}
    />
  );
}

export function RecordNotes({
  label,
  notes,
  empty,
}: {
  label: string;
  notes: string | null | undefined;
  empty: string;
}) {
  const text = notes?.trim();
  return (
    <>
      <p className="studio-home-label">{label}</p>
      {text ? (
        <p className="studio-client-note">{text}</p>
      ) : (
        <p className="studio-empty">{empty}</p>
      )}
    </>
  );
}

export function RecordWebsite({ url }: { url: string | null | undefined }) {
  const site = url?.trim();
  if (!site) return null;
  const href = /^https?:\/\//i.test(site) ? site : `https://${site}`;
  return (
    <a className="studio-place is-pink" href={href} target="_blank" rel="noreferrer">
      {site.replace(/^https?:\/\/(www\.)?/i, "").replace(/\/$/, "")}
    </a>
  );
}

/** An email that opens the mail app. */
export function RecordEmail({ email }: { email: string | null | undefined }) {
  const address = email?.trim();
  if (!address) return null;
  return (
    <p>
      <a className="studio-place is-pink" href={`mailto:${address}`}>
        {address}
      </a>
    </p>
  );
}

export function RecordContacts({ contacts }: { contacts: DirectoryContact[] }) {
  if (!contacts.length) return <p className="studio-empty">no contact yet.</p>;
  return contacts.map((person, index) => (
    <div key={`${person.email}-${index}`} className="studio-record-contact">
      {person.name ? (
        <p>
          <PersonName name={person.name} />
        </p>
      ) : null}
      {person.phone ? <p>{formatPhone(person.phone)}</p> : null}
      <RecordEmail email={person.email} />
    </div>
  ));
}

/** the contact fields in an edit form, with room to add another person */
export function ContactFields({
  contacts,
  onChange,
}: {
  contacts: DirectoryContact[];
  onChange: (contacts: DirectoryContact[]) => void;
}) {
  const rows = contacts.length ? contacts : [{ name: "", email: "", phone: "" }];
  const change = (index: number, patch: Partial<DirectoryContact>) =>
    onChange(rows.map((person, at) => (at === index ? { ...person, ...patch } : person)));
  return (
    <>
      {rows.map((person, index) => (
        <div key={index} className="studio-contact-fields is-wide">
          {index > 0 ? (
            <div className="studio-contact-head">
              <span>contact {index + 1}</span>
              <button
                type="button"
                className="studio-file-remove"
                aria-label={`remove contact ${index + 1}`}
                onClick={() => onChange(rows.filter((_, at) => at !== index))}
              >
                <X aria-hidden="true" />
              </button>
            </div>
          ) : null}
          <label className="studio-field">
            <span>contact</span>
            <input
              className="studio-input"
              value={person.name}
              onChange={(event) => change(index, { name: event.target.value })}
            />
          </label>
          <label className="studio-field">
            <span>phone</span>
            <input
              className="studio-input"
              type="tel"
              value={person.phone}
              onChange={(event) => change(index, { phone: typePhone(event.target.value) })}
            />
          </label>
          <label className="studio-field">
            <span>email</span>
            <input
              className="studio-input"
              type="email"
              value={person.email}
              onChange={(event) => change(index, { email: event.target.value })}
            />
          </label>
        </div>
      ))}
      <button
        type="button"
        className="studio-template-add studio-contact-add"
        onClick={() => onChange([...rows, { name: "", email: "", phone: "" }])}
      >
        + add a contact
      </button>
    </>
  );
}
