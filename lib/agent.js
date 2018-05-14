const Application = require('./layer');

class Agent extends Application {
  constructor() {
    super('agent.js', true);
  }
  
  /**
   * get the agent name from argv
   * set $name to invoke
   * @returns {*}
   */
  get $name() {
    return this.$argv.service.agent.name;
  }
  
  /**
   * send `ipc:agent#success` to master
   * @returns {*}
   */
  onListen() {
    return this.send('master', `ipc:agent#success`, { name: this.$name });
  }
  
  onResolve(signal) {
    if (this.$server.$logger) {
      this.$server.$logger.info(`[agent:<${this.$name}>#destroy#${signal}]`, 'success');
    }
  }
  
  onReject(e, signal) {
    if (this.$server.$logger) {
      this.$server.$logger.error(`[agent:<${this.$name}>#destroy#${signal}]`, 'error', e);
    }
  }
  
  onError(e) {
    this.send('master', 'ipc:agent#error', {
      name: this.$name,
      error: e.message
    });
  }
  
  /**
   * we start really destroy when master tell us `ipc:agent#close` message
   * either we loop checking the message
   */
  ['ipc:agent#close']() {
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