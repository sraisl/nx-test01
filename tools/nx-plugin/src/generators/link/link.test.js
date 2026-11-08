'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { addProjectConfiguration } = require('@nx/devkit');
const generator = require('./generator');
const kotlinLib = require('../kotlin-lib/generator');
const springService = require('../spring-service/generator');
const { changedPaths, createTree, readJson } = require('../../utils/test-helpers');

async function workspace() {
  const tree = createTree();
  await kotlinLib(tree, { name: 'common', groupId: 'com.acme' });
  await kotlinLib(tree, { name: 'util' });
  await springService(tree, { name: 'orders' });
  await springService(tree, { name: 'billing', port: 8090 });
  return tree;
}

/** Minimal react-app as produced by the react-app generator (only what link touches). */
function addReactApp(tree, name, { tags = ['type:react-app'] } = {}) {
  addProjectConfiguration(tree, name, { name, root: `apps/${name}`, projectType: 'application', tags });
  tree.write(
    `apps/${name}/vite.config.mts`,
    "import { defineConfig } from 'vite';\n\nconst API_TARGET = 'http://localhost:8080';\n\nexport default defineConfig({ server: { proxy: { '/api': API_TARGET } } });\n",
  );
  tree.write(`apps/${name}/Dockerfile`, 'FROM nginx\nENV API_URL=http://backend:8080\nUSER 101\n');
}

test('links a kotlin-lib into a service: pom.xml and implicitDependencies, idempotent', async () => {
  const tree = await workspace();
  await generator(tree, { project: 'orders', dependency: 'common' });
  const pom = tree.read('apps/orders/pom.xml', 'utf-8');
  assert.match(
    pom,
    /\t\t<dependency>\n\t\t\t<groupId>com\.acme<\/groupId>\n\t\t\t<artifactId>common<\/artifactId>\n\t\t\t<version>0\.0\.0-SNAPSHOT<\/version>\n\t\t<\/dependency>\n\n\t\t<dependency>\n\t\t\t<groupId>org\.springframework\.boot<\/groupId>\n\t\t\t<artifactId>spring-boot-starter-actuator-test/,
  );
  assert.deepEqual(readJson(tree, 'apps/orders/project.json').implicitDependencies, ['common']);

  await generator(tree, { project: 'orders', dependency: 'common' });
  assert.equal(tree.read('apps/orders/pom.xml', 'utf-8'), pom);
  assert.deepEqual(readJson(tree, 'apps/orders/project.json').implicitDependencies, ['common']);
});

test('links a kotlin-lib into another kotlin-lib and rejects cycles', async () => {
  const tree = await workspace();
  await generator(tree, { project: 'common', dependency: 'util' });
  assert.match(
    tree.read('libs/common/pom.xml', 'utf-8'),
    /<groupId>com\.example<\/groupId>\n\t\t\t<artifactId>util<\/artifactId>/,
  );
  assert.deepEqual(readJson(tree, 'libs/common/project.json').implicitDependencies, ['util']);
  const before = changedPaths(tree);
  const utilPom = tree.read('libs/util/pom.xml', 'utf-8');
  await assert.rejects(generator(tree, { project: 'util', dependency: 'common' }), /cycle: util -> common -> util/);
  await assert.rejects(generator(tree, { project: 'util', dependency: 'util' }), /itself/);
  assert.equal(tree.read('libs/util/pom.xml', 'utf-8'), utilPom);
  assert.deepEqual(changedPaths(tree), before);
});

test('links a spring-service as backend of a react-app', async () => {
  const tree = await workspace();
  addReactApp(tree, 'web');
  await generator(tree, { project: 'web', dependency: 'billing' });
  const vite = tree.read('apps/web/vite.config.mts', 'utf-8');
  assert.equal(vite.match(/^const API_TARGET = 'http:\/\/localhost:8090';$/gm).length, 1);
  const dockerfile = tree.read('apps/web/Dockerfile', 'utf-8');
  assert.equal(dockerfile.match(/^ENV API_URL=http:\/\/billing:8090$/gm).length, 1);
  assert.equal(readJson(tree, 'apps/web/project.json').implicitDependencies, undefined);

  // Re-linking to another backend rewrites the marker lines.
  await generator(tree, { project: 'web', dependency: 'orders' });
  assert.match(tree.read('apps/web/vite.config.mts', 'utf-8'), /^const API_TARGET = 'http:\/\/localhost:8080';$/m);
  assert.match(tree.read('apps/web/Dockerfile', 'utf-8'), /^ENV API_URL=http:\/\/orders:8080$/m);
});

test('detects untagged projects by their files', async () => {
  const tree = createTree();
  addReactApp(tree, 'web', { tags: [] });
  tree.write('apps/orders/project.json', JSON.stringify({ name: 'orders', projectType: 'application' }));
  tree.write('apps/orders/src/main/resources/application.yaml', 'server:\n  port: 8081\n');
  await generator(tree, { project: 'web', dependency: 'orders' });
  assert.match(tree.read('apps/web/Dockerfile', 'utf-8'), /^ENV API_URL=http:\/\/orders:8081$/m);
});

test('rejects unsupported combinations and unknown projects', async () => {
  const tree = await workspace();
  addReactApp(tree, 'web');
  const before = changedPaths(tree);
  await assert.rejects(
    generator(tree, { project: 'orders', dependency: 'billing' }),
    /Cannot link spring-service "orders" to spring-service "billing"/,
  );
  await assert.rejects(generator(tree, { project: 'common', dependency: 'orders' }), /Cannot link kotlin-lib/);
  await assert.rejects(generator(tree, { project: 'web', dependency: 'common' }), /Cannot link react-app/);
  await assert.rejects(generator(tree, { project: 'orders', dependency: 'web' }), /Cannot link/);
  await assert.rejects(generator(tree, { project: 'nope', dependency: 'common' }), /Project "nope" does not exist/);
  await assert.rejects(generator(tree, { project: 'orders', dependency: 'nope' }), /Dependency "nope" does not exist/);
  assert.deepEqual(changedPaths(tree), before);
});

test('rejects a react-app without exactly one marker line', async () => {
  const tree = await workspace();
  addReactApp(tree, 'web');
  tree.write('apps/web/Dockerfile', 'FROM nginx\n');
  const vite = tree.read('apps/web/vite.config.mts', 'utf-8');
  await assert.rejects(generator(tree, { project: 'web', dependency: 'orders' }), /exactly one `ENV API_URL=...` line/);
  assert.equal(tree.read('apps/web/vite.config.mts', 'utf-8'), vite);
});
