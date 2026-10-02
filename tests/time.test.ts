import { describe, expect, it } from "vitest";
import { parseSpokenDate, parseSpokenTime } from "@/lib/agent/spoken";
import { checkPickupTime, formatDateLong, zonedToUtc } from "@/lib/time";

describe("fuseau de Paris", () => {
  it("convertit l'heure d'été et d'hiver", () => {
    expect(zonedToUtc("2026-07-01", "12:00")?.toISOString()).toBe("2026-07-01T10:00:00.000Z");
    expect(zonedToUtc("2026-12-01", "12:00")?.toISOString()).toBe("2026-12-01T11:00:00.000Z");
  });
  it("rejette une heure inexistante (passage à l'heure d'été)", () => {
    expect(zonedToUtc("2027-03-28", "02:30")).toBeNull();
  });
  it("vérifie le délai minimum", () => {
    const now = new Date("2026-10-02T08:00:00Z"); // 10:00 à Paris
    expect(checkPickupTime("2026-10-02", "11:00", now)).toEqual({ ok: false, error: "too_soon" });
    expect(checkPickupTime("2026-10-02", "09:00", now)).toEqual({ ok: false, error: "past" });
    expect(checkPickupTime("2026-10-02", "13:00", now).ok).toBe(true);
  });
  it("formate les dates", () => {
    expect(formatDateLong("2026-10-03", "fr")).toBe("samedi 3 octobre 2026");
    expect(formatDateLong("2026-10-03", "en")).toBe("Saturday, 3 October 2026");
  });
});

describe("dates et heures dictées", () => {
  const now = new Date("2026-10-02T08:00:00Z"); // vendredi 2 octobre 2026
  it("comprend les dates relatives", () => {
    expect(parseSpokenDate("demain", now)).toBe("2026-10-03");
    expect(parseSpokenDate("après-demain", now)).toBe("2026-10-04");
    expect(parseSpokenDate("tomorrow morning", now)).toBe("2026-10-03");
    expect(parseSpokenDate("lundi", now)).toBe("2026-10-05");
    expect(parseSpokenDate("vendredi", now)).toBe("2026-10-09");
  });
  it("comprend les dates explicites", () => {
    expect(parseSpokenDate("2026-11-15", now)).toBe("2026-11-15");
    expect(parseSpokenDate("15/11", now)).toBe("2026-11-15");
    expect(parseSpokenDate("le 5 janvier", now)).toBe("2027-01-05");
    expect(parseSpokenDate("October 20th", now)).toBe("2026-10-20");
    expect(parseSpokenDate("n'importe quoi", now)).toBeNull();
  });
  it("comprend les heures", () => {
    expect(parseSpokenTime("14:30")).toBe("14:30");
    expect(parseSpokenTime("14h30")).toBe("14:30");
    expect(parseSpokenTime("8h")).toBe("08:00");
    expect(parseSpokenTime("2:30 pm")).toBe("14:30");
    expect(parseSpokenTime("7 pm")).toBe("19:00");
    expect(parseSpokenTime("midi")).toBe("12:00");
    expect(parseSpokenTime("25:00")).toBeNull();
  });
});
