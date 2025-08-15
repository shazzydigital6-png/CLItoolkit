// src/web/server.ts
import express from "express";
import path from "path";
import fs from "fs";
import cors from "cors";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import axios from "axios";
import { stringify } from "csv-stringify/sync";
import { HostfullyClient } from "../api/hostfullyClient";
import { ENV } from "../utils/env";

const app = express();

/* ----------------------------------------------------------
   Proxy / networking
---------------------------------------------------------- */
// If you run behind cloudflared (or any local reverse proxy), trust loopback proxies.
app.set("trust proxy", "loopback"); // trusts 127.0.0.1 and ::1

const PORT = Number(process.env.PORT || ENV.PORT || 3000);
const NODE_ENV = (process.env.NODE_ENV || ENV.NODE_ENV || "development") as
  | "development"
  | "production"
  | "staging";

/* ----------------------------------------------------------
   Security
---------------------------------------------------------- */
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        // no inline scripts — we load /app.js as an external file
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", "data:", "https:"],
        connectSrc: ["'self'"], // API calls are same-origin
      },
    },
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: "same-origin" },
  })
);

/* ----------------------------------------------------------
   CORS
---------------------------------------------------------- */
const allowedOrigins =
  ENV.ALLOWED_ORIGINS?.length
    ? ENV.ALLOWED_ORIGINS
    : ["http://localhost:3000", "http://127.0.0.1:3000"];

app.use(
  cors({
    origin: allowedOrigins,
    credentials: true,
    optionsSuccessStatus: 200,
  })
);

/* ----------------------------------------------------------
   Rate limit (API only)
---------------------------------------------------------- */
app.use(
  "/api/",
  rateLimit({
    windowMs: ENV.RATE_LIMIT_WINDOW_MS || 15 * 60 * 1000,
    max:
      typeof ENV.RATE_LIMIT_MAX === "number"
        ? ENV.RATE_LIMIT_MAX
        : NODE_ENV === "production"
        ? 100
        : 1000,
    message: { error: "Too many requests, please try again later." },
    standardHeaders: true,
    legacyHeaders: false,
  })
);

/* ----------------------------------------------------------
   Parsers
---------------------------------------------------------- */
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

/* ----------------------------------------------------------
   API client
---------------------------------------------------------- */
const hostfullyClient = new HostfullyClient();

/* ----------------------------------------------------------
   Helpers
---------------------------------------------------------- */
function sanitizeProperty(property: any) {
  return {
    uid: property.uid,
    name: property.name || property.title || "",
    isActive: Boolean(property.isActive),
    address: {
      city: property.address?.city || "",
      state: property.address?.state || "",
    },
    availability: {
      maxGuests: property.availability?.maxGuests || property.maxGuests || 0,
    },
    // placeholders for list view (details fetched on demand)
    descriptions: {
      public_name: "",
      short_description: "",
      long_description: "",
      neighbourhood: "",
      space: "",
      access: "",
      transit: "",
    },
    characterCounts: {
      public_name: 0,
      short_description: 0,
      long_description: 0,
      neighbourhood: 0,
      space: 0,
      access: 0,
      transit: 0,
    },
  };
}
const sanitizePropertyList = (properties: any[]) => properties.map(sanitizeProperty);

type Descriptions = {
  public_name: string;
  short_description: string;
  long_description: string;
  neighbourhood: string;
  space: string;
  access: string;
  transit: string;
};
type DescBundle = { descriptions: Descriptions; characterCounts: Record<string, number> };

/** Try REST /property-descriptions */
async function fetchDescriptionsFromREST(propertyUid: string): Promise<Descriptions> {
  const resp = await axios.get(`${ENV.BASE}/property-descriptions`, {
    params: { propertyUid, agencyUid: ENV.AGENCY_UID },
    headers: { "X-HOSTFULLY-APIKEY": ENV.APIKEY },
    timeout: 15000,
    validateStatus: () => true,
  });

  if (resp.status !== 200) {
    const msg = resp.data?.apiErrorMessage || resp.statusText || "Upstream error";
    throw new Error(`HTTP ${resp.status}: ${msg}`);
  }

  const arr =
    resp.data?.propertyDescriptions ??
    resp.data?.data ??
    (Array.isArray(resp.data) ? resp.data : []);
  const d: any = Array.isArray(arr) && arr.length > 0 ? arr[0] : {};

  return {
    public_name: d.name || "",
    short_description: d.shortSummary || "",
    long_description: d.summary || "",
    neighbourhood: d.neighbourhood || "",
    space: d.space || "",
    access: d.access || "",
    transit: d.transit || "",
  };
}

