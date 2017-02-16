/*
 * @Author: toan.nguyen
 * @Date:   2016-04-23 10:39:16
* @Last modified by:   nhutdev
* @Last modified time: 2017-02-16T15:50:37+07:00
 */

'use strict';

const Hoek = require('hoek');
const moment = require('moment');
const helpers = require('node-helpers');

const bearerScheme = helpers.auth.Bearer;

class OAuthBearerLocalAuthenticator {

  /**
   * Constructor, set default data
   *
   * @param  {Object} opts Option data
   */
  constructor(opts) {
    Hoek.assert(typeof(opts) === 'object', 'Authenticator config must be a object');
    let cloneCfg = Hoek.clone(opts);
    cloneCfg.tokenType = 'Bearer';
    cloneCfg.validateFunc = this.validate;

    this.config = cloneCfg;
  }

  /**
   * Authorizes token from oauth to loading resource
   *
   * @param  {Request}  request  is the hapi request object of the request which is being authenticated.
   * @param  {string}   username the username received from the client
   * @param  {string}   password the password received from the client.
   * @param  {Function} callback  a callback function with the signature function(err, isValid, credentials) where:
   *                              err - an internal error. If defined will replace default Boom.unauthorized error
   *                              isValid - true if both the username was found and the password matched, otherwise false.
   *                              credentials - a credentials object passed back to the application in request.auth.credentials. Typically, credentials are only included when isValid is true, but there are cases when the application needs to know who tried to authenticate even when it fails (e.g. with authentication mode 'try').
   * @param {boolean}   allowEmptyUsername (optional) if true, allows making requests with an empty username. Defaults to false
   * @param {object} unauthorizedAttributes  (optional) if set, passed directly to Boom.unauthorized if no custom err is defined. Useful for setting realm attribute in WWW-Authenticate header. Defaults to undefined.
   *
   * @return {Function}           Callback result
   */
  validate(token, settings, callback) {
    // For convenience, the request object can be accessed
    // from `this` within validateFunc.
    let self = this,
      tokenStore = this.dataStore.getStore(settings.tokenStore),
      expiredError = helpers.Error.translate({
        code: '301',
      });

    this.log(['debug', 'authorize-token'], 'Authorizes access token: ' + token);

    let model = tokenStore.createModel(),
      query = model.toThriftQuery({
        accessToken: token
      });

    return tokenStore.getOne(query).then((token) => {
      if (moment(token.expiresIn).isBefore(new Date())) {
        console.error(token.expiresIn, new Date());
        return callback(null, false, expiredError);
      }

      return self.dataStore.userStore.getOneByPk(token.userId).then((user) => {
        return callback(null, true, {
          token: token,
          profile: user
        });
      }).catch((e) => {
        let errors = helpers.Error.translate(e),
          code = helpers.Error.getCode(errors);

        if (code == '202') {
          let userNotFound = helpers.Error.translate({
            code: '315'
          });
          return callback(null, false, userNotFound);
        }

        console.error(e);
        return callback(null, false, errors);

      });
    }).catch((e) => {

      let errors = helpers.Error.translate(e),
        code = helpers.Error.getCode(errors);

      if (code == '202') {
        let revokeError = helpers.Error.translate({
          code: '302'
        });

        return callback(null, false, revokeError);
      }

      console.error(e);
      return callback(null, false, errors);
    });

  }

  /**
   * Registers authenticators for server
   *
   * @param  {HAPIServer} server HAPI Server
   * @param  {Array} cfgs Authenticator config
   */
  register(server) {
    Hoek.assert(server, 'Server instance must not be null');
    server.auth.strategy(this.config.name, bearerScheme.schemeName, this.config);
  }
}

module.exports = OAuthBearerLocalAuthenticator;
