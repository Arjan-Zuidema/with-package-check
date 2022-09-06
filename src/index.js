import { exec } from 'child_process';
import fs from 'fs';
import strings from 'node-strings';

export async function withPackageCheck(config) {
  if(process.env.NODE_ENV === 'production') {
    return config;
  }

  await checkPackages(true);

  return config;
}

function readJson(path) {
  return JSON.parse(fs.readFileSync(path, 'utf8'));
}

async function checkPackages(autofixEnabled) {
  const inquirer = await (await import('inquirer')).default;
  return new Promise((resolve, reject) =>
  {
    if(autofixEnabled)
      console.info("Checking for outdated packages");

    const packageJson = readJson("./package.json");
    const packageLockJson = readJson("./package-lock.json");

    const dependencies = Object.keys({
      ...packageJson.dependencies,
      ...packageJson.devDependencies
    }).sort();

    const logs = [];

    let installPackages = [];
    let errorPackages = new Set();
    dependencies.forEach(dependency =>
    {
      const needed = packageLockJson.dependencies[dependency];
      let linked;
      let installed;
      try
      {
        const dependencyPath = `./node_modules/${dependency}`;
        const dependencyPackagePath = `${dependencyPath}/package.json`;

        const lstats = fs.lstatSync(dependencyPath);
        if(lstats.isSymbolicLink()) {
          const link = fs.readlinkSync(dependencyPath);
          linked = path.resolve(path.basename(__filename), "node_modules", link);
        } else {
          installed = readJson(dependencyPackagePath);
        }
      }catch(e){}

      if(needed)
      {
        if(installed)
        {
          if(installed.version !== needed.version)
          {
            installPackages.push(`${dependency}@${needed.version}`);
            logs.push({func: 'warn', msg: `Version mismatch for ${dependency}, version ${strings.bold(installed.version)} is installed but version ${strings.bold(needed.version)} is needed`});
          }
          else
          {
            // Installed version matches, check for peer dependencies
            if(installed.hasOwnProperty("peerDependencies"))
            {
              Object.keys(installed.peerDependencies).forEach(peerDependency =>
              {
                let isOptional = false;
                if(installed.hasOwnProperty("peerDependenciesMeta"))
                {
                  if(installed.peerDependenciesMeta.hasOwnProperty(peerDependency))
                  {
                    isOptional = installed.peerDependenciesMeta[peerDependency].hasOwnProperty('optional') ? installed.peerDependenciesMeta[peerDependency].optional : false
                  }
                }

                if(!isOptional && !dependencies.includes(peerDependency))
                {
                  try
                  {
                    const peerDependencyPackagePath = `./node_modules/${peerDependency}/package.json`;
                    fs.statSync(peerDependencyPackagePath);
                  }
                  catch(e)
                  {
                    errorPackages.add(peerDependency);

                    if(e.code !== "ENOENT")
                      logs.push({func: 'error', msg: e.toString()});
                    else
                      logs.push({func: 'warn', msg: `${dependency} requires ${peerDependency} but is not installed, you must do this yourself, because I can't determine the version you need`});
                  }
                }
              });
            }
          }
        }
        else if (linked) {
          logs.push({func: 'info', msg: strings.white(`${dependency} is currently linked at ${strings.bold(linked)}`)})
        }
        else
        {
          installPackages.push(`${dependency}@${needed.version}`);
          logs.push({func: 'warn', msg: `${dependency} is not installed, but found in lock file.`})
        }
      }
      else
      {
        logs.push({func: 'error', msg: `Found ${dependency} in package.json, but was not found in lock file`})
        process.exit(-1);
      }
    });
    strings.clean();

    if(logs.length > 0)
    {
      logs.forEach(l => console[l.func].apply(null, [l.msg]));
    }

    // Show error packages and halt
    if(errorPackages.size > 0)
    {
      console.error(`Found ${errorPackages.size} packages with errors:`);
      errorPackages.forEach(errorPackage => console.error(errorPackage));
      process.exit(0);
    }

    if(installPackages.length > 0)
    {
      if(autofixEnabled)
      {
        // Show prompt to install missing/outdated packages
        inquirer.prompt([{type: "confirm", name: "autofix", message: "Want to auto-install packages?"}])
        .then(answer =>
        {
          if(answer.autofix)
          {
            const command = []
            command.push(`npm i ${installPackages.join(" ")}`);

            if(command.length > 0)
            {
              console.info(`Running npm install for ${installPackages.join(" ")}`);
              const npmi = exec(command.join(" && "));
              npmi.stderr.on("data", console.error);
              npmi.on("exit", async () =>
              {
                console.event("Installed missing packages");
                try
                {
                  console.info("Re-checking for outdated packages");
                  await checkPackages(false);
                  resolve();
                }
                catch(e)
                {
                  reject(e);
                }
              })
            }
          }
          else
          {
            resolve();
          }
        })
      }
      else
        reject();
    }
    else
    {
      if(!autofixEnabled)
        console.info("All packages up-to-date");
      resolve();
    }
  });
}