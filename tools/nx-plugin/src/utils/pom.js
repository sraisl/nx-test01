'use strict';

/**
 * Minimal, dependency-free pom.xml helpers (string based, no XML parser).
 * Only top-level <dependencies> of the project are touched; <dependencyManagement>
 * and plugin <dependencies> are skipped.
 */

/** Removes nested blocks whose dependencies must not be considered top-level. */
function maskNested(xml) {
  return xml.replace(/<(dependencyManagement|build|profiles|parent|reporting)>[\s\S]*?<\/\1>/g, (block) =>
    ' '.repeat(block.length),
  );
}

function stripComments(xml) {
  return xml.replace(/<!--[\s\S]*?-->/g, (c) => ' '.repeat(c.length));
}

/** Returns the project's own groupId (falls back to the parent's) or null. */
function readGroupId(xml) {
  const clean = stripComments(xml);
  const own = /<groupId>\s*([^<\s]+)\s*<\/groupId>/.exec(
    maskNested(clean).replace(/<dependencies>[\s\S]*?<\/dependencies>/g, ''),
  );
  if (own) return own[1];
  const parent = /<parent>[\s\S]*?<groupId>\s*([^<\s]+)\s*<\/groupId>[\s\S]*?<\/parent>/.exec(clean);
  return parent ? parent[1] : null;
}

function readArtifactId(xml) {
  const clean = maskNested(stripComments(xml)).replace(/<dependencies>[\s\S]*?<\/dependencies>/g, '');
  const match = /<artifactId>\s*([^<\s]+)\s*<\/artifactId>/.exec(clean);
  return match ? match[1] : null;
}

/** Index range of the top-level <dependencies> block, or null. */
function findDependenciesBlock(xml) {
  const masked = maskNested(stripComments(xml));
  const start = masked.indexOf('<dependencies>');
  if (start === -1) return null;
  const end = masked.indexOf('</dependencies>', start);
  if (end === -1) throw new Error('Malformed pom.xml: unclosed <dependencies>.');
  return { start, end };
}

function hasDependency(xml, groupId, artifactId) {
  const block = findDependenciesBlock(xml);
  if (!block) return false;
  const body = stripComments(xml).slice(block.start, block.end);
  const deps = body.match(/<dependency>[\s\S]*?<\/dependency>/g) ?? [];
  return deps.some(
    (d) =>
      new RegExp(`<groupId>\\s*${escape(groupId)}\\s*</groupId>`).test(d) &&
      new RegExp(`<artifactId>\\s*${escape(artifactId)}\\s*</artifactId>`).test(d),
  );
}

function escape(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Indentation unit used in the file (tab or spaces), derived from the first indented line. */
function indentUnit(xml) {
  const match = /^([ \t]+)</m.exec(xml);
  return match ? (match[1].startsWith('\t') ? '\t' : match[1]) : '\t';
}

function lineIndent(xml, index) {
  const lineStart = xml.lastIndexOf('\n', index) + 1;
  return /^[ \t]*/.exec(xml.slice(lineStart))[0];
}

/**
 * Adds a dependency to the top-level <dependencies> (created if missing). Idempotent.
 * Inserted before the first test-scoped dependency (keeps compile deps grouped), otherwise at the end.
 */
function addDependency(xml, { groupId, artifactId, version, scope }) {
  if (hasDependency(xml, groupId, artifactId)) return xml;
  const unit = indentUnit(xml);
  let block = findDependenciesBlock(xml);
  if (!block) {
    // Only top-level <build> counts as anchor (not one inside <profiles>).
    const masked = stripComments(xml).replace(
      /<(dependencyManagement|profiles|parent|reporting)>[\s\S]*?<\/\1>/g,
      (b) => ' '.repeat(b.length),
    );
    const anchor = ['<build>', '</project>'].map((tag) => masked.indexOf(tag)).find((i) => i !== -1);
    if (anchor === undefined) throw new Error('Malformed pom.xml: no </project>.');
    const outer = lineIndent(xml, anchor) || unit;
    const lineStart = xml.lastIndexOf('\n', anchor) + 1;
    xml = `${xml.slice(0, lineStart)}${outer}<dependencies>\n${outer}</dependencies>\n\n${xml.slice(lineStart)}`;
    block = findDependenciesBlock(xml);
  }
  const outer = lineIndent(xml, block.start);
  const depIndent = outer + unit;
  const inner = depIndent + unit;
  const lines = [
    `${depIndent}<dependency>`,
    `${inner}<groupId>${groupId}</groupId>`,
    `${inner}<artifactId>${artifactId}</artifactId>`,
    ...(version ? [`${inner}<version>${version}</version>`] : []),
    ...(scope ? [`${inner}<scope>${scope}</scope>`] : []),
    `${depIndent}</dependency>`,
  ];
  const snippet = lines.join('\n') + '\n';

  // Insert before the first test-scoped dependency, or before </dependencies>.
  const body = xml.slice(block.start, block.end);
  const deps = [...body.matchAll(/<dependency>[\s\S]*?<\/dependency>/g)];
  const firstTest = deps.find((m) => /<scope>\s*test\s*<\/scope>/.test(m[0]));
  let insertAt;
  if (firstTest) {
    insertAt = xml.lastIndexOf('\n', block.start + firstTest.index) + 1;
    // Skip back over a blank separator line so the new dependency joins the compile group.
    const prevLineEnd = insertAt - 1;
    const prevLineStart = xml.lastIndexOf('\n', prevLineEnd - 1) + 1;
    if (xml.slice(prevLineStart, prevLineEnd).trim() === '') insertAt = prevLineStart;
  } else {
    insertAt = xml.lastIndexOf('\n', block.end) + 1;
  }
  return xml.slice(0, insertAt) + snippet + xml.slice(insertAt);
}

module.exports = { addDependency, hasDependency, readArtifactId, readGroupId };
