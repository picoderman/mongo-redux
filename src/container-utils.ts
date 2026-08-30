export type DBCredentials = {
  dbName: string;
  username: string;
  password: string;
};

export const execContainer = async (args: string[], env?: Record<string, string | undefined>) => {
  const executable = Bun.which('container');

  if (!executable) throw new Error("Apple's 'container' CLI is not installed");

  const process = Bun.spawn([executable, ...args], {
    env,
    stdin: 'ignore',
    stdout: 'pipe',
    stderr: 'pipe',
  });

  const [exitCode, stdout, stderr] = await Promise.all([
    process.exited,
    new Response(process.stdout).text(),
    new Response(process.stderr).text(),
  ]);

  return { exitCode, stdout, stderr };
};

export const execMongoShellScript = (dbCreds: DBCredentials, script: string) => {
  const { dbName, username, password } = dbCreds;

  return execContainer([
    'exec',
    dbName,
    'mongosh',
    '--quiet',
    '--username',
    username,
    '--password',
    password,
    '--authenticationDatabase',
    'admin',
    '--eval',
    script,
  ]);
};

export const ensureContainerSystemRunning = async () => {
  const result = await execContainer([
    'system',
    'status',
    '--format',
    'json',
  ]);
  const output = result.stderr.trim() || result.stdout.trim();

  if (result.exitCode !== 0)
    throw new Error(
      `Apple Container service is stopped or unreachable${output ? `: ${output}` : ''}`,
    );

  let systemStatus;

  try {
    systemStatus = JSON.parse(result.stdout);
  } catch {
    throw new Error('Apple Container returned an invalid system status response');
  }

  if (systemStatus?.status !== 'running')
    throw new Error('Apple Container service is stopped or unreachable');
};

const findContainer = async (name: string) => {
  const result = await execContainer(['list', '--all', '--format', 'json']);

  if (result.exitCode !== 0) {
    const output = result.stderr.trim() || result.stdout.trim();

    throw new Error(
      `Listing Apple containers failed with exit code ${result.exitCode}${output ? `: ${output}` : ''}`,
    );
  }

  let containers;

  try {
    containers = JSON.parse(result.stdout);
  } catch {
    throw new Error('Apple Container returned an invalid container list response');
  }

  if (!Array.isArray(containers))
    throw new Error('Apple Container returned an invalid container list response');

  return containers.find(container => container?.configuration?.id === name);
};

export const getIsContainerRunning = async (name: string) =>
  (await findContainer(name))?.status === 'running';

export const getIsContainerStopped = async (name: string) =>
  (await findContainer(name))?.status === 'stopped';

export const startContainer = async (name: string) => {
  const result = await execContainer(['start', name]);

  if (result.exitCode !== 0) {
    const output = result.stderr.trim() || result.stdout.trim();

    throw new Error(
      `Starting existing Apple container '${name}' failed with exit code ${result.exitCode}${output ? `: ${output}` : ''}`,
    );
  }

  return false;
};
