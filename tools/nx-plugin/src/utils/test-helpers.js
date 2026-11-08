'use strict';

/** Test helpers shared by generator tests (not used at runtime). */

const { createTreeWithEmptyWorkspace } = require('@nx/devkit/testing');

/**
 * Empty virtual workspace with the repository's Prettier config, so that formatFiles uses
 * Prettier (as in the real workspace) instead of oxfmt (the default of Nx 24's test workspace).
 */
function createTree() {
  const tree = createTreeWithEmptyWorkspace();
  // Nx 24's empty test workspace ships an oxfmt config; this repository uses Prettier.
  tree.delete('.oxfmtrc.json');
  tree.write('.prettierrc', JSON.stringify({ singleQuote: true, printWidth: 120 }));
  return tree;
}

function readJson(tree, file) {
  return JSON.parse(tree.read(file, 'utf-8'));
}

/** Snapshot of all changed paths in a tree, to assert that a failing generator wrote nothing. */
function changedPaths(tree) {
  return tree
    .listChanges()
    .map((c) => `${c.type}:${c.path}`)
    .sort();
}

module.exports = { changedPaths, createTree, readJson };
