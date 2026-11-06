import assert from "node:assert/strict";
import test from "node:test";

const appointments = [
  ["winter massage", "2026-11-06T11:00:00Z", "06.11.2026", "12:00"],
  ["summer massage", "2026-07-06T10:00:00Z", "06.07.2026", "12:00"],
  ["winter offset", "2026-11-06T12:00:00+01:00", "06.11.2026", "12:00"],
  ["summer offset", "2026-07-06T12:00:00+02:00", "06.07.2026", "12:00"],
  ["before spring transition", "2026-03-29T00:30:00Z", "29.03.2026", "01:30"],
  ["after spring transition", "2026-03-29T01:30:00Z", "29.03.2026", "03:30"],
  ["before autumn transition", "2026-10-25T00:30:00Z", "25.10.2026", "02:30"],
  ["after autumn transition", "2026-10-25T01:30:00Z", "25.10.2026", "02:30"],
  ["winter date rollover", "2026-11-05T23:15:00Z", "06.11.2026", "00:15"],
  ["summer date rollover", "2026-07-05T22:15:00Z", "06.07.2026", "00:15"],
];

test("appointment displays use Berlin time in every runtime timezone", async (t) => {
  const originalTimeZone = process.env.TZ;

  try {
    for (const timeZone of ["UTC", "Europe/Berlin", "America/New_York"]) {
      await t.test(timeZone, async (t) => {
        process.env.TZ = timeZone;
        // Reload so each runtime also initializes the formatters in its own zone.
        const moduleUrl = new URL("../src/lib/format.ts", import.meta.url);
        moduleUrl.searchParams.set("runtimeTimeZone", timeZone);
        const { formatDateTime, formatDate, formatTime } = await import(moduleUrl);

        for (const [name, timestamp, date, time] of appointments) {
          await t.test(name, () => {
            assert.equal(formatDateTime(timestamp), `${date}, ${time}`);
            assert.equal(formatDate(timestamp), date);
            assert.equal(formatTime(timestamp), time);
            assert.equal(
              formatDateTime(timestamp),
              `${formatDate(timestamp)}, ${formatTime(timestamp)}`,
            );
          });
        }

        await t.test("missing timestamps retain the placeholder", () => {
          for (const value of [null, undefined, ""]) {
            assert.equal(formatDateTime(value), "-");
            assert.equal(formatDate(value), "-");
            assert.equal(formatTime(value), "-");
          }
        });
      });
    }
  } finally {
    if (originalTimeZone === undefined) {
      delete process.env.TZ;
    } else {
      process.env.TZ = originalTimeZone;
    }
  }
});
