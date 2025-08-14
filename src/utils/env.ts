import 'dotenv/config';

export const ENV = {
  BASE: process.env.HOSTFULLY_BASE!,
  APIKEY: process.env.HOSTFULLY_APIKEY!,
  AGENCY_UID: process.env.AGENCY_UID!,
  THROTTLE_MS: Number(process.env.THROTTLE_MS || 0), // <-- add this
};

for (const k of ['BASE','APIKEY','AGENCY_UID'] as const) {
  if (!ENV[k]) throw new Error(`Missing env var: ${k}`);
}
