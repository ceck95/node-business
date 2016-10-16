/*
 * @Author: toan.nguyen
 * @Date:   2016-09-08 16:06:57
* @Last modified by:   nhutdev
* @Last modified time: 2016-10-16T20:16:42+07:00
 */

'use strict';

const Hoek = require('hoek');
const thrift = require('thrift');
const BPromise = require('bluebird');
const helpers = require('node-helpers');
const thriftPool = require('node-thrift-pool');
const optionTypes = helpers.ttypes.options;
// const PagingQuery = helpers.models.PagingQuery;

class ThriftDataService {

  /**
   * Constructor, set default data
   *
   * @param  {Object} commonLibrary Common Library object
   * @param  {Object} options       Option data
   */
  constructor(options) {
    this._init(options);
  }

  get modelClass() {
    return this._modelClass;
  }

  /**
   * [createModel description]
   * @param  {[type]} name [description]
   * @return {[type]}      [description]
   */
  createModel(data) {
    return new this._modelClass(data);
  }

  /**
   * [_init description]
   *
   * @param  {[type]} modelClassName [description]
   * @param  {[type]} modelClass     [description]
   * @param  {[type]} options        [description]
   *
   * @return {[type]}                [description]
   */
  _init(options) {

    this._model = options.model;
    this._modelClass = options.modelClass;
    this._modelClassName = options.modelClassName;
    this._namespace = options.namespace;
    this._thriftConfig = options.config.servers[this._namespace];
    this._tableAlias = options.model.tableAlias;
    this._serviceMap = this.buildServiceMap();
  }

  /**
   * Returns table alias of model
   *
   * @return {String}
   */
  get tableAlias() {
    return this._tableAlias;
  }

  /**
   * [buildServiceMap description]
   *
   * @return {[type]} [description]
   */
  buildServiceMap() {
    let self = this,
      serviceMap = {};

    if (this._model.defaultServiceActions) {
      this._model.defaultServiceActions.forEach(actionName => {
        let serviceName = helpers.DataAccess.getServiceName(this._model, actionName);
        if (!self[actionName]) {
          self[actionName] = ((...args) => {
            return self.executeService(serviceName, ...args);
          }).bind(self);
        }

        serviceMap[actionName] = serviceName;

      });
    }

    if (this._model.serviceActions) {
      // let client = self.connect();

      this._model.serviceActions.forEach(actionName => {
        let serviceName = helpers.DataAccess.getServiceName(this._model, actionName);
        serviceMap[actionName] = serviceName;

        // Hoek.assert(client[serviceName], 'Service `' + serviceName + '` for action `' + actionName + '` has not been implemented. Model Class: ' + this._modelClassName);

        self[actionName] = ((...args) => {
          return self.executeService(serviceName, ...args);
        }).bind(self);
      });

    }

    return serviceMap;
  }

  /**
   * Connects to thrift pool, with key
   *
   * @param  {String} key Thrift Connection key
   *
   * @return {ThriftClient}         Thrift client
   */
  connect() {
    let cfg = this._thriftConfig;
    return thriftPool(thrift, cfg.thriftService, cfg.connection, cfg.options);
  }

  /**
   * [execute description]
   * @param  {[type]} actionName [description]
   * @return {[type]}            [description]
   */
  execute(actionName, ...args) {
    let serviceName = this._serviceMap[actionName];
    Hoek.assert(serviceName, 'Service `' + serviceName + '` for action `' + actionName + '` has not been implemented. Model Class: ' + this._modelClassName);

    return this.executeService(serviceName, ...args);
  }

  /**
   * [execute description]
   * @param  {[type]} serviceName [description]
   * @return {[type]}            [description]
   */
  executeService(serviceName, ...args) {
    let self = this;

    return new BPromise((resolve, reject) => {

      if (typeof(args[args.length - 1]) !== 'function') {
        let responseFunc = (err, result) => {
          if (err) {
            return reject(err);
          }
          return resolve(result);
        };

        args.push(responseFunc);
      }

      let client = self.connect();

      if (!client[serviceName]) {
        let e = new Error('Service `' + serviceName + '` has not been implemented. Model Class: ' + this._modelClassName);
        return reject(e);
      }

      return client[serviceName](...args);
    });
  }

  /**
   * Insert one model into database
   *
   * @param  {Object} model  Model data
   *
   * @return {BPromise} Promise result
   */
  insertOne(model) {
    let thriftInsert = model.toThriftInsert ? model.toThriftInsert() : model,
      serviceName = this._serviceMap.insertOne;

    return this.executeService(serviceName, thriftInsert);
  }

