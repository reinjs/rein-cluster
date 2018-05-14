const path = require('path');
const is = require('is-type-of');
const IPCMessage = require('ipc-message');
const utils = require('../../rein-utils');

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
    this.$closing = false;
    this.$startClosing = false;
    this.$interval = setInterval(noop, 24 * 60 * 60 * 1000);
    this.$argv = utils.processArgvFormatter(process.argv.slice(2));
    this.$framework = utils.loadFile(path.resolve(this.$argv.framework, file));
    this.$server = new this.$framework(this);
    this.on('message', async msg => {
      if (is.function(this[msg.action])) return await this[msg.action](msg);
      if (is.function(this.$server.message)) return await this.$server.message(msg);
      await this.emit(msg.action, msg);
    });
  }
  
  /**
   * start agent service with thirdpart service `create` lifecycle
   * then sending 'ipc:agent#success' to master for telling which agent is ready
   * make $installed with true
   * @returns {Promise<void>}
   */
  async $listen() {
    if (this.$server.create) await this.$server.create();
    // if (this.pid % 2 === 1) throw new Error('error');
    if (is.function(this.onListen)) await this.onListen();
    this.$installed = true;
  }
  
  /**
   * destroy agent invoking thirdpart `destroy` lifecycle
   * @returns {Promise<void>}
   */
  async $destroy(signal) {
    if (this.$server.destroy) {
      await this.$server.destroy(signal);
    }
  }
  
  /**
   * killing main handle
   * @param signal
   */
  $kill(signal) {
    if (this.$closing) return;
    this.$closing = true;
    let closing = false;
    const timer = setInterval(() => {
      if (!this.$startClosing || closing) return;
      closing = true;
      clearInterval(this.$interval);
      clearInterval(timer);
      this.$destroy(signal).then(() => this.$resolve(signal)).catch(e => this.$reject(e, signal));
    }, 5);
  }
  
  /**
   * kill down the process
   * we log some message then exit with code 0
   * @param signal
   */
  $resolve(signal) {
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
  $reject(e, signal) {
    if (is.function(this.onReject)) this.onReject(signal);
    process.exit(1);
  }
  
  /**
   * tell master something error with `ipc:agent#error` when it catch error
   * just do it
   * @param e
   */
  $error(e) {
    if (is.function(this.onError)) this.onError(e);
  }
};

function noop() {}