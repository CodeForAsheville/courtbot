/* eslint "no-console": "off" */

require('dotenv').config(); // needed for local dev when not using Heroku to pull in env vars
const runnerScript = require('../utils/loaddata.js');
const manager = require('../utils/db/manager')
const runner_log = require('../utils/logger/runner_log')
const log = require('../utils/logger')

runnerScript()
.then((r) => runner_log.loaded(r))
.then(() => {
    log.debug('checking active handles')
    let v = process._getActiveHandles()
    log.debug(v)
    log.debug('checking active requests')
    let u = process._getActiveRequests()
    log.debug(u)
})
.then(() => manager.knex.destroy())
.catch((err) => {
    manager.knex.destroy()
    log.error(err)
});
