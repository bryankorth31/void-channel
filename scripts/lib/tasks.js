// Windows scheduled tasks for a profile: "<prefix> Publish" every two hours and "<prefix> Nightly" at 3:30.
// Used by setup.js and by HQ's "Re-create scheduled tasks" button. Non-default profiles get the
// VOID_PROFILE variable set inside the task command so every script reads the right profile.
const path = require('path');
const { execSync } = require('child_process');
const PROFILE = require('./profile');

function taskCommand(nodeBin, script) {
  const node = `"${nodeBin}"`, file = `"${path.join(PROFILE.ROOT, 'scripts', script)}"`;
  if (PROFILE.name === 'voidtv') return `${node} ${file}`;
  return `cmd /c "set VOID_PROFILE=${PROFILE.name}&& ${node} ${file}"`;
}

function createTasks(nodeBin) {
  const made = [];
  const defs = [
    [`${PROFILE.taskPrefix} Publish`, '/SC HOURLY /MO 2 /ST 00:20', 'publish.js'],
    [`${PROFILE.taskPrefix} Nightly`, '/SC DAILY /ST 03:30', 'nightly.js'],
  ];
  for (const [name, sched, script] of defs) {
    const tr = taskCommand(nodeBin, script).replace(/"/g, '\\"');
    execSync(`schtasks /Create /F /TN "${name}" ${sched} /TR "${tr}"`, { stdio: ['ignore', 'pipe', 'pipe'] });
    made.push(name);
  }
  return made;
}

function taskNames() { return [`${PROFILE.taskPrefix} Publish`, `${PROFILE.taskPrefix} Nightly`]; }

module.exports = { createTasks, taskNames, taskCommand };
