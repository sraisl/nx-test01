'use strict';

/** Explicit Nx targets for a Maven project (nx:run-commands, see CONTRACT.md). */
function mavenTargets(root, { library = false, name } = {}) {
  const mvn = `./mvnw -B -f ${root}/pom.xml`;
  const targets = {
    build: {
      executor: 'nx:run-commands',
      ...(library ? { cache: false } : {}),
      options: {
        // Libraries are installed into ~/.m2 so dependent projects resolve them; therefore not cacheable.
        command: `${mvn} ${library ? 'install' : 'package'} -DskipTests`,
      },
      inputs: ['production', '^production'],
      outputs: ['{projectRoot}/target'],
    },
    test: {
      executor: 'nx:run-commands',
      options: { command: `${mvn} verify` },
      inputs: ['default', '^production'],
      outputs: ['{projectRoot}/target'],
    },
  };
  if (!library) {
    targets.image = {
      executor: 'nx:run-commands',
      options: {
        command: `${mvn} spring-boot:build-image -DskipTests -Dspring-boot.build-image.imageName="\${IMAGE_NAME:-${name}:local}"`,
      },
    };
    targets.serve = {
      executor: 'nx:run-commands',
      continuous: true,
      options: { command: `${mvn} spring-boot:run` },
    };
  }
  return targets;
}

module.exports = { mavenTargets };
