module.exports = class Agent {
  constructor(obj) {
    this._app = obj;
    this._logger = console;
  }
  
  async create() {
    console.log(this._app._name, 'in create lifecycle')
  }
  
  async message(msg) {
    console.log(this._app._name, 'in message lifecycle')
  }
  
  async destroy(signal) {
    console.log(this._app._name, 'in destroy lifecycle', signal)
  }
};