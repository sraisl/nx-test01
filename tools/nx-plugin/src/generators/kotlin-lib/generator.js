'use strict';

const path = require('node:path');
const { addProjectConfiguration, formatFiles, generateFiles, joinPathFragments } = require('@nx/devkit');
const {
  DEFAULT_GROUP_ID,
  assertNameAvailable,
  kotlinNames,
  validateGroupId,
  validateName,
} = require('../../utils/workspace');
const { mavenTargets } = require('../../utils/maven');

function normalizeOptions(tree, options) {
  const name = options.name;
  const groupId = options.groupId ?? DEFAULT_GROUP_ID;
  validateName(name);
  validateGroupId(groupId);
  const root = joinPathFragments('libs', name);
  assertNameAvailable(tree, name, root);
  return { name, groupId, root, ...kotlinNames(groupId, name) };
}

async function generator(tree, options) {
  const o = normalizeOptions(tree, options);
  generateFiles(tree, path.join(__dirname, 'files'), o.root, o);
  addProjectConfiguration(tree, o.name, {
    name: o.name,
    $schema: '../../node_modules/nx/schemas/project-schema.json',
    root: o.root,
    projectType: 'library',
    sourceRoot: `${o.root}/src`,
    tags: ['type:kotlin-lib'],
    targets: mavenTargets(o.root, { library: true }),
  });
  await formatFiles(tree);
}

module.exports = generator;
module.exports.default = generator;
module.exports.normalizeOptions = normalizeOptions;
