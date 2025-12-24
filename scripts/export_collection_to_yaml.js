// scripts/export_collection_to_yaml.js
// Usage (Git Bash):
//   export BGG_TOKEN="..."
//   node scripts/export_collection_to_yaml.js Shojobo
//
// Writes ./games.yaml (owned boardgames, excluding expansions).

import fs from "node:fs";

const username = process.argv[2];
if (!username) {
    console.error("Usage: node scripts/export_collection_to_yaml.js <BGG_USERNAME>");
    process.exit(1);
}

const token = process.env.BGG_TOKEN;
if (!token) {
    console.error("Missing BGG_TOKEN env var.");
    process.exit(1);
}

function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}

function decodeEntities(str) {
    return str
        .replaceAll("&amp;", "&")
        .replaceAll("&quot;", '"')
        .replaceAll("&apos;", "'")
        .replaceAll("&lt;", "<")
        .replaceAll("&gt;", ">");
}

// Extract <item objectid="12345"> ... </item>
function extractObjectIds(xml) {
    const ids = [];
    const re = /<item\b[^>]*objectid="(\d+)"[^>]*>/g;
    let m;
    while ((m = re.exec(xml))) ids.push(Number(m[1]));
    return ids;
}

// Very small YAML writer
function toYaml(ids) {
    const lines = [];
    lines.push("games:");
    for (const id of ids) {
        lines.push(`  - bgg_id: ${id}`);
    }
    lines.push(""); // newline at end
    return lines.join("\n");
}

async function fetchCollectionXML() {
    // Excluding expansions because BGG collection can include them even with subtype=boardgame.
    // (BGG wiki notes this behavior and workaround.)
    const url =
        `https://boardgamegeek.com/xmlapi2/collection` +
        `?username=${encodeURIComponent(username)}` +
        `&own=1` +
        `&subtype=boardgame` +
        `&excludesubtype=boardgameexpansion`;

    for (let attempt = 1; attempt <= 10; attempt++) {
        // Try token as Bearer header first (matches what you did for /thing if you used Authorization).
        // If your token only works as a query param, see the note below.
        const res = await fetch(url, {
            headers: {
                "User-Agent": "boardgame-shelf-github-pages/1.0 (personal project)",
                "Accept": "application/xml,text/xml;q=0.9,*/*;q=0.8",
                "Authorization": `Bearer ${token}`,
            },
        });

        const text = await res.text();
        const snippet = text.slice(0, 120).replace(/\s+/g, " ");

        // BGG often returns 202 when the collection is being generated.
        if (res.status === 202) {
            await sleep(2000 * attempt);
            continue;
        }

        if (res.status === 401) {
            throw new Error(
                `BGG returned 401 Unauthorized. Your token may need to be passed differently. ` +
                `First bytes: "${snippet}"`
            );
        }

        // Happy path: XML with <items> and <item ...>
        if (text.includes("<items") && text.includes("<item")) return text;

        // Sometimes it returns <items total="0"> if something is off
        if (text.includes("<items")) return text;

        console.warn(`BGG unexpected response attempt ${attempt}/10 status=${res.status} snippet="${snippet}"`);
        await sleep(1200 * attempt);
    }

    throw new Error("BGG collection did not return usable XML after retries.");
}

async function main() {
    const xml = await fetchCollectionXML();
    const ids = extractObjectIds(xml);

    if (!ids.length) {
        // helpful hint if you get empty results
        const totalMatch = xml.match(/<items\b[^>]*total="(\d+)"/);
        const total = totalMatch ? totalMatch[1] : "unknown";
        console.warn(`No objectid items found. total=${total}. Is the collection public and filtered correctly?`);
    }

    // De-dupe + sort
    const unique = [...new Set(ids)].sort((a, b) => a - b);

    fs.writeFileSync("games.yaml", toYaml(unique), "utf8");
    console.log(`Wrote games.yaml with ${unique.length} games for user "${username}".`);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
