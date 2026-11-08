'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { addProjectConfiguration } = require('@nx/devkit');
const { changedPaths, createTree, readJson } = require('../../utils/test-helpers');

// Replace the react-app generator (slow, runs @nx/react) with a stub that creates the marker files.
const reactPath = path.join(__dirname, '..', 'react-app', 'generator.js');
const hasReact = fs.existsSync(reactPath);
const reactCalls = [];
if (hasReact) {
  const stub = async (tree, options) => {
    reactCalls.push(options);
    const root = `apps/${options.name}`;
    addProjectConfiguration(tree, options.name, {
      name: options.name,
      root,
      projectType: 'application',
      tags: ['type:react-app'],
    });
    tree.write(`${root}/vite.config.mts`, "const API_TARGET = 'http://localhost:8080';\n");
    tree.write(`${root}/Dockerfile`, 'ENV API_URL=http://backend:8080\n');
    return () => undefined; // no install task in the stub
  };
  require.cache[reactPath] = { id: reactPath, filename: reactPath, loaded: true, exports: stub };
}

const generator = require('./generator');

test('creates libs and services and links them', async () => {
  const tree = createTree();
  await generator(tree, {
    services: 'spring-service:orders,kotlin-lib:common,spring-service:billing',
    links: 'orders:common,billing:common',
    groupId: 'com.acme',
  });
  assert.ok(tree.exists('libs/common/pom.xml'));
  assert.match(tree.read('apps/orders/src/main/resources/application.yaml', 'utf-8'), /port: 8080/);
  assert.match(tree.read('apps/billing/src/main/resources/application.yaml', 'utf-8'), /port: 8081/);
  for (const name of ['orders', 'billing']) {
    assert.deepEqual(readJson(tree, `apps/${name}/project.json`).implicitDependencies, ['common']);
    assert.match(
      tree.read(`apps/${name}/pom.xml`, 'utf-8'),
      /<groupId>com\.acme<\/groupId>\n\t\t\t<artifactId>common<\/artifactId>/,
    );
  }
});

test('adds to an existing workspace', async () => {
  const tree = createTree();
  await generator(tree, { services: 'kotlin-lib:common,spring-service:orders' });
  await generator(tree, { services: 'spring-service:billing,kotlin-lib:util', links: 'billing:common,common:util' });
  assert.match(tree.read('apps/billing/src/main/resources/application.yaml', 'utf-8'), /port: 8081/);
  assert.deepEqual(readJson(tree, 'libs/common/project.json').implicitDependencies, ['util']);
});

test('validates everything before writing', async () => {
  const tree = createTree();
  await generator(tree, { services: 'kotlin-lib:common,spring-service:orders', links: 'orders:common' });
  const before = changedPaths(tree);
  const cases = [
    [{ services: 'kotlin-lib:x1,spring-service:x1' }, /Duplicate project name "x1"/],
    [{ services: 'kotlin-lib:x1,spring-service:orders' }, /"orders" already exists/],
    [{ services: 'go-service:x1' }, /Unknown project type "go-service"/],
    [{ services: 'kotlin-lib:X1' }, /Invalid project name/],
    [{ services: 'kotlin-lib' }, /Invalid services entry/],
    [{ services: '' }, /at least one/],
    [{ services: 'kotlin-lib:x1', links: 'x1:nope' }, /Unknown project "nope"/],
    [{ services: 'kotlin-lib:x1', links: 'x1' }, /Invalid links entry/],
    [
      { services: 'kotlin-lib:x1', links: 'common:orders' },
      /Cannot link kotlin-lib "common" to spring-service "orders"/,
    ],
    [{ services: 'kotlin-lib:x1,kotlin-lib:x2', links: 'x1:x2,x2:x1' }, /cycle: x2 -> x1 -> x2/],
    [{ services: 'kotlin-lib:x1', links: 'common:x1,x1:common' }, /cycle/],
    [{ services: 'kotlin-lib:x1', groupId: 'Bad' }, /Invalid groupId/],
  ];
  for (const [options, error] of cases) {
    await assert.rejects(generator(tree, options), error);
    assert.deepEqual(changedPaths(tree), before, `wrote files for ${JSON.stringify(options)}`);
  }
});

test('creates react apps after services and links their backend', { skip: !hasReact }, async () => {
  const tree = createTree();
  await generator(tree, {
    services: 'react-app:web,spring-service:orders,spring-service:billing',
    links: 'web:billing',
  });
  assert.deepEqual(reactCalls.at(-1), { name: 'web' });
  assert.match(tree.read('apps/web/vite.config.mts', 'utf-8'), /'http:\/\/localhost:8081'/);
  assert.match(tree.read('apps/web/Dockerfile', 'utf-8'), /^ENV API_URL=http:\/\/billing:8081$/m);
  assert.equal(readJson(tree, 'apps/web/project.json').implicitDependencies, undefined);

  const before = changedPaths(tree);
  await assert.rejects(
    generator(tree, { services: 'react-app:shop', links: 'shop:orders,shop:billing' }),
    /only have one backend/,
  );
  await assert.rejects(
    generator(tree, { services: 'kotlin-lib:x1', links: 'orders:web' }),
    /Cannot link spring-service "orders" to react-app "web"/,
  );
  assert.deepEqual(changedPaths(tree), before);
});