  /**
   * Insert many models into database
   *
   * @param  {Array} model  Model data
   *
   * @return {BPromise} Promise result
   */
  insertMany(models) {

    let serviceName = this._serviceMap.insertMany,
      insertModels = new Array(models.length);

    for (let i = models.length - 1; i >= 0; i--) {
      let m = models[i];
      insertModels[i] = m.toThriftInsert ? m.toThriftInsert() : m;
    }

    return this.executeService(serviceName, insertModels);

  }

  /**
   * Update model into database
   *
   * @param  {Object} model  Model data
   * @param  {Object} options Update options
   *
   * @return {BPromise} Promise result
   */
  updateOne(model, query, options) {

    let thriftForm = model.toThriftForm ? model.toThriftForm() : model,
      serviceName = this._serviceMap.updateOne;

    if (!query) {
      let updateOptions = new optionTypes.UpdateOptions();
      if (options) {
        helpers.Model.assignData(updateOptions, options);
      }
      return this.executeService(serviceName, thriftForm, updateOptions);
    }

    query = query.toThriftQuery ? query.toThriftQuery() : query;

    if (options) {
      let updateOptions = new optionTypes.UpdateOptions();
      helpers.Model.assignData(updateOptions, options);
      return this.executeService(serviceName, thriftForm, query, updateOptions);
    }

    return this.executeService(serviceName, thriftForm, query);
  }

  /**
   * Upsert model into database
   *
   * @param  {Object} model  Model data
   * @param  {Object} options Update options
   *
   * @return {BPromise} Promise result
   */
  upsertOne(model) {

    let thriftForm = model.toThriftInsert ? model.toThriftInsert() : model,
      serviceName = this._serviceMap.upsertOne;

    return this.executeService(serviceName, thriftForm);
  }

  /**
   * Get single object from database, return service
   *
   * @param  {mixed} condition     query condition
   * @param  {Function} result Returned service data
   */
  getOne(query) {

    let thriftQuery = query.toThriftQuery ? query.toThriftQuery() : query;
    return this.commonGetOne('getOne', thriftQuery);
  }

  /**
   * [commonGetOne description]
   * @param  {[type]} actionName [description]
   * @return {[type]}            [description]
   */
  commonGetOne(actionName, ...args) {
    let self = this;

    return new BPromise((resolve, reject) => {

      let serviceName = self._serviceMap[actionName],
        responseFunc = (err, result) => {
          if (err) {
            return reject(err);
          }

          let m = new self._modelClass(result);
          return resolve(m);
        };

      args.push(responseFunc);

      return self.executeService(serviceName, ...args);
    });
  }

  /**
   * [commonGetMany description]
   * @param  {[type]} actionName [description]
   * @return {[type]}            [description]
   */
  commonGetMany(actionName, ...args) {
    let self = this;

    return new BPromise((resolve, reject) => {

      let serviceName = self._serviceMap[actionName],
        responseFunc = (err, results) => {
          if (err) {
            return reject(err);
          }

          if (helpers.Array.isEmpty(results)) {
            return resolve([]);
          }

          let respModels = new Array(results.length);
          for (let i = results.length - 1; i >= 0; i--) {
            let raw = results[i];
            respModels[i] = new self._modelClass(raw);
          }

          return resolve(respModels);
        };

      args.push(responseFunc);

      return self.executeService(serviceName, ...args);
    });
  }

  /**
   * [commonGetOptions description]
   * @param  {[type]} actionName [description]
   * @param  {[type]} model      [description]
   * @param  {[type]} options    [description]
   * @return {[type]}            [description]
   */
  commonGetOneOptions(actionName, options, ...args) {
    let self = this;

    return new BPromise((resolve, reject) => {

      let serviceName = self._serviceMap[actionName],
        selectOptions = new optionTypes.SelectOptions(),
        responseFunc = (err, result) => {

          if (err) {
            return reject(err);
          }

          let m = new self._modelClass(result);
          return resolve(m);
        };


      if (options) {
        helpers.Model.assignCamelCase(selectOptions, options);
      }

      args.push(selectOptions);
      args.push(responseFunc);

      return self.executeService(serviceName, ...args);
    });
  }


