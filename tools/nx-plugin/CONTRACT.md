# Generator contract

Binding specification for `@platform/nx-plugin` (local npm workspace package in `tools/nx-plugin`).
All generators are CommonJS (`.js`), depend only on `@nx/devkit` (and, for `react-app`, call
`@nx/react` via `@nx/devkit`'s generator API), and are invoked as
`npx nx g @platform/nx-plugin:<generator> …`.

Conventions follow the reference repo `nx-demo` (see `.github/copilot-instructions.md` there and here).

## Common rules

- Project names: `^[a-z][a-z0-9-]{1,40}$`, must be unique in the workspace. Generators fail with a
  clear message otherwise (`throw new Error('…')`).
- Every generated `project.json` sets `name`, `$schema`, `projectType`, `sourceRoot`.
- Maven projects: explicit targets with `nx:run-commands`, `./mvnw -B -f <root>/pom.xml …`,
  version fixed `0.0.0-SNAPSHOT`, `java.version` = 25 (major from `mise.toml`), groupId from option
  `groupId` (default `com.example`), Kotlin package `<groupId>.<name without dashes>`.
- No Maven wrapper per project (root `mvnw` only), no Dockerfile for Maven projects.
- Generators are idempotent where cheap (e.g. `link` does not duplicate entries) and call
  `formatFiles(tree)` at the end.
- Every generator has a `schema.json` (with `$id`, `cli: "nx"`, `properties`, `required`) and
  a test file `<generator>.test.js` using `node:test` + `createTreeWithEmptyWorkspace` from
  `@nx/devkit/testing`. Tests run via `npx nx test nx-plugin`.

## `kotlin-lib`

Options: `name` (required), `groupId`.

Creates `libs/<name>`:
- `pom.xml`: Kotlin JVM library, imports `spring-boot-dependencies` BOM (same Spring Boot version as
  services, 4.1.2) for dependency management, `kotlin-maven-plugin`, JUnit 5 (`kotlin-test-junit5`).
  No `spring-boot-maven-plugin` (no repackaging).
- One sample class and one test.
- `project.json` (`projectType: library`):
  - `build`: `install -DskipTests`, `cache: false`, inputs `production`, `^production`, outputs `{projectRoot}/target`
  - `test`: `verify`, inputs `default`, `^production`, outputs `{projectRoot}/target`
  - no `image`.

## `spring-service`

Options: `name` (required), `groupId`, `port` (number, default: first free port starting at 8080
among existing spring services, read from their `src/main/resources/application.yaml`),
`libs` (comma-separated `kotlin-lib` names, optional).

Creates `apps/<name>` modelled on `nx-demo/apps/demo-service`:
- `pom.xml` with `spring-boot-starter-parent` 4.1.2, Kotlin 2.3.21, webmvc + actuator, tests.
- `Application.kt`, a `HelloController` under `/api/<name>/hello`, a `@SpringBootTest` context test.
- `application.yaml` with `server.port` and `spring.application.name`.
- `project.json` (`projectType: application`): `build` (`package -DskipTests`), `test` (`verify`),
  `image` (`spring-boot:build-image -DskipTests -Dspring-boot.build-image.imageName="${IMAGE_NAME:-<name>:local}"`),
  `serve` (`spring-boot:run`, `continuous: true`); inputs/outputs as in `kotlin-lib`.
- For every entry in `libs`: call the `link` generator.

## `react-app`

Options: `name` (required), `backend` (optional `spring-service` name), `port` (dev server port,
default: first free port starting at 4200).

- Runs `@nx/react:application` with `directory: apps/<name>`, `bundler: vite`,
  `unitTestRunner: vitest`, `linter: eslint`, `e2eTestRunner: none`, `style: css`,
  `useProjectJson: true`, `name: <name>`.
- Adds (modelled on `nx-demo/apps/web`): `Dockerfile` (nginx-unprivileged `1.30-alpine`, `apk upgrade`,
  `USER 101`, `HEALTHCHECK` on `/healthz`, copies only `dist/apps/<name>`),
  `Dockerfile.dockerignore`, nginx config template with `/healthz`, `/api` proxied to `API_URL`
  resolved per request (`resolver` from `NGINX_LOCAL_RESOLVERS`).
- `project.json`: `image` target `docker build -f apps/<name>/Dockerfile -t "${IMAGE_NAME:-<name>:local}" .`;
  `test.outputs` add `{projectRoot}/test-results`; Vitest JUnit reporter to `<root>/test-results/`.
- Vite dev server on `port`, `/api` proxy to the backend port if `backend` is given (else `http://localhost:8080`).
- If `backend` given: call `link`.
- **Marker lines** (exact form, one occurrence each, rewritten by `link`):
  - `apps/<name>/vite.config.mts (or the vite config file name @nx/react generates)`: `const API_TARGET = 'http://localhost:<port>';` (used as `/api` proxy target)
  - `apps/<name>/Dockerfile`: `ENV API_URL=http://<backend-or-"backend">:<port>` (default for the container;
    without backend: `ENV API_URL=http://backend:8080`)

## `link`

Options: `project` (required), `dependency` (required).

- `project` = spring-service or kotlin-lib, `dependency` = kotlin-lib: add Maven dependency
  (`<groupId>`, `<artifactId>dependency</artifactId>`, `0.0.0-SNAPSHOT`) to the project's `pom.xml`
  **and** `dependency` to `implicitDependencies` in its `project.json`. Both must stay in sync.
- `project` = react-app, `dependency` = spring-service: set the Vite proxy target and default
  `API_URL` to the backend's port. **No** `implicitDependencies` (runtime, not build dependency).
- Anything else: error. Cycles: error.

## `bootstrap`

Options:
- `services` (required): comma-separated `<type>:<name>`, types `spring-service`, `kotlin-lib`, `react-app`.
  Example: `kotlin-lib:common,spring-service:orders,spring-service:billing,react-app:web`
- `links` (optional): comma-separated `<project>:<dependency>`.
  Example: `orders:common,billing:common,web:orders`
- `groupId` (optional, passed on).

Order: all `kotlin-lib`, then `spring-service`, then `react-app`, then all `links`. Validate the
whole input before writing anything (unknown types, duplicates, invalid names, unknown link
targets, cycles). Usable on an empty workspace and on an existing one (adds projects).
