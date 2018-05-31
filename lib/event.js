const childprocess = require('child_process');
const hasOwnProperty = Object.prototype.hasOwnProperty;

module.exports = class MasterEvent {
  constructor(master) {
    this._master = master;
    this._configs = master._configs;
    this._agents = {};
    this._agents.timer = null;
    this._agents.total = 0;
    this._agents.cluster = {};
    this._workers = {};
    this._workers.timer = null;
    this._workers.total = 0;
    this._workers.cluster = {};
    this._pools = [];
    this._extra = {};
  }
  
  ['agent:extra:data'](msg) {
    const name = msg.body.name;
    const data = msg.body.data;
    this._extra[name] = data || {};
  }
  
  forceKill(cb) {
    process.nextTick(() => {
      for (let i = 0, j = this._pools.length; i < j; i++) {
        const pid = String(this._pools[i]);
        console.log('[master] force killing pid:', pid);
        childprocess.spawnSync('kill', ['-9', pid]);
      }
      console.log('[exit] all exited.');
      cb();
    });
  }
  
  kill(name) {
    switch (name) {
      case 'agents':
        if (!this._master._configs.agents.length) {
          return () => Promise.resolve();
        }
        this['cluster:agents#kill']();
        return this['cluster:agents#all:killed']();
      case 'workers':
        this['cluster:workers#kill']();
        return this['cluster:workers#all:killed']();
    }
  }
  
  addAgent(name, pid) {
    this._pools.push(pid);
    this._agents.cluster[name] = {
      status: 0,
      message: null,
      pid: pid
    };
  }
  
  agentForking() {
    this._agents.total++;
  }
  
  agentKilled(name) {
    if (this._agents.cluster[name]) {
      const pid = this._agents.cluster[name].pid;
      const index = this._pools.indexOf(pid);
      if (index > -1) this._pools.splice(index, 1);
      this._agents.total--;
    }
  }
  
  addWorker(pid) {
    this._pools.push(pid);
    this._workers.cluster[pid] = {
      status: 0,
      message: null
    }
  }
  
  workerForking() {
    this._workers.total++;
  }
  
  workerKilled(pid) {
    this._workers.total--;
    if (this._workers.cluster[pid]) {
      const index = this._pools.indexOf(pid);
      if (index > -1) this._pools.splice(index, 1);
      delete this._workers.cluster[pid];
    }
  }
  
  ['ipc:agent#success'](msg) {
    if (this._agents.cluster[msg.body.name] !== undefined) {
      this._agents.cluster[msg.body.name].status = 1;
    }
  }
  
  ['ipc:worker#success'](msg) {
    if (this._workers.cluster[msg.from] !== undefined) {
      this._workers.cluster[msg.from].status = 1;
    }
  }
  
  ['ipc:agent#error'](msg) {
    if (this._agents.cluster[msg.body.name] !== undefined) {
      this._agents.cluster[msg.body.name].status = -1;
      this._agents.cluster[msg.body.name].message = msg.body.error;
    }
  }
  
  ['ipc:worker#error'](msg) {
    if (this._workers.cluster[msg.from] !== undefined) {
      this._workers.cluster[msg.from].status = -1;
      this._workers.cluster[msg.from].message = msg.body.error;
    }
  }
  
  ['cluster#status'](object) {
    return new Promise(resolve => {
      const startTime = Date.now();
      // start a timer which checking out that all agents is normal
      object.timer = setInterval(() => {
        let total = 0;
      
        // when all agents is timeout
        // reject it
        if (this._configs.timeout !== Infinity) {
          if (Date.now() - startTime > this._configs.timeout) {
            clearInterval(object.timer);
            return resolve(false);
          }
        }

        // loop checking status for all agents
        for (const name in object.cluster) {
          if (hasOwnProperty.call(object.cluster, name)) {
            switch (object.cluster[name].status) {
              case 1: total++; break;
              case -1: break;
              default: return;
            }
          }
        }
      
        // when all agents is done and normally
        // resolve it
        if (total === object.total) {
          clearInterval(object.timer);
          return resolve(true);
        }
        
        clearInterval(object.timer);
        resolve(false);
      }, 5);
    });
  }
  
  /**
   * 检测agents的状态
   * @returns {*}
   */
  async ['cluster:agents#status']() {
    const status = await this['cluster#status'](this._agents);
    if (this._agents.total > 0) {
      this._master.send('agents', 'agent:extra:data');
      await new Promise((resolve, reject) => {
        const keys = Object.keys(this._agents.cluster);
        const startTime = Date.now();
        const timer = setInterval(() => {
          if (this._configs.timeout !== Infinity) {
            if (Date.now() - startTime > this._configs.timeout) {
              clearInterval(timer);
              return reject(new Error('agent:extra:data timeout'));
            }
          }
          for (let i = 0; i < keys.length; i++) {
            if (!this._extra[keys[i]]) return;
          }
          clearInterval(timer);
          resolve();
        }, 5);
      })
    }
    return status;
  }
  
  /**
   * 检测workers的状态
   * @returns {*}
   */
  ['cluster:worker#status']() {
    return this['cluster#status'](this._workers);
  }
  
  ['cluster:agents#kill']() {
    for (const name in this._agents.cluster) {
      if (
        hasOwnProperty.call(this._agents.cluster, name) &&
        this._agents.cluster[name].pid &&
        !!this._master.agents[name] &&
        !this._master.agents[name].killed
      ) {
        this._master.agents[name].kill('SIGTERM');
        this._master.send(name, 'ipc:agent#close');
      }
    }
  }
  
  ['cluster#all:killed'](object) {
    return () => {
      return new Promise(resolve => {
        const timer = setInterval(() => {
          if (object.total === 0) {
            clearInterval(timer);
            resolve();
          }
        }, 5);
      });
    }
  }
  
  ['cluster:agents#all:killed']() {
    return this['cluster#all:killed'](this._agents);
  }
  
  ['cluster:workers#kill']() {
    for (const pid in this._workers.cluster) {
      let worker;
      for (let i = 0; i < this._master.workers.length; i++) {
        if (this._master.workers[i].process.pid === Number(pid)) {
          worker = this._master.workers[i];
          break;
        }
      }
    
      if (!worker.isDead()) {
        process.kill(Number(pid), 'SIGTERM');
        this._master.send(Number(pid), 'ipc:worker#close');
      }
    }
  }
  
  ['cluster:workers#all:killed']() {
    return this['cluster#all:killed'](this._workers);
  }
};