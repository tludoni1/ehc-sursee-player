# ehc-sursee-player

Abruf von Spieler- und Torhüter-Statistiken des EHC Sursee von der SIHF-Stats-API (data.sihf.ch).

## Nutzung

```bash
npm run fetch          # Spielerdaten abrufen
npm run fetch:detail    # Detaillierte Spielerdaten abrufen
npm run debug:standings # Debug: Tabellenstände
```

Die abgerufenen Daten werden im Ordner `data/` gespeichert. Die Dateien in `scripts/` enthalten zudem Loader/Core-Skripte für ein Web-Widget zur Anzeige von Kader und Statistiken auf einer Website.
