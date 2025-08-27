(function () {
  function loadScript(url, callback) {
    const s = document.createElement("script");
    s.src = url + "?v=" + Date.now(); // Cache-Buster
    s.onload = callback;
    document.head.appendChild(s);
  }

  function init() {
    const widgets = document.querySelectorAll("[id^='ehc-player-widget']");
    widgets.forEach((el) => {
      const config = {
        el,
        team: el.dataset.team || "",
        title: el.dataset.title || "EHC Sursee Player Stats",
        sort: el.dataset.sort || "Punkte",
        color: el.dataset.color || "1",
        font: el.dataset.font || "Arial, sans-serif",
        showleague: el.dataset.showleague === "true",
        season: el.dataset.season || "current",
        phase: el.dataset.phase || "all", // neu: Phase
        template: el.dataset.template || "compact",
        columns: {
          games: el.dataset.colGames !== "false",
          goals: el.dataset.colGoals !== "false",
          assists: el.dataset.colAssists !== "false",
          points: el.dataset.colPoints !== "false",
          pointsPerGame: el.dataset.colPointsPerGame !== "false",
          penaltyMinutes: el.dataset.colPenaltyMinutes !== "false"
        }
      };

      if (window.EHCPlayerWidgetCore) {
        window.EHCPlayerWidgetCore(config);
      } else {
        loadScript(
          "https://tludoni1.github.io/ehc-sursee-player/scripts/player-widget-core.js",
          () => window.EHCPlayerWidgetCore(config)
        );
      }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
