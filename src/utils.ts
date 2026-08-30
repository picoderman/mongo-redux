export const execute = async (
  executable: string,
  args: string[],
  env?: Record<string, string | undefined>,
) => {
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

export const execMongoShellScript = (
  executable: string,
  dbName: string,
  username: string,
  password: string,
  script: string,
) =>
  execute(executable, [
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
