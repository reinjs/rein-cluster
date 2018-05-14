const os = require('os');
const fs = require('fs');
const path = require('path');
const is = require('is-type-of');
const Event = require('./event');
const cluster = require('cluster');
const findRoot = require('find-root');
const IPCMessage = require('ipc-message');
const ChildProcess = require('child_process');
const utils = require('../../rein-utils');
const AgentRuntimeFile = path.resolve(__dirname, 'agent.js');
const WorkerRuntimeFile = path.resolve(__dirname, 'worker.js');

module.exports = class Master extends IPCMessage {
  constructor(configs = {}) {
    super();
    this.$refork = true;
    this.$argv = this.argv();
    this.$configs = this.analysis(configs);
    this.$event = new Event(this);
    this.message();
    process.on('SIGTERM', () => this.kill());
    process.on('SIGINT', () => this.kill());
    process.on('SIGQUIT', () => this.kill());
  }
  
  /**
   * 格式化配置
   * @param configs
   *  - cwd <string> 项目根目录地址(绝对地址)
   *  - agents <array<string> | undefined> agents列表
   *  - maxWorkers: <Number> default: os.cups().length
   *  - timeout <number> 超时时间 default: Infinity
   *  - framework <string> 服务架构名 worker.js and agent.js
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
   * 如果在$event上存在就方法
   * 否则触发master上的事件
   */
  message() {
    this.on('message', async msg => {
      if (is.function(this.$event[msg.action])) {
        return await this.$event[msg.action](msg);
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
  
  async listen() {
    this.createAgents();
    const agentsForkStatus = await this.$event['cluster:agents#status']();
    if (!agentsForkStatus) return await this.kill('agents');
    this.createWorkers(this.$configs.maxWorkers);
    const workersForkStatus = await this.$event['cluster:worker#status']();
    if (!workersForkStatus) return await this.kill('workers', 'agents');
    this.send(['agents', 'workers'], 'cluster:ready');
  }
  
  /**
   * 创建agents
   * 并计数
   */
  createAgents() {
    const argvs = this.$argv.args;
    const opt = {
      cwd: this.$configs.cwd,
      stdout: process.stdout,
      stderr: process.stderr,
      env: process.env,
      execArgv: process.execArgv.slice(0).concat(this.$argv.execArgv)
    };
    for (let i = 0, j = this.$configs.agents.length; i < j ; i++) {
      const name = this.$configs.agents[i];
      const args = ['--service.agent.name=' + name, '--framework=' + this.$configs.framework].concat(argvs);
      const agent = ChildProcess.fork(AgentRuntimeFile, args, opt);
      this.registAgent(name, agent);
      this.$event.addAgent(name, agent.pid);
      this.$event.agentForking();
      agent.on('close', () => this.$event.agentKilled());
    }
  }
  
  createWorkers(n) {
    const argvs = this.$argv.args;
    const args = ['--framework=' + this.$configs.framework, ...argvs];
    cluster.setupMaster({
      exec: WorkerRuntimeFile,
      args,
      silent: false,
      env: process.env,
      execArgv: process.execArgv.slice(0).concat(this.$argv.execArgv)
    });
    for (let i = 0; i < n; i++) cluster.fork();
    cluster
      .on('fork', worker => this.$event.addWorker(worker.process.pid))
      .on('online', () => this.$event.workerForking())
      .on('exit', worker => {
        this.$event.workerKilled(worker.process.pid);
        if (this.$refork) cluster.fork();
      });
  }
  
  kill(...args) {
    if (!args.length) args = ['workers', 'agents'];
    return new Promise((resolve, reject) => {
      const fns = args.map(name => this.$event.kill(name));
      const $resolve = () => { resolve(); process.exit(0); };
      const $reject = e => { reject(e); console.error(e); process.exit(1); };
      this.$refork = false;
      if (fns.length === 2) {
        fns[0]().then(() => fns[1]()).then($resolve).catch($reject);
      } else {
        fns[0]().then($resolve).catch($reject);
      }
    });
  }
};