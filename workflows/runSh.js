'use strict';

var self = runSh;
module.exports = self;

var fs = require('fs-extra');

var getStatusCodeByName = require('../_common/getStatusCodeByName.js');
var initJob = require('../job/initJob.js');
var setupDirs = require('../job/setupDirs.js');
var pollBuildJobStatus = require('../job/pollBuildJobStatus.js');
var getPreviousState = require('../job/getPreviousState.js');
var getSecrets = require('../job/getSecrets.js');
var setupDependencies = require('../job/setupDependencies.js');
var notifyOnStart = require('../job/notifyOnStart.js');
var processINs = require('../job/processINs.js');
var generateSteps = require('../job/generateSteps.js');
var handoffAndPoll = require('../job/handoffAndPoll.js');
var readJobStatus = require('../job/readJobStatus.js');
var processOUTs = require('../job/processOUTs.js');
var createTrace = require('../job/createTrace.js');
var persistPreviousState = require('../job/persistPreviousState.js');
var saveStepState = require('../job/saveStepState.js');
var postVersion = require('../job/postVersion');
var cleanup = require('../job/cleanup.js');
var updateStatus = require('../job/updateStatus.js');

function runSh(externalBag, callback) {
  // At this point we have started processing the runSh and we do not want
  // the cluster node validation to affect the build.
  global.config.isProcessingRunShJob = true;

  var bag = {
    rawMessage: externalBag.rawMessage,
    builderApiToken: externalBag.builderApiToken,
    builderApiAdapter: externalBag.builderApiAdapter,
    consoleAdapter: externalBag.consoleAdapter,
    reqProcDir: global.config.reqProcDir,
    reqKickDir: global.config.reqKickDir,
    reqExecDir: global.config.reqExecDir,
    buildRootDir: global.config.buildDir,
    reqKickScriptsDir: util.format('%s/scripts', global.config.reqKickDir),
    buildInDir: util.format('%s/IN', global.config.buildDir),
    buildOutDir: util.format('%s/OUT', global.config.buildDir),
    buildStateDir: util.format('%s/state', global.config.buildDir),
    buildStatusDir: util.format('%s/status', global.config.buildDir),
    buildSharedDir: util.format('%s/shared', global.config.buildDir),
    buildScriptsDir: util.format('%s/scripts', global.config.buildDir),
    buildSecretsDir: util.format('%s/secrets', global.config.buildDir),
    buildPreviousStateDir: util.format('%s/previousState',
      global.config.buildDir),
    messageFilePath: util.format('%s/message.json', global.config.buildDir),
    stepMessageFilename: 'version.json',
    operation: {
      IN: 'IN',
      OUT: 'OUT',
      TASK: 'TASK',
      NOTIFY: 'NOTIFY'
    }
  };

  bag.subPrivateKeyPath = util.format('%s/00_sub', bag.buildSecretsDir);
  bag.outputVersionFilePath = util.format('%s/outputVersion.json',
    bag.buildStateDir);

  bag.who = util.format('%s|%s', msName, self.name);
  logger.info(bag.who, 'Inside');

  async.series([
      _initJob.bind(null, bag),
      _setupDirectories.bind(null, bag),
      _pollBuildJobStatus.bind(null, bag),
      _setExecutorAsReqProc.bind(null, bag),
      _getPreviousState.bind(null, bag),
      _getSecrets.bind(null, bag),
      _setupDependencies.bind(null, bag),
      _notifyOnStart.bind(null, bag),
      _processINs.bind(null, bag),
      _generateSteps.bind(null, bag),
      _handOffAndPoll.bind(null, bag),
      _readJobStatus.bind(null, bag),
      _processOUTs.bind(null, bag),
      _createTrace.bind(null, bag),
      _persistPreviousState.bind(null, bag),
      _saveStepState.bind(null, bag),
      _postVersion.bind(null, bag),
      _cleanupBuildDirectory.bind(null, bag),
      _updateBuildJobStatus.bind(null, bag)
    ],
    function (err) {
      return callback(err);
    }
  );
}

function _initJob(bag, next) {
  var who = bag.who + '|' + _initJob.name;
  logger.verbose(who, 'Inside');

  bag.isInitializingJobGrpSuccess = true;
  bag.consoleAdapter.openGrp('Initializing job');

  initJob(bag,
    function (err, resultBag) {
      if (err) {
        bag.consoleAdapter.closeGrp(false);
        bag.jobStatusCode = getStatusCodeByName('error');
        bag.isInitializingJobGrpSuccess = false;
      } else {
        bag = _.extend(bag, resultBag);
      }

      return next();
    }
  );
}

