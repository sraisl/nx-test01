'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const generator = require('./generator');
const { changedPaths, createTree, readJson } = require('../../utils/test-helpers');

test('creates a Kotlin library with explicit Maven targets', async () => {
  const tree = createTree();
  await generator(tree, { name: 'common-utils', groupId: 'com.acme' });

  const pom = tree.read('libs/common-utils/pom.xml', 'utf-8');
  assert.match(
    pom,
    /<groupId>com\.acme<\/groupId>\n\t<artifactId>common-utils<\/artifactId>\n\t<version>0\.0\.0-SNAPSHOT<\/version>/,
  );
  assert.match(pom, /<java\.version>25<\/java\.version>/);
  assert.match(pom, /<artifactId>spring-boot-dependencies<\/artifactId>\n\t\t\t\t<version>\$\{spring-boot\.version\}/);
  assert.match(pom, /<spring-boot\.version>4\.1\.2<\/spring-boot\.version>/);
  assert.match(pom, /<artifactId>kotlin-test-junit5<\/artifactId>/);
  assert.doesNotMatch(pom, /spring-boot-maven-plugin/);
  assert.ok(tree.exists('libs/common-utils/src/main/kotlin/com/acme/commonutils/CommonUtilsGreeter.kt'));
  assert.match(
    tree.read('libs/common-utils/src/test/kotlin/com/acme/commonutils/CommonUtilsGreeterTests.kt', 'utf-8'),
    /^package com\.acme\.commonutils$/m,
  );

  const project = readJson(tree, 'libs/common-utils/project.json');
  assert.equal(project.name, 'common-utils');
  assert.equal(project.projectType, 'library');
  assert.equal(project.sourceRoot, 'libs/common-utils/src');
  assert.ok(project.$schema);
  assert.deepEqual(project.tags, ['type:kotlin-lib']);
  assert.equal(project.targets.build.options.command, './mvnw -B -f libs/common-utils/pom.xml install -DskipTests');
  assert.equal(project.targets.build.cache, false);
  assert.deepEqual(project.targets.build.inputs, ['production', '^production']);
  assert.deepEqual(project.targets.build.outputs, ['{projectRoot}/target']);
  assert.equal(project.targets.test.options.command, './mvnw -B -f libs/common-utils/pom.xml verify');
  assert.deepEqual(project.targets.test.inputs, ['default', '^production']);
  assert.equal(project.targets.image, undefined);
});

test('defaults groupId to com.example', async () => {
  const tree = createTree();
  await generator(tree, { name: 'common' });
  assert.ok(tree.exists('libs/common/src/main/kotlin/com/example/common/CommonGreeter.kt'));
});

test('rejects invalid and duplicate names without writing', async () => {
  const tree = createTree();
  await generator(tree, { name: 'common' });
  const before = changedPaths(tree);
  await assert.rejects(generator(tree, { name: 'common' }), /already exists/);
  await assert.rejects(generator(tree, { name: 'Bad_Name' }), /Invalid project name/);
  await assert.rejects(generator(tree, { name: 'ok', groupId: 'Com..x' }), /Invalid groupId/);
  assert.deepEqual(changedPaths(tree), before);
});
