'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { assertNoCycle, readServicePort, validateName } = require('./workspace');
const { createTree } = require('./test-helpers');

test('validates names', () => {
  assert.doesNotThrow(() => validateName('orders-v2'));
  for (const bad of ['a', 'Orders', '1abc', 'a_b', undefined]) {
    assert.throws(() => validateName(bad), /Invalid project name/);
  }
});

test('reads server.port in nested and dotted form', () => {
  const tree = createTree();
  tree.write(
    'apps/a/src/main/resources/application.yaml',
    'spring:\n  application:\n    name: a\n\nserver:\n  address: 0.0.0.0\n  port: 8085\n',
  );
  tree.write('apps/b/src/main/resources/application.yml', 'server.port: 9000\n');
  assert.equal(readServicePort(tree, 'apps/a'), 8085);
  assert.equal(readServicePort(tree, 'apps/b'), 9000);
  assert.equal(readServicePort(tree, 'apps/c'), null);
});

test('detects cycles', () => {
  const edges = new Map([
    ['a', ['b']],
    ['b', ['c']],
  ]);
  assert.doesNotThrow(() => assertNoCycle(edges, 'a', 'c'));
  assert.throws(() => assertNoCycle(edges, 'c', 'a'), /cycle: c -> a -> b -> c/);
  assert.throws(() => assertNoCycle(edges, 'a', 'a'), /itself/);
});