  /**
   * [commonGetManyOptions description]
   * @param  {[type]} actionName [description]
   * @param  {[type]} options    [description]
   * @return {[type]}            [description]
   */
  commonGetManyOptions(actionName, options, ...args) {

    let self = this;

    return new BPromise((resolve, reject) => {

      let serviceName = self._serviceMap[actionName],
        selectOptions = new optionTypes.SelectOptions(),
        responseFunc = (err, results) => {
          if (err) {
            return reject(err);
          }

          let respModels = self.convertModels(results);

          return resolve(respModels);
        };


      if (options) {
        helpers.Model.assignCamelCase(selectOptions, options);
      }
      args.push(selectOptions);
      args.push(responseFunc);

      return self.executeService(serviceName, ...args);
    });
  }

  /**
   * [commonGetManyOptions description]
   * @param  {[type]} actionName [description]
   * @param  {[type]} options    [description]
   * @return {[type]}            [description]
   */
  commonGetPagination(actionName, ...args) {

    let self = this;

    return new BPromise((resolve, reject) => {

      let serviceName = self._serviceMap[actionName],
        responseFunc = (err, results) => {
          if (err) {
            return reject(err);
          }

          let respModels = self.convertModels(results.data);
          results.data = respModels;

          return resolve(results);
        };

      args.push(responseFunc);

      return self.executeService(serviceName, ...args);
    });
  }


  /**
   * Get single object from database, return service
   *
   * @param  {mixed} condition     query condition
   * @param  {Function} result Returned service data
   */
  getOneByPk(pk) {
    return this.commonGetOne('getOneByPk', pk);
  }

  /**
   * [convertModels description]
   * @param  {[type]} rawModels [description]
   * @return {[type]}         [description]
   */
  convertModels(rawModels) {
    if (helpers.Array.isEmpty(rawModels)) {
      return [];
    }

    let respModels = new Array(rawModels.length);
    for (let i = rawModels.length - 1; i >= 0; i--) {
      let raw = rawModels[i];
      respModels[i] = new this._modelClass(raw);
    }

    return respModels;
  }

  /**
   * Get single object from database, return service
   *
   * @param  {mixed} condition     query condition
   * @param  {Function} result Returned service data
   */
  // getOneRelation(condition, opts, result) {

  //   opts = opts || {};
  //   if (Array.isArray(opts)) {
  //     opts = { includes: opts };
  //   }

  //   return this.responseGetOne(this.adapter.getOneRelation(condition, opts), opts, result);
  // }

  /**
   * Get single object from database, return service
   *
   * @param  {mixed} condition     query condition
   * @param  {Function} result Returned service data
   */
  getOneRelationByPk(pk, options) {
    return this.commonGetOneOptions('getOneRelationByPk', options, pk);
  }

  /**
   * Check exists by condition
   *
   * @param  {mixed} uid    Unique Primary key value
   * @param  {Function} result Callback result
   */
  // exists(condition, result) {

  //   let opts = {};

  //   return this.responseDefault(this.exists, opts, result);
  // }

  /**
   * Get multiple objects from database, return service
   *
   * @param  {Array} pks     Primary key
   * @param {Object} opts Optional data
   * @param  {Function} result Returned service data
   */
  getMany(pks) {
    return this.commonGetMany('getMany', pks);
  }

  /**
   * Get multiple objects from database with relationship, return service
   *
   * @param  {Array} pks     Primary key
   * @param {Object} opts Optional data
   *
   * @param  {Function} result Returned service data
   */
  getManyRelation(pks, options) {
    return this.commonGetManyOptions('getManyRelation', options, pks);
  }

  /**
   * Get all records from database, return service
   *
   * @param {Object} opts Optional data
   * @param  {Function} result Returned service data
   */
  getAll() {
    return this.commonGetMany('getAll');
  }

  /**
   * Query all rows from database, without relations
   * Filtered by status
   *
   * @param  {Integer} status Status
   * @param  {Function} result Callback function
   *
   * @return {object}   Result model
   */
  getAllStatus(status) {
    return this.commonGetMany('getAllStatus', status);
  }

  /**
   * Query all active rows from database, without relations
   *
   * @param  {Function} result Callback function
   *
   * @return {object}   Result model
   */
  getAllActive() {
    return this.commonGetMany('getAllActive');
  }

  /**
   * Query all inactive rows from database, without relations, with order
   *
   * @param  {Function} result Callback function
   *
   * @return {object}   Result model
   */
  getAllInactive() {
    return this.commonGetMany('getAllInactive');
  }

  /**
   * Query all disabled rows from database, without relations, with order
   *
   * @param  {Function} result Callback function
   *
   * @return {object}   Result model
   */
  getAllDisabled() {
    return this.commonGetMany('getAllDisabled');
  }

