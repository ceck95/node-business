/**
 * @Author: Tran Van Nhut <nhutdev>
 * @Date:   2017-02-25T09:26:40+07:00
 * @Email:  tranvannhut4495@gmail.com
* @Last modified by:   nhutdev
* @Last modified time: 2017-02-25T13:11:20+07:00
 */


'use strict';

const Hoek = require('hoek');
const moment = require('moment');
const helpers = require('node-helpers');
const config = require('config');

const bearerScheme = helpers.auth.Bearer;
const OAuthBearerLocal = require('./oauth-bearer-local');
const OAuthBasicLocal = require('./basic');

class OAuthBearerLocalAuthenticator {

  /**
   * Constructor, set default data
   *
   * @param  {Object} opts Option data
   */
  constructor(opts) {
    Hoek.assert(typeof(opts) === 'object', 'Authenticator config must be a object');
    let cloneCfg = Hoek.clone(opts);
    cloneCfg.validateFunc = this.validate;
    cloneCfg.tokenType = ['Bearer', 'Basic'];
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

    switch (settings.tokenTypeCurrent) {
      case 'Bearer':
        settings.tokenType = 'Bearer';
        let bearerLocal = new OAuthBearerLocal(settings);
        bearerLocal.validate.call(this, token, settings, callback);
        break;
      case 'Basic':
        settings.tokenType = 'Basic';
        let basicLocal = new OAuthBasicLocal(settings);
        basicLocal.validate.call(this, token, settings, callback);
        break;
    }

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
