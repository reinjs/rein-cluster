# rein-cluster

The cluster module of reinjs

## Install

```shell
npm i @reinjs/rein-cluster
```

## Options

- cwd <string> 项目根目录地址(绝对地址)
- agents <array<string> | undefined> agents列表
- maxWorkers <Number> default: os.cups().length
- timeout <number> 超时时间 default: Infinity
- framework <string> 服务架构名 worker.js and agent.js

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

# License

It is [MIT licensed](https://opensource.org/licenses/MIT).

