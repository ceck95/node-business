/*
 * @Author: toan.nguyen
 * @Date:   2016-09-08 16:43:58
 * @Last Modified by:   toan.nguyen
 * @Last Modified time: 2016-09-26 07:32:47
 */

'use strict';

const Hoek = require('hoek');
const thrift = require('thrift');
const thriftPool = require('node-thrift-pool');
const ThriftDataService = require('./thrift-data-service');

class ThriftManager {

  /**
   * Constructor, set default data
   *
   * @param  {Object} commonLibrary Common Library object
   * @param  {Object} options       Option data
   */
  constructor(commonLibrary, options) {
    this._thriftServices = {};
    this._defaultServiceNamespace = options.default;
    this._configs = Hoek.clone(options);

    for (let k in this._configs.servers) {

      if (!this._defaultServiceNamespace) {
        this._defaultServiceNamespace = k;
      }
      this._thriftServices[k] = {};
      this._configs.servers[k].thriftService = commonLibrary.thrift[k];
    }

    this._defaultThriftService = this._thriftServices[this._defaultServiceNamespace];
    this.addThriftModelServices(commonLibrary);

  }

  /**
   * Add thrift service to the service manager
   *
   * @param  {Object} commonLibrary Common Library object
   * @param  {String} key           Config key
   * @param  {Object} options       Option data
   */
  addThriftModelServices(commonLibrary) {
    for (let key in commonLibrary.models) {

      let modelClass = commonLibrary.models[key];
      if (!modelClass) {
        console.warn('`' + key + '` is not a model');
        continue;
      }

      let model = new modelClass();

      if (model.defaultServiceActions || model.serviceActions) {


        let serviceNamespace = model.serviceNamespace || 'default';
        if (serviceNamespace === 'default') {
          serviceNamespace = this._defaultServiceNamespace;
        }

        let modelService = new ThriftDataService({
          modelClassName: key,
          modelClass: modelClass,
          model: model,
          config: this._configs,
          namespace: serviceNamespace
        });


        this._thriftServices[serviceNamespace][key] = modelService;
      }
    }
  }


  /**
   * Connects to thrift pool, with key
   *
   * @param  {String} key Thrift Connection key
   *
   * @return {ThriftClient}         Thrift client
   */
  connect(key) {
    key = key || this._defaultServiceNamespace;
    let cfg = this._configs.servers[key];

    return thriftPool(thrift, cfg.thriftService, cfg.connection, cfg.options);
  }

  /**
   * [createModel description]
   * @param  {[type]} name [description]
   * @return {[type]}      [description]
   */
  createModel(className, data) {
    return this.getStore(className).createModel(data);
  }

  /**
   * [getStore description]
   *
   * @return {[type]} [description]
   */
  getStore(className) {

    if (Array.isArray(className)) {
      if (className.length > 1) {
        return this._thriftServices[className[0]][className[1]];
      }

      return this._defaultThriftService[className[0]];
    }

    return this._defaultThriftService[className];
  }
}

module.exports = ThriftManager;
