import fs from "fs";
import path from "path";
import fetch from "node-fetch";

const SEASON = 2025;   // kannst du anpassen
const LEAGUE = 37;     // z.B. Senioren D = 37
const BASE_URL = "https://data.sihf.ch/Statistic/api/cms/cache300";

// universeller Parser: klappt für JSONP und plain JSON
function stripAnyJsonCallback(text) {
  const start = text.indexOf("(");
  const end = text.lastIndexOf(")");
  if (start !== -1 && end !== -1) {
    return text.substring(start + 1, end);
  }
  return text; // falls reines JSON ohne Callback
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
  try {
    return JSON.parse(stripAnyJsonCallback(text));
  } catch (err) {
    throw new Error("❌ Fehler beim Parsen der Antwort:\n" + text.substring(0, 200));
  }
}

async function main() {
  const url = `${BASE_URL}?alias=standings&searchQuery=${SEASON}/${LEAGUE}/&filterQuery=${SEASON}/${LEAGUE}/&language=de`;

  console.log("➡️  Fetching standings:", url);

  const data = await fetchJson(url);

  // Ordner vorbereiten
  const outDir = path.join("data", "debug");
  fs.mkdirSync(outDir, { recursive: true });

  const outFile = path.join(outDir, `standings-${SEASON}-${LEAGUE}.json`);
  fs.writeFileSync(outFile, JSON.stringify(data, null, 2), "utf-8");

  console.log(`✅ Gespeichert: ${outFile}`);
}

main().catch((err) => {
  console.error("❌ Fehler:", err.message);
});
