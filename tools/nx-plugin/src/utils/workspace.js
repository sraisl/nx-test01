'use strict';

const { getProjects, joinPathFragments, names } = require('@nx/devkit');

const NAME_PATTERN = /^[a-z][a-z0-9-]{1,40}$/;
const GROUP_ID_PATTERN = /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)*$/;
const DEFAULT_GROUP_ID = 'com.example';
const FIRST_SERVICE_PORT = 8080;
const KINDS = ['kotlin-lib', 'spring-service', 'react-app'];
const VITE_CONFIG_NAMES = ['vite.config.mts', 'vite.config.ts', 'vite.config.mjs', 'vite.config.js'];
const APPLICATION_CONFIG_NAMES = ['application.yaml', 'application.yml'];

function validateName(name) {
  if (typeof name !== 'string' || !NAME_PATTERN.test(name)) {
    throw new Error(
      `Invalid project name "${name}": must match ${NAME_PATTERN} (lowercase letters, digits, dashes; 2-41 characters).`,
    );
  }
}

function validateGroupId(groupId) {
  if (typeof groupId !== 'string' || !GROUP_ID_PATTERN.test(groupId)) {
    throw new Error(`Invalid groupId "${groupId}": must match ${GROUP_ID_PATTERN}.`);
  }
}

/** Fails if a project with this name or its target directory already exists. */
function assertNameAvailable(tree, name, root) {
  if (getProjects(tree).has(name)) {
    throw new Error(`Project "${name}" already exists in the workspace.`);
  }
  if (root && tree.exists(root)) {
    throw new Error(`Directory "${root}" already exists.`);
  }
}

/** Kotlin naming derived from a project name, e.g. "order-service" -> package "com.example.orderservice". */
function kotlinNames(groupId, name) {
  const packageName = `${groupId}.${name.replace(/-/g, '')}`;
  return {
    packageName,
    packagePath: packageName.replace(/\./g, '/'),
    className: names(name).className,
  };
}

function findViteConfig(tree, root) {
  return VITE_CONFIG_NAMES.map((n) => joinPathFragments(root, n)).find((p) => tree.exists(p));
}

function findApplicationConfig(tree, root) {
  return APPLICATION_CONFIG_NAMES.map((n) => joinPathFragments(root, 'src/main/resources', n)).find((p) =>
    tree.exists(p),
  );
}

/**
 * Determines the kind of a project: tag `type:<kind>` first, otherwise heuristics
 * (projectType plus pom.xml / Spring config / Vite config). Returns null if unknown.
 */
function projectKind(tree, project) {
  const tagged = (project.tags ?? [])
    .filter((t) => t.startsWith('type:'))
    .map((t) => t.slice('type:'.length))
    .find((k) => KINDS.includes(k));
  if (tagged) return tagged;
  const root = project.root;
  const hasPom = tree.exists(joinPathFragments(root, 'pom.xml'));
  if (project.projectType === 'library') return hasPom ? 'kotlin-lib' : null;
  if (project.projectType === 'application') {
    if (findViteConfig(tree, root)) return 'react-app';
    if (hasPom || findApplicationConfig(tree, root)) return 'spring-service';
  }
  return null;
}

/** Reads `server.port` from the service's application.yaml (nested or dotted form). */
function readServicePort(tree, root) {
  const file = findApplicationConfig(tree, root);
  if (!file) return null;
  const content = tree.read(file, 'utf-8');
  const nested = /^server:[ \t]*\r?\n(?:(?:[ \t]+.*|[ \t]*)\r?\n)*?[ \t]+port:[ \t]*["']?(\d+)/m.exec(content);
  const dotted = /^server\.port:[ \t]*["']?(\d+)/m.exec(content);
  const match = nested ?? dotted;
  return match ? Number(match[1]) : null;
}

function serviceRoots(tree) {
  const roots = [];
  for (const [, project] of getProjects(tree)) {
    if (projectKind(tree, project) === 'spring-service') roots.push(project.root);
  }
  return roots;
}

function usedServicePorts(tree) {
  return new Set(
    serviceRoots(tree)
      .map((root) => readServicePort(tree, root))
      .filter((p) => p !== null),
  );
}

function firstFreeServicePort(tree) {
  const used = usedServicePorts(tree);
  let port = FIRST_SERVICE_PORT;
  while (used.has(port)) port++;
  return port;
}

/**
 * Returns the path [from, ..., to] if `to` is reachable from `from` via edges, else null.
 * `edges` is a Map<string, Iterable<string>>.
 */
function findPath(edges, from, to) {
  const seen = new Set();
  const walk = (node, path) => {
    if (node === to) return [...path, node];
    if (seen.has(node)) return null;
    seen.add(node);
    for (const next of edges.get(node) ?? []) {
      const found = walk(next, [...path, node]);
      if (found) return found;
    }
    return null;
  };
  return walk(from, []);
}

/** Map of project name -> implicitDependencies (strings only, no negations/globs). */
function implicitDependencyEdges(tree) {
  const edges = new Map();
  for (const [name, project] of getProjects(tree)) {
    edges.set(
      name,
      (project.implicitDependencies ?? []).filter((d) => typeof d === 'string' && !d.startsWith('!')),
    );
  }
  return edges;
}

/** Throws if adding project -> dependency would create a cycle in `edges`. */
function assertNoCycle(edges, project, dependency) {
  if (project === dependency) {
    throw new Error(`Project "${project}" cannot depend on itself.`);
  }
  const path = findPath(edges, dependency, project);
  if (path) {
    throw new Error(
      `Linking "${project}" -> "${dependency}" would create a cycle: ${[project, ...path].join(' -> ')}.`,
    );
  }
}

/** Splits a comma-separated option (or array) into trimmed, non-empty entries. */
function splitList(value) {
  if (value === undefined || value === null) return [];
  const items = Array.isArray(value) ? value : String(value).split(',');
  return items.map((s) => String(s).trim()).filter(Boolean);
}

module.exports = {
  DEFAULT_GROUP_ID,
  KINDS,
  NAME_PATTERN,
  assertNameAvailable,
  assertNoCycle,
  findApplicationConfig,
  findViteConfig,
  firstFreeServicePort,
  implicitDependencyEdges,
  kotlinNames,
  projectKind,
  readServicePort,
  splitList,
  usedServicePorts,
  validateGroupId,
  validateName,
};
