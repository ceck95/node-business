/*
 * @Author: toan.nguyen
 * @Date:   2016-04-23 10:39:16
 * @Last Modified by:   toan.nguyen
 * @Last Modified time: 2016-10-07 16:27:40
 */

'use strict';

const Hoek = require('hoek');
const req = require('request-promise');
const requestErrors = require('request-promise/errors');
const helpers = require('nexx-helpers');

const bearerScheme = helpers.auth.Bearer;

class OAuthBearerAuthenticator {

  /**
   * Constructor, set default data
   *
   * @param  {Object} opts Option data
   */
  constructor(opts) {
    Hoek.assert(typeof (opts) === 'object', 'Authenticator config must be a object');
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
      oauthCfg = this.config.api.nexxOAuth,
      headerAuth = helpers.Auth.getBasicHeader(oauthCfg),
      logger = new helpers.Log(this);

    logger.debug('Authorizes access token: ' + token);

    return req({
      uri: '/token/validate',
      baseUrl: oauthCfg.baseUrl,
      method: 'POST',
      headers: {
        authorization: headerAuth
      },
      json: true,
      body: JSON.stringify({
        data: {
          accessToken: token
        }
      })
    }).then(body => {
      body.data.token = token;

      if (this.config.user.autoProfile) {
        return self.userManager.getProfileByNexId(self, body.data.userId, token).then(data => {

          body.data.userId = data.profile.uid;
          body.data.profile = data.profile;
          body.data.isNewUser = data.isNewUser;

          return callback(null, true, body.data);
        });
      }

      return callback(null, true, body.data);
    }).catch(requestErrors.StatusCodeError, response => {
      logger.info({
        errorCode: response.statusCode,
        body: response.error
      });

      return callback(null, false, response.error);
    }).catch(err => {

      logger.error(err.toString());
      return callback(null, false, err);
    }).catch(Error, e => {
      console.error(e);
      throw e;
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

module.exports = OAuthBearerAuthenticator;
