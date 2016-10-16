/*
 * @Author: toan.nguyen
 * @Date:   2016-05-21 22:25:40
* @Last modified by:   nhutdev
* @Last modified time: 2016-10-16T20:14:58+07:00
 */

'use strict';

const Hoek = require('hoek');
const BPromise = require('bluebird');
const helpers = require('node-helpers');

class NotificationBussiness {

  /**
   * Constructor, set default data
   */
  constructor(options, resources, translator) {

    Hoek.assert(options, 'Options must not be empty');
    Hoek.assert(resources, 'Resources must not be empty');
    Hoek.assert(translator, 'Translator must not be empty');

    this.defaultTarget = options.default;
    this.resources = resources;
    this.translator = translator;
    this._urbanAirships = {};

    for (let key in options.applications) {
      let cfg = options.applications[key],
        urban = new helpers.UrbanAirship(cfg);

      urban.className = cfg.className.split('.');
      this._urbanAirships[key] = urban;
    }
  }

  /**
   * [getDefaultStore description]
   *
   * @param  {[type]} request [description]
   * @param  {[type]} type [description]
   *
   * @return {[type]}         [description]
   */
  getStore(request, target) {
    target = target || this.defaultTarget;
    let urban = this._urbanAirships[target];
    return request.dataStore.getStore(urban.className);
  }

  /**
   * Applies option data
   *
   * @param  {Object} opts Option data
   *
   * @return {Object}      Applied option data
   */
  applyOptions(opts) {

    opts = Hoek.applyToDefaults({
      messageAlert: true,
      deviceTypes: ['android', 'ios'],
      save: false
    }, opts || {});

    if (opts.subjectKey) {
      let options = this.resources.subject[opts.subjectKey];
      Hoek.merge(opts, options, false, false);
    }

    if (!opts.title && opts.titleKey) {
      opts.title = this.translator.translate(opts.titleKey);
    }

    if (!opts.message && opts.messageKey) {
      opts.message = this.translator.translate(opts.messageKey);
    }

    if (opts.subjectType) {
      opts.appDefined = opts.appDefined || {};
      opts.appDefined.subjectType = opts.subjectType;
    }

    if (opts.params) {
      for (let key in opts.params) {
        opts.title = opts.title.replace('{{' + key + '}}', opts.params[key]);
        if (opts.message) {
          opts.message = opts.message.replace('{{' + key + '}}', opts.params[key]);
        }
      }
    }

    let alert = opts.alert;
    if (!alert) {
      if (opts.messageAlert) {
        alert = opts.message || opts.title;
      } else {
        alert = opts.title || opts.message;
      }
    }
    opts.alert = alert;

    return opts;
  }

  /**
   * Adds device type into params
   *
   * @param {Object} params Input params
   * @param {String} type   Device type
   */
  _addDeviceType(params, type) {
    if (helpers.Array.isEmpty(params.deviceTypes)) {
      params.deviceTypes = [type];
    } else if (params.deviceTypes.indexOf(type) === -1) {
      params.deviceTypes = [type];
    }
  }

  /**
   * Adds profile to audience
   *
   * @param {Object} params  Input params
   * @param {Object} profile Profile data
   */
  _addProfileToAudience(params, profile) {

    params.deviceToken = params.deviceToken || [];
    params.alias = params.alias || [];

    if (typeof(profile) === 'object') {
      let userId = profile.uid || profile.userId;

      if (params.exceptUsers ? params.exceptUsers.indexOf(userId) !== -1 : false) {
        return;
      }

      let metadata = helpers.Json.parse(profile.metadata);

      if (profile.deviceToken && profile.platform) {
        params.deviceToken.push({
          deviceToken: profile.deviceToken,
          platform: profile.platform
        });

        this._addDeviceType(params, profile.platform);

      } else if (metadata.deviceMeta ? metadata.deviceMeta.deviceToken : false) {
        params.deviceToken.push({
          deviceToken: metadata.deviceMeta.deviceToken,
          platform: metadata.deviceMeta.platform
        });

        this._addDeviceType(params, metadata.deviceMeta.platform);
      } else {
        params.alias = userId;
      }

      return userId;
    } else {
      if (params.exceptUsers ? params.exceptUsers.indexOf(profile) !== -1 : false) {
        return;
      }
      params.alias.push(profile);
      return profile;
    }
  }

