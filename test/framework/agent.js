module.exports = class Agent {
  constructor(obj) {
    this.app = obj;
    this.logger = console;
  }
  
  async create() {
    // console.log(this.app.name, 'in create lifecycle')
  }
  
  async message(msg) {
    // console.log(this.app.name, 'in message lifecycle')
  }
  
  async destroy(signal) {
    // console.log(this.app.name, 'in destroy lifecycle', signal)
  }
};