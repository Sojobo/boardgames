let activeCategory = null;

async function loadData() {
    const res = await fetch("./games.json", { cache: "no-store" });
    if (!res.ok) throw new Error("games.json not found yet. Run the build action once.");
    return await res.json();
}

function fmtPlayers(p) {
    if (!p?.min || !p?.max) return "👥 ?";
    return p.min === p.max ? `👥 ${p.min}` : `👥 ${p.min}–${p.max}`;
}

function fmtTime(t) {
    if (!t?.min || !t?.max) return "⏱ ?";
    return t.min === t.max ? `⏱ ${t.min}m` : `⏱ ${t.min}–${t.max}m`;
}

function fmtRating(r) {
    const avg = r?.average;
    if (!avg || !Number.isFinite(avg)) return null;
    const rounded = Math.round(avg * 10) / 10;
    return `${rounded}`;
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
    const activeTagEl = document.getElementById("activeTag");

    grid.innerHTML = "";

    metaEl.textContent = meta;

    activeTagEl.innerHTML = activeCategory
        ? `<span class="chip">Filtered by category: <strong>${activeCategory}</strong> <button id="clearTag" aria-label="Clear filter">×</button></span>`
        : "";

    const clearBtn = document.getElementById("clearTag");
    if (clearBtn) {
        clearBtn.addEventListener("click", () => {
            activeCategory = null;
            document.getElementById("search").value = "";
            window.__rerender?.();
        });
    }

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
          ${fmtRating(g.ratings) ? `<span class="badge"><span class="star">★</span>${fmtRating(g.ratings)}</span>` : ""}
        </div>

        <div class="kv">
          <span class="pill">${fmtPlayers(g.players)}</span>
          <span class="pill">${fmtTime(g.playtime)}</span>
          ${g.yearpublished ? `<span class="pill">📅 ${g.yearpublished}</span>` : ""}
        </div>

        <div class="tags">
          ${topTags.map((t) => `<span class="tag" data-category="${t.replaceAll('"', "&quot;")}">${t}</span>`).join("")}
        </div>

        ${g.note ? `<div class="note">${g.note}</div>` : ""}

        ${g.bgg_url ? `
            <div class="footer-row">
                <a class="bgg-link" href="${g.bgg_url}" target="_blank" rel="noreferrer">
                BGG
                <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="M14 4h6v6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                    <path d="M10 14L20 4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                    <path d="M20 14v6H4V4h6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
                </a>
            </div>
        ` : ""}

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

    if (activeCategory) {
        filtered = filtered.filter((g) => (g.categories || []).includes(activeCategory));
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

    window.__rerender = rerender;

    document.getElementById("grid").addEventListener("click", (e) => {
        const el = e.target.closest(".tag[data-category]");
        if (!el) return;

        const cat = el.getAttribute("data-category");
        activeCategory = (activeCategory === cat) ? null : cat;

        // optional: also set search to category for clarity
        document.getElementById("search").value = activeCategory ? cat : "";
        rerender();
    });

    document.getElementById("clearFilters").addEventListener("click", () => {
        activeCategory = null;

        document.getElementById("search").value = "";
        document.getElementById("playerFilter").value = "";
        document.getElementById("sort").value = "name";

        rerender();
    });

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
