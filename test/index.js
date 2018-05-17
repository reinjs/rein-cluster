const Master = require('../index');

const cluster = new Master({
  cwd: __dirname,
  agents: ['a'],
  timeout: 10000,
  framework: '/Users/shenyunjie/CodeBox/reinjs/rein-cluster/test/framework'
});

cluster.listen();