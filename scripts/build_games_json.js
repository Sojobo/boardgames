// scripts/build_games_json.js
// Node 18+
// Generates site/games.json from games.yaml by fetching data from BoardGameGeek.

import fs from "node:fs";
import path from "node:path";

const YAML_PATH = path.join(process.cwd(), "games.yaml");
const OUT_PATH = path.join(process.cwd(), "site", "games.json");

// Tiny YAML parser for our very simple format (games list with bgg_id + optional note).
// If you later want full YAML support, swap this to use "yaml" npm package.
function parseSimpleYaml(yamlText) {
    const lines = yamlText.split(/\r?\n/);
    const games = [];
    let inGames = false;
    let current = null;

    for (const raw of lines) {
        const line = raw.replace(/\t/g, "  ").trimEnd();
        if (!line.trim() || line.trim().startsWith("#")) continue;

        if (line.startsWith("games:")) {
            inGames = true;
            continue;
        }
        if (!inGames) continue;

        // New item: "- bgg_id: 123"
        if (line.trimStart().startsWith("- ")) {
            if (current) games.push(current);
            current = {};
            const rest = line.trimStart().slice(2).trim();

            // Handle "- bgg_id: 123"
            const [k, ...vParts] = rest.split(":");
            if (k && vParts.length) {
                const v = vParts.join(":").trim().split("#")[0].trim();
                if (k.trim() === "bgg_id") current.bgg_id = Number(v);
                else current[k.trim()] = v;
            }
            continue;
        }

        // Indented properties: "note: blah"
        if (current && line.startsWith("  ")) {
            const trimmed = line.trim();
            const [k, ...vParts] = trimmed.split(":");
            const v = vParts.join(":").trim();
            if (!k) continue;

            // Strip optional quotes
            const unquoted =
                (v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))
                    ? v.slice(1, -1)
                    : v;

            if (k.trim() === "bgg_id") current.bgg_id = Number(unquoted);
            else current[k.trim()] = unquoted;
        }
    }
    if (current) games.push(current);
    return { games };
}

async function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}

// BGG sometimes returns a "please retry" behavior for hot caches.
// We'll retry a few times if the response doesn't contain items.
async function fetchBGGThingXML(ids) {
    const url = `https://boardgamegeek.com/xmlapi2/thing?id=${ids.join(",")}&stats=1`;
    for (let attempt = 1; attempt <= 5; attempt++) {
        const res = await fetch(url, {
            headers: {
                "User-Agent": "boardgame-shelf-github-pages/1.0 (personal project)",
            },
        });
        const text = await res.text();

        // crude check: presence of "<item"
        if (text.includes("<item")) return text;

        // backoff
        await sleep(800 * attempt);
    }
    throw new Error("BGG API did not return items after retries.");
}

// Minimal XML extraction using string/regex (good enough for BGG’s predictable XML).
function getAttr(tagText, attr) {
    const m = tagText.match(new RegExp(`${attr}="([^"]*)"`));
    return m ? m[1] : null;
}

function decodeEntities(str) {
    return str
        .replaceAll("&amp;", "&")
        .replaceAll("&quot;", '"')
        .replaceAll("&apos;", "'")
        .replaceAll("&lt;", "<")
        .replaceAll("&gt;", ">");
}

// Extract <item ...>...</item> blocks
function extractItems(xml) {
    const items = [];
    const re = /<item\b[^>]*>[\s\S]*?<\/item>/g;
    let m;
    while ((m = re.exec(xml))) items.push(m[0]);
    return items;
}

function extractSingleTag(xmlBlock, tagName) {
    const re = new RegExp(`<${tagName}>([\\s\\S]*?)<\\/${tagName}>`);
    const m = xmlBlock.match(re);
    return m ? decodeEntities(m[1].trim()) : null;
}

function extractValueTags(xmlBlock, tagName) {
    // matches <tagName ... />
    const re = new RegExp(`<${tagName}\\b[^>]*/>`, "g");
    const out = [];
    let m;
    while ((m = re.exec(xmlBlock))) {
        const tag = m[0];
        out.push({
            id: getAttr(tag, "id"),
            type: getAttr(tag, "type"),
            value: decodeEntities(getAttr(tag, "value") ?? ""),
        });
    }
    return out;
}

