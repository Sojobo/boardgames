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

        ${(g.bgg_url || g.kickstarter) ? `
            <div class="footer-row">
                <div class="external-links">
                ${g.kickstarter ? `
                    <a class="icon-link ks" href="${g.kickstarter}" target="_blank" rel="noreferrer" title="Kickstarter">
                        <svg width="800px" height="800px" viewBox="-17 0 290 290" version="1.1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" preserveAspectRatio="xMidYMid">
                            <g fill="#05CE78">
                            <path d="M209.302,144.583 L235.582,118.478 C262.806,91.436 262.806,47.391 235.582,20.349 C208.358,-6.694 164.018,-6.694 136.794,20.349 L127.225,29.853 C114.557,11.781 93.667,0 69.812,0 C31.267,0 0,31.059 0,69.346 L0,219.686 C0,257.973 31.267,289.032 69.812,289.032 C93.667,289.032 114.557,277.251 127.225,259.178 L136.794,268.683 C164.018,295.726 208.358,295.726 235.582,268.683 C262.806,241.641 262.806,197.597 235.582,170.554 L209.302,144.583" />
                        </svg>
                    </a>
                ` : ``}

                ${g.bgg_url ? `
                    <a class="icon-link bgg" href="${g.bgg_url}" target="_blank" rel="noreferrer" title="BoardGameGeek">
                        <svg viewBox="0 0 24 24" aria-hidden="true">
                            <path fill="currentColor"
                                d="M12 2c-2.4 0-4.4 2-4.4 4.4
                                0 1 .3 1.9.9 2.6L4 13.4
                                5.8 15l2.9-2.7V22h6.6v-9.7
                                L18.2 15 20 13.4 15.5 9
                                c.6-.7.9-1.6.9-2.6
                                C16.4 4 14.4 2 12 2z"/>
                        </svg>
                    </a>
                ` : ``}
                </div>
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
