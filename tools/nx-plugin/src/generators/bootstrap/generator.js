'use strict';

const { getProjects, joinPathFragments, runTasksInSerial } = require('@nx/devkit');
const {
  DEFAULT_GROUP_ID,
  KINDS,
  assertNoCycle,
  implicitDependencyEdges,
  projectKind,
  splitList,
  validateGroupId,
  validateName,
} = require('../../utils/workspace');

const ROOT_DIR = { 'kotlin-lib': 'libs', 'spring-service': 'apps', 'react-app': 'apps' };
const MAVEN_KINDS = ['spring-service', 'kotlin-lib'];

function parsePair(entry, what, example) {
  const parts = entry.split(':').map((s) => s.trim());
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new Error(`Invalid ${what} entry "${entry}": expected ${example}.`);
  }
  return parts;
}

function loadReactGenerator() {
  try {
    const mod = require('../react-app/generator');
    return mod.default ?? mod;
  } catch (e) {
    throw new Error(`react-app generator is not available: ${e.message}`);
  }
}

/** Validates the complete input against the workspace; throws before anything is written. */
function plan(tree, options) {
  const groupId = options.groupId ?? DEFAULT_GROUP_ID;
  validateGroupId(groupId);

  const entries = splitList(options.services);
  if (entries.length === 0) throw new Error('Option "services" must contain at least one <type>:<name>.');

  const existing = getProjects(tree);
  const kinds = new Map(); // name -> kind (existing and planned)
  for (const [name, project] of existing) kinds.set(name, projectKind(tree, project));

  const services = [];
  const seen = new Set();
  for (const entry of entries) {
    const [type, name] = parsePair(entry, 'services', '<type>:<name>, e.g. spring-service:orders');
    if (!KINDS.includes(type)) {
      throw new Error(`Unknown project type "${type}" in "${entry}": expected one of ${KINDS.join(', ')}.`);
    }
    validateName(name);
    if (seen.has(name)) throw new Error(`Duplicate project name "${name}" in services.`);
    seen.add(name);
    if (existing.has(name)) throw new Error(`Project "${name}" already exists in the workspace.`);
    const root = joinPathFragments(ROOT_DIR[type], name);
    if (tree.exists(root)) throw new Error(`Directory "${root}" already exists.`);
    services.push({ type, name });
    kinds.set(name, type);
  }

  const edges = implicitDependencyEdges(tree);
  const links = [];
  const linkKeys = new Set();
  const backends = new Map();
  for (const entry of splitList(options.links)) {
    const [project, dependency] = parsePair(entry, 'links', '<project>:<dependency>, e.g. orders:common');
    for (const n of [project, dependency]) {
      if (!kinds.has(n)) throw new Error(`Unknown project "${n}" in link "${entry}".`);
    }
    if (linkKeys.has(`${project}:${dependency}`)) continue;
    linkKeys.add(`${project}:${dependency}`);
    const sourceKind = kinds.get(project);
    const targetKind = kinds.get(dependency);
    if (MAVEN_KINDS.includes(sourceKind) && targetKind === 'kotlin-lib') {
      assertNoCycle(edges, project, dependency);
      edges.set(project, [...(edges.get(project) ?? []), dependency]);
    } else if (sourceKind === 'react-app' && targetKind === 'spring-service') {
      if (backends.has(project)) {
        throw new Error(
          `react-app "${project}" can only have one backend (got "${backends.get(project)}" and "${dependency}").`,
        );
      }
      backends.set(project, dependency);
    } else {
      throw new Error(
        `Cannot link ${sourceKind ?? 'unknown'} "${project}" to ${targetKind ?? 'unknown'} "${dependency}": ` +
          'supported are spring-service/kotlin-lib -> kotlin-lib and react-app -> spring-service.',
      );
    }
    links.push({ project, dependency });
  }

  const reactGenerator = services.some((s) => s.type === 'react-app') ? loadReactGenerator() : null;
  return { groupId, services, links, reactGenerator };
}

async function generator(tree, options) {
  const p = plan(tree, options);
  const kotlinLib = require('../kotlin-lib/generator');
  const springService = require('../spring-service/generator');
  const link = require('../link/generator');
  const tasks = [];

  for (const type of KINDS) {
    for (const s of p.services.filter((x) => x.type === type)) {
      if (type === 'kotlin-lib') await kotlinLib(tree, { name: s.name, groupId: p.groupId });
      if (type === 'spring-service') await springService(tree, { name: s.name, groupId: p.groupId });
      if (type === 'react-app') {
        const task = await p.reactGenerator(tree, { name: s.name });
        if (typeof task === 'function') tasks.push(task);
      }
    }
  }
  for (const l of p.links) {
    await link(tree, l);
  }
  return runTasksInSerial(...tasks);
}

module.exports = generator;
module.exports.default = generator;
module.exports.plan = plan;