function _setupDirectories(bag, next) {
  var who = bag.who + '|' + _setupDirectories.name;
  logger.verbose(who, 'Inside');

  setupDirs(bag,
    function (err) {
      if (err) {
        bag.consoleAdapter.closeGrp(false);
        bag.jobStatusCode = getStatusCodeByName('error');
        bag.isInitializingJobGrpSuccess = false;
      }
      return next();
    }
  );
}

function _pollBuildJobStatus(bag, next) {
  if (bag.isJobCancelled) return next();
  if (bag.jobStatusCode) return next();

  var who = bag.who + '|' + _pollBuildJobStatus.name;
  logger.verbose(who, 'Inside');

  pollBuildJobStatus(bag,
    function () {
      return next();
    }
  );
}

function _setExecutorAsReqProc(bag, next) {
  if (bag.jobStatusCode) return next();

  var who = bag.who + '|' + _setExecutorAsReqProc.name;
  logger.verbose(who, 'Inside');

  bag.consoleAdapter.openCmd('Setting executor as reqProc');

  var whoPath = util.format('%s/job.who', bag.buildStatusDir);
  fs.writeFile(whoPath, 'reqProc\n',
    function (err) {
      if (err) {
        var msg = util.format('%s, Failed to write file: %s ' +
          'with err: %s', who, whoPath, err);
        bag.consoleAdapter.publishMsg(msg);
        bag.consoleAdapter.closeCmd(false);
        bag.consoleAdapter.closeGrp(false);
        bag.jobStatusCode = getStatusCodeByName('error');
        return next();
      }

      bag.consoleAdapter.publishMsg(
        util.format('Updated %s', whoPath)
      );
      bag.consoleAdapter.closeCmd(true);
      return next();
    }
  );
}

function _getPreviousState(bag, next) {
  if (bag.isJobCancelled) return next();

  var who = bag.who + '|' + _getPreviousState.name;
  logger.verbose(who, 'Inside');

  getPreviousState(bag,
    function (err) {
      if (err) {
        bag.consoleAdapter.closeGrp(false);
        bag.jobStatusCode = getStatusCodeByName('error');
        bag.isInitializingJobGrpSuccess = false;
      }
      return next();
    }
  );
}

function _getSecrets(bag, next) {
  if (bag.isJobCancelled) return next();
  if (bag.jobStatusCode) return next();

  var who = bag.who + '|' + _getSecrets.name;
  logger.verbose(who, 'Inside');

  getSecrets(bag,
    function (err, resultBag) {
      if (err) {
        bag.consoleAdapter.closeGrp(false);
        bag.jobStatusCode = getStatusCodeByName('error');
        bag.isInitializingJobGrpSuccess = false;
      } else {
        bag = _.extend(bag, resultBag);
      }
      return next();
    }
  );
}

function _setupDependencies(bag, next) {
  if (bag.isJobCancelled) return next();
  if (bag.jobStatusCode) return next();

  var who = bag.who + '|' + _setupDependencies.name;
  logger.verbose(who, 'Inside');

  setupDependencies(bag,
    function (err, resultBag) {
      if (err) {
        bag.consoleAdapter.closeGrp(false);
        bag.jobStatusCode = getStatusCodeByName('error');
        bag.isInitializingJobGrpSuccess = false;
      } else {
        bag = _.extend(bag, resultBag);
      }
      return next();
    }
  );
}

function _notifyOnStart(bag, next) {
  if (bag.isJobCancelled) return next();
  if (bag.jobStatusCode) return next();

  var who = bag.who + '|' + _notifyOnStart.name;
  logger.verbose(who, 'Inside');

  notifyOnStart(bag,
    function (err) {
      // Log failure and continue with the build even if queuing notification
      // fails.
      if (err) {
        logger.warn(util.format(
          '%s: Failed to queue on_start notification with error: %s',
          who, err));

        // Closing of "Initializing job" is handled here as this is the last
        // step of the group.
        bag.consoleAdapter.closeGrp(false);
      } else {
        bag.consoleAdapter.closeGrp(true);
      }

      return next();
    }
  );
}

function _processINs(bag, next) {
  if (bag.jobStatusCode) return next();

  var who = bag.who + '|' + _processINs.name;
  logger.verbose(who, 'Inside');

  processINs(bag,
    function (err) {
      if (err)
        bag.jobStatusCode = getStatusCodeByName('error');
      return next();
    }
  );
}

