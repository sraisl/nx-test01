'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { addDependency, hasDependency, readArtifactId, readGroupId } = require('./pom');

const POM = `<?xml version="1.0" encoding="UTF-8"?>
<project>
\t<parent>
\t\t<groupId>org.springframework.boot</groupId>
\t\t<artifactId>spring-boot-starter-parent</artifactId>
\t</parent>
\t<groupId>com.acme</groupId>
\t<artifactId>orders</artifactId>
\t<dependencies>
\t\t<dependency>
\t\t\t<groupId>a</groupId>
\t\t\t<artifactId>b</artifactId>
\t\t</dependency>

\t\t<dependency>
\t\t\t<groupId>t</groupId>
\t\t\t<artifactId>t</artifactId>
\t\t\t<scope>test</scope>
\t\t</dependency>
\t</dependencies>
\t<build>
\t\t<plugins>
\t\t\t<plugin>
\t\t\t\t<dependencies>
\t\t\t\t\t<dependency><groupId>com.acme</groupId><artifactId>common</artifactId></dependency>
\t\t\t\t</dependencies>
\t\t\t</plugin>
\t\t</plugins>
\t</build>
</project>
`;

test('reads own groupId and artifactId, not the parent ones', () => {
  assert.equal(readGroupId(POM), 'com.acme');
  assert.equal(readArtifactId(POM), 'orders');
});

test('adds a dependency before test dependencies with matching indentation, idempotently', () => {
  assert.equal(hasDependency(POM, 'com.acme', 'common'), false, 'plugin dependencies are ignored');
  const dep = { groupId: 'com.acme', artifactId: 'common', version: '0.0.0-SNAPSHOT' };
  const once = addDependency(POM, dep);
  assert.ok(
    once.includes(
      '\t\t</dependency>\n\t\t<dependency>\n\t\t\t<groupId>com.acme</groupId>\n\t\t\t<artifactId>common</artifactId>\n\t\t\t<version>0.0.0-SNAPSHOT</version>\n\t\t</dependency>\n\n\t\t<dependency>\n\t\t\t<groupId>t</groupId>',
    ),
    once,
  );
  assert.equal(addDependency(once, dep), once);
  assert.equal(hasDependency(once, 'com.acme', 'common'), true);
});

test('creates <dependencies> when missing (outside dependencyManagement)', () => {
  const xml =
    '<project>\n  <artifactId>x</artifactId>\n  <dependencyManagement>\n    <dependencies>\n    </dependencies>\n  </dependencyManagement>\n  <build>\n  </build>\n</project>\n';
  const out = addDependency(xml, { groupId: 'g', artifactId: 'a' });
  assert.match(out, /<\/dependencyManagement>\n {2}<dependencies>\n {4}<dependency>\n {6}<groupId>g<\/groupId>/);
  assert.match(out, /<\/dependencies>\n\n {2}<build>/);
});
