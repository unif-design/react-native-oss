'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
require('./build-llms-core.test.js');
require('./build-llms-site.test.js');
const { buildBundle } = require('./llms/bundle');
const bundle = buildBundle({ root: path.join(__dirname, '..') });
assert(
  bundle['md/native-setup.md'].toString('utf8').includes('onRequestComplete'),
);
assert(bundle['md/api.md'].toString('utf8').includes('transferDirectory'));
console.log('PASS OSS API 与宿主终态契约进入 LLM 资料');
