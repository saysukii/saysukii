import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { readClientCsv, readVendorCsv, readVenueCsv } from "./directory-csv";

describe("directory csv from a notion export", () => {
  it("reads notion's vendor columns and turns florals into a wholesaler", () => {
    const read = readVendorCsv(
      "﻿name,category,contact,phone number,location,notes\n" +
        "jet fresh flowers,florals,,305.499.9144,7725 NW 41 St. Suite 100 Doral Florida 33166,ask for the cooler\n" +
        "tent co,tents,,,,\n",
    );
    assert.equal(read.error, undefined);
    assert.deepEqual(read.rows[0], {
      name: "jet fresh flowers",
      type: "wholesaler",
      contact_name: null,
      contact_email: null,
      contact_phone: "305.499.9144",
      ordering_method: "ask for the cooler",
      address: "7725 NW 41 St. Suite 100 Doral Florida 33166",
    });
    assert.equal(read.rows[1]?.type, "other");
    assert.equal(read.rows[1]?.ordering_method, "category: tents");
  });

  it("brings a venue in without a location, with its category, capacity, and website", () => {
    const read = readVenueCsv(
      "﻿category,name,website,location,capacity,contact,phone number\n" +
        "gallery,SCOPE Art Fair,scope-art.com,,,,\n" +
        'event space,Lavan Venue,lavan.com,"3861 Stirling Rd, Fort Lauderdale, FL, United States",250,Ana,954.555.0101\n',
    );
    assert.equal(read.error, undefined);
    assert.equal(read.rows[0]?.address, "");
    assert.equal(read.rows[0]?.category, "gallery");
    assert.equal(read.rows[0]?.website, "scope-art.com");
    assert.equal(read.rows[0]?.load_in_notes, null);
    assert.equal(read.rows[1]?.address, "3861 Stirling Rd, Fort Lauderdale, FL");
    assert.equal(read.rows[1]?.contact_phone, "954.555.0101");
    assert.equal(read.rows[1]?.category, "event space");
    assert.equal(read.rows[1]?.capacity, "250");
  });

  it("reads a client's full name, phone number, and address, and names a row without an email", () => {
    const read = readClientCsv(
      "﻿full name,email,phone number,address,organization,notes\n" +
        'Camila Reyes,camila@example.com,(954) 555-0194,"401 N Fort Lauderdale Beach Blvd, FL",,\n' +
        "No Email,,305 555 0000,,,\n",
    );
    assert.equal(read.rows[0]?.name, "Camila Reyes");
    assert.equal(read.rows[0]?.phone, "(954) 555-0194");
    assert.equal(read.rows[0]?.address, "401 N Fort Lauderdale Beach Blvd, FL");
    assert.deepEqual(read.rejected, [{ line: 3, reason: "row 3 needs an email" }]);
  });
});
