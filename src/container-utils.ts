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
