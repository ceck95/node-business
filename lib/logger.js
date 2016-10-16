/*
 * @Author: toan.nguyen
 * @Date:   2016-09-06 10:53:41
 * @Last Modified by:   toan.nguyen
 * @Last Modified time: 2016-09-07 05:08:31
 */

'use strict';

let helpers = require('nexx-helpers'),
  config = require('config'),
  bunyan = require('bunyan'),
  bformat = require('bunyan-format'),
  formatOut = bformat({ outputMode: 'short' });

let defaultLevel = 'info',
  logCfg = config.has('logger') ? config.get('logger') : {};

let logName = logCfg.name || 'default';

if (logCfg.level) {
  defaultLevel = logCfg.level;
} else if (helpers.isDebug) {
  defaultLevel = 'debug';
}

let streams = logCfg.streams || [];

streams.push({
  stream: formatOut,
  level: defaultLevel
});

let logger = bunyan.createLogger({
  name: logName,
  streams: streams
});

module.exports = logger;
