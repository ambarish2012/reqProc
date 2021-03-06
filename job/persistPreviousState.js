'use strict';

var self = saveState;
module.exports = self;

var fs = require('fs-extra');

var getStatusCodeByName = require('../_common/getStatusCodeByName.js');

function saveState(externalBag, callback) {
  var bag = {
    buildJobId: externalBag.buildJobId,
    builderApiAdapter: externalBag.builderApiAdapter,
    jobStatusCode: externalBag.jobStatusCode,
    consoleAdapter: externalBag.consoleAdapter,
    buildStateDir: externalBag.buildStateDir,
    buildPreviousStateDir: externalBag.buildPreviousStateDir
  };
  bag.who = util.format('%s|job|%s', msName, self.name);
  logger.info(bag.who, 'Inside');

  async.series([
      _checkInputParams.bind(null, bag),
      _getLatestBuildJobStatus.bind(null, bag),
      _persistPreviousStateOnFailure.bind(null, bag)
    ],
    function (err) {
      var result;
      if (err) {
        logger.error(bag.who, util.format('Failed to create trace'));
      } else{
        logger.info(bag.who, 'Successfully created trace');
        result = {
          jobStatusCode: bag.jobStatusCode,
          isJobCancelled: bag.isJobCancelled
        };
      }
      return callback(err, result);
    }
  );
}

function _checkInputParams(bag, next) {
  var who = bag.who + '|' + _checkInputParams.name;
  logger.verbose(who, 'Inside');

  return next();
}

function _getLatestBuildJobStatus(bag, next) {
  var who = bag.who + '|' + _getLatestBuildJobStatus.name;
  logger.verbose(who, 'Inside');

  bag.builderApiAdapter.getBuildJobById(bag.buildJobId,
    function (err, buildJob) {
      if (err) {
        var msg = util.format('%s, Failed to get buildJob' +
          ' for buildJobId:%s, with err: %s', who, bag.buildJobId, err);
        logger.warn(msg);
        bag.jobStatusCode = getStatusCodeByName('error');
      }

      if (buildJob.statusCode === getStatusCodeByName('cancelled')) {
        bag.isJobCancelled = true;
        logger.warn(util.format('%s, Job with buildJobId:%s' +
          ' is cancelled', who, bag.buildJobId));
      }
      return next();
    }
  );
}

function _persistPreviousStateOnFailure(bag, next) {
  if (!bag.jobStatusCode) return next();

  var who = bag.who + '|' + _persistPreviousStateOnFailure.name;
  logger.verbose(who, 'Inside');

  bag.consoleAdapter.openGrp('Persisting Previous State');
  bag.consoleAdapter.openCmd('Copy previous state to current state');

  var srcDir = bag.buildPreviousStateDir ;
  var destDir = bag.buildStateDir;
  fs.copy(srcDir, destDir,
    function (err) {
      if (err) {
        bag.consoleAdapter.publishMsg(
          'Failed to persist previous state of job');
        bag.consoleAdapter.closeCmd(false);
        bag.consoleAdapter.closeGrp(false);
      } else {
        bag.consoleAdapter.publishMsg(
          'Successfully persisted previous state of job');
        bag.consoleAdapter.closeCmd(true);
        bag.consoleAdapter.closeGrp(true);
      }
      return next();
    }
  );
}