function extractName(xmlBlock) {
    // Prefer primary name
    const re = /<name\b[^>]*\/>/g;
    const candidates = [];
    let m;
    while ((m = re.exec(xmlBlock))) candidates.push(m[0]);

    let primary = candidates.find((t) => getAttr(t, "type") === "primary");
    if (!primary) primary = candidates[0];
    return primary ? decodeEntities(getAttr(primary, "value") ?? "") : null;
}

function extractStats(xmlBlock) {
    // <statistics> <ratings> <average value="7.123" />
    const avgTag = xmlBlock.match(/<average\b[^>]*\/>/);
    const bayesTag = xmlBlock.match(/<bayesaverage\b[^>]*\/>/);
    const usersRatedTag = xmlBlock.match(/<usersrated\b[^>]*\/>/);

    const average = avgTag ? Number(getAttr(avgTag[0], "value")) : null;
    const bayesaverage = bayesTag ? Number(getAttr(bayesTag[0], "value")) : null;
    const usersrated = usersRatedTag ? Number(getAttr(usersRatedTag[0], "value")) : null;

    return { average, bayesaverage, usersrated };
}

function extractNumericAttr(xmlBlock, tagName, attr = "value") {
    const m = xmlBlock.match(new RegExp(`<${tagName}\\b[^>]*\\/?>`));
    if (!m) return null;
    const v = getAttr(m[0], attr);
    if (v == null) return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
}

function parseBGGItem(xmlBlock) {
    const idMatch = xmlBlock.match(/<item\b[^>]*id="(\d+)"/);
    const bgg_id = idMatch ? Number(idMatch[1]) : null;

    const name = extractName(xmlBlock);
    const yearpublished = extractNumericAttr(xmlBlock, "yearpublished");
    const minplayers = extractNumericAttr(xmlBlock, "minplayers");
    const maxplayers = extractNumericAttr(xmlBlock, "maxplayers");
    const minplaytime = extractNumericAttr(xmlBlock, "minplaytime");
    const maxplaytime = extractNumericAttr(xmlBlock, "maxplaytime");

    const thumbnail = extractSingleTag(xmlBlock, "thumbnail");
    const image = extractSingleTag(xmlBlock, "image");

    const links = extractValueTags(xmlBlock, "link");
    const categories = links.filter((l) => l.type === "boardgamecategory").map((l) => l.value);
    const mechanics = links.filter((l) => l.type === "boardgamemechanic").map((l) => l.value);

    const stats = extractStats(xmlBlock);

    return {
        bgg_id,
        name,
        yearpublished,
        players: { min: minplayers, max: maxplayers },
        playtime: { min: minplaytime, max: maxplaytime },
        thumbnail,
        image,
        categories,
        mechanics,
        ratings: stats,
        bgg_url: bgg_id ? `https://boardgamegeek.com/boardgame/${bgg_id}` : null,
    };
}

async function main() {
    const yamlText = fs.readFileSync(YAML_PATH, "utf8");
    const { games } = parseSimpleYaml(yamlText);

    const ids = games.map((g) => g.bgg_id).filter(Boolean);
    if (!ids.length) throw new Error("No bgg_id entries found in games.yaml");

    // BGG allows multiple IDs in one call; keep it modest in chunks.
    const chunkSize = 30;
    const parsedById = new Map();

    for (let i = 0; i < ids.length; i += chunkSize) {
        const chunk = ids.slice(i, i + chunkSize);
        const xml = await fetchBGGThingXML(chunk);
        const items = extractItems(xml);
        for (const itemXml of items) {
            const parsed = parseBGGItem(itemXml);
            if (parsed.bgg_id) parsedById.set(parsed.bgg_id, parsed);
        }
        // polite pause
        await sleep(400);
    }

    const finalGames = games.map((g) => {
        const data = parsedById.get(g.bgg_id);
        return {
            ...data,
            note: g.note ?? "",
            // keep any extra fields you add in yaml later
            ...Object.fromEntries(Object.entries(g).filter(([k]) => !["bgg_id", "note"].includes(k))),
        };
    });

    finalGames.sort((a, b) => (a?.name ?? "").localeCompare(b?.name ?? ""));

    fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
    fs.writeFileSync(
        OUT_PATH,
        JSON.stringify(
            {
                generated_at: new Date().toISOString(),
                source: "BoardGameGeek XMLAPI2 /thing?stats=1",
                games: finalGames,
            },
            null,
            2
        ),
        "utf8"
    );

    console.log(`Wrote ${OUT_PATH} with ${finalGames.length} games.`);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