/** Fallback: pull description-like fields from the property detail */
async function fetchDescriptionsFromProperty(propertyUid: string): Promise<Descriptions> {
  const prop = await hostfullyClient.getPropertyByUid(propertyUid).catch(() => null);
  if (!prop) {
    return {
      public_name: "",
      short_description: "",
      long_description: "",
      neighbourhood: "",
      space: "",
      access: "",
      transit: "",
    };
  }
  return {
    public_name: prop.description_name || prop.main_description_name || "",
    short_description:
      prop.description_shortSummary || prop.main_description_shortSummary || "",
    long_description:
      prop.description_longDescription || prop.main_description_longDescription || "",
    neighbourhood:
      prop.description_neighbourhood || prop.main_description_neighbourhood || "",
    space: prop.description_space || prop.main_description_space || "",
    access: prop.description_access || prop.main_description_access || "",
    transit: prop.description_transit || prop.main_description_transit || "",
  };
}

function withCounts(descriptions: Descriptions): DescBundle {
  const d = Object.fromEntries(
    Object.entries(descriptions).map(([k, v]) => [k, String(v || "")])
  ) as Descriptions;
  const characterCounts = Object.fromEntries(
    Object.entries(d).map(([k, v]) => [k, v.length])
  ) as Record<string, number>;
  return { descriptions: d, characterCounts };
}

/** Merge REST + fallback (REST wins when present) */
async function fetchDescriptionsMerged(uid: string): Promise<DescBundle> {
  let fromRest: Descriptions | null = null;
  try {
    fromRest = await fetchDescriptionsFromREST(uid);
  } catch (e) {
    // swallow; we'll rely on fallback
  }
  const fromProp = await fetchDescriptionsFromProperty(uid);

  const merged: Descriptions = {
    public_name: fromRest?.public_name ?? fromProp.public_name,
    short_description: fromRest?.short_description ?? fromProp.short_description,
    long_description: fromRest?.long_description ?? fromProp.long_description,
    neighbourhood: fromRest?.neighbourhood ?? fromProp.neighbourhood,
    space: fromRest?.space ?? fromProp.space,
    access: fromRest?.access ?? fromProp.access,
    transit: fromRest?.transit ?? fromProp.transit,
  };

  return withCounts(merged);
}

/* ----------------------------------------------------------
   PUBLIC API
---------------------------------------------------------- */

