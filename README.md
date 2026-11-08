# nx-service-template

GitHub-Template für ein Nx-24-Monorepo mit Spring-Boot-Services (Kotlin, Maven),
Kotlin-Bibliotheken und React-Apps (Vite). Ein lokales Nx-Plugin (`@platform/nx-plugin`, Ordner
`tools/nx-plugin`) legt die Projekte an und verdrahtet ihre Abhängigkeiten. Build, Test und
Image-Bau laufen als Nx-Targets, lokal und in CI mit denselben Befehlen. Nx Cloud ist deaktiviert.

- Konventionen für Agenten: [`.github/copilot-instructions.md`](.github/copilot-instructions.md)
- Vertrag der Generatoren: [`tools/nx-plugin/CONTRACT.md`](tools/nx-plugin/CONTRACT.md)
- Einmalige GitHub-Einrichtung: [`docs/workspace-setup.md`](docs/workspace-setup.md)

## Voraussetzungen

- [mise](https://mise.jdx.dev): installiert Java, Node.js und weitere Tools in den Versionen aus
  [`mise.toml`](mise.toml). Java und Node.js nicht separat installieren.
- Docker: nur für Image-Builds.

Maven wird nicht installiert; es läuft über den Maven Wrapper (`./mvnw`).

## Neues Projekt starten

1. Auf GitHub **Use this template** → **Create a new repository** wählen. Danach die Einstellungen
   aus [`docs/workspace-setup.md`](docs/workspace-setup.md) (Abschnitt B) im neuen Repository setzen.
2. Im Tab **Actions** den Workflow **Scaffold services** mit **Run workflow** starten, z. B. mit:
   - `services`: `kotlin-lib:common,spring-service:orders,react-app:web`
   - `links`: `orders:common,web:orders`
   - `group-id`: `com.example`
3. Der Workflow erzeugt die Projekte, committet sie auf einem Branch `feature/scaffold-<run-id>` und
   öffnet einen Pull Request nach `main`.
4. PRs, die mit `GITHUB_TOKEN` erstellt werden, lösen **keine** CI aus. Dann einen leeren Commit
   pushen (`git commit --allow-empty -m 'ci: trigger'`) oder den PR schließen und wieder öffnen.
   Sobald **Build and test (affected)** grün ist, den PR mergen.

Alternativ lokal, ohne Workflow:

```bash
mise trust && mise install
npm ci
npx nx g @platform/nx-plugin:bootstrap --services=kotlin-lib:common,spring-service:orders,react-app:web --links=orders:common,web:orders
npx nx format:write
```

Die Generatoren schreiben nur Dateien; committen muss man selbst.

## Generatoren

Aufruf: `npx nx g @platform/nx-plugin:<generator> <optionen>`. Projektnamen müssen zu
`^[a-z][a-z0-9-]{1,40}$` passen und im Workspace eindeutig sein.

| Generator | Optionen | Erzeugt |
|---|---|---|
| `bootstrap` | `services` (Pflicht, `<typ>:<name>,…`), `links` (optional, `<projekt>:<abhängigkeit>,…`), `groupId` (Standard `com.example`) | Mehrere Projekte und Verknüpfungen auf einmal. Die Eingabe wird vor dem Schreiben vollständig geprüft. |
| `spring-service` | `name` (Pflicht), `groupId`, `port` (Standard: erster freier Port ab 8080), `libs` (kommagetrennte `kotlin-lib`-Namen) | `apps/<name>`: Spring Boot mit Kotlin und Maven, Image über Paketo Buildpacks |
| `kotlin-lib` | `name` (Pflicht), `groupId` | `libs/<name>`: Kotlin-Bibliothek mit Maven, ohne Repackaging, kein Image |
| `react-app` | `name` (Pflicht), `backend` (optional, ein `spring-service`), `port` (Standard: erster freier Port ab 4200) | `apps/<name>`: React mit Vite und Vitest, Image per Dockerfile mit nginx |
| `link` | `project` (Pflicht), `dependency` (Pflicht) | Verknüpfung zweier Projekte, siehe unten |

Bei `spring-service` und `kotlin-lib` ist das Kotlin-Package `<groupId>.<name ohne Bindestriche>`.

### Verknüpfungen

- **`spring-service` oder `kotlin-lib` → `kotlin-lib`:** Maven-Abhängigkeit in der `pom.xml` und
  `implicitDependencies` in der `project.json`. Beides wird gemeinsam gepflegt. Zyklen werden
  abgelehnt, doppelte Einträge nicht angelegt.
- **`react-app` → `spring-service`:** Laufzeit-Abhängigkeit. Setzt das Vite-Proxy-Ziel für `/api`
  und das Standard-`API_URL` im Dockerfile auf den Port des Backends. Es gibt **keine**
  `implicitDependencies`, weil es keine Build-Abhängigkeit ist.

## Projekte später ergänzen

```bash
npx nx g @platform/nx-plugin:kotlin-lib common
npx nx g @platform/nx-plugin:spring-service inventory --libs=common
npx nx g @platform/nx-plugin:react-app shop --backend=inventory
npx nx g @platform/nx-plugin:link orders common
```

## Befehle

| Zweck | Befehl |
|---|---|
| Alles prüfen, bauen und testen | `npx nx run-many -t lint typecheck build test` |
| Nur Betroffenes | `npx nx affected -t lint typecheck build test` |
| Formatierung prüfen / anwenden | `npx nx format:check` / `npx nx format:write` |
| Ein Projekt testen | `npx nx run <projekt>:test` |
| Generatoren testen | `npx nx test nx-plugin` |
| Container-Image lokal bauen | `npx nx run <projekt>:image` (Name `<projekt>:local`, überschreibbar mit `IMAGE_NAME`) |
| Backend und Frontend starten | `npx nx run-many -t serve -p <backend> <frontend>` |

Der Vite-Dev-Server leitet `/api` an das Backend weiter. Das Frontend-Image leitet `/api` an
`API_URL` weiter und startet auch ohne erreichbares Backend.

## Bekannte Einschränkung

PRs, die mit `GITHUB_TOKEN` erstellt werden (also auch der PR des Workflows **Scaffold services**),
lösen keine Workflows aus. Die Required Checks bleiben dann offen, bis ein Commit mit einem
anderen Token oder ein Schließen und Wiederöffnen des PRs CI auslöst. Abhilfe wäre ein
GitHub-App-Token im Workflow; das ist nicht umgesetzt.
