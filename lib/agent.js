const Application = require('./layer');

class Agent extends Application {
  constructor() {
    super('agent.js', true);
  }
  
  /**
   * get the agent name from argv
   * set _name to invoke
   * @returns {*}
   */
  get _name() {
    return this._argv.service.agent.name;
  }
  
  /**
   * send `ipc:agent#success` to master
   * @returns {*}
   */
  onListen() {
    return this.send('master', `ipc:agent#success`, { name: this._name });
  }
  
  onResolve(signal) {
    if (this.server.logger) {
      this.server.logger.info(`[agent:<${this._name}>#destroy#${signal}]`, 'success');
    }
  }
  
  onReject(e, signal) {
    if (this.server.logger) {
      this.server.logger.error(`[agent:<${this._name}>#destroy#${signal}]`, 'error', e);
    }
  }
  
  onError(e) {
    this.send('master', 'ipc:agent#error', {
      name: this._name,
      error: e.message
    });
  }
  
  /**
   * we start really destroy when master tell us `ipc:agent#close` message
   * either we loop checking the message
   */
  ['ipc:agent#close']() {
    this._startClosing = true;
  }
}

//////////////////////////////////////////////////////////
// we must start service on agent
// by shenyunjie
//////////////////////////////////////////////////////////

const app = new Agent();

// something for exit
process.on('SIGTERM', app._kill.bind(app, 'SIGTERM'));
process.on('SIGINT', app._kill.bind(app, 'SIGINT'));
process.on('SIGQUIT', app._kill.bind(app, 'SIGQUIT'));

// something for error
['error', 'rejectionHandled', 'uncaughtException', 'unhandledRejection'].forEach(errtype => {
  process.on(errtype, e => {
    if (app.server.logger) app.server.logger.error(`[agent:error#${errtype}]`, e);
    if (!app._installed) app.onError(e);
  });
});

// listen the service on agent
// bind error handle
app._listen().catch(app._error.bind(app));