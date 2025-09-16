(function () {
  function loadScript(url, callback) {
    const s = document.createElement("script");
    s.src = url + "?v=" + Date.now(); // Cache-Buster
    s.onload = callback;
    document.head.appendChild(s);
  }

  function init() {
    const widgets = document.querySelectorAll("[id^='ehc-goalie-widget']");
    widgets.forEach((el) => {
      const config = {
        el,
        team: el.dataset.team || "",
        title: el.dataset.title || "EHC Sursee Goalie Stats",
        sort: el.dataset.sort || "goalsAgainstAverage",
        color: el.dataset.color || "1",
        font: el.dataset.font || "Arial, sans-serif",
        showleague: el.dataset.showleague === "true",
        season: el.dataset.season || "current",
        phase: el.dataset.phase || "all",
        columns: {
          gamesPlayed: el.dataset.colGamesPlayed !== "false",
          firstKeeper: el.dataset.colFirstKeeper !== "false",
          goalsAgainst: el.dataset.colGoalsAgainst !== "false",
          goalsAgainstAverage: el.dataset.colGoalsAgainstAverage !== "false",
          secondsPlayed: el.dataset.colSecondsPlayed !== "false",
          penaltyInMinutes: el.dataset.colPenaltyInMinutes !== "false",
          goals: el.dataset.colGoals !== "false",
          assists: el.dataset.colAssists !== "false"
        }
      };

      if (window.EHCGoalieWidgetCore) {
        window.EHCGoalieWidgetCore(config);
      } else {
        loadScript(
          "https://tludoni1.github.io/ehc-sursee-player/scripts/goalie-widget-core.js",
          () => window.EHCGoalieWidgetCore(config)
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
