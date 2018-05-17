const Application = require('./layer');
let catchError = false;

class Agent extends Application {
  constructor() {
    super('agent.js', true);
  }
  
  /**
   * get the agent name from argv
   * set name to invoke
   * @returns {*}
   */
  get name() {
    return this._argv.service.agent.name;
  }
  
  /**
   * send `ipc:agent#success` to master
   * @returns {*}
   */
  onListen() {
    return new Promise(resolve => {
      process.nextTick(() => {
        if (!catchError) this.send('master', `ipc:agent#success`, { name: this.name });
        setTimeout(resolve, 100);
      });
    });
  }
  
  onResolve(signal) {
    this.logger.info(`[Agent:<${this.name}>:destroy#${signal}]`, 'it closed successful');
  }
  
  onReject(e, signal) {
    this.logger.error(`[Agent:<${this.name}>:destroy#${signal}]`, 'error', e);
  }
  
  onError(e) {
    catchError = true;
    this.send('master', 'ipc:agent#error', {
      name: this.name,
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
['error', 'rejectionHandled', 'uncaughtException', 'unhandledRejection'].forEach(errtype => process.on(errtype, e => app._error(e)));

// listen the service on agent
// bind error handle
app._listen().catch(e => app._error(e));