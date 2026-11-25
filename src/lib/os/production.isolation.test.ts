import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  assignmentHeadline,
  firstName,
  flowerMatches,
  assignmentLetters,
  defaultProjectName,
  freeSlug,
  lastProductionDay,
  productionDateRange,
  productionSlug,
  productionTitle,
  readStemList,
  taskInputInstant,
  taskInputValue,
  teamCanOpen,
  dayWindow,
  productionPhase,
  productionSchedule,
} from "./production";

describe("the production's name and address", () => {
  it("reads as say sukii x the project", () => {
    assert.equal(productionTitle("Google x Monks"), "Say Sukii x Google x Monks");
    assert.equal(productionTitle("  "), "Say Sukii x Project");
  });

  it("makes an address from the name", () => {
    assert.equal(
      productionSlug("Google x Monks: AI Agents Live + Labs"),
      "google-x-monks-ai-agents-live-labs",
    );
    assert.equal(productionSlug("Pérez & Co."), "perez-and-co");
    assert.equal(productionSlug("!!!"), "production");
  });

  it("takes the next free address when one is taken", () => {
    assert.equal(freeSlug("lumen", []), "lumen");
    assert.equal(freeSlug("lumen", ["lumen", "lumen-2"]), "lumen-3");
  });

  it("starts from the brand, then the person", () => {
    assert.equal(
      defaultProjectName({ name: "Maya Santos", organization: "Lumen Studio" }),
      "Lumen Studio",
    );
    assert.equal(defaultProjectName({ name: "Maya Santos", organization: " " }), "Maya Santos");
  });
});

describe("where a production is, on its own", () => {
  // thursday 11/12, 11am – 11:30pm, in miami (est is five hours behind utc)
  const days = [
    { day: "2026-11-10", hours: "9:00am – 6:00pm" },
    { day: "2026-11-12", hours: "11am-1130pm" },
  ];
  const schedule = productionSchedule(days, ["2026-11-12"]);
  const at = (iso: string) => Date.parse(iso);

  it("reads the first start and the last end from the days' hours", () => {
    assert.equal(schedule.start, "2026-11-10T14:00:00.000Z");
    assert.equal(schedule.end, "2026-11-13T04:30:00.000Z");
    assert.equal(schedule.wraps, "2026-11-15T04:30:00.000Z");
  });

  it("moves from pre-production to wrapped with the clock", () => {
    assert.equal(productionPhase(schedule, at("2026-11-10T13:59:00Z")), "pre_production");
    assert.equal(productionPhase(schedule, at("2026-11-12T20:00:00Z")), "production");
    // 11:45pm thursday: production's over, wrap-up begins
    assert.equal(productionPhase(schedule, at("2026-11-13T04:45:00Z")), "post_production");
    // 48 hours later: wrapped
    assert.equal(productionPhase(schedule, at("2026-11-15T04:29:00Z")), "post_production");
    assert.equal(productionPhase(schedule, at("2026-11-15T04:31:00Z")), "wrapped");
  });

  it("closes to the team only once it's wrapped", () => {
    assert.equal(teamCanOpen("post_production"), true);
    assert.equal(teamCanOpen("wrapped"), false);
  });

  it("reads windows written every which way", () => {
    assert.deepEqual(dayWindow("10:00am – 10:00pm"), { start: 600, end: 1320 });
    assert.deepEqual(dayWindow("7:00am – 1:00pm\n6:00pm – 11:00pm (museum, then studio)"), {
      start: 420,
      end: 1380,
    });
    assert.deepEqual(dayWindow("6–10pm"), { start: 1080, end: 1320 });
    // past midnight runs into the next day
    assert.deepEqual(dayWindow("8pm – 1am"), { start: 1200, end: 1500 });
    // no times: the whole day
    assert.deepEqual(dayWindow("load in after lunch"), { start: 0, end: 1440 });
  });

  it("uses the event's own dates when there are no production days", () => {
    const onlyEvent = productionSchedule([], ["2026-12-01"]);
    assert.equal(onlyEvent.start, "2026-12-01T05:00:00.000Z");
    assert.equal(onlyEvent.end, "2026-12-02T05:00:00.000Z");
    assert.equal(productionPhase(productionSchedule([], [])), "pre_production");
  });

  it("finds the last day", () => {
    assert.equal(lastProductionDay([{ day: "2026-11-24" }], ["2026-11-28"]), "2026-11-28");
    assert.equal(lastProductionDay([], []), null);
  });

  it("reads its dates as numbers", () => {
    assert.equal(productionDateRange("2026-11-30", "2026-12-05"), "11/30 – 12/5");
    assert.equal(productionDateRange("2026-03-24", "2026-03-24"), "3/24");
    assert.equal(productionDateRange(null, null), "");
  });
});

