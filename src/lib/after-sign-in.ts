/** Where to land after signing in: a page inside the studio, never another site. */
export function afterSignIn(next: string | null | undefined) {
  const path = next?.trim() ?? "";
  if (!path.startsWith("/") || path.startsWith("//") || path.startsWith("/auth"))
    return "/dashboard";
  return path;
}
