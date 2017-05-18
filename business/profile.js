/*
 * @Author: toan.nguyen
 * @Date:   2016-05-21 22:25:40
* @Last modified by:   nhutdev
* @Last modified time: 2016-10-16T20:15:02+07:00
 */

'use strict';

const Hoek = require('hoek');
const BPromise = require('bluebird');
const helpers = require('node-helpers');

// const nexGosms = require('nex-gosms');
const optionTypes = helpers.ttypes.options;
const req = require('request-promise');
const requestErrors = require('request-promise/errors');

class ProfileBusiness {


  /**
   * Get profile from thrift service
   *
   * @param  {Object} request Request interface
   * @param  {String} userId  Request User ID
   * @param  {Object} opts    Optional data
   *
   * @return {BPromise}       Returns result promise
   */
  getProfile(request, userId, token) {

    let self = this,
      userStore = request.dataStore.userStore;

    request.log(['debug', 'profile', 'uid'], 'User ID: ' + userId);

    Hoek.assert(userStore, 'User className configuration has not implemented');

    return new BPromise((resolve, reject) => {

      let errorFunc = (err) => {
        let errors = helpers.Error.translate(err);

        if (helpers.Error.getCode(errors) == '202') {

          if (!request.config.user.autoRegister) {
            errors = helpers.Error.translate({
              code: '315'
            });
            return reject(errors);
          }

          let oauthCfg = request.config.api.nexxOAuth,
            headerAuth = 'Bearer ' + token;

          // not found, insert Customer for current user
          return req({
            uri: '/account/profile',
            baseUrl: oauthCfg.baseUrl,
            method: 'GET',
            headers: {
              authorization: headerAuth
            },
            json: true,
          }).then(body => {

            let prof = userStore.createModel(body.data.user),
              settings = request.config.user.settings || {};

            prof.settings = JSON.stringify(settings);

            return userStore.insertOne(prof).then(insertedProfile => {
              let profile = userStore.createModel(insertedProfile);
              return resolve({
                profile: profile,
                isNewUser: true
              });
            }, err => {
              request.log(['error', 'profile', 'insert'], err);
              let errors = helpers.Error.translate(err);
              return reject(errors);
            });

          }).catch(requestErrors.StatusCodeError, response => {
            request.log(['info', 'validateToken'], {
              errorCode: response.statusCode,
              body: response.error
            });

            return reject(response.error);
          }).catch(err => {

            request.log(['error', 'profile', 'nex-id'], err.toString());
            return reject(err);
          });

        } else {
          request.log(['error', 'profile', 'get'], err);
          return reject(errors);
        }
      };

      let respFunc = (profile, isNewUser) => {
        isNewUser = isNewUser || false;

        let errors,
          status = helpers.Const.status;

        switch (profile.status) {
          case status.INACTIVE:
            errors = helpers.Error.translate({
              code: '313'
            });
            return reject(errors);
          case status.DELETED:
            errors = helpers.Error.translate({
              code: '314'
            });
            return reject(errors);
          case status.DISABLED:
            errors = helpers.Error.translate({
              code: '312'
            });
            return reject(errors);
        }

        self.updateDeviceMeta(request, profile).then(result => {
          request.log(['debug'], 'Update notification token successfully: ' + result);
        }).catch(err => {
          console.error(err);
        });

        return resolve({
          profile: profile,
          isNewUser: isNewUser
        });
      };

      if (request.config.user.includes) {
        return userStore.getOneRelationByPk(userId, {
          includes: request.config.user.includes
        }).then(profile => {
          return respFunc(profile, false);
        }).catch(e => {
          return errorFunc(e);
        });

      }
      return userStore.getOneByPk(userId).then(profile => {
        return respFunc(profile, false);
      }).catch(e => {
        return errorFunc(e);
      });
    });
  }

  /**
   * Get profile from thrift service
   *
   * @param  {Object} request Request interface
   * @param  {String} nexId  Request User ID
   * @param  {Object} opts    Optional data
   *
   * @return {BPromise}       Returns result promise
   */
  getProfileByNexId(request, nexId, token) {

    let self = this,
      userStore = request.dataStore.userStore;

    request.log(['debug', 'profile', 'uid'], 'NexID: ' + nexId);

    Hoek.assert(userStore, 'User className configuration has not implemented');

    return new BPromise((resolve, reject) => {

      let errorFunc = (err) => {
        let errors = helpers.Error.translate(err);

        if (helpers.Error.getCode(errors) == '202') {

          if (!request.config.user.autoRegister) {
            errors = helpers.Error.translate({
              code: '315'
            });
            return reject(errors);
          }

          let oauthCfg = request.config.api.nexxOAuth,
            headerAuth = 'Bearer ' + token;

          // not found, insert Customer for current user
          return req({
            uri: '/account/profile',
            baseUrl: oauthCfg.baseUrl,
            method: 'GET',
            headers: {
              authorization: headerAuth
            },
            json: true,
          }).then(body => {

            let prof = userStore.createModel(body.data.user),
              settings = request.config.user.settings || {};

            prof.settings = JSON.stringify(settings);
            prof.uid = null;
            prof.nexid = body.data.user.uid;

            return userStore.insertOne(prof).then(insertedProfile => {

              return respFunc(insertedProfile, true);
            }, err => {
              request.log(['error', 'profile', 'insert'], err);
              let errors = helpers.Error.translate(err);
              return reject(errors);
            });

          }).catch(requestErrors.StatusCodeError, response => {
            request.log(['info', 'validateToken'], {
              errorCode: response.statusCode,
              body: response.error
            });

            return reject(response.error);
          }).catch(err => {

            request.log(['error', 'profile', 'nex-id'], err.toString());
            return reject(err);
          });

        } else {
          request.log(['error', 'profile', 'get'], err);
          return reject(errors);
        }
      };

      let respFunc = (profile, isNewUser) => {
        profile = userStore.createModel(profile);
        isNewUser = isNewUser || false;

        let errors,
          status = helpers.Const.status;

        switch (profile.status) {
          case status.INACTIVE:
            errors = helpers.Error.translate({
              code: '313'
            });
            return reject(errors);
          case status.DELETED:
            errors = helpers.Error.translate({
              code: '314'
            });
            return reject(errors);
          case status.DISABLED:
            errors = helpers.Error.translate({
              code: '312'
            });
            return reject(errors);
        }

        self.updateDeviceMeta(request, profile).then(result => {
          request.log(['debug'], 'Update notification token successfully: ' + result);
        }).catch(err => {
          console.error(err);
        });

        return resolve({
          profile: profile,
          isNewUser: isNewUser
        });
      };

      let selectOptions = new optionTypes.SelectOptions();
      selectOptions.includes = request.config.user.includes;

      if (request.config.user.includes) {
        return userStore.getOneRelationByNexId(nexId, selectOptions).then(profile => {

          return respFunc(profile, false);
        }).catch(e => {
          return errorFunc(e);
        });

      }

      return userStore.getOneByNexId(nexId).then(profile => {
        return respFunc(profile, false);
      }).catch(e => {
        return errorFunc(e);
      });
    });
  }

