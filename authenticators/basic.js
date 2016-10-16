/*
 * @Author: toan.nguyen
 * @Date:   2016-04-23 10:39:16
* @Last modified by:   nhutdev
* @Last modified time: 2016-10-16T20:10:50+07:00
 */

'use strict';

const Hoek = require('hoek');
const helpers = require('node-helpers');

const bearerScheme = helpers.auth.Bearer;

class BasicAuthenticator {

  /**
   * Constructor, set default data
   *
   * @param  {Object} opts Option data
   */
  constructor(opts) {
    Hoek.assert(typeof(opts) === 'object', 'Authenticator config must be a object');
    Hoek.assert(opts.storeName, 'OAuth store must not be empty');

    let cloneCfg = Hoek.clone(opts);
    cloneCfg.tokenType = 'Basic';
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
    let request = this;

    request.log(['debug', 'authorize'], 'Authorizes basic token: ' + token);

    // Use a real strategy here,
    // comparing with a token from your database
    let ds = request.dataStore.getStore(settings.storeName),
      decodedToken = new Buffer(token, 'base64').toString('ascii'),
      clientCredential = decodedToken.split(':'),
      notFound = request.errorManager.translate({
        code: '303',
        source: 'authorization'
      });

    if (clientCredential.length == 2) {
      let clientId = clientCredential[0],
        clientSecret = clientCredential[1];

      request.log(['debug', 'authorize'], 'Client ID: ' + clientId + '. Client Secret: ' +
        clientSecret);

      return ds.getOneByClientId(clientId).then((response) => {
        if (response.clientSecret !== clientSecret) {
          return callback(null, false, notFound);
        }

        // var grantType = request.payload.data.grantType;
        // if (response.authorizationGrantType !== grantType) {
        //   var er1 = 'invalid_grant',
        //     message1 = 'The provided authorization grant is not allowed.';

        //   request.log(['error', 'oauth'], er1);
        //   return callback(null, false, {
        //     code: er1,
        //     message: message1
        //   });
        // }

        return callback(null, true, response);

      }).catch(e => {
        console.error(e);
        request.log(['error', 'authenticator', 'basic'], e);
        let errors = helpers.Error.translate(e),
          code = helpers.Error.getCode(errors);

        if (code == '202') {
          return callback(null, false, notFound);
        }
        return callback(null, false, errors);
      });

    }

    return callback(null, false, notFound);
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

module.exports = BasicAuthenticator;
