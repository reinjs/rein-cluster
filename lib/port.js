const detectPort = require('detect-port');
module.exports = function checkPortCanUse(port) {
  return new Promise((resolve, reject) => {
    const args = [];
    if (port) {
      args.push(port);
    }
    args.push((err, port) => {
      if (err) {
        err.name = 'ClusterPortConflictError';
        err.message = '[master] try get free port error, ' + err.message;
        return reject(err);
      }
      resolve(port);
    });
    detectPort(...args);
  });
}