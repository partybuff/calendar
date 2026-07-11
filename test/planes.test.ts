import { describe, it } from "node:test";
import { ok as assert } from "node:assert/strict";
import { freshInstall } from "./helpers.js";
import { toSerial } from "../src/date-math.js";
import { _getAllPlaneData, _planesMiniCalEvents, getPlanarState } from "../src/planes.js";

describe("Planes canon", () => {
  it("returns a canonical fixed phase for Dal Quor (always remote)", () => {
    freshInstall();
    const dq = getPlanarState("Dal Quor", toSerial(998, 0, 1));
    assert(dq && dq.phase === "remote", "Dal Quor should always be remote");
    assert(dq && dq.plane && dq.plane.type === "fixed", "Dal Quor should be a fixed plane");
  });

  it("computes coterminous and remote windows for Fernia from its canon anchor", () => {
    freshInstall();
    const anchorCot = getPlanarState("Fernia", toSerial(998, 6, 14));
    assert(anchorCot && anchorCot.phase === "coterminous", "Fernia should be coterminous during Lharvion 998");

    // Half-orbit (2.5 years) later we expect remote.
    const remoteCheck = getPlanarState("Fernia", toSerial(1001, 0, 14));
    assert(remoteCheck && remoteCheck.phase === "remote", "Fernia should be remote 2.5 years after coterminous");
  });

  it("recognises Mabar's annual Long Shadows and its 5-year remote window separately", () => {
    freshInstall();

    // Derive Mabar's annual coterminous ("Long Shadows") window for year 998
    // from the engine instead of hardcoding a date. Engine 0.44 retired the
    // fixed Vult 26-28 dates: the window now floats on the new moon nearest
    // the winter solstice (Vult 21), so a hardcoded day would drift out of
    // the window on future canon changes.
    const vultScanStart = toSerial(998, 11, 1) - 10;
    const vultScanEnd = toSerial(998, 11, 28) + 10;
    let cotermStart: number | null = null;
    let cotermEnd: number | null = null;
    for (let s = vultScanStart; s <= vultScanEnd; s++) {
      const ps = getPlanarState("Mabar", s);
      if (ps && ps.phase === "coterminous") {
        if (cotermStart == null) cotermStart = s;
        cotermEnd = s;
      }
    }
    assert(cotermStart != null && cotermEnd != null,
      "expected to find Mabar's annual Long Shadows window near Vult 998");

    const insideLongShadows = getPlanarState("Mabar", cotermStart!);
    assert(insideLongShadows && insideLongShadows.phase === "coterminous",
      "a day inside the derived window falls within Long Shadows");
    const dayAfterWindow = getPlanarState("Mabar", cotermEnd! + 1);
    assert(dayAfterWindow && dayAfterWindow.phase !== "coterminous",
      "Long Shadows should end right after its derived window");
    const midYear = getPlanarState("Mabar", toSerial(998, 5, 15)); // Nymm — opposite side of the year
    assert(midYear && midYear.phase !== "coterminous",
      "Mabar should not be coterminous mid-year, far from the Long Shadows window");

    // The rarer 5-year remote is a SEPARATE phenomenon from the annual
    // coterminous above: it floats on the full moon nearest the summer
    // solstice (Nymm 21) and first fires in year 999 (anchor year + 1).
    // Derive that window too and confirm it reports 'remote' — distinct
    // from, and not confused with, the annual Long Shadows coterminous.
    const nymmScanStart = toSerial(999, 5, 1) - 10;
    const nymmScanEnd = toSerial(999, 5, 28) + 10;
    let remoteStart: number | null = null;
    let remoteEnd: number | null = null;
    for (let s = nymmScanStart; s <= nymmScanEnd; s++) {
      const ps = getPlanarState("Mabar", s);
      if (ps && ps.phase === "remote") {
        if (remoteStart == null) remoteStart = s;
        remoteEnd = s;
      }
    }
    assert(remoteStart != null && remoteEnd != null,
      "expected to find Mabar's 5-year remote window near Nymm 999");

    const insideRemote = getPlanarState("Mabar", remoteStart!);
    assert(insideRemote && insideRemote.phase === "remote",
      "a day inside the derived remote window falls within the 5-year remote, not Long Shadows");
    const beforeRemote = getPlanarState("Mabar", remoteStart! - 5);
    assert(beforeRemote && beforeRemote.phase === "neutral",
      "Mabar should be neutral just before the rare remote window opens");
  });

  it("emits mini-calendar fills for any active short canon phases in range", () => {
    freshInstall();
    const start = toSerial(998, 6, 1);
    const end = toSerial(998, 6, 28);
    const events = _planesMiniCalEvents(start, end);
    // Fernia is canonically coterminous during Lharvion 998 — at least one
    // fill should be emitted for that window.
    assert(events.length > 0, "expected canonical fills within a known active month");
    assert(events.every((evt: any) => !String(evt.name).startsWith("Generated:")), "no generated overlays should appear");
  });

  it("getPlanarState returns null for unknown plane names", () => {
    freshInstall();
    assert(getPlanarState("NotAPlane", toSerial(998, 0, 1)) == null);
  });

  it("_getAllPlaneData enumerates Eberron's 13 canonical planes", () => {
    freshInstall();
    const planes = _getAllPlaneData();
    assert(planes.length === 13, "expected the 13 canonical Eberron planes");
    const names = planes.map((p: any) => p.name);
    ["Daanvi", "Dal Quor", "Dolurrh", "Fernia", "Irian", "Kythri", "Lamannia", "Mabar", "Risia", "Shavarath", "Syrania", "Thelanis", "Xoriat"].forEach((expected) => {
      assert(names.indexOf(expected) >= 0, "expected " + expected + " in the plane table");
    });
  });
});
