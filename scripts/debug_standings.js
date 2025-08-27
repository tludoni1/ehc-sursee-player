import fs from "fs";
import path from "path";
import fetch from "node-fetch";

const SEASON = 2025;   // kannst du anpassen
const LEAGUE = 37;     // Senioren D
const BASE_URL = "https://data.sihf.ch/Statistic/api/cms/cache300";

function stripAnyJsonCallback(text) {
  const start = text.indexOf("(");
  const end = text.lastIndexOf(")");
  if (start !== -1 && end !== -1) {
    return text.substring(start + 1, end);
  }
  return text; // plain JSON
}

async function fetchJson(url) {
  const cacheBuster = `v=${Date.now()}`;
  const fullUrl = url + (url.includes("?") ? "&" : "?") + cacheBuster;

  const res = await fetch(fullUrl, {
    headers: {
      "User-Agent": "Mozilla/5.0",
      "Referer": "https://www.sihf.ch/",
    },
  });

  const text = await res.text();

  // 👉 Debug: zeig die ersten 300 Zeichen im Log
  console.log("🔎 API Antwort (erste 300 Zeichen):", text.substring(0, 300));

  try {
    if (text.includes("(") && text.includes(")")) {
      return JSON.parse(stripAnyJsonCallback(text));
    }
    return JSON.parse(text);
  } catch (err) {
    throw new Error("❌ Fehler beim Parsen – Antwort war kein valides JSON/JSONP.");
  }
}

async function main() {
  const url = `${BASE_URL}?alias=standings&searchQuery=${SEASON}/${LEAGUE}/&filterQuery=${SEASON}/${LEAGUE}/&language=de`;

  console.log("➡️  Fetching standings:", url);

  const data = await fetchJson(url);

  const outDir = path.join("data", "debug");
  fs.mkdirSync(outDir, { recursive: true });

  const outFile = path.join(outDir, `standings-${SEASON}-${LEAGUE}.json`);
  fs.writeFileSync(outFile, JSON.stringify(data, null, 2), "utf-8");

  console.log(`✅ Gespeichert: ${outFile}`);
}

main().catch((err) => {
  console.error("❌ Fehler:", err.message);
});
