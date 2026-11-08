'use strict';

const path = require('node:path');
const {
  formatFiles,
  generateFiles,
  getProjects,
  joinPathFragments,
  readProjectConfiguration,
  runTasksInSerial,
  updateProjectConfiguration,
} = require('@nx/devkit');
const { applicationGenerator } = require('@nx/react');

const NAME_PATTERN = /^[a-z][a-z0-9-]{1,40}$/;
const FIRST_PORT = 4200;
const PREVIEW_PORT_OFFSET = 100;
const VITE_CONFIG_NAMES = ['vite.config.mts', 'vite.config.ts', 'vite.config.mjs', 'vite.config.js'];

function findViteConfig(tree, root) {
  return VITE_CONFIG_NAMES.map((n) => joinPathFragments(root, n)).find((p) => tree.exists(p));
}

function usedPorts(tree) {
  const ports = new Set();
  for (const [, project] of getProjects(tree)) {
    if (project.projectType !== 'application') continue;
    const config = findViteConfig(tree, project.root);
    if (!config) continue;
    const match = /server:\s*\{[^}]*?port:\s*(\d+)/s.exec(tree.read(config, 'utf-8'));
    if (match) ports.add(Number(match[1]));
  }
  return ports;
}

function firstFreePort(tree) {
  const used = usedPorts(tree);
  let port = FIRST_PORT;
  while (used.has(port)) port++;
  return port;
}

async function generator(tree, options) {
  const { name, backend } = options;
  if (typeof name !== 'string' || !NAME_PATTERN.test(name)) {
    throw new Error(`Invalid project name "${name}": must match ${NAME_PATTERN}.`);
  }
  const projects = getProjects(tree);
  if (projects.has(name)) {
    throw new Error(`Project "${name}" already exists in the workspace.`);
  }
  if (backend) {
    const backendProject = projects.get(backend);
    if (!backendProject || backendProject.projectType !== 'application') {
      throw new Error(`Backend "${backend}" is not an existing spring-service application.`);
    }
  }
  const port = options.port ?? firstFreePort(tree);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) {
    throw new Error(`Invalid port "${port}".`);
  }
  const root = joinPathFragments('apps', name);

  const reactTask = await applicationGenerator(tree, {
    name,
    directory: root,
    bundler: 'vite',
    unitTestRunner: 'vitest',
    linter: 'eslint',
    e2eTestRunner: 'none',
    style: 'css',
    useProjectJson: true,
    skipFormat: true,
  });

  // Our own Vite config (port, /api proxy, JUnit reporter) replaces the generated one.
  const generated = findViteConfig(tree, root);
  if (generated && !generated.endsWith('vite.config.mts')) tree.delete(generated);
  generateFiles(tree, path.join(__dirname, 'files'), root, {
    name,
    port,
    previewPort: port + PREVIEW_PORT_OFFSET,
    tmpl: '',
  });

  const project = readProjectConfiguration(tree, name);
  project.name = name;
  project.projectType = 'application';
  project.tags = [...new Set([...(project.tags ?? []), 'type:react-app'])];
  project.targets = project.targets ?? {};
  const test = project.targets.test ?? {};
  const outputs = test.outputs ?? [];
  if (!outputs.includes('{projectRoot}/test-results')) outputs.push('{projectRoot}/test-results');
  project.targets.test = { ...test, outputs };
  project.targets.image = {
    executor: 'nx:run-commands',
    options: {
      command: `docker build -f ${root}/Dockerfile -t "\${IMAGE_NAME:-${name}:local}" .`,
    },
  };
  updateProjectConfiguration(tree, name, project);

  if (backend) {
    const link = require('../link/generator');
    await (link.default ?? link)(tree, { project: name, dependency: backend });
  }

  await formatFiles(tree);
  return runTasksInSerial(reactTask);
}

module.exports = generator;
module.exports.default = generator;