  /**
   * Common push notifications
   *
   * @param  {Object} request Request data
   * @param  {Object} params  Request params
   *
   * @return {Promise}        Promise result
   */
  _commonPush(request, params, audience) {

    return new BPromise((resolve, reject) => {
      let logger = new helpers.Log(request),
        urbanAirship = this._urbanAirships[params.target],
        created = (new Date()).getTime();

      Hoek.assert(urbanAirship, 'UrbanAirship instance of target`' + params.target + '` is not exists');

      params.appDefined = {
        title: params.title,
        type: params.type,
        subjectId: params.subjectId,
        subjectType: params.subjectType,
        createdAt: created,
        metadata: params.metadata
      };

      if (!params.ignoreBody) {
        params.appDefined.body = params.message;
      }

      let urbanFunc = (model) => {
        // push notification request

        let requestParams = urbanAirship.buildParams(params);
        logger.debug('Request params: ', requestParams);

        return urbanAirship.pushNotification(requestParams).then(result => {
          logger.debug('Notification result: ', result);
          let response = model || params.appDefined;

          return resolve(response);

        }, (err) => {
          logger.error('Push to user error: ', err);
          return reject(err);
        });
      };

      // insert into database
      if (params.save) {
        let notificationStore = request.dataStore.getStore(urbanAirship.className),
          notificationModel = notificationStore.createModel({
            title: params.title,
            message: params.message,
            type: params.type,
            subjectId: params.subjectId,
            subjectType: params.subjectType,
            metadata: params.metadata,
            status: helpers.Const.status.ACTIVE,
            audience: audience
          });

        return notificationStore.insertOne(notificationModel).then(result => {
          params.appDefined.uid = result.uid;
          let responseModel = notificationStore.createModel(result);
          return urbanFunc(responseModel);
        }).catch(err => {
          logger.error('Inserted notification error', err);
          return reject(err);
        });
      } else {
        return urbanFunc();
      }
    });
  }


  /**
   * Push notification to target user
   *
   * @param  {Object} request Request interface
   * @param  {String} profile  Target profile
   * @param  {Object} opts    Optional data
   */
  pushToUser(request, profile, opts) {

    Hoek.assert(profile, 'Notification profile must not be empty');

    let self = this;

    opts = self.applyOptions(opts);

    let userId = self._addProfileToAudience(opts, profile);
    return self._commonPush(request, opts, [userId]);
  }


  /**
   * Push notification to array of user
   *
   * @param  {Object} request Request interface
   * @param  {String} profiles  Target profiles
   * @param  {Object} opts    Optional data
   *
   */
  pushAll(request, opts) {

    let self = this;
    opts = self.applyOptions(opts);

    let urbanAirship = self._urbanAirships[opts.target];

    Hoek.assert(urbanAirship, 'UrbanAirship instance of target`' + opts.target + '` is not exists');

    opts.audience = 'all';

    return self._commonPush(request, opts, []);
  }

  /**
   * Push notification to array of user
   *
   * @param  {Object} request Request interface
   * @param  {String} profiles  Target profiles
   * @param  {Object} opts    Optional data
   *
   */
  pushToUsers(request, profiles, opts) {

    Hoek.assert(profiles, 'Notification profile must not be empty');
    let self = this,
      logger = new helpers.Log(request);

    opts = self.applyOptions(opts);

    let audience = [];

    logger.debug('Pushes notification to multiple users: ' + profiles.length);

    profiles.forEach((profile) => {

      let userId = self._addProfileToAudience(opts, profile);
      audience.push(userId);
    });

    return self._commonPush(request, opts, audience);
  }

  /**
   * Count unread notifications
   *
   * @param  {Object}   request  Request instance
   * @param  {String}   userId   User id
   * @param  {Function} callback Callback function
   *
   */
  countUnread(request, userId, opts) {
    opts = opts || {};

    Hoek.assert(userId, 'User ID cannot be empty');

    let self = this,
      // logger = new helpers.Log(request.log),
      target = opts.target || this.defaultTarget;

    Hoek.assert(self._urbanAirships[target], 'UrbanAirship client with type', target, ' is not existed');

    let urbanAirship = self._urbanAirships[target],
      notificationStore = request.dataStore.getStore(urbanAirship.className);

    return notificationStore.countUnread(userId, '');
  }
}

module.exports = NotificationBussiness;