describe("a pasted recipe", () => {
  it("keeps one stem a line, without bullets or boxes", () => {
    assert.deepEqual(
      readStemList(
        "☐ Anthurium Salmon\n- Orchid Phals Hot Pink\n\n[ ] Palms   Areca Small\n2. Eucalyptus",
      ),
      ["Anthurium Salmon", "Orchid Phals Hot Pink", "Palms Areca Small", "Eucalyptus"],
    );
  });
});

describe("a task's time, in the studio's zone", () => {
  it("reads and writes miami time", () => {
    // 6pm in miami in november is 11pm utc
    assert.equal(taskInputInstant("2026-11-24T18:00"), "2026-11-24T23:00:00.000Z");
    assert.equal(taskInputValue("2026-11-24T23:00:00.000Z"), "2026-11-24T18:00");
    // and in summer it's four hours, not five
    assert.equal(taskInputInstant("2026-07-04T09:30"), "2026-07-04T13:30:00.000Z");
    assert.equal(taskInputInstant("not a time"), null);
  });
});

describe("assignment letters", () => {
  const at = (minutesAgo: number) =>
    new Date(Date.UTC(2026, 10, 18, 12, 0) - minutesAgo * 60_000).toISOString();
  const now = Date.UTC(2026, 10, 18, 12, 0);

  it("sends one letter per member per production", () => {
    const letters = assignmentLetters(
      [
        { task_id: "t1", profile_id: "cara", inquiry_id: "lumen", assigned_at: at(10) },
        { task_id: "t2", profile_id: "cara", inquiry_id: "lumen", assigned_at: at(9) },
        { task_id: "t3", profile_id: "nina", inquiry_id: "lumen", assigned_at: at(9) },
        { task_id: "t4", profile_id: "cara", inquiry_id: "harbor", assigned_at: at(9) },
      ],
      now,
    );
    assert.deepEqual(
      letters.map((letter) => [letter.profile_id, letter.inquiry_id, letter.task_ids]),
      [
        ["cara", "lumen", ["t1", "t2"]],
        ["nina", "lumen", ["t3"]],
        ["cara", "harbor", ["t4"]],
      ],
    );
  });

  it("waits while the studio is still assigning", () => {
    const letters = assignmentLetters(
      [
        { task_id: "t1", profile_id: "cara", inquiry_id: "lumen", assigned_at: at(10) },
        { task_id: "t2", profile_id: "cara", inquiry_id: "lumen", assigned_at: at(1) },
      ],
      now,
    );
    assert.deepEqual(letters, []);
  });

  it("puts joining a production and its tasks in the same letter", () => {
    const letters = assignmentLetters(
      [
        { task_id: null, profile_id: "theo", inquiry_id: "lumen", assigned_at: at(8) },
        { task_id: null, profile_id: "cara", inquiry_id: "lumen", assigned_at: at(8) },
        { task_id: "t1", profile_id: "cara", inquiry_id: "lumen", assigned_at: at(8) },
      ],
      now,
    );
    assert.deepEqual(
      letters.map((letter) => [letter.profile_id, letter.task_ids]),
      [
        ["theo", []],
        ["cara", ["t1"]],
      ],
    );
  });

  it("says how many tasks", () => {
    assert.equal(assignmentHeadline(0, "Lumen"), "you're on the team for Lumen");
    assert.equal(assignmentHeadline(1, "Lumen"), "you're on 1 task for Lumen");
    assert.equal(assignmentHeadline(3, "Lumen"), "you're on 3 tasks for Lumen");
  });
});

describe("the recipe's flowers", () => {
  it("suggests what starts with the typing first, then what has it inside", () => {
    assert.deepEqual(flowerMatches("ran", []).slice(0, 3), [
      "ranunculus",
      "amaranthus",
      "hydrangea",
    ]);
  });

  it("suggests the studio's own stems too, in lowercase", () => {
    assert.ok(flowerMatches("mand", ["Carnation Mandalay"]).includes("carnation mandalay"));
    assert.deepEqual(flowerMatches("  ", []), []);
  });

  it("names a teammate by their first name", () => {
    assert.equal(firstName("Cara Ortiz"), "Cara");
    assert.equal(firstName("Sukii"), "Sukii");
  });
});

