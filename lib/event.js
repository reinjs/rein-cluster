const hasOwnProperty = Object.prototype.hasOwnProperty;

module.exports = class MasterEvent {
  constructor(master) {
    this.$master = master;
    this.$configs = master.$configs;
    this.$agents = {};
    this.$agents.timer = null;
    this.$agents.total = 0;
    this.$agents.cluster = {};
    this.$workers = {};
    this.$workers.timer = null;
    this.$workers.total = 0;
    this.$workers.cluster = {};
  }
  
  kill(name) {
    switch (name) {
      case 'agents':
        this['cluster:agents#kill']();
        return this['cluster:agents#all:killed']();
      case 'workers':
        this['cluster:workers#kill']();
        return this['cluster:workers#all:killed']();
    }
  }
  
  addAgent(name, pid) {
    this.$agents.cluster[name] = {
      status: 0,
      message: null,
      pid: pid
    };
  }
  
  agentForking() {
    this.$agents.total++;
  }
  
  agentKilled() {
    this.$agents.total--;
  }
  
  addWorker(pid) {
    this.$workers.cluster[pid] = {
      status: 0,
      message: null
    }
  }
  
  workerForking() {
    this.$workers.total++;
  }
  
  workerKilled(pid) {
    this.$workers.total--;
    if (this.$workers.cluster[pid]) delete this.$workers.cluster[pid];
  }
  
  ['ipc:agent#success'](msg) {
    if (this.$agents.cluster[msg.body.name] !== undefined) {
      this.$agents.cluster[msg.body.name].status = 1;
    }
  }
  
  ['ipc:worker#success'](msg) {
    if (this.$workers.cluster[msg.from] !== undefined) {
      this.$workers.cluster[msg.from].status = 1;
    }
  }
  
  ['ipc:agent#error'](msg) {
    if (this.$agents.cluster[msg.body.name] !== undefined) {
      this.$agents.cluster[msg.body.name].status = -1;
      this.$agents.cluster[msg.body.name].message = msg.body.error;
    }
  }
  
  ['ipc:worker#error'](msg) {
    if (this.$workers.cluster[msg.from] !== undefined) {
      this.$workers.cluster[msg.from].status = -1;
      this.$workers.cluster[msg.from].message = msg.body.error;
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
        if (this.$configs.timeout !== Infinity) {
          if (Date.now() - startTime > this.$configs.timeout) {
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
      
        resolve(false);
      }, 10);
    });
  }
  
  /**
   * 检测agents的状态
   * @returns {*}
   */
  ['cluster:agents#status']() {
    return this['cluster#status'](this.$agents);
  }
  
  /**
   * 检测workers的状态
   * @returns {*}
   */
  ['cluster:worker#status']() {
    return this['cluster#status'](this.$workers);
  }
  
  ['cluster:agents#kill']() {
    for (const name in this.$agents.cluster) {
      this.$master.agents[name].kill('SIGTERM');
      this.$master.send(name, 'ipc:agent#close');
    }
  }
  
  ['cluster:agents#all:killed']() {
    return () => {
      return new Promise(resolve => {
        const timer = setInterval(() => {
          if (this.$agents.total === 0) {
            clearInterval(timer);
            resolve();
          }
        }, 5);
      });
    }
  }
  
  ['cluster:workers#kill']() {
    for (const pid in this.$workers.cluster) {
      let worker;
      for (let i = 0; i < this.$master.workers.length; i++) {
        if (this.$master.workers[i].process.pid === Number(pid)) {
          worker = this.$master.workers[i];
          break;
        }
      }
    
      if (!worker.isDead()) {
        process.kill(Number(pid), 'SIGTERM');
        this.$master.send(Number(pid), 'ipc:worker#close');
      }
    }
  }
  
  ['cluster:workers#all:killed']() {
    return () => {
      return Promise.resolve();
    }
  }
};