  /**
   * Query all deleted rows from database, without relations, with order
   *
   * @param  {Function} result Callback function
   *
   * @return {object}   Result model
   */
  getAllDeleted() {
    return this.commonGetMany('getAllDeleted');
  }


  /**
   * Get all records from database, with order return service
   *
   * @param {String} order Order SQL string
   * @param {Object} opts Optional data
   * @param  {Function} result Returned service data
   */
  getAllOrder(order) {
    return this.commonGetMany('getAllOrder', order);
  }

  /**
   * Get all records from database, with relationship and pagination, return service
   *
   * @param  {Object} pagingParams     Pagination params
   * @param  {Function} result Returned service data
   */
  getPagination(pagingParams) {

    let thriftPaging = pagingParams.toThriftObject ? pagingParams.toThriftObject() : pagingParams;

    return this.commonGetPagination('getPagination', thriftPaging);
  }

  /**
   * Get multiple rows from table, with condition
   *
   * @param  {object} params Query params
   * @param  {Object} opts Optional data
   * @param  {Function} result Callback function
   *
   */
  // getAllCondition(params, opts, result) {
  //   return this.responseMany(this.adapter.getAllCondition(params, opts), opts, result);
  // }


  /**
   * Filter multiple objects from database, return service
   *
   * @param  {Object} params     Parameters filter data
   * @param  {Object} pagingParams     Pagination params
   * @param  {Function} result Returned service data
   */
  filter(params, pagingParams) {

    let thriftParams = params.toThriftObject ? params.toThriftObject() : params,
      thriftPaging = pagingParams.toThriftObject ? pagingParams.toThriftObject() : pagingParams;

    return this.commonGetMany('filter', thriftParams, thriftPaging);
  }

  /**
   * Filter multiple objects from database, return service
   *
   * @param  {Object} params     Parameters filter data
   * @param  {Object} pagingParams     Pagination params
   * @param  {Function} result Returned service data
   */
  filterPagination(params, pagingParams) {

    let thriftParams = params.toThriftObject ? params.toThriftObject() : params,
      thriftPaging = pagingParams.toThriftObject ? pagingParams.toThriftObject() : pagingParams;

    return this.commonGetPagination('filterPagination', thriftParams, thriftPaging);

  }

  /**
   * Deletes one record by condition
   *
   * @param  {Object} condition    Query condition
   * @param  {Function} result Callback result
   */
  deleteOne(query) {

    let thriftQuery = query.toThriftQuery ? query.toThriftQuery() : query;
    return this.execute('deleteOne', thriftQuery);
  }

  /**
   * Delete many record by condition
   *
   * @param  {Object} condition    Query condition
   * @param  {Function} result Callback result
   */
  deleteMany(query) {

    let thriftQuery = query.toThriftQuery ? query.toThriftQuery() : query;
    return this.execute('deleteMany', thriftQuery);
  }

  /**
   * Delete one record by primary key
   *
   * @param  {mixed} pk    Unique Primary key value
   * @param  {Function} result Callback result
   */
  deleteByPk(pk) {

    let self = this;
    return new BPromise((resolve, reject) => {
      let client = self.connect(),
        serviceName = self._serviceMap.deleteByPk;

      return client[serviceName](pk, (err, result) => {
        if (err) {
          return reject(err);
        }

        return resolve(result);
      });
    });
  }

  /**
   * Get or create new record, return retrieved record data
   *
   * @param  {Object} model  Model data
   * @param  {Function} result Returned service data
   */
  getOrCreate(model) {

    let thriftInsert = model.toThriftInsert ? model.toThriftInsert() : model;

    return this.commonGetOne('getOrCreate', thriftInsert);
  }

  /**
   * Get and update one record, return retrieved record data
   *
   * @param  {Object} model     Model data
   * @param  {Object} query     Query data
   * @param  {Object} options   Option data
   *
   * @param  {Function} result Returned service data
   */
  getOneAndUpdate(model, query, options) {
    let thriftForm = model.toThriftForm ? model.toThriftForm() : model,
      thriftQuery = query.toThriftQuery ? query.toThriftQuery() : query,
      updateOptions = new optionTypes.UpdateOptions();

    if (options) {
      helpers.Model.assignData(updateOptions, options);
    }

    return this.commonGetOne('getOneAndUpdate', thriftForm, thriftQuery, updateOptions);
  }
}

module.exports = ThriftDataService;