// List properties (sanitized)
app.get("/api/properties", async (_req, res) => {
  try {
    const properties = await hostfullyClient.listAllProperties();
    const sanitized = sanitizePropertyList(properties);
    res.json({
      success: true,
      count: sanitized.length,
      properties: sanitized,
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    const status = err?.response?.status || 500;
    console.error("API /api/properties error:", status, err?.message);
    res.status(500).json({
      success: false,
      error: "Failed to fetch properties",
      message: NODE_ENV === "development" ? err?.message : "Internal server error",
    });
  }
});

// Single property (sanitized)
app.get("/api/properties/:uid", async (req, res) => {
  try {
    const property = await hostfullyClient.getPropertyByUid(req.params.uid);
    if (!property) {
      return res.status(404).json({ success: false, error: "Property not found" });
    }
    res.json({
      success: true,
      property: sanitizeProperty(property),
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    const status = err?.response?.status || 500;
    console.error(`API /api/properties/${req.params.uid} error:`, status, err?.message);
    res.status(500).json({
      success: false,
      error: "Failed to fetch property",
      message: NODE_ENV === "development" ? err?.message : "Internal server error",
    });
  }
});

// Per-property descriptions (REST + fallback merged)
app.get("/api/properties/:uid/descriptions", async (req, res) => {
  const { uid } = req.params;
  try {
    const bundle = await fetchDescriptionsMerged(uid);
    res.json({ success: true, ...bundle, uid, timestamp: new Date().toISOString() });
  } catch (err: any) {
    const msg = err?.message || "Unknown error";
    console.error(`Descriptions error for ${uid}:`, msg);
    res.status(502).json({
      success: false,
      error: "Failed to fetch descriptions",
      message: msg,
    });
  }
});

// CSV export (all properties + all description fields)
// Main route:
app.get("/api/export/properties.csv", async (req, res) => {
  try {
    const properties = await hostfullyClient.listAllProperties();
    const sanitized = sanitizePropertyList(properties);

    // Simple worker pool (limit concurrency; default 5)
    const limit = Math.max(1, Number(req.query.concurrency) || 5);
    let index = 0;
    const results: Array<{ p: ReturnType<typeof sanitizeProperty>; d: Descriptions }> =
      new Array(sanitized.length);

    async function worker() {
      while (index < sanitized.length) {
        const i = index++;
        const p = sanitized[i];
        try {
          const bundle = await fetchDescriptionsMerged(p.uid);
          results[i] = { p, d: bundle.descriptions };
        } catch (e: any) {
          console.warn(`Desc fetch failed for ${p.uid}: ${e?.message}`);
          results[i] = {
            p,
            d: {
              public_name: "",
              short_description: "",
              long_description: "",
              neighbourhood: "",
              space: "",
              access: "",
              transit: "",
            },
          };
        }
      }
    }
    await Promise.all(Array.from({ length: Math.min(limit, sanitized.length) }, worker));

    const rows = results.map(({ p, d }) => ({
      uid: p.uid,
      name: p.name,
      status: p.isActive ? "Active" : "Inactive",
      city: p.address.city,
      state: p.address.state,
      maxGuests: p.availability.maxGuests,
      public_name: d.public_name,
      short_description: d.short_description,
      long_description: d.long_description,
      neighbourhood: d.neighbourhood,
      space: d.space,
      access: d.access,
      transit: d.transit,
    }));

    const columns = [
      "uid",
      "name",
      "status",
      "city",
      "state",
      "maxGuests",
      "public_name",
      "short_description",
      "long_description",
      "neighbourhood",
      "space",
      "access",
      "transit",
    ];

    const csv = stringify(rows, { header: true, columns });

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", 'attachment; filename="hostfully_properties.csv"');
    res.status(200).send(csv);
  } catch (err: any) {
    console.error("CSV export error:", err?.message);
    res.status(500).json({ success: false, error: "Failed to generate CSV", message: err?.message });
  }
});
// Alias for convenience:
app.get("/api/properties.csv", (req, res) => {
  (app._router as any).handle(
    { ...req, url: "/api/export/properties.csv", originalUrl: "/api/export/properties.csv" },
    res,
    () => {}
  );
});

// Health check
app.get("/api/health", (_req, res) => {
  res.json({
    success: true,
    status: "healthy",
    environment: NODE_ENV,
    timestamp: new Date().toISOString(),
  });
});

/* ----------------------------------------------------------
   Static assets
---------------------------------------------------------- */
const publicCandidates = [
  path.join(__dirname, "public"), // when built to dist
  path.resolve(process.cwd(), "src/web/public"), // when running ts-node/tsx
];
const publicDir =
  publicCandidates.find((p) => {
    try {
      return fs.existsSync(p);
    } catch {
      return false;
    }
  }) || publicCandidates[0];

app.use(express.static(publicDir));

/* ----------------------------------------------------------
   HTML shell (no inline JS—loads /app.js)
---------------------------------------------------------- */
app.get("/", (_req, res) => {
  res.type("html").send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Hostfully Property Browser</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap" rel="stylesheet" />
  <style>
    body { font-family: Inter, system-ui, -apple-system, Segoe UI, Roboto, sans-serif; max-width: 1200px; margin: 0 auto; padding: 20px; background:#f5f5f5; }
    .container { background: #fff; border-radius: 8px; padding: 30px; box-shadow: 0 2px 10px rgba(0,0,0,.08); }
    .header { text-align: center; margin-bottom: 40px; padding-bottom: 20px; border-bottom: 3px solid #007bff; }
    .header h1 { margin:0; font-size: 2.4rem; color:#333; }
    .subtitle { color:#666; margin-top:10px; }
    .controls { display:flex; justify-content:center; gap:12px; margin-bottom:24px; flex-wrap:wrap; }
    .btn { background:#007bff; color:#fff; border:none; padding:12px 16px; border-radius:6px; cursor:pointer; font-size:16px; }
    .btn:hover:not(:disabled){ background:#0056b3; }
    .btn:disabled{ background:#ccc; cursor:not-allowed; }
    .btn.secondary{ background:#6c757d; }
    .btn.secondary:hover:not(:disabled){ background:#545b62; }
    .jump-controls{ display:flex; align-items:center; gap:10px; }
    #jumpInput{ width:80px; padding:8px; border:1px solid #ccc; border-radius:4px; }
    .property-display{ border:2px solid #e9ecef; border-radius:8px; padding:24px; background:#f8f9fa; }
    .property-header{ display:flex; justify-content:space-between; align-items:center; margin-bottom:16px; padding-bottom:12px; border-bottom:2px solid #dee2e6; }
    .property-title{ font-size:1.6rem; color:#333; margin:0; }
    .property-counter{ background:#007bff; color:#fff; padding:8px 16px; border-radius:20px; font-weight:700; }
    .descriptions-grid{ display:grid; grid-template-columns:repeat(auto-fit, minmax(300px,1fr)); gap:16px; margin-top:12px; }
    .description-field{ background:#fff; border:1px solid #dee2e6; border-radius:6px; padding:14px; }
    .field-label{ font-weight:700; color:#495057; margin-bottom:6px; font-size:.9rem; letter-spacing:.3px; }
    .field-content{ color:#333; line-height:1.5; min-height:40px; }
    .field-content.empty{ color:#999; font-style:italic; }
    .char-count{ color:#6c757d; font-size:.8rem; margin-top:4px; }
    .loading{ text-align:center; color:#666; font-size:1.1rem; padding:32px; }
    .error{ background:#f8d7da; color:#721c24; padding:12px; border-radius:6px; margin:16px 0; }
    .status-badge{ padding:4px 12px; border-radius:12px; font-size:.8rem; font-weight:700; }
    .status-active{ background:#d4edda; color:#155724; }
    .status-inactive{ background:#f8d7da; color:#721c24; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🏠 Hostfully Property Browser</h1>
      <div class="subtitle">Secure Property Description Viewer</div>
    </div>

    <div class="controls">
      <button id="loadBtn" class="btn">Load Properties</button>
      <button id="prevBtn" class="btn secondary" disabled>⬅️ Previous</button>
      <button id="nextBtn" class="btn secondary" disabled>Next ➡️</button>
      <div class="jump-controls">
        <label for="jumpInput">Jump to:</label>
        <input type="number" id="jumpInput" min="1" placeholder="1" disabled />
        <button id="jumpBtn" class="btn secondary" disabled>Go</button>
      </div>
      <button id="downloadBtn" class="btn">⬇️ Download CSV</button>
    </div>

    <div id="propertyDisplay" class="property-display" style="display:none;">
      <div class="property-header">
        <h2 id="propertyTitle" class="property-title"></h2>
        <div class="property-counter" id="propertyCounter"></div>
      </div>
      <div id="propertyInfo"></div>
      <div class="descriptions-grid" id="descriptionsGrid"></div>
    </div>

    <div id="loadingMsg" class="loading" style="display:none;">Loading properties...</div>
    <div id="errorMsg" class="error" style="display:none;"></div>
  </div>

  <script src="/app.js" defer></script>
</body>
</html>`);
});

/* ----------------------------------------------------------
   Errors
---------------------------------------------------------- */
app.use(
  (
    err: any,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction
  ) => {
    console.error("Server Error:", err);
    res.status(500).json({
      success: false,
      error: "Internal server error",
      message: NODE_ENV === "development" ? err?.message : "Something went wrong",
    });
  }
);

app.use("*", (req, res) => {
  res.status(404).json({ success: false, error: "Not found", path: req.originalUrl });
});

/* ----------------------------------------------------------
   Start
---------------------------------------------------------- */
const HOST = process.env.HOST || "::"; // IPv6-any (works with cloudflared), also accepts IPv4 on most systems
app.listen(PORT, HOST, () => {
  console.log(`🚀 Hostfully browser: http://localhost:${PORT}`);
  console.log(`📊 Environment: ${NODE_ENV}`);
  console.log(`🌐 CORS allowed: ${allowedOrigins.join(", ")}`);
});

export default app;
