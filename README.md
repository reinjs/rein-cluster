# rein-cluster

The cluster module of reinjs

## Install

```shell
npm i @reinjs/rein-cluster
```

## Options

| property | type | description | default |
| :---- | :---- | :---- | :---- |
| cwd | `string` | project root path | `process.cwd()` |
| agents | `array<string> or undefined` | agents list | undefined |
| maxWorkers | `number` | worker counts | `os.cpus().length` |
| timeout | `number` | timeout | Infinity |
| framework | `string` | framework name or dir path | undefined |

## Usage

```javascript
const Cluster = require('@reinjs/rein-cluster');

const cluster = new Cluster({
  cwd: __dirname,
  agents: ['a', 'b', 'c', 'e'],
  timeout: 10000,
  framework: '@reinjs/rein'
});

cluster.listen();
// Use Promise like this:
// cluster.listen().then(() => console.log('cluster ok')).catch(e => console.error(e));
```

## Framework

We provide three invoking lifecycle to build framework, also it must return a class.

- @life message(msg): <Promise> 消息通知生命周期
- @life create(): <Promise> 启动服务生命周期
- @life destroy(signal): <Promise> 销毁服务生命周期

It is easily to build framework by three lifecycle.

```javascript
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
```

# License

It is [MIT licensed](https://opensource.org/licenses/MIT).

