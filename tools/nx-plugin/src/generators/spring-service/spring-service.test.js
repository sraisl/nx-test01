'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const generator = require('./generator');
const kotlinLib = require('../kotlin-lib/generator');
const { changedPaths, createTree, readJson } = require('../../utils/test-helpers');

test('creates a Spring Boot service like demo-service', async () => {
  const tree = createTree();
  await generator(tree, { name: 'order-service' });

  const pom = tree.read('apps/order-service/pom.xml', 'utf-8');
  assert.match(pom, /<artifactId>spring-boot-starter-parent<\/artifactId>\n\t\t<version>4\.1\.2<\/version>/);
  assert.match(pom, /<artifactId>order-service<\/artifactId>\n\t<version>0\.0\.0-SNAPSHOT<\/version>/);
  assert.match(pom, /<kotlin\.version>2\.3\.21<\/kotlin\.version>/);
  assert.match(pom, /spring-boot-starter-webmvc</);
  assert.match(pom, /spring-boot-starter-actuator</);

  const base = 'apps/order-service/src';
  assert.ok(tree.exists(`${base}/main/kotlin/com/example/orderservice/OrderServiceApplication.kt`));
  assert.match(
    tree.read(`${base}/main/kotlin/com/example/orderservice/HelloController.kt`, 'utf-8'),
    /@GetMapping\("\/api\/order-service\/hello"\)/,
  );
  assert.match(
    tree.read(`${base}/test/kotlin/com/example/orderservice/OrderServiceApplicationTests.kt`, 'utf-8'),
    /@SpringBootTest/,
  );
  const yaml = tree.read(`${base}/main/resources/application.yaml`, 'utf-8');
  assert.match(yaml, /name: order-service/);
  assert.match(yaml, /port: 8080/);

  const project = readJson(tree, 'apps/order-service/project.json');
  assert.equal(project.projectType, 'application');
  assert.equal(project.name, 'order-service');
  assert.deepEqual(project.tags, ['type:spring-service']);
  assert.equal(project.targets.build.options.command, './mvnw -B -f apps/order-service/pom.xml package -DskipTests');
  assert.equal(project.targets.build.cache, undefined);
  assert.equal(project.targets.test.options.command, './mvnw -B -f apps/order-service/pom.xml verify');
  assert.equal(
    project.targets.image.options.command,
    './mvnw -B -f apps/order-service/pom.xml spring-boot:build-image -DskipTests -Dspring-boot.build-image.imageName="${IMAGE_NAME:-order-service:local}"',
  );
  assert.equal(project.targets.serve.continuous, true);
  assert.equal(project.targets.serve.options.command, './mvnw -B -f apps/order-service/pom.xml spring-boot:run');
});

test('picks the first free port and validates explicit ports', async () => {
  const tree = createTree();
  await generator(tree, { name: 'orders' });
  await generator(tree, { name: 'billing', port: 8082 });
  await generator(tree, { name: 'stock' });
  assert.match(tree.read('apps/billing/src/main/resources/application.yaml', 'utf-8'), /port: 8082/);
  assert.match(tree.read('apps/stock/src/main/resources/application.yaml', 'utf-8'), /port: 8081/);
  await assert.rejects(generator(tree, { name: 'other', port: 8082 }), /already used/);
  await assert.rejects(generator(tree, { name: 'other', port: 80 }), /Invalid port/);
});

test('links libs given in "libs"', async () => {
  const tree = createTree();
  await kotlinLib(tree, { name: 'common' });
  await kotlinLib(tree, { name: 'util' });
  await generator(tree, { name: 'orders', libs: 'common, util' });
  assert.deepEqual(readJson(tree, 'apps/orders/project.json').implicitDependencies, ['common', 'util']);
  const pom = tree.read('apps/orders/pom.xml', 'utf-8');
  assert.match(pom, /<artifactId>common<\/artifactId>\n\t\t\t<version>0\.0\.0-SNAPSHOT<\/version>/);
  assert.match(pom, /<artifactId>util<\/artifactId>/);
});

test('rejects unknown libs and duplicates without writing', async () => {
  const tree = createTree();
  await generator(tree, { name: 'orders' });
  const before = changedPaths(tree);
  await assert.rejects(generator(tree, { name: 'billing', libs: 'nope' }), /Library "nope" does not exist/);
  await assert.rejects(generator(tree, { name: 'billing', libs: 'orders' }), /not a kotlin-lib/);
  await assert.rejects(generator(tree, { name: 'orders' }), /already exists/);
  assert.deepEqual(changedPaths(tree), before);
});
