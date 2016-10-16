/*
 * @Author: toan.nguyen
 * @Date:   2016-09-09 12:23:34
 * @Last Modified by:   toan.nguyen
 * @Last Modified time: 2016-10-06 19:11:59
 */

'use strict';

module.exports = {
  authenticators: {
    Basic: require('./authenticators/basic'),
    OAuthBearer: require('./authenticators/oauth-bearer'),
  },
  business: {
    Notification: require('./business/notification'),
    Profile: require('./business/profile'),
  },
  logger: require('./lib/logger'),
  ThriftManager: require('./lib/thrift-manager'),
  AuthManager: require('./lib/auth-manager'),
};
