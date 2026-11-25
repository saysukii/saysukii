import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

describe("the sign-in link page", () => {
  it("stands on its own, not inside the sign-in page, so emailed links reach it", () => {
    // the sign-in page renders no child, so a callback nested under it would only ever show the
    // sign-in form: invitations, magic links, and password resets would all stop there
    const tree = readFileSync(new URL("../routeTree.gen.ts", import.meta.url), "utf8");
    const route = tree.match(/const AuthCallbackRoute = [\s\S]*?getParentRoute: \(\) => (\w+)/);
    assert.ok(route, "the /auth/callback route should be in the route tree");
    assert.equal(route[1], "rootRouteImport");
    assert.match(tree, /path: '\/auth\/callback'/);
  });
});