describe("the schedule's hours", () => {
  it("counts a shift's hours, past midnight too", async () => {
    const { shiftHours, shiftSpan, hoursLabel } = await import("./production");
    assert.equal(shiftHours("10:00", "18:00"), 8);
    assert.equal(shiftHours("11:00", "23:30"), 12.5);
    assert.equal(shiftHours("22:00", "02:00"), 4);
    assert.equal(shiftSpan("10:00", "18:30"), "10:00am – 6:30pm");
    assert.equal(hoursLabel(1), "1 hr");
    assert.equal(hoursLabel(7.5), "7.5 hrs");
  });

  it("knows who has news since the last share", async () => {
    const { unsharedPeople } = await import("./production");
    const sent = "2026-11-20T15:00:00.000Z";
    assert.deepEqual(
      unsharedPeople(
        [
          { profile_id: "cara", notified_at: sent, changed_at: null },
          // a shift of nina's was taken away after she was sent her schedule
          { profile_id: "nina", notified_at: sent, changed_at: "2026-11-21T15:00:00.000Z" },
          { profile_id: "theo", notified_at: sent, changed_at: "2026-11-19T15:00:00.000Z" },
          // maya was put on it and never sent anything
          { profile_id: "maya", notified_at: null, changed_at: null },
        ],
        [
          { profile_id: "cara", notified_at: sent },
          { profile_id: "theo", notified_at: null },
        ],
        [{ profile_id: "cara", notified_at: sent }],
      ).sort(),
      ["maya", "nina", "theo"],
    );
  });

  it("sends the hours once the last shift ends, past midnight too", async () => {
    const { hoursDueAt } = await import("./production");
    const shift = (day: string, starts: string, ends: string) => ({ day, starts, ends });
    assert.equal(hoursDueAt([]), null);
    // 6pm to 11pm on friday 12/4 in miami ends at 4am utc on 12/5
    assert.equal(
      hoursDueAt([shift("2026-11-30", "10:00", "18:00"), shift("2026-12-04", "18:00", "23:00")]),
      "2026-12-05T04:00:00.000Z",
    );
    // a shift that runs to 2am ends the next morning
    assert.equal(hoursDueAt([shift("2026-12-04", "20:00", "02:00")]), "2026-12-05T07:00:00.000Z");
  });

  it("pays each person on their scheduled hours at their rate", async () => {
    const { hoursSummary, hoursCsv } = await import("./production");
    const shift = (profile_id: string, day: string, starts: string, ends: string) => ({
      profile_id,
      day,
      starts,
      ends,
      role: "production",
      location: "studio",
    });
    const summary = hoursSummary(
      [
        shift("cara", "2026-11-30", "10:00", "18:00"),
        shift("cara", "2026-12-01", "09:00", "13:00"),
        shift("theo", "2026-12-01", "16:00", "22:00"),
        shift("nina", "2026-11-30", "14:00", "22:00"),
        shift("nina", "2026-12-01", "19:00", "23:00"),
      ],
      new Map([
        ["cara", "Cara Ortiz"],
        ["theo", "Theo Brandt"],
        ["nina", "Nina Park"],
      ]),
      { cara: { cents: 2800, per: "hour" }, nina: { cents: 40000, per: "production" } },
    );
    assert.deepEqual(
      summary.people.map((person) => [person.name, person.hours, person.pay_cents]),
      [
        ["Cara Ortiz", 12, 33600],
        ["Nina Park", 12, 40000],
        ["Theo Brandt", 6, null],
      ],
    );
    assert.equal(summary.hours, 30);
    assert.equal(summary.pay_cents, 73600);
    const csv = hoursCsv("Lumen, Live", summary).split("\n");
    assert.equal(csv[0], "production,person,date,start,end,hours,role,location,paid,rate,pay");
    assert.equal(
      csv[1],
      '"Lumen, Live",Cara Ortiz,2026-11-30,10:00 am,6:00 pm,8,production,studio,hourly,28.00,224.00',
    );
    // a flat rate is paid once, on the first shift
    assert.equal(
      csv[3],
      '"Lumen, Live",Nina Park,2026-11-30,2:00 pm,10:00 pm,8,production,studio,flat,400.00,400.00',
    );
    assert.equal(
      csv[4],
      '"Lumen, Live",Nina Park,2026-12-01,7:00 pm,11:00 pm,4,production,studio,flat,400.00,',
    );
    assert.equal(
      csv[5],
      '"Lumen, Live",Theo Brandt,2026-12-01,4:00 pm,10:00 pm,6,production,studio,,,',
    );
  });
});