  /**
   * Update device meta data
   *
   * @param  {Object} request    Request data
   * @param  {Profile} profile Pofile data
   *
   */
  updateDeviceMeta(request, profile) {

    let metadata = profile.metadata || {};

    if (typeof (metadata) === 'string') {
      metadata = JSON.parse(profile.metadata);
    }

    if (!request.headers.devicetoken) {
      request.log(['debug', 'profile', 'devicetoken'], 'Empty device token');

      return BPromise.resolve();
    }

    let deviceMeta = metadata.deviceMeta || {},
      platform = request.headers.platform.toLowerCase();
    if (deviceMeta.deviceToken === request.headers.devicetoken && deviceMeta.platform === platform) {
      request.log(['debug', 'profile', 'devicetoken'], 'Same device token: ' + request.headers.devicetoken);
      return BPromise.resolve();
    }

    deviceMeta = {
      deviceToken: request.headers.devicetoken,
      platform: platform,
      os: request.headers.os,
      version: request.headers.version
    };

    metadata.deviceMeta = deviceMeta;

    profile.metadata = metadata;

    let userStore = request.dataStore.userStore;
    request.log(['debug', 'device-token', 'update'], request.headers.devicetoken);
    let metaString = helpers.Data.toDataString(metadata);

    return userStore.updateMetadata(profile.uid, metaString);
  }


  /**
   * Sends new verfication code to user by SMS or email
   *
   * @param  {Request} request Request object
   * @param  {CommonUser} user User object
   * @param {string} password new password
   */
  sendVerificationCode(request) {

    return new BPromise((resolve, reject) => {

      let profile = request.auth.credentials.profile,
        userStore = request.dataStore.userStore,
        verificationCfg = request.config.user.verification,
        verificationCode = profile.refreshVerificationCode(verificationCfg);

      let sendEmailFunc = () => {

        if (!profile.email) {
          let errors = helpers.Error.translate({
            code: '308'
          });
          request.log(['info', 'verfication', 'send'], errors);
          return reject(errors);
        }

        let thriftForm = profile.toThriftVerificationForm();

        return userStore.updateVerificationCode(thriftForm).then(() => {
          // send email if user has contact email
          // create reusable transporter object using the default SMTP transport
          let mailCfg = request.config.email.default,
            mailHelper = new helpers.Mailer(mailCfg),
            subject = request.translator.translate(verificationCfg.subjectKey),
            body = request.translator.translate(verificationCfg.bodyKey, {
              params: {
                verificationCode: verificationCode
              }
            });

          // setup e-mail data with unicode symbols
          mailHelper.send({
            to: profile.email, // list of receivers
            subject: subject, // Subject line
            html: body, // html body
          }, (error, info) => {

            if (error) {
              return request.log(['error', 'verfication', 'send'], error);
            }

            request.log(['debug', 'verfication'], 'Message sent: ' + info.response);
          });

          return resolve(verificationCode);
        }).catch(err => {
          return reject(err);
        });
      };

      // save verification code for profile

      switch (verificationCfg.transport) {
        case 'sms':
          if (!profile.phoneNumber) {
            let errors = helpers.Error.translate({
              code: '307'
            });
            request.log(['info', 'verfication', 'send'], errors);
            return reject(errors);
          }

          let thriftForm = profile.toThriftVerificationForm(),
            smsCfg = request.config.sms.default,
            // smsClient = new nexGosms(smsCfg),
            phoneNumber = helpers.Data.internationalPhoneNumber(profile.phoneNumber, request.config.i18n.country),
            message = request.translator.translate(verificationCfg.smsKey, {
              params: {
                verificationCode: verificationCode
              }
            });

          if (!message) {
            message = `Verification code ${verificationCode}`;
          }

          return smsClient.sendBrand({
            phoneNumber: phoneNumber,
            message: message
          }).then((result) => {
            return userStore.updateVerificationCode(thriftForm).then(() => {
              return resolve(verificationCode);
            });
          }).catch(e => {
            request.log(['error'], e);
            return reject(e);
          });


        case 'email':
          return sendEmailFunc();
        default:
          return sendEmailFunc();
      }
    });
  }
}

module.exports = ProfileBusiness;
