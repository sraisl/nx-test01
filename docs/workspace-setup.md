# Einrichtung des GitHub-Repositorys

Diese Schritte sind einmalig und werden in der GitHub-Oberfläche ausgeführt. Sie stehen nicht in
Dateien des Repositorys. Repository-Einstellungen, Actions-Berechtigungen und Rulesets werden beim
Erstellen aus einem Template **nicht** übernommen; sie müssen in jedem neuen Repository gesetzt
werden.

## A. Template-Repository

1. **Als Template markieren:** Settings → General → Abschnitt „Template repository“ → Haken setzen.
2. **PRs durch Actions erlauben:** Settings → Actions → General → Workflow permissions → Option
   „Allow GitHub Actions to create and approve pull requests“ aktivieren. Ohne diese Option kann
   der Workflow „Scaffold services“ keinen Pull Request öffnen.
3. **Ruleset für `main`:** Settings → Rules → Rulesets → New branch ruleset
   - Target: Default branch (`main`).
   - „Restrict deletions“ und „Block force pushes“ aktivieren.
   - „Require a pull request before merging“ aktivieren (0 Approvals bei Einzelentwicklung).
   - „Require status checks to pass“ aktivieren und den Check **`Build and test (affected)`**
     hinzufügen. Der Check ist erst in der Auswahl, wenn der Workflow `CI` mindestens einmal
     gelaufen ist.
   - Keine Bypass-Akteure eintragen.
   - Alternativ per API mit der Definition aus [`docs/github/ruleset-main.json`](github/ruleset-main.json)
     (`integration_id` 15368 ist GitHub Actions):
     `gh api -X POST repos/<owner>/<repo>/rulesets --input docs/github/ruleset-main.json`
4. **Nx Cloud:** nichts einrichten. `nx.json` setzt `neverConnectToCloud: true`; es werden weder
   ein Token noch ein Secret benötigt.

## B. Aus dem Template erzeugte Repositorys

1. Auf GitHub **Use this template** → **Create a new repository**.
2. Schritt A.2 im neuen Repository ausführen. Schritt A.1 ist dort nicht nötig.
3. CI einmal laufen lassen, bevor das Ruleset gesetzt wird. Erscheint der Check
   `Build and test (affected)` nicht in der Auswahl, wurde CI noch nicht ausgeführt: einen Branch
   mit einem Commit pushen und einen Pull Request öffnen.
4. Schritt A.3 im neuen Repository ausführen. Ein Ruleset mit einem Check, der noch nie gelaufen
   ist, blockiert alle Pull Requests.
5. Den Workflow **Scaffold services** starten (siehe [`README.md`](../README.md)).
