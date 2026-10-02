import { describe, expect, it } from "vitest";
import { CALL_SLUGS, callPath, keyFromSlug, pathFor, switchLocalePath } from "@/i18n/routes";

describe("page « Appeler » (lien des publicités)", () => {
  it("adresse dans chaque langue", () => {
    expect(callPath("fr")).toBe("/fr/appel");
    expect(callPath("en")).toBe("/en/call");
  });

  it("le sélecteur de langue garde la page", () => {
    expect(switchLocalePath("/fr/appel", "en")).toBe("/en/call");
    expect(switchLocalePath("/en/call", "fr")).toBe("/fr/appel");
  });

  it("ne se confond avec aucune page de contenu", () => {
    expect(keyFromSlug(CALL_SLUGS.fr, "fr")).toBeNull();
    expect(keyFromSlug(CALL_SLUGS.en, "en")).toBeNull();
    // Adresse d'une langue dans l'autre : pas la page appel
    expect(switchLocalePath("/en/appel", "fr")).toBe("/fr");
  });

  it("les autres pages changent toujours de langue", () => {
    expect(switchLocalePath(pathFor("cdg", "fr"), "en")).toBe(pathFor("cdg", "en"));
  });
});