function _generateSteps(bag, next) {
  if (bag.jobStatusCode) return next();

  var who = bag.who + '|' + _generateSteps.name;
  logger.verbose(who, 'Inside');

  generateSteps(bag,
    function (err) {
      if (err) {
        bag.consoleAdapter.closeGrp(false);
        bag.jobStatusCode = getStatusCodeByName('error');
        return next();
      }

      return next();
    }
  );
}

function _handOffAndPoll(bag, next) {
  if (bag.jobStatusCode) return next();

  var who = bag.who + '|' + _handOffAndPoll.name;
  logger.verbose(who, 'Inside');

  handoffAndPoll(bag,
    function (err) {
      if (err) {
        bag.consoleAdapter.closeGrp(false);
        bag.jobStatusCode = getStatusCodeByName('error');
        return next();
      }
      return next();
    }
  );
}

function _readJobStatus(bag, next) {
  if (bag.jobStatusCode) return next();

  var who = bag.who + '|' + _readJobStatus.name;
  logger.verbose(who, 'Inside');

  bag.consoleAdapter.openGrp('Reading Status');

  readJobStatus(bag,
    function (err, resultBag) {
      if (err) {
        bag.consoleAdapter.closeGrp(false);
        bag.jobStatusCode = getStatusCodeByName('error');
        return next();
      }

      bag = _.extend(bag, resultBag);
      bag.consoleAdapter.closeGrp(true);
      return next();
    }
  );
}

function _processOUTs(bag, next) {
  if (bag.jobStatusCode) return next();

  var who = bag.who + '|' + _processOUTs.name;
  logger.verbose(who, 'Inside');

  processOUTs(bag,
    function (err) {
      if (err)
        bag.jobStatusCode = getStatusCodeByName('error');
      return next();
    }
  );
}

function _createTrace(bag, next) {
  if (bag.jobStatusCode) return next();

  var who = bag.who + '|' + _createTrace.name;
  logger.verbose(who, 'Inside');

  createTrace(bag,
    function (err, resultBag) {
      if (err)
        bag.jobStatusCode = getStatusCodeByName('error');
      else
        bag = _.extend(bag, resultBag);
      return next();
    }
  );
}

function _persistPreviousState(bag, next) {
  var who = bag.who + '|' + _persistPreviousState.name;
  logger.verbose(who, 'Inside');

  persistPreviousState(bag,
    function (err, resultBag) {
      if (!err)
        bag = _.extend(bag, resultBag);
      return next();
    }
  );
}

function _saveStepState(bag, next) {
  if (bag.isJobCancelled) return next();

  var who = bag.who + '|' + _saveStepState.name;
  logger.verbose(who, 'Inside');

  bag.consoleAdapter.openGrp('Saving Job Files');

  saveStepState(bag,
    function (err, resultBag) {
      if (err) {
        bag.jobStatusCode = getStatusCodeByName('error');
        bag.consoleAdapter.closeGrp(false);
      } else {
        bag = _.extend(bag, resultBag);
        bag.consoleAdapter.closeGrp(true);
      }
      return next();
    }
  );
}

function _postVersion(bag, next) {
  if (bag.isJobCancelled) return next();

  var who = bag.who + '|' + _postVersion.name;
  logger.verbose(who, 'Inside');

  postVersion(bag,
    function (err, resultBag) {
      if (err) {
        bag.jobStatusCode = getStatusCodeByName('error');
        bag.consoleAdapter.closeGrp(false);
      } else {
        bag = _.extend(bag, resultBag);
      }
      return next();
    }
  );
}

function _cleanupBuildDirectory(bag, next) {
  var who = bag.who + '|' + _cleanupBuildDirectory.name;
  logger.verbose(who, 'Inside');

  bag.consoleAdapter.openGrp('Job cleanup');

  cleanup(bag,
    function (err) {
      if (err) {
        bag.consoleAdapter.closeGrp(false);
        bag.jobStatusCode = getStatusCodeByName('error');
        return next();
      }

      bag.consoleAdapter.closeGrp(true);
      return next();
    }
  );
}

function _updateBuildJobStatus(bag, next) {
  var who = bag.who + '|' + _updateBuildJobStatus.name;
  logger.verbose(who, 'Inside');

  bag.consoleAdapter.openGrp('Updating Status');

  updateStatus(bag,
    function (err) {
      if (err)
        bag.consoleAdapter.closeGrp(false);
      else
        bag.consoleAdapter.closeGrp(true);
      return next();
    }
  );
}
