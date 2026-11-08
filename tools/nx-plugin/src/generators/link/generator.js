'use strict';

const {
  formatFiles,
  getProjects,
  joinPathFragments,
  readProjectConfiguration,
  updateProjectConfiguration,
} = require('@nx/devkit');
const {
  DEFAULT_GROUP_ID,
  assertNoCycle,
  findViteConfig,
  implicitDependencyEdges,
  projectKind,
  readServicePort,
} = require('../../utils/workspace');
const pom = require('../../utils/pom');

const MAVEN_KINDS = ['spring-service', 'kotlin-lib'];
const API_TARGET_LINE = /^const API_TARGET = '[^'\n]*';$/gm;
const API_URL_LINE = /^ENV API_URL=\S*$/gm;

/** Validates a link and returns what to do; throws with a clear message otherwise. Writes nothing. */
function planLink(tree, { project, dependency }) {
  if (!project || !dependency) throw new Error('Options "project" and "dependency" are required.');
  const projects = getProjects(tree);
  const source = projects.get(project);
  const target = projects.get(dependency);
  if (!source) throw new Error(`Project "${project}" does not exist.`);
  if (!target) throw new Error(`Dependency "${dependency}" does not exist.`);
  if (project === dependency) throw new Error(`Project "${project}" cannot depend on itself.`);
  const sourceKind = projectKind(tree, source);
  const targetKind = projectKind(tree, target);

  if (MAVEN_KINDS.includes(sourceKind) && targetKind === 'kotlin-lib') {
    assertNoCycle(implicitDependencyEdges(tree), project, dependency);
    return { type: 'maven', source, target };
  }
  if (sourceKind === 'react-app' && targetKind === 'spring-service') {
    const port = readServicePort(tree, target.root);
    if (port === null) {
      throw new Error(
        `Cannot read server.port of "${dependency}" from ${target.root}/src/main/resources/application.yaml.`,
      );
    }
    return { type: 'backend', source, target, port };
  }
  throw new Error(
    `Cannot link ${sourceKind ?? 'unknown'} "${project}" to ${targetKind ?? 'unknown'} "${dependency}": ` +
      'supported are spring-service/kotlin-lib -> kotlin-lib and react-app -> spring-service.',
  );
}

function linkMaven(tree, project, dependency, source, target) {
  const sourcePom = joinPathFragments(source.root, 'pom.xml');
  const targetPom = joinPathFragments(target.root, 'pom.xml');
  if (!tree.exists(sourcePom)) throw new Error(`${sourcePom} not found.`);
  const targetXml = tree.exists(targetPom) ? tree.read(targetPom, 'utf-8') : '';
  const groupId = pom.readGroupId(targetXml) ?? DEFAULT_GROUP_ID;
  const artifactId = pom.readArtifactId(targetXml) ?? dependency;

  const xml = tree.read(sourcePom, 'utf-8');
  const updated = pom.addDependency(xml, { groupId, artifactId, version: '0.0.0-SNAPSHOT' });
  if (updated !== xml) tree.write(sourcePom, updated);

  const config = readProjectConfiguration(tree, project);
  const deps = config.implicitDependencies ?? [];
  if (!deps.includes(dependency)) {
    config.implicitDependencies = [...deps, dependency];
    updateProjectConfiguration(tree, project, config);
  }
}

function replaceMarker(tree, file, pattern, line, description) {
  const content = tree.read(file, 'utf-8');
  const count = (content.match(pattern) ?? []).length;
  if (count !== 1) {
    throw new Error(`Expected exactly one ${description} line in ${file}, found ${count}.`);
  }
  const updated = content.replace(pattern, line);
  if (updated !== content) tree.write(file, updated);
}

function linkBackend(tree, dependency, source, port) {
  const viteConfig = findViteConfig(tree, source.root);
  const dockerfile = joinPathFragments(source.root, 'Dockerfile');
  if (!viteConfig) throw new Error(`No vite config found in ${source.root}.`);
  if (!tree.exists(dockerfile)) throw new Error(`${dockerfile} not found.`);
  // Validate both markers before writing either.
  for (const [file, pattern, description] of [
    [viteConfig, API_TARGET_LINE, "`const API_TARGET = '...';`"],
    [dockerfile, API_URL_LINE, '`ENV API_URL=...`'],
  ]) {
    const count = (tree.read(file, 'utf-8').match(pattern) ?? []).length;
    if (count !== 1) throw new Error(`Expected exactly one ${description} line in ${file}, found ${count}.`);
  }
  replaceMarker(tree, viteConfig, API_TARGET_LINE, `const API_TARGET = 'http://localhost:${port}';`, 'API_TARGET');
  replaceMarker(tree, dockerfile, API_URL_LINE, `ENV API_URL=http://${dependency}:${port}`, 'API_URL');
}

async function generator(tree, options) {
  const plan = planLink(tree, options);
  if (plan.type === 'maven') {
    linkMaven(tree, options.project, options.dependency, plan.source, plan.target);
  } else {
    linkBackend(tree, options.dependency, plan.source, plan.port);
  }
  await formatFiles(tree);
}

module.exports = generator;
module.exports.default = generator;
module.exports.planLink = planLink;
