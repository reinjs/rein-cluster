const os = require('os');
const fs = require('fs');
const net = require('net');
const path = require('path');
const is = require('is-type-of');
const Event = require('./event');
const cluster = require('cluster');
const findRoot = require('find-root');
const checkPort = require('./port');
const IPCMessage = require('ipc-message');
const ChildProcess = require('child_process');
const utils = require('@reinjs/rein-utils');
const AgentRuntimeFile = path.resolve(__dirname, 'agent.js');
const WorkerRuntimeFile = path.resolve(__dirname, 'worker.js');

module.exports = class Master extends IPCMessage {
  constructor(configs = {}) {
    super();
    this._refork = true;
    this._argv = this.argv();
    this._configs = this.analysis(configs);
    this._event = new Event(this);
    this.message();
    process.on('SIGTERM', () => this.kill());
    process.on('SIGINT', () => this.kill());
    process.on('SIGQUIT', () => this.kill());
    
    // something for error
    ['error', 'rejectionHandled', 'uncaughtException', 'unhandledRejection'].forEach(errtype => {
      process.on(errtype, e => {
        console.error(`[master:error#${errtype}]`, e);
        this.kill();
      });
    });
  }
  
  /**
   * 格式化配置
   * @param configs
   *  - cwd <string> 项目根目录地址(绝对地址)
   *  - agents <array<string> | undefined> agents列表
   *  - maxWorkers: <Number> default: os.cups().length
   *  - timeout <number> 超时时间 default: Infinity
   *  - framework <string> 服务架构名 worker.js and agent.js
   *  - socket <boolean> 是否使用socket模式
   * @returns {*}
   */
  analysis(configs) {
    if (!configs.cwd) configs.cwd = process.cwd();
    if (!configs.agents) configs.agents = [];
    if (!is.array(configs.agents)) configs.agents = [configs.agents];
    if (!path.isAbsolute(configs.cwd)) throw new Error(`[master.options.cwd] it must be an absolute path: ${configs.cwd}`);
    if (!configs.timeout) configs.timeout = Infinity;
    if (!configs.maxWorkers) configs.maxWorkers = os.cpus().length;
    if (!configs.framework) {
      // try to read framework property from package.json
      const closestPackageFile = findRoot(configs.cwd);
      if (!closestPackageFile) {
        throw new Error('[master.options.framework] miss closest `package.json` file, you should add it first, and type a `framework` property.');
      }
      const pkg = utils.loadFile(path.resolve(closestPackageFile, 'package.json'));
      if (!pkg.framework) {
        throw new Error('[master.options.framework] in `package.json`, and type a `framework` property.');
      }
      configs.framework = pkg.framework;
    }
    if (/^[.]/.test(configs.framework)) configs.framework = path.resolve(configs.cwd, configs.framework);
    if (!path.isAbsolute(configs.framework)) configs.framework = path.dirname(require.resolve(configs.framework));
    const workerFile = path.resolve(configs.framework, 'worker.js');
    const agentFile = path.resolve(configs.framework, 'agent.js');
    // make sure framework is a really module
    if (!fs.existsSync(configs.framework)) throw new Error('[master.options.framework] can not find the framework, please make sure it is a really module.');
    if (!fs.existsSync(workerFile)) throw new Error('[master.options.framework#application] can not find the framework file, please make sure it is a really file.\nfile: ' + workerFile);
    if (!fs.existsSync(agentFile)) throw new Error('[master.options.framework#agent] can not find the framework file, please make sure it is a really file.\nfile: ' + agentFile);
    return configs;
  }
  
  /**
   * 消息通道
   * 如果在_event上存在就方法
   * 否则触发master上的事件
   */
  message() {
    this.on('message', async msg => {
      if (msg.action === 'teardown') {
        return this.kill();
      }
      if (is.function(this._event[msg.action])) {
        return await this._event[msg.action](msg);
      }
      await this.emit(msg.action, msg);
    });
  }
  
  /**
   * 格式化参数
   * 如果有--inspect开头的参数
   * 直接插入到execArgv中
   * @returns {{args: Array, execArgv: Array}}
   */
  argv() {
    const argvs = process.argv.slice(2);
    const res = { args: [], execArgv: [] };
    for (let i = 0, j = argvs.length; i < j ; i++) {
      // e.g. --inspect-brk --inspect
      if (argvs[i].indexOf('--inspect') === 0) {
        res.execArgv.push(argvs[i]);
      } else {
        res.args.push(argvs[i]);
      }
    }
    return res;
  }
  
  stickyWorker(ip) {
    let s = '';
    for (let i = 0; i < ip.length; i++) {
      if (!isNaN(ip[i])) {
        s += ip[i];
      }
    }
    return Number(s);
  }
  
  async startSocketService() {
    if (this._configs.socket) {
      this.socketConnect = net.createServer({ pauseOnConnect: true }, socket => {
        if (!socket.remoteAddress) return socket.close();
        const hash = this.stickyWorker(socket.remoteAddress.replace(/(\d+\.\d+\.\d+\.\d+)/, '$1'));
        const worker = this.workers[hash % this.workers.length];
        if (!worker) return;
        worker.send('sticky:balance', socket);
      });
      let port;
      for (let i = 0; i < this._argv.args.length; i++) {
        if (this._argv.args[i].indexOf('--service.port=') > -1) {
          const _port = this._argv.args[i].replace('--service.port=', '');
          if (!isNaN(_port)) {
            port = Number(_port);
            break;
          }
        }
      }
      if (!port) port = 8080;
      this.socketConnect.listen(port);
      this.clusterPort = await checkPort();
    }
  }
  
  async listen() {
    await this.startSocketService();
    // if agents exists
    // fork them
    if (this._configs.agents.length) {
      this.createAgents();
      const agentsForkStatus = await this._event['cluster:agents#status']();
      if (!agentsForkStatus) return await this.kill('agents');
    }
    
    // start to fork workers
    this.createWorkers(this._configs.maxWorkers);
    const workersForkStatus = await this._event['cluster:worker#status']();
    if (!workersForkStatus) return await this.kill('workers', 'agents');
    this.send(['agents', 'workers'], 'cluster:ready');
  }
  
  /**
   * 创建agents
   * 并计数
   */
  createAgents() {
    const argvs = this._argv.args;
    const opt = {
      cwd: this._configs.cwd,
      stdout: process.stdout,
      stderr: process.stderr,
      env: process.env,
      execArgv: process.execArgv.slice(0).concat(this._argv.execArgv)
    };
    for (let i = 0, j = this._configs.agents.length; i < j ; i++) {
      const name = this._configs.agents[i];
      const args = [
        '--cwd=' + this._configs.cwd,
        '--service.agent.name=' + name,
        '--framework=' + this._configs.framework
      ].concat(argvs);
      const agent = ChildProcess.fork(AgentRuntimeFile, args, opt);
      this.registAgent(name, agent);
      this._event.addAgent(name, agent.pid);
      this._event.agentForking();
      agent.on('close', () => this._event.agentKilled(name));
    }
  }
  
  createWorkers(n) {
    const argvs = this._argv.args;
    const args = [
      '--cwd=' + this._configs.cwd,
      '--framework=' + this._configs.framework,
      '--agent.extra=' + JSON.stringify(this._event._extra),
      ...argvs
    ];
    if (this.clusterPort) {
      args.push('--service.port=' + this.clusterPort);
    }
    cluster.setupMaster({
      exec: WorkerRuntimeFile,
      args,
      silent: false,
      env: process.env,
      execArgv: process.execArgv.slice(0).concat(this._argv.execArgv)
    });
    for (let i = 0; i < n; i++) cluster.fork();
    cluster
    .on('fork', worker => this._event.addWorker(worker.process.pid))
    .on('online', () => this._event.workerForking())
    .on('exit', worker => {
      this._event.workerKilled(worker.process.pid);
      if (this._refork) cluster.fork();
    });
  }
  
  kill(...args) {
    if (this._killing) return;
    this._killing = true;
    if (!args.length) args = ['workers', 'agents'];
    this._refork = false;
    const fns = args.map(name => this._event.kill(name));
    const forceKill = code => this._event.forceKill(() => process.exit(code));
    const _resolve = () => { forceKill(0); };
    const _reject = e => { console.error(e); forceKill(1); };
    if (fns.length === 2) {
      fns[0]().then(() => fns[1]()).then(_resolve).catch(_reject);
    } else {
      fns[0]().then(_resolve).catch(_reject);
    }
  }
};