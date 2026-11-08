# Copilot-Anweisungen

Zentrale Konventionen für Copilot und andere KI-Agenten in diesem Repository. `AGENTS.md` und
`CLAUDE.md` verweisen hierher.

## Struktur

- `apps/<name>`: Anwendungen (Spring-Boot-Services und React-Apps), `libs/<name>`: Kotlin-Bibliotheken.
- `tools/nx-plugin`: Nx-Generatoren (`@platform/nx-plugin`). Der Vertrag in
  `tools/nx-plugin/CONTRACT.md` ist verbindlich.
- Neue Projekte entstehen **nur** über die Generatoren (`npx nx g @platform/nx-plugin:<generator>`),
  nie durch Kopieren. Bestehende Projekte dürfen von Hand geändert werden.

## Generatoren

- Änderungen an Generatoren, Schemas oder Verhalten gehen **zusammen** mit `CONTRACT.md` in einen
  Commit. Die Optionen in `schema.json` und die Tabelle in `README.md` bleiben synchron.
- CommonJS (`.js`). Einzige Abhängigkeit: `@nx/devkit`.
- Jeder Generator hat `schema.json` (mit `$id` und `cli: "nx"`) und eine Testdatei
  `<generator>.test.js` mit `node:test` und `createTreeWithEmptyWorkspace` aus `@nx/devkit/testing`.
- Eingaben vor dem Schreiben validieren; Fehler als `throw new Error('…')` mit klarer Meldung.
- Idempotent, wo es günstig ist (z. B. `link` legt keine doppelten Einträge an). Am Ende
  `formatFiles(tree)` aufrufen.
- Tests: `npx nx test nx-plugin`.

## Maven (Spring Boot und Kotlin)

- Targets stehen explizit in der `project.json` und rufen `./mvnw -B -f <root>/pom.xml …` über
  `nx:run-commands` auf. Kein Maven Wrapper pro Projekt, nur der Root-`mvnw`.
- Version fest `0.0.0-SNAPSHOT`. `java.version` entspricht der Java-Version aus `mise.toml`.
- Tests laufen nur im Target `test` (`verify`). Andere Targets überspringen sie (`-DskipTests`).
- Kein Dockerfile; Images entstehen über Paketo (`spring-boot:build-image`).
- Abhängigkeiten auf `kotlin-lib`: `pom.xml` und `implicitDependencies` in der `project.json`
  stimmen überein. Nur über den Generator `link` anlegen.

## TypeScript und Frontend

- Targets kommen aus den Nx-Plugins (`@nx/vite`, `@nx/vitest`, `@nx/eslint`, `@nx/js`).
- Images per Dockerfile (nginx-unprivileged, `USER 101`, `HEALTHCHECK` auf `/healthz`); das
  Dockerfile kopiert nur das Build-Ergebnis.
- Backend-Aufrufe über relative Pfade (`/api/...`). `link` von `react-app` auf `spring-service` setzt
  nur Proxy und `API_URL`, keine `implicitDependencies`.

## Nx und Plugins

- Nur produktionsreife Nx-Plugins, laut offizieller Doku bzw. README für die eingesetzte Version.
  Keine experimentellen, Beta- oder Community-Plugins. `@nx/maven` wird nicht verwendet, solange es
  experimentell ist.
- Nx-Konfiguration für Nx 24: `dependsOn` in Kurzform (`"^build"`) oder als Objekt. Keine
  `targetDefaults` mit dem Executor `nx:run-commands`. Projektspezifische `inputs`/`outputs` in der
  `project.json`.
- Nx Cloud ist aus (`neverConnectToCloud: true`). Nur lokaler Cache.
- Nx-Befehle immer über `npx nx …`.

## Tool-Versionen

- `mise.toml` ist die einzige Quelle für Tool-Versionen, mit exakten Versionen (keine `lts` oder
  `latest`). Keine weiteren Versionsdateien (`.nvmrc`, `.java-version`, `.tool-versions`).
- Maven kommt über `./mvnw`, Nx über `package.json`; beides nicht über mise.

## CI (GitHub Actions)

- Actions auf Commit-SHAs pinnen, mit Versionskommentar (`uses: actions/checkout@<sha> # vX.Y.Z`).
- Minimale `permissions` pro Workflow.
- Eingaben (`inputs`, Kontextwerte) per `env:` an Shell-Schritte übergeben, nicht direkt per
  `${{ … }}` im `run`-Block.
- Tools über `jdx/mise-action` (Composite Action `.github/actions/setup`). `actions/setup-java` und
  `actions/setup-node` nicht verwenden.
- Den Job-Namen `Build and test (affected)` nicht ohne Anpassung des Rulesets für `main` ändern.
- Workflows rufen nur Nx-Targets auf; Build- und Test-Logik gehört nicht in YAML.

## Dokumentation und Arbeitsweise

- Befehlsänderungen in `README.md` nachtragen; Einrichtungsschritte in `docs/workspace-setup.md`.
- Antworten auf Deutsch; Code, Commit-Messages und Bezeichner auf Englisch
  (Conventional Commits, z. B. `feat: …`, `ci: …`).
- Kleinste sinnvolle Prüfung ausführen (z. B. `npx nx test nx-plugin`, `npx nx format:check`) und
  nicht ausgeführte Prüfungen benennen.
