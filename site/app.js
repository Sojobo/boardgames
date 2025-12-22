async function loadData() {
    const res = await fetch("./games.json", { cache: "no-store" });
    if (!res.ok) throw new Error("games.json not found yet. Run the build action once.");
    return await res.json();
}

function fmtPlayers(p) {
    if (!p?.min || !p?.max) return "Players: ?";
    return p.min === p.max ? `Players: ${p.min}` : `Players: ${p.min}–${p.max}`;
}

function fmtTime(t) {
    if (!t?.min || !t?.max) return "Time: ?";
    return t.min === t.max ? `Time: ${t.min} min` : `Time: ${t.min}–${t.max} min`;
}

function fmtRating(r) {
    const avg = r?.average;
    const users = r?.usersrated;
    if (!avg || !Number.isFinite(avg)) return "Rating: ?";
    const rounded = Math.round(avg * 10) / 10;
    return users ? `★ ${rounded} (${users.toLocaleString()})` : `★ ${rounded}`;
}

function worksWithPlayers(game, n) {
    const min = game?.players?.min;
    const max = game?.players?.max;
    if (!min || !max) return false;
    if (n === 6) return max >= 6;
    return n >= min && n <= max;
}

function sortGames(games, mode) {
    const copy = [...games];
    if (mode === "rating") {
        copy.sort((a, b) => (b?.ratings?.average ?? 0) - (a?.ratings?.average ?? 0));
        return copy;
    }
    if (mode === "players") {
        copy.sort((a, b) => (b?.players?.max ?? 0) - (a?.players?.max ?? 0));
        return copy;
    }
    if (mode === "year") {
        copy.sort((a, b) => (b?.yearpublished ?? 0) - (a?.yearpublished ?? 0));
        return copy;
    }
    copy.sort((a, b) => (a?.name ?? "").localeCompare(b?.name ?? ""));
    return copy;
}

function render(games, meta) {
    const grid = document.getElementById("grid");
    const empty = document.getElementById("empty");
    const metaEl = document.getElementById("meta");

    grid.innerHTML = "";

    metaEl.textContent = meta;

    if (!games.length) {
        empty.classList.remove("hidden");
        return;
    }
    empty.classList.add("hidden");

    for (const g of games) {
        const card = document.createElement("div");
        card.className = "card";

        const imgUrl = g.image || g.thumbnail || "";
        const topTags = [...(g.categories || [])].slice(0, 4);

        card.innerHTML = `
      <div class="thumb">
        ${imgUrl ? `<img src="${imgUrl}" alt="${(g.name || "Game").replaceAll('"', "&quot;")}">` : ""}
      </div>
      <div class="card-body">
        <div class="card-title">
          <span>${g.name ?? "Unknown"}</span>
          <span class="badge">${fmtRating(g.ratings)}</span>
        </div>

        <div class="kv">
          <span class="pill">${fmtPlayers(g.players)}</span>
          <span class="pill">${fmtTime(g.playtime)}</span>
          ${g.yearpublished ? `<span class="pill">Year: ${g.yearpublished}</span>` : ""}
        </div>

        <div class="tags">
          ${topTags.map((t) => `<span class="tag">${t}</span>`).join("")}
          ${g.mechanics?.length ? `<span class="tag">+ ${g.mechanics.length} mechanics</span>` : ""}
        </div>

        <div class="actions">
          ${g.bgg_url ? `<a class="button" href="${g.bgg_url}" target="_blank" rel="noreferrer">BGG page</a>` : ""}
        </div>

        ${g.note ? `<div class="note">${g.note}</div>` : ""}
      </div>
    `;

        grid.appendChild(card);
    }
}

function applyFilters(allGames) {
    const q = document.getElementById("search").value.trim().toLowerCase();
    const playerVal = document.getElementById("playerFilter").value;
    const sortMode = document.getElementById("sort").value;

    let filtered = allGames;

    if (q) {
        filtered = filtered.filter((g) => {
            const haystack = [
                g.name,
                ...(g.categories || []),
                ...(g.mechanics || []),
                g.note,
            ]
                .filter(Boolean)
                .join(" • ")
                .toLowerCase();
            return haystack.includes(q);
        });
    }

    if (playerVal) {
        const n = Number(playerVal);
        filtered = filtered.filter((g) => worksWithPlayers(g, n));
    }

    filtered = sortGames(filtered, sortMode);
    return filtered;
}

async function main() {
    const data = await loadData();
    const allGames = data.games || [];
    const generated = data.generated_at ? new Date(data.generated_at).toLocaleString() : "unknown time";

    const rerender = () => {
        const filtered = applyFilters(allGames);
        render(filtered, `Showing ${filtered.length}/${allGames.length} games • updated ${generated}`);
    };

    document.getElementById("search").addEventListener("input", rerender);
    document.getElementById("playerFilter").addEventListener("change", rerender);
    document.getElementById("sort").addEventListener("change", rerender);

    rerender();
}

main().catch((e) => {
    console.error(e);
    document.getElementById("meta").textContent =
        "Could not load games.json yet. Push to GitHub to trigger the build, or run the script locally.";
});
