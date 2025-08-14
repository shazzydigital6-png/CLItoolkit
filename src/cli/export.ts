// src/cli/export.ts
import * as fs from "fs";
import * as path from "path";
import { stringify } from "csv-stringify/sync";
import { HostfullyClient } from "../api/hostfullyClient";
import { ENV } from "../utils/env";

type ExportOpts = {
  region?: string;
  out?: string;
  includeArchived?: boolean;
  debug?: boolean; // will be set by CLI if you pass --debug
};

export async function runExport(opts: ExportOpts) {
  // ensure DEBUG flag is honored even if CLI forgot to set env
  if (opts.debug && process.env.DEBUG !== "true") process.env.DEBUG = "true";

  const region = opts.region ?? "ALL";
  const outDir = opts.out ?? "./exports";
  const DEBUG = process.env.DEBUG === "true" ? "on" : "off";
console.log(`Starting export with START_PAGE=${process.env.START_PAGE || 1}, THROTTLE_MS=${process.env.THROTTLE_MS || 0}, DEBUG=${DEBUG}`);


  // show effective settings so you know what's happening
  const startPage = process.env.START_PAGE || "1";
  const throttleMs = process.env.THROTTLE_MS || "0";
  const debugOn = process.env.DEBUG === "true" ? "on" : "off";
  console.log(
    `Starting export with START_PAGE=${startPage}, THROTTLE_MS=${throttleMs}, DEBUG=${debugOn}`
  );

  // basic env guardrails
  const agencyUid = ENV.AGENCY_UID;
  if (!agencyUid) {
    throw new Error("AGENCY_UID is missing. Add it to your .env file.");
  }

  // fetch from Hostfully
  const client = new HostfullyClient();

  if (process.env.DEBUG === "true") {
    try {
      const who = await client.whoAmI();
      console.log("[diag] /agencies OK");
    } catch (e: any) {
      console.warn("[diag] /agencies failed (rate limit or key?):", e?.response?.status, e?.response?.data || e?.message);
    }
  }

  const props = await client.listAllProperties({
    includeArchived: !!opts.includeArchived,
    // START_PAGE is consumed inside the client; we print it here for visibility
  });

  if (process.env.DEBUG === "true") {
    console.log(`[export] total properties fetched: ${props.length}`);
  }

  // Map Hostfully objects → CSV rows (spec-friendly)
  const now = new Date().toISOString();
  const rows = props.map((p: any) => ({
    listing_id: p.uid,
    platform_status: p.isActive ? "active" : "unlisted",
    title: p.name ?? p.title ?? "",
    short_description: p.summary ?? "",
    full_description: p.description ?? "",
    neighborhood_overview: p.neighborhoodOverview ?? "",
    house_rules: p.houseRules ?? "",
    amenities: JSON.stringify(p.amenities ?? []),
    tags: JSON.stringify(p.tags ?? []),
    filters: JSON.stringify(p.filters ?? []),
    bedrooms: p.bedrooms ?? null,
    bathrooms: p.bathrooms ?? null,
    max_guests: p.availability?.maxGuests ?? p.maxGuests ?? null,
    beds: JSON.stringify(p.beds ?? []),
    address_city: p.address?.city ?? "",
    address_state: p.address?.state ?? "",
    address_country: p.address?.countryCode ?? "",
    latitude: p.address?.latitude ?? p.location?.lat ?? null,
    longitude: p.address?.longitude ?? p.location?.lng ?? null,
    photos: JSON.stringify(p.photos ?? []),
    checkin_instructions: p.checkInInstructions ?? "",
    fees_taxes_note: p.feesTaxesNote ?? "",
    last_synced_at: now,
  }));

  // write CSV
  const ts = now.replace(/[:.]/g, "-");
  const file = path.join(outDir, `hostfully_export_${region}_${ts}.csv`);
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(file, stringify(rows, { header: true }), "utf8");

  console.log(`✅ Exported ${rows.length} listings → ${file}`);
}
