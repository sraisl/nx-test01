'use strict';

const path = require('node:path');
const { addProjectConfiguration, formatFiles, generateFiles, getProjects, joinPathFragments } = require('@nx/devkit');
const {
  DEFAULT_GROUP_ID,
  assertNameAvailable,
  firstFreeServicePort,
  kotlinNames,
  projectKind,
  splitList,
  usedServicePorts,
  validateGroupId,
  validateName,
} = require('../../utils/workspace');
const { mavenTargets } = require('../../utils/maven');
const link = require('../link/generator');

function normalizeOptions(tree, options) {
  const name = options.name;
  const groupId = options.groupId ?? DEFAULT_GROUP_ID;
  validateName(name);
  validateGroupId(groupId);
  const root = joinPathFragments('apps', name);
  assertNameAvailable(tree, name, root);

  let port;
  if (options.port === undefined || options.port === null || options.port === '') {
    port = firstFreeServicePort(tree);
  } else {
    port = Number(options.port);
    if (!Number.isInteger(port) || port < 1024 || port > 65535) {
      throw new Error(`Invalid port "${options.port}": must be an integer between 1024 and 65535.`);
    }
    if (usedServicePorts(tree).has(port)) {
      throw new Error(`Port ${port} is already used by another spring-service.`);
    }
  }

  const libs = [...new Set(splitList(options.libs))];
  const projects = getProjects(tree);
  for (const lib of libs) {
    const project = projects.get(lib);
    if (!project) throw new Error(`Library "${lib}" does not exist.`);
    const kind = projectKind(tree, project);
    if (kind !== 'kotlin-lib') {
      throw new Error(`"${lib}" is a ${kind ?? 'project of unknown kind'}, not a kotlin-lib.`);
    }
  }

  return { name, groupId, root, port, libs, ...kotlinNames(groupId, name) };
}

async function generator(tree, options) {
  const o = normalizeOptions(tree, options);
  generateFiles(tree, path.join(__dirname, 'files'), o.root, o);
  addProjectConfiguration(tree, o.name, {
    name: o.name,
    $schema: '../../node_modules/nx/schemas/project-schema.json',
    root: o.root,
    projectType: 'application',
    sourceRoot: `${o.root}/src`,
    tags: ['type:spring-service'],
    targets: mavenTargets(o.root, { name: o.name }),
  });
  for (const lib of o.libs) {
    await link(tree, { project: o.name, dependency: lib });
  }
  await formatFiles(tree);
}

module.exports = generator;
module.exports.default = generator;
module.exports.normalizeOptions = normalizeOptions;
