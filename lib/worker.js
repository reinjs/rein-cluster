const Application = require('./layer');
let catchError = false;

class Agent extends Application {
  constructor() {
    super('worker.js');
  }
  
  /**
   * send `ipc:agent#success` to master
   * @returns {*}
   */
  onListen() {
    return new Promise(resolve => {
      process.nextTick(() => {
        if (!catchError) this.send('master', `ipc:worker#success`);
        setTimeout(resolve, 100);
      });
    });
  }
  
  onResolve(signal) {
    if (this.server.logger) {
      this.server.logger.info(`[Worker<${this.pid}>:destroy#${signal}]`, 'it closed successful.');
    }
  }
  
  onReject(e, signal) {
    if (this.server.logger) {
      this.server.logger.error(`[Worker<${this.pid}>:destroy#${signal}]`, 'error', e);
    }
  }
  
  onError(e) {
    catchError = true;
    this.send('master', 'ipc:worker#error', {
      error: e.message
    });
  }
  
  /**
   * we start really destroy when master tell us `ipc:agent#close` message
   * either we loop checking the message
   */
  ['ipc:worker#close']() {
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
['error', 'rejectionHandled', 'uncaughtException', 'unhandledRejection'].forEach(errtype => process.on(errtype, app._error.bind(app)));

// listen the service on agent
// bind error handle
app._listen().catch(app._error.bind(app));