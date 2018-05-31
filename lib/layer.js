const path = require('path');
const is = require('is-type-of');
const IPCMessage = require('ipc-message');
const utils = require('@reinjs/rein-utils');

/**
 * in service we got lifecycle:
 * @life message(msg): <Promise> 消息通知生命周期
 * @life create(): <Promise> 启动服务生命周期
 * @life destroy(signal): <Promise> 销毁服务生命周期
 * @type {module.Application}
 */
module.exports = class Application extends IPCMessage {
  constructor(file, isAgent) {
    super(isAgent);
    this._closing = false;
    this._startClosing = false;
    this._interval = setInterval(noop, 24 * 60 * 60 * 1000);
    this._argv = utils.processArgvFormatter(process.argv.slice(2));
    this._framework = utils.loadFile(path.resolve(this._argv.framework, file));
    this.server = new this._framework(this);
    this.on('message', async msg => {
      if (msg.action === 'agent:extra:data') return await this.extra();
      if (is.function(this[msg.action])) return await this[msg.action](msg);
      if (is.function(this.server.message)) return await this.server.message(msg);
      await this.emit(msg.action, msg);
    });
  }
  
  async extra() {
    let res = {
      name: this.server.name
    };
    if (is.function(this.server.extra)) res.data = await this.server.extra();
    return this.send('master', 'agent:extra:data', res);
  }
  
  get logger() {
    return this.server.logger || console;
  }
  
  /**
   * start agent service with thirdpart service `create` lifecycle
   * then sending 'ipc:agent#success' to master for telling which agent is ready
   * make _installed with true
   * @returns {Promise<void>}
   */
  async _listen() {
    if (this.server.create) await this.server.create();
    // if (this.pid % 2 === 1) throw new Error('error');
    if (is.function(this.onListen)) await this.onListen();
    this._installed = true;
  }
  
  /**
   * destroy agent invoking thirdpart `destroy` lifecycle
   * @returns {Promise<void>}
   */
  async _destroy(signal) {
    if (this.server.destroy) {
      await this.server.destroy(signal);
    }
  }
  
  /**
   * killing main handle
   * @param signal
   */
  _kill(signal) {
    if (this._closing) return;
    this._closing = true;
    let closing = false;
    const timer = setInterval(() => {
      if (!this._startClosing || closing) return;
      closing = true;
      clearInterval(this._interval);
      clearInterval(timer);
      this._destroy(signal).then(() => this._resolve(signal)).catch(e => this._reject(e, signal));
    }, 5);
  }
  
  /**
   * kill down the process
   * we log some message then exit with code 0
   * @param signal
   */
  _resolve(signal) {
    this.removeAllListeners();
    process.removeAllListeners();
    if (is.function(this.onResolve)) this.onResolve(signal);
    process.exit(0);
  }
  
  /**
   * it catch errors when killing down the process
   * we should output error message and exit with code 1
   * @param e
   * @param signal
   */
  _reject(e, signal) {
    if (is.function(this.onReject)) this.onReject(signal);
    process.exit(1);
  }
  
  /**
   * tell master something error with `ipc:agent#error` when it catch error
   * just do it
   * @param e
   */
  _error(e) {
    this.logger.error(e);
    if (is.function(this.onError)) {
      if (!this._installed) this.onError(e);
    }
  }
};

function noop() {}