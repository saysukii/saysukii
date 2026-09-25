import { getRouteApi } from "@tanstack/react-router";

const authenticatedRoute = getRouteApi("/_authenticated");

export function useDevPreview() {
  return authenticatedRoute.useRouteContext().devPreview;
}
