import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { capitalizeName } from "./name-case";

describe("client names, capitalized", () => {
  it("capitalizes each word written in lowercase", () => {
    assert.equal(capitalizeName("amiyah qi"), "Amiyah Qi");
    assert.equal(capitalizeName("Tony vassell"), "Tony Vassell");
    assert.equal(capitalizeName("andrea basket-pee"), "Andrea Basket-Pee");
    assert.equal(capitalizeName("skyler o’berry"), "Skyler O’Berry");
  });

  it("leaves names already written with care alone", () => {
    assert.equal(capitalizeName("Jessica deRoquancourt Miller"), "Jessica deRoquancourt Miller");
    assert.equal(capitalizeName("Fleurs de Villes Inc."), "Fleurs de Villes Inc.");
    assert.equal(capitalizeName("TAĪSTU"), "TAĪSTU");
    assert.equal(capitalizeName("Gigi of Henri Bendel"), "Gigi of Henri Bendel");
    assert.equal(capitalizeName("ashlee.balom001"), "ashlee.balom001");
    assert.equal(capitalizeName("de la espada"), "De la Espada");
  });
});
