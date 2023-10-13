'use strict';
const common = require('../common');

common.skipIfInspectorDisabled();

const { Session } = require('inspector');
const { Worker, isMainThread, workerData } = require('worker_threads');

if (!workerData) {
  common.skipIfWorker();
}

if (isMainThread) {
  new Worker(__filename, { workerData: {} });
} else {
  const session = new Session();
  session.connectToMainThread();
  // Do not crash
  session.disconnect();
}
