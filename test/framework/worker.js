const Koa = require('koa');
module.exports = class Worker extends Koa {
  constructor(obj) {
    super();
    this._app = obj;
    this._logger = console;
  }
  
  async create() {
    await new Promise((resolve, reject) => {
      this.use(async ctx => ctx.body = 'Hello world');
      this.listen(8080, err => {
        if (err) return reject(err);
        this._logger.log('server on `http://127.0.0.1:8080`');
        resolve();
      });
    });
  }
  
  async message(msg) {
    console.log(this._app.pid, 'in message lifecycle')
  }
  
  async destroy(signal) {
    console.log(this._app.pid, 'in destroy lifecycle', signal)
  }
};