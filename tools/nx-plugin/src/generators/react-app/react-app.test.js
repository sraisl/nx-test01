'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { readProjectConfiguration } = require('@nx/devkit');
const generator = require('./generator');
const { createTree } = require('../../utils/test-helpers');

const hasLink = fs.existsSync(path.join(__dirname, '..', 'link', 'generator.js'));

test('generates react app with image, docker files and vite config', { timeout: 120000 }, async () => {
  const tree = createTree();
  await generator(tree, { name: 'web' });

  const project = readProjectConfiguration(tree, 'web');
  assert.equal(project.name, 'web');
  assert.equal(project.projectType, 'application');
  assert.ok(project.tags.includes('type:react-app'));
  assert.match(
    project.targets.image.options.command,
    /docker build -f apps\/web\/Dockerfile -t "\$\{IMAGE_NAME:-web:local\}" \./,
  );
  assert.ok(project.targets.test.outputs.includes('{projectRoot}/test-results'));

  const dockerfile = tree.read('apps/web/Dockerfile', 'utf-8');
  assert.equal(dockerfile.match(/^ENV API_URL=http:\/\/backend:8080$/gm).length, 1);
  assert.match(dockerfile, /COPY dist\/apps\/web /);
  assert.match(dockerfile, /USER 101/);
  assert.match(tree.read('apps/web/Dockerfile.dockerignore', 'utf-8'), /!dist\/apps\/web\//);
  assert.match(tree.read('apps/web/nginx/default.conf.template', 'utf-8'), /\$\{API_URL\}/);

  const vite = tree.read('apps/web/vite.config.mts', 'utf-8');
  assert.equal(vite.match(/^const API_TARGET = 'http:\/\/localhost:8080';$/gm).length, 1);
  assert.match(vite, /port: 4200/);
  assert.match(vite, /test-results\/junit\.xml/);
});

test('picks the next free port and honours an explicit one', { timeout: 120000 }, async () => {
  const tree = createTree();
  await generator(tree, { name: 'web' });
  await generator(tree, { name: 'admin' });
  assert.match(tree.read('apps/admin/vite.config.mts', 'utf-8'), /port: 4201/);
  await generator(tree, { name: 'shop', port: 4300 });
  assert.match(tree.read('apps/shop/vite.config.mts', 'utf-8'), /port: 4300/);
});

test('rejects invalid and duplicate names', { timeout: 120000 }, async () => {
  const tree = createTree();
  await assert.rejects(generator(tree, { name: 'Web' }), /Invalid project name/);
  await generator(tree, { name: 'web' });
  await assert.rejects(generator(tree, { name: 'web' }), /already exists/);
});

test('rejects unknown backend', { timeout: 120000 }, async () => {
  const tree = createTree();
  await assert.rejects(generator(tree, { name: 'web', backend: 'nope' }), /Backend "nope"/);
});

test('links the backend when given', { timeout: 120000, skip: !hasLink }, async () => {
  const tree = createTree();
  tree.write(
    'apps/orders/project.json',
    JSON.stringify({ name: 'orders', projectType: 'application', root: 'apps/orders' }),
  );
  tree.write('apps/orders/src/main/resources/application.yaml', 'server:\n  port: 8081\n');
  await generator(tree, { name: 'web', backend: 'orders' });
  assert.match(tree.read('apps/web/vite.config.mts', 'utf-8'), /const API_TARGET = 'http:\/\/localhost:8081';/);
  assert.match(tree.read('apps/web/Dockerfile', 'utf-8'), /^ENV API_URL=http:\/\/orders:8081$/m);
});
