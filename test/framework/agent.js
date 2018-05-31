module.exports = class Agent {
  constructor(obj) {
    this.app = obj;
    this.logger = console;
    this.name = 'a';
  }
  
  async extra() {
    return {
      a: 1,
      b: 2
    }
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