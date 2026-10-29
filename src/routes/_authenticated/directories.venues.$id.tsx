import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { DirectoryHome } from "@/components/portal/DirectoryHome";
import { PersonName } from "@/components/studio/PersonName";
import { getDevPreviewDirectories } from "@/lib/dev-preview";
import { listDirectories } from "@/lib/os/clients.functions";
import { useDevPreview } from "@/lib/use-dev-preview";

export const Route = createFileRoute("/_authenticated/directories/venues/$id")({
  head: () => ({
    meta: [{ title: "Venue — Say Sukii OS" }, { name: "robots", content: "noindex" }],
  }),
  component: VenuePage,
});

function VenuePage() {
  const { id } = Route.useParams();
  const { profile } = Route.useRouteContext();
  const devPreview = useDevPreview();
  const isAdmin = profile.role === "admin";
  const fetchDirectories = useServerFn(listDirectories);

  const { data, isPending } = useQuery({
    queryKey: ["os", "directories", devPreview],
    queryFn: () => (devPreview ? getDevPreviewDirectories() : fetchDirectories()),
    enabled: isAdmin,
  });

  const venue = data?.venues.find((item) => item.id === id);

  if (!isAdmin) {
    return (
      <div className="studio-home is-book">
        <p className="studio-pearl-note">directories are available to admin users only.</p>
      </div>
    );
  }

  if (isPending) {
    return (
      <DirectoryHome title="venue" back={{ to: "/directories/venues", label: "venues" }}>
        null
      </DirectoryHome>
    );
  }

  if (!venue) {
    return (
      <DirectoryHome title="venue" back={{ to: "/directories/venues", label: "venues" }}>
        <p className="studio-pearl-note">this venue could not be found.</p>
      </DirectoryHome>
    );
  }

  const rest = [venue.contact_email, venue.contact_phone].filter(Boolean).join(" · ");

  return (
    <DirectoryHome
      title={venue.name}
      back={{ to: "/directories/venues", label: "venues" }}
      lede={venue.address}
    >
      <section className="studio-directory studio-directory-record">
        <dl>
          <div>
            <dt>contact</dt>
            <dd>
              {venue.contact_name || rest ? (
                <>
                  {venue.contact_name ? <PersonName name={venue.contact_name} /> : null}
                  {venue.contact_name && rest ? " · " : null}
                  {rest}
                </>
              ) : (
                "—"
              )}
            </dd>
          </div>
        </dl>
        <p className="studio-directory-note">{venue.load_in_notes || "no load-in notes yet."}</p>
        <Link to="/directories/venues" className="auth-text-action">
          all venues
        </Link>
      </section>
    </DirectoryHome>
  );
}
