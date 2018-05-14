const Application = require('./layer');

class Agent extends Application {
  constructor() {
    super('worker.js');
  }
  
  /**
   * send `ipc:agent#success` to master
   * @returns {*}
   */
  onListen() {
    return this.send('master', `ipc:worker#success`);
  }
  
  onResolve(signal) {
    if (this.$server.$logger) {
      this.$server.$logger.info(`[worker:<${this.pid}>#destroy#${signal}]`, 'success');
    }
  }
  
  onReject(e, signal) {
    if (this.$server.$logger) {
      this.$server.$logger.error(`[worker:<${this.pid}>#destroy#${signal}]`, 'error', e);
    }
  }
  
  onError(e) {
    this.send('master', 'ipc:worker#error', {
      error: e.message
    });
  }
  
  /**
   * we start really destroy when master tell us `ipc:agent#close` message
   * either we loop checking the message
   */
  ['ipc:worker#close']() {
    this.$startClosing = true;
  }
}

//////////////////////////////////////////////////////////
// we must start service on agent
// by shenyunjie
//////////////////////////////////////////////////////////

const app = new Agent();

// something for exit
process.on('SIGTERM', app.$kill.bind(app, 'SIGTERM'));
process.on('SIGINT', app.$kill.bind(app, 'SIGINT'));
process.on('SIGQUIT', app.$kill.bind(app, 'SIGQUIT'));

// something for error
['error', 'rejectionHandled', 'uncaughtException', 'unhandledRejection'].forEach(errtype => {
  process.on(errtype, e => {
    if (this.$server.$logger) this.$server.$logger.error(`[agent:error#${errtype}]`, e);
    if (!app.$installed) app.onError(e);
  });
});

// listen the service on agent
// bind error handle
app.$listen().catch(app.$error.bind(app));