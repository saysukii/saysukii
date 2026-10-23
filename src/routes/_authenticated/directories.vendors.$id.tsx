import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { DirectoryHome } from "@/components/portal/DirectoryHome";
import { getDevPreviewDirectories } from "@/lib/dev-preview";
import { listDirectories } from "@/lib/os/clients.functions";
import { useDevPreview } from "@/lib/use-dev-preview";

export const Route = createFileRoute("/_authenticated/directories/vendors/$id")({
  head: () => ({
    meta: [{ title: "Vendor — Say Sukii OS" }, { name: "robots", content: "noindex" }],
  }),
  component: VendorPage,
});

function VendorPage() {
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

  const vendor = data?.vendors.find((item) => item.id === id);

  if (!isAdmin) {
    return (
      <div className="studio-home is-book">
        <p className="studio-pearl-note">directories are available to admin users only.</p>
      </div>
    );
  }

  if (isPending) {
    return (
      <DirectoryHome title="vendor" back={{ to: "/directories/vendors", label: "vendors" }} lede="gathering…">
        <p className="studio-empty">gathering…</p>
      </DirectoryHome>
    );
  }

  if (!vendor) {
    return (
      <DirectoryHome title="vendor" back={{ to: "/directories/vendors", label: "vendors" }}>
        <p className="studio-pearl-note">this vendor could not be found.</p>
      </DirectoryHome>
    );
  }

  const contact = [vendor.contact_name, vendor.contact_email, vendor.contact_phone].filter(Boolean);

  return (
    <DirectoryHome title={vendor.name} back={{ to: "/directories/vendors", label: "vendors" }} lede={vendor.type}>
      <section className="studio-directory studio-directory-record">
        <dl>
          <div>
            <dt>contact</dt>
            <dd>{contact.length ? contact.join(" · ") : "—"}</dd>
          </div>
        </dl>
        <p className="studio-directory-note">{vendor.ordering_method || "no ordering notes yet."}</p>
        <Link to="/directories/vendors" className="auth-text-action">
          all vendors
        </Link>
      </section>
    </DirectoryHome>
  );
}